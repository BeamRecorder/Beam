//! Library artwork uses the same independent source worker as timeline filmstrips.
use super::visuals::{
    VisualWorker,
    types::{Source, Visual, VisualRequest},
};
use crate::{PreviewFrame, Result, video::pipeline::media};
use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::Duration,
};

pub(crate) fn decode(worker: &VisualWorker, source: Source) -> Result<PreviewFrame> {
    let cancel = Arc::new(AtomicBool::new(false));
    let (sender, receiver) = mpsc::channel();
    worker.submit(
        source,
        VisualRequest::Video { position_ms: 0 },
        Arc::clone(&cancel),
        Box::new(move |result| {
            let result = result.and_then(|update| match update.visual {
                Visual::Video(frame) => Ok(frame),
                Visual::Audio(_) => Err(media("expected video artwork")),
            });
            let _ = sender.send(result);
        }),
    )?;
    let result = receiver
        .recv_timeout(Duration::from_secs(15))
        .map_err(media);
    cancel.store(true, Ordering::Release);
    result?
}
