#![allow(clippy::expect_used)]

use std::process::Command;

#[test]
fn process_sampler_counts_the_probe_once_without_counting_threads() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let output = temporary.path().join("session");
    let result = Command::new(env!("CARGO_BIN_EXE_beam-media-probe"))
        .args([
            "record",
            "--output",
            output.to_str().expect("path"),
            "--duration",
            "2",
            "--no-camera",
            "--no-microphone",
            "--no-system-audio",
        ])
        .status()
        .expect("record");
    assert!(!result.success());
    let measurements: serde_json::Value = serde_json::from_slice(
        &std::fs::read(output.join("measurements.json")).expect("measurements"),
    )
    .expect("JSON");
    let samples = measurements["processSamples"].as_array().expect("samples");
    assert!(!samples.is_empty());
    assert_eq!(samples[0]["processCount"], 1);
    assert!(samples[0].get("previewFramesUploaded").is_none());
    assert!(samples[0]["rssBytes"].as_u64().expect("RSS") < 512 * 1024 * 1024);
    assert!(measurements["probeLoop"]["polls"].as_u64().expect("polls") > 0);
    assert!(
        measurements["probeLoop"]["pollMaxDurationNs"]
            .as_u64()
            .expect("poll duration")
            > 0
    );
    assert_eq!(
        measurements["probeLoop"]["resourceSamples"],
        samples.len() as u64
    );
    assert!(
        measurements["probeLoop"]["resourceSampleMaxDurationNs"]
            .as_u64()
            .expect("sampler duration")
            > 0
    );
    let report = Command::new(env!("CARGO_BIN_EXE_beam-media-probe"))
        .args(["report", "--output", output.to_str().expect("path")])
        .output()
        .expect("report");
    assert!(report.status.success());
    let report: serde_json::Value = serde_json::from_slice(&report.stdout).expect("report JSON");
    assert_eq!(report["probeLoop"], measurements["probeLoop"]);
}
