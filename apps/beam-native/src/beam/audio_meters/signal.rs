//! Real packet levels shared by the launcher's native meter previews.

use beam_audio::AudioEvent;
use beam_media_engine::AudioLevel;

/// Measures one packet without treating malformed samples as silence.
pub(super) fn level(timestamp_ns: u64, values: &[f32]) -> Result<AudioLevel, String> {
    if values.is_empty() || values.iter().any(|value| !value.is_finite()) {
        return Err("audio meter received empty or non-finite samples".into());
    }
    let peak = values
        .iter()
        .fold(0.0_f32, |peak, sample| peak.max(sample.abs()));
    let squares: f64 = values.iter().map(|sample| f64::from(*sample).powi(2)).sum();
    Ok(AudioLevel {
        timestamp_ns,
        peak,
        rms: (squares / values.len() as f64).sqrt() as f32,
    })
}

/// Reads actual PCM packets and surfaces native disconnect/failure events.
pub(super) fn drain(
    mut packet: impl FnMut() -> Result<Option<beam_audio::TimedAudioPacket>, String>,
    mut event: impl FnMut() -> Option<AudioEvent>,
) -> Result<Option<AudioLevel>, String> {
    for _ in 0..64 {
        match event() {
            Some(AudioEvent::Failed(error) | AudioEvent::Disconnected(error)) => return Err(error),
            None => break,
            _ => {}
        }
    }
    let mut latest: Option<AudioLevel> = None;
    for _ in 0..64 {
        let Some(packet) = packet()? else {
            break;
        };
        let mut value = level(packet.packet.start_ns, &packet.packet.data)?;
        if let Some(previous) = latest {
            value.peak = value.peak.max(previous.peak);
            value.rms = value.rms.max(previous.rms);
        }
        latest = Some(value);
    }
    Ok(latest)
}
