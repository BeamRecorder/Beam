//! Seek-independent 2D easing and connected pans from Beam's zoom-playback.ts.
use super::types::{Camera, CursorPoint, Zoom};

/// Keeps the viewport within the source at the current magnification.
pub fn clamp(camera: Camera) -> Camera {
    let margin = 1. / (2. * camera.scale.max(1.));
    Camera {
        x: camera.x.clamp(margin, 1. - margin),
        y: camera.y.clamp(margin, 1. - margin),
        ..camera
    }
}
/// Calculates the existing Beam zoom envelope, including short regions.
pub fn strength(zoom: &Zoom, time_ms: f64) -> f64 {
    let time = time_ms - 200.;
    let start = zoom.start_ms as f64 + 1000. - 1522.575;
    let mut in_end = start + 1522.575;
    let mut out_start = zoom.end_ms as f64 - 500.;
    if in_end > out_start {
        let midpoint = (in_end + out_start) / 2.;
        in_end = midpoint;
        out_start = midpoint;
    }
    if time < start || time > out_start + 1015.05 {
        0.
    } else if time < in_end {
        ease((time - start) / (in_end - start).max(1.))
    } else if time <= out_start {
        1.
    } else {
        1. - ease((time - out_start) / 1015.05)
    }
}
/// Interpolates captured cursor movement using a binary source-time search.
pub fn cursor_at(points: &[CursorPoint], time_ms: f64) -> Option<Camera> {
    let index = points.partition_point(|p| p.time_ms as f64 <= time_ms);
    let previous = index.checked_sub(1).and_then(|i| points.get(i));
    let next = points.get(index);
    match (previous, next) {
        (Some(a), Some(b)) => {
            let t = (time_ms - a.time_ms as f64) / (b.time_ms - a.time_ms).max(1) as f64;
            Some(Camera {
                x: lerp(a.cx, b.cx, t),
                y: lerp(a.cy, b.cy, t),
                scale: 1.,
            })
        }
        (Some(p), None) | (None, Some(p)) => Some(Camera {
            x: p.cx,
            y: p.cy,
            scale: 1.,
        }),
        _ => None,
    }
}
/// Evaluates a sorted zoom list, returning the camera, envelope, and follow permission.
pub fn at(zooms: &[Zoom], time: f64) -> (Camera, f64, bool) {
    for pair in zooms.windows(2) {
        let (a, b) = (&pair[0], &pair[1]);
        let pan = a.end_ms as f64 + 200.;
        if b.start_ms.saturating_sub(a.end_ms) <= 1350 && time >= pan && time <= pan + 1000. {
            let t = ease((time - pan) / 1000.);
            let left = focus(a);
            let right = focus(b);
            return (
                Camera {
                    x: lerp(left.x, right.x, t),
                    y: lerp(left.y, right.y, t),
                    scale: lerp(left.scale, right.scale, t),
                },
                1.,
                false,
            );
        }
    }
    let best = zooms
        .iter()
        .map(|z| (z, strength(z, time)))
        .filter(|(_, s)| *s > 0.)
        .max_by(|(a, x), (b, y)| x.total_cmp(y).then(a.start_ms.cmp(&b.start_ms)));
    match best {
        Some((zoom, value)) => (
            Camera {
                scale: 1. + (zoom.scale - 1.) * value,
                ..focus(zoom)
            },
            value,
            true,
        ),
        None => (Camera::default(), 0., false),
    }
}
fn focus(zoom: &Zoom) -> Camera {
    clamp(Camera {
        x: zoom.cx,
        y: zoom.cy,
        scale: zoom.scale,
    })
}
fn ease(t: f64) -> f64 {
    1. - (1. - t.clamp(0., 1.)).powi(3)
}
fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}
