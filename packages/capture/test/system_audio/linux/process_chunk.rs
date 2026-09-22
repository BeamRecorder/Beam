#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;

struct Fixture {
    state: ProcessState,
    receiver: crossbeam_channel::Receiver<SinkMessage>,
}

fn fixture(persist_samples: bool, capacity: usize) -> Fixture {
    let (sink, receiver) = crossbeam_channel::bounded(capacity);
    let gate = Arc::new(StartGate::new());
    gate.release(0).expect("start gate");
    Fixture {
        state: ProcessState {
            format: Some(SystemAudioFormat {
                sample_rate: 48_000,
                channels: 2,
            }),
            active: true,
            stopping: false,
            gate,
            sink,
            persist_samples,
            metrics: Arc::new(SystemAudioMetrics::default()),
            fatal: Arc::new(Mutex::new(None)),
        },
        receiver,
    }
}

fn stereo_samples() -> Vec<u8> {
    [0.5_f32, -0.25]
        .into_iter()
        .flat_map(f32::to_le_bytes)
        .collect()
}

#[test]
fn inactive_unreleased_and_unnegotiated_streams_ignore_chunks() {
    let mut test = fixture(true, 1);
    let bytes = stereo_samples();
    test.state.active = false;
    process_audio_chunk(&test.state, 0, bytes.len(), Some(&bytes));
    test.state.active = true;
    test.state.gate = Arc::new(StartGate::new());
    process_audio_chunk(&test.state, 0, bytes.len(), Some(&bytes));
    test.state.gate.release(0).expect("start gate");
    test.state.format = None;
    process_audio_chunk(&test.state, 0, bytes.len(), Some(&bytes));
    assert_eq!(test.state.metrics.samples_received(), 0);
    assert_eq!(test.state.metrics.samples_dropped(), 0);
    assert!(test.receiver.is_empty());
}

#[test]
fn malformed_chunks_increment_drops_without_sending_partial_pcm() {
    let test = fixture(true, 1);
    let bytes = stereo_samples();
    process_audio_chunk(&test.state, 0, 6, Some(&bytes));
    process_audio_chunk(&test.state, 0, 8, None);
    process_audio_chunk(&test.state, 4, 8, Some(&bytes));
    process_audio_chunk(&test.state, usize::MAX, 8, Some(&bytes));
    assert_eq!(test.state.metrics.samples_received(), 0);
    assert_eq!(test.state.metrics.samples_dropped(), 4);
    assert!(test.receiver.is_empty());
}

#[test]
fn preview_counts_samples_and_peak_without_persisting_bytes() {
    let test = fixture(false, 1);
    let bytes = stereo_samples();
    process_audio_chunk(&test.state, 0, bytes.len(), Some(&bytes));
    assert_eq!(test.state.metrics.samples_received(), 1);
    assert_eq!(test.state.metrics.samples_dropped(), 0);
    assert_eq!(test.state.metrics.take_peak(), 0.5);
    assert!(test.receiver.is_empty());
}

#[test]
fn recording_queues_owned_pcm_and_drops_when_the_sink_is_full() {
    let test = fixture(true, 1);
    let bytes = stereo_samples();
    process_audio_chunk(&test.state, 0, bytes.len(), Some(&bytes));
    process_audio_chunk(&test.state, 0, bytes.len(), Some(&bytes));
    assert_eq!(test.state.metrics.samples_received(), 1);
    assert_eq!(test.state.metrics.samples_dropped(), 1);
    assert_eq!(test.state.metrics.take_peak(), 0.5);
    assert!(matches!(
        test.receiver.try_recv(),
        Ok(SinkMessage::Samples(samples)) if samples == bytes
    ));
}

#[test]
fn disconnected_writer_sets_fatal_without_counting_samples_as_received() {
    let test = fixture(true, 1);
    drop(test.receiver);
    let bytes = stereo_samples();
    process_audio_chunk(&test.state, 0, bytes.len(), Some(&bytes));
    assert_eq!(test.state.metrics.samples_received(), 0);
    let fatal = test.state.fatal.lock().expect("fatal error");
    assert!(
        fatal
            .as_ref()
            .is_some_and(|error| error.to_string().contains("system audio writer stopped"))
    );
}
