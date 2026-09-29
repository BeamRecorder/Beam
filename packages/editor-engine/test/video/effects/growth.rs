//! Native measurement uses full-HD GL surfaces; no video sink opens a window.
use super::{definition, project, types::Render};
use beam_editor_domain::animation::{Binding, Value};
use ges::prelude::*;
use std::time::Instant;

fn rss() -> u64 {
    std::fs::read_to_string("/proc/self/status")
        .unwrap()
        .lines()
        .find(|line| line.starts_with("VmRSS:"))
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap()
        .parse::<u64>()
        .unwrap()
        * 1024
}

#[cfg(target_os = "linux")]
#[test]
#[ignore = "real full-HD GPU memory and latency measurement"]
fn full_hd_one_ten_and_one_hundred_effects_measure_actual_native_resources() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        for count in [1, 10, 100] {
            let mut project = project();
            project.canvas.width = 1920;
            project.canvas.height = 1080;
            for _ in 0..count {
                let mut effect = definition(&project, "beam.color").instantiate();
                effect
                    .parameters
                    .insert("brightness".into(), Binding::constant(Value::Number(0.01)));
                crate::video::clip_mut(&mut project, 0)
                    .instances
                    .push(effect);
            }
            let before = rss();
            let started = Instant::now();
            let render = Render::new(root.path(), &project);
            let ready = started.elapsed();
            let started = Instant::now();
            let frame = render.image(400);
            let seek = started.elapsed();
            let gpu_nodes = render
                .pipeline
                .iterate_recurse()
                .into_iter()
                .flatten()
                .filter(|n| {
                    n.factory()
                        .is_some_and(|f| matches!(f.name().as_str(), "glshader" | "glcolorbalance"))
                })
                .count();
            eprintln!(
                "FULL_HD effects={count} gpu_nodes={gpu_nodes} rss_delta_bytes={} preroll_ms={} seek_ms={} frame_bytes={}",
                rss().saturating_sub(before),
                ready.as_millis(),
                seek.as_millis(),
                frame.rgba.len()
            );
            assert_eq!(frame.rgba.len(), 1920 * 1080 * 4);
            assert!(frame.rgba[(540 * 1920 + 960) * 4] > 240);
        }
    });
}
