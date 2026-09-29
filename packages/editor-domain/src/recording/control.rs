//! Compiles source-time camera motion once, shared by preview and export.
use super::{
    follow, playback, spring,
    types::{Camera, CameraKey, Follow, Velocity},
};
use crate::{EditorError, MediaAsset, Result};

/// Builds sparse 30 Hz curves around real zooms, with bounded control-point memory.
/// GStreamer interpolates these keys; UI timers never animate the camera.
pub fn compile(asset: &MediaAsset) -> Result<Vec<CameraKey>> {
    let mut times = std::collections::BTreeSet::from([0, asset.duration_ms]);
    for zoom in asset.zooms.iter() {
        let begin = zoom.start_ms.saturating_sub(1000);
        let end = zoom.end_ms.saturating_add(2000).min(asset.duration_ms);
        times.insert(begin);
        times.insert(end);
        for time in (begin..end).step_by(33) {
            times.insert(time);
            if times.len() > 216_000 {
                return Err(EditorError::Invalid(
                    "zoom curves exceed the supported six-hour recording budget".into(),
                ));
            }
        }
    }
    let mut state = Follow::default();
    let mut velocity = Velocity::default();
    let mut camera = Camera::default();
    let mut last = 0;
    let mut keys = Vec::with_capacity(times.len());
    for time in times {
        let delta = time.saturating_sub(last);
        if delta > 100 {
            state = Follow::default();
            velocity = Velocity::default();
            camera = Camera::default();
        }
        let (desired, strength, follows) = playback::at(&asset.zooms, time as f64);
        let target = if follows {
            follow::target(
                &mut state,
                playback::cursor_at(&asset.cursor, time as f64),
                desired,
                strength,
                time as f64,
            )
        } else {
            desired
        };
        camera = spring::step(camera, target, &mut velocity, delta as f64, 11.95);
        if time == asset.duration_ms && strength < 0.01 {
            camera = Camera::default();
        }
        keys.push(CameraKey {
            time_ms: time,
            camera: playback::clamp(camera),
        });
        last = time;
    }
    Ok(keys)
}
