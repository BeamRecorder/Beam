//! One parked source worker; each audio job yields after an eight-second chunk.
use super::{
    audio,
    types::{Cancel, Consumer, Job, Source, Update, Visual, VisualRequest},
    video,
};
use crate::{EditorError, Result, video::pipeline::media};
use std::{
    collections::VecDeque,
    sync::{Arc, Condvar, Mutex, atomic::Ordering},
};

pub use super::types::VisualWorker;
use super::types::{Queue, Shared};

impl VisualWorker {
    pub fn new() -> Result<Self> {
        let queue = Arc::new((Mutex::new(Queue::default()), Condvar::new()));
        let worker = Arc::clone(&queue);
        let thread = std::thread::Builder::new()
            .name("beam-source-visuals".into())
            .spawn(move || run(worker))
            .map_err(|error| media(format!("source worker: {error}")))?;
        Ok(Self {
            queue,
            thread: Some(thread),
        })
    }
    /// Enqueues only currently retained visual requests; cancellation is shared with their native lease.
    pub fn submit(
        &self,
        source: Source,
        request: VisualRequest,
        cancel: Cancel,
        consumer: Consumer,
    ) -> Result<()> {
        super::validate(&source, &request)?;
        let mut queue = self.queue.0.lock().unwrap_or_else(|p| p.into_inner());
        queue
            .pending
            .retain(|job| !job.cancel.load(Ordering::Acquire));
        if queue.stopped {
            return Err(EditorError::Stopped);
        }
        if queue.pending.len() >= 128 {
            return Err(media("too many active source previews"));
        }
        queue.pending.push_back(Job {
            source,
            request,
            cancel,
            consumer,
            audio: None,
        });
        self.queue.1.notify_one();
        Ok(())
    }
}
impl Drop for VisualWorker {
    fn drop(&mut self) {
        {
            let mut queue = self.queue.0.lock().unwrap_or_else(|p| p.into_inner());
            queue.stopped = true;
            if let Some(cancel) = &queue.active {
                cancel.store(true, Ordering::Release);
            }
            queue.pending.clear();
            self.queue.1.notify_one();
        }
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn run(queue: Shared) {
    if let Err(error) = gst::init() {
        eprintln!("Beam source worker: {error}");
        return;
    }
    let context = gst::glib::MainContext::new();
    if let Err(error) = context.with_thread_default(|| process(queue)) {
        eprintln!("Beam source context: {error}");
    }
}
fn process(shared: Shared) {
    let mut videos = VecDeque::new();
    let mut audios = VecDeque::new();
    let mut slices: VecDeque<((uuid::Uuid, uuid::Uuid), super::types::Waveform)> = VecDeque::new();
    loop {
        let mut job = {
            let mut queue = shared.0.lock().unwrap_or_else(|p| p.into_inner());
            while queue.pending.is_empty() && !queue.stopped {
                queue = shared.1.wait(queue).unwrap_or_else(|p| p.into_inner());
            }
            if queue.stopped {
                break;
            }
            let job = queue.pending.pop_front().expect("nonempty visual queue");
            queue.active = Some(Arc::clone(&job.cancel));
            job
        };
        if job.cancel.load(Ordering::Acquire) {
            continue;
        }
        let key = (job.source.project_id, job.source.asset.id);
        let result = match job.request {
            VisualRequest::Video { position_ms } => (|| {
                if !videos.iter().any(|(id, _)| *id == key) {
                    let decoder = video::Decoder::new(&job.source)?;
                    if videos.len() == 2 {
                        videos.pop_front();
                    }
                    videos.push_back((key, decoder));
                }
                let decoder = &videos
                    .iter()
                    .find(|(id, _)| *id == key)
                    .expect("video decoder")
                    .1;
                Ok(Update {
                    visual: Visual::Video(decoder.frame(position_ms)?),
                    complete: true,
                })
            })(),
            VisualRequest::Audio {
                start_ms,
                end_ms,
                step_ms,
            } => (|| {
                let analysis = job.audio.get_or_insert_with(|| {
                    let mut analysis = audio::Analysis::new(start_ms, end_ms, step_ms);
                    super::reuse::pool(
                        &mut analysis.data,
                        slices
                            .iter()
                            .filter(|(id, _)| *id == key)
                            .map(|(_, data)| data.clone()),
                    );
                    analysis
                });
                if analysis.data.ready.iter().all(|ready| *ready) {
                    return Ok(Update {
                        visual: Visual::Audio(analysis.data.clone()),
                        complete: true,
                    });
                }
                if !audios.iter().any(|(id, _)| *id == key) {
                    let decoder = audio::Decoder::new(&job.source)?;
                    if audios.len() == 2 {
                        audios.pop_front();
                    }
                    audios.push_back((key, decoder));
                }
                let decoder = &audios
                    .iter()
                    .find(|(id, _)| *id == key)
                    .expect("audio decoder")
                    .1;
                let complete = decoder.chunk(analysis, &job.cancel)?;
                Ok(Update {
                    visual: Visual::Audio(analysis.data.clone()),
                    complete,
                })
            })(),
        };
        if let Some(analysis) = &job.audio
            && analysis.data.ready.iter().any(|ready| *ready)
        {
            slices.retain(|(id, data)| {
                *id != key
                    || data.start_ms != analysis.data.start_ms
                    || data.step_ms != analysis.data.step_ms
            });
            if slices.len() >= 32 {
                slices.pop_front();
            }
            slices.push_back((key, analysis.data.clone()));
        }
        if job.cancel.load(Ordering::Acquire) {
            continue;
        }
        let complete = result.as_ref().map_or(true, |update| update.complete);
        (job.consumer)(result);
        if !complete {
            let mut queue = shared.0.lock().unwrap_or_else(|p| p.into_inner());
            if !queue.stopped && !job.cancel.load(Ordering::Acquire) {
                queue.pending.push_back(job);
            }
        }
    }
}
