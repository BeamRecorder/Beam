//! Streamed, range-bounded PCM analysis; no whole-file audio buffer is retained.
pub(super) use super::types::{Analysis, AudioDecoder as Decoder};
use super::{
    bands::Bands,
    types::{ANALYSIS_RATE, Cancel, Source, Waveform},
};
use crate::{Result, video::pipeline::media};
use gst::prelude::*;
use std::{
    sync::atomic::Ordering,
    time::{Duration, Instant},
};

impl Analysis {
    pub(super) fn new(start: u64, end: u64, step: u64) -> Self {
        let count = (end - start).div_ceil(step) as usize;
        Self {
            data: Waveform {
                start_ms: start,
                duration_ms: end - start,
                step_ms: step,
                points: vec![[0.; 5]; count],
                ready: vec![false; count],
            },
            cursor: start,
            bands: Bands::new(ANALYSIS_RATE),
        }
    }
}

impl Drop for Decoder {
    fn drop(&mut self) {
        let _ = self.pipeline.set_state(gst::State::Null);
    }
}
impl Decoder {
    pub(super) fn new(source: &Source) -> Result<Self> {
        crate::project::sources::verify(&source.root, &source.asset)?;
        let path = crate::project::validation::source_path(&source.root, &source.asset.path)?;
        let sink = gst_app::AppSink::builder()
            .sync(false)
            .max_buffers(4)
            .build();
        let convert = gst::ElementFactory::make("audioconvert")
            .build()
            .map_err(media)?;
        let resample = gst::ElementFactory::make("audioresample")
            .build()
            .map_err(media)?;
        let caps = gst::ElementFactory::make("capsfilter")
            .property(
                "caps",
                gst::Caps::builder("audio/x-raw")
                    .field("format", "F32LE")
                    .field("layout", "interleaved")
                    .field("rate", ANALYSIS_RATE as i32)
                    .build(),
            )
            .build()
            .map_err(media)?;
        let bin = gst::Bin::new();
        bin.add_many([&convert, &resample, &caps, sink.upcast_ref()])
            .map_err(media)?;
        gst::Element::link_many([&convert, &resample, &caps, sink.upcast_ref()]).map_err(media)?;
        bin.add_pad(
            &gst::GhostPad::with_target(
                &convert
                    .static_pad("sink")
                    .ok_or_else(|| media("missing audio sink pad"))?,
            )
            .map_err(media)?,
        )
        .map_err(media)?;
        let pipeline = gst::ElementFactory::make("playbin3")
            .property("uri", crate::video::probe::uri(&path)?)
            .property_from_str("flags", "audio")
            .property("audio-sink", &bin)
            .build()
            .map_err(media)?;
        let decoder = Self { pipeline, sink };
        decoder
            .pipeline
            .set_state(gst::State::Paused)
            .map_err(media)?;
        decoder
            .pipeline
            .state(gst::ClockTime::from_seconds(5))
            .0
            .map_err(media)?;
        Ok(decoder)
    }

    /// Reads at most eight seconds before another visible source gets a turn.
    pub(super) fn chunk(&self, analysis: &mut Analysis, cancel: &Cancel) -> Result<bool> {
        let limit = analysis.data.start_ms + analysis.data.duration_ms;
        while analysis.cursor < limit {
            let index =
                ((analysis.cursor - analysis.data.start_ms) / analysis.data.step_ms) as usize;
            if !analysis.data.ready[index] {
                break;
            }
            analysis.cursor =
                (analysis.data.start_ms + (index as u64 + 1) * analysis.data.step_ms).min(limit);
        }
        if analysis.cursor >= limit {
            return Ok(true);
        }
        let begin = analysis.cursor;
        let mut end = (begin + 8000).min(limit);
        // Stop at the first reusable interval instead of decoding it again.
        for (index, ready) in analysis.data.ready.iter().enumerate() {
            let time = analysis.data.start_ms + index as u64 * analysis.data.step_ms;
            if *ready && time > begin {
                end = end.min(time);
                break;
            }
        }
        self.pipeline.set_state(gst::State::Paused).map_err(media)?;
        if cancel.load(Ordering::Acquire) {
            return Err(crate::EditorError::Stopped);
        }
        self.pipeline
            .seek(
                1.,
                gst::SeekFlags::FLUSH | gst::SeekFlags::ACCURATE,
                gst::SeekType::Set,
                gst::ClockTime::from_mseconds(analysis.cursor),
                gst::SeekType::Set,
                gst::ClockTime::from_mseconds(end),
            )
            .map_err(media)?;
        self.pipeline
            .set_state(gst::State::Playing)
            .map_err(media)?;
        let decoded = self.read(analysis, cancel, end);

        self.pipeline.set_state(gst::State::Paused).map_err(media)?;
        decoded?;
        analysis.bands.flush(&mut analysis.data.points);
        analysis.cursor = end;
        let complete = end >= analysis.data.start_ms + analysis.data.duration_ms;
        for (index, ready) in analysis.data.ready.iter_mut().enumerate() {
            let start = analysis.data.start_ms + index as u64 * analysis.data.step_ms;
            if start + analysis.data.step_ms > begin
                && (complete || start + analysis.data.step_ms <= end)
            {
                *ready = true;
            }
        }
        Ok(complete)
    }
    fn read(&self, analysis: &mut Analysis, cancel: &Cancel, end: u64) -> Result<()> {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            if cancel.load(Ordering::Acquire) {
                return Err(crate::EditorError::Stopped);
            }
            if let Some(sample) = self
                .sink
                .try_pull_sample(gst::ClockTime::from_mseconds(100))
            {
                let buffer = sample
                    .buffer()
                    .ok_or_else(|| media("audio sample has no buffer"))?;
                let pts = buffer
                    .pts()
                    .ok_or_else(|| media("audio sample has no timestamp"))?
                    .nseconds();
                let channels = sample
                    .caps()
                    .and_then(|caps| caps.structure(0))
                    .and_then(|s| s.get::<i32>("channels").ok())
                    .filter(|n| (1..=64).contains(n))
                    .ok_or_else(|| media("invalid PCM channel count"))?
                    as usize;
                let mapped = buffer.map_readable().map_err(media)?;
                accumulate(analysis, pts, mapped.as_slice(), channels, end);
                if pts / 1_000_000 >= end {
                    break;
                }
            } else if self.sink.is_eos() {
                break;
            } else if Instant::now() >= deadline {
                return Err(media("source audio decoder timed out"));
            }
        }
        Ok(())
    }
}

fn accumulate(analysis: &mut Analysis, pts: u64, bytes: &[u8], channels: usize, end: u64) {
    for (frame, samples) in bytes.chunks_exact(channels * 4).enumerate() {
        let time = pts / 1_000_000 + frame as u64 * 1000 / u64::from(ANALYSIS_RATE);
        if time < analysis.cursor || time >= end {
            continue;
        }
        let point = ((time - analysis.data.start_ms) / analysis.data.step_ms) as usize;
        if point >= analysis.data.points.len() {
            continue;
        }
        let mut mono = 0.;
        for channel in samples.as_chunks::<4>().0 {
            let value = f32::from_le_bytes(*channel);
            let value = if value.is_finite() { value } else { 0. };
            analysis.data.points[point][0] =
                analysis.data.points[point][0].max(value.abs().min(1.));
            mono += f64::from(value);
        }
        analysis
            .bands
            .add(mono / channels as f64, point, &mut analysis.data.points);
    }
}
