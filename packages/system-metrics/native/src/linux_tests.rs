use super::*;
use std::time::Duration;
fn client(busy: u64, capacity: u64) -> Client {
    parse(&format!("drm-driver: i915\ndrm-pdev: pci-0\ndrm-client-id: 42\ndrm-engine-render: {busy} ns\ndrm-engine-capacity-render: {capacity}\n"))
        .unwrap_or_else(|| unreachable!("valid fixture"))
}
fn clients(client: Client) -> HashMap<String, Client> {
    [(client.id.clone(), client)].into()
}
fn busy(sample: GpuSample) -> f64 {
    match sample {
        GpuSample::Sampled { devices, .. } => devices[0].engines[0].busy_percent,
        _ => unreachable!("expected real sample"),
    }
}
#[test]
fn requires_identity_and_real_counters() {
    for text in [
        "",
        "drm-driver: i915",
        "drm-driver: i915\ndrm-client-id: 1",
        "drm-driver: i915\ndrm-client-id: 1\ndrm-engine-render: bogus ns",
    ] {
        assert!(parse(text).is_none());
    }
    assert!(parse("drm-driver: i915\ndrm-client-id: 1\ndrm-engine-render: 0 ns").is_some());
}
#[test]
fn warms_then_reports_busy_time_with_engine_capacity() {
    let now = Instant::now();
    let mut sampler = Sampler::default();
    assert!(matches!(
        sampler.update(clients(client(10, 2)), now),
        GpuSample::Warming { .. }
    ));
    assert_eq!(
        busy(sampler.update(
            clients(client(1_000_000_010, 2)),
            now + Duration::from_secs(1)
        )),
        50.0
    );
}
#[test]
fn does_not_double_count_duplicate_file_descriptors() {
    let client = client(100, 1);
    let mut map = HashMap::new();
    for _ in 0..4 {
        map.insert(client.id.clone(), client.clone());
    }
    assert_eq!(map.len(), 1);
}
#[test]
fn counter_regressions_preserve_high_water_mark() {
    let now = Instant::now();
    let mut sampler = Sampler::default();
    sampler.update(clients(client(2_000_000_000, 1)), now);
    assert_eq!(
        busy(sampler.update(clients(client(1, 1)), now + Duration::from_secs(1))),
        0.0
    );
    assert_eq!(
        busy(sampler.update(
            clients(client(2_500_000_000, 1)),
            now + Duration::from_secs(2)
        )),
        50.0
    );
}
#[test]
fn gpu_clock_domain_and_zero_capacity_are_handled() {
    let mut first = client(0, 2);
    first.engines.insert(
        "render".into(),
        Counter {
            busy: 100,
            total: Some(1000),
            capacity: 2,
        },
    );
    let mut second = first.clone();
    second.engines.insert(
        "render".into(),
        Counter {
            busy: 600,
            total: Some(2000),
            capacity: 2,
        },
    );
    let now = Instant::now();
    let mut sampler = Sampler::default();
    sampler.update(clients(first), now);
    assert_eq!(
        busy(sampler.update(clients(second), now + Duration::from_millis(5))),
        25.0
    );
    assert!(parse("drm-driver: xe\ndrm-client-id: 1\ndrm-engine-render: 1 ns\ndrm-engine-capacity-render: 0").is_none());
}
#[test]
fn new_clients_and_zero_elapsed_do_not_fabricate_idle_samples() {
    let now = Instant::now();
    let mut sampler = Sampler::default();
    sampler.update(clients(client(0, 1)), now);
    assert!(matches!(
        sampler.update(clients(client(10, 1)), now),
        GpuSample::Warming { .. }
    ));
    assert!(matches!(sampler.sample(&[]), GpuSample::Unavailable { .. }));
}
