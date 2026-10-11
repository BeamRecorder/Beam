#![allow(clippy::expect_used)]
use super::FramePool;
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

#[test]
fn a_million_frames_never_allocate_beyond_the_inflight_limit() {
    let pool = FramePool::new(3);
    let allocations = AtomicUsize::new(0);
    let mut retained = Vec::new();
    for frame in 0..1_000_000 {
        let lease = pool
            .acquire(|| Ok::<_, ()>(allocations.fetch_add(1, Ordering::Relaxed)))
            .expect("allocation");
        if let Some(lease) = lease {
            retained.push(lease);
        }
        assert!(allocations.load(Ordering::Relaxed) <= 3);
        if frame % 17 == 0 && !retained.is_empty() {
            retained.remove(0);
        }
    }
    assert_eq!(allocations.load(Ordering::Relaxed), 3);
}

#[test]
fn retaining_a_sample_prevents_surface_reuse_until_its_last_consumer_finishes() {
    let pool = FramePool::new(1);
    let producer = pool
        .acquire(|| Ok::<_, ()>(42))
        .expect("allocate")
        .expect("lease");
    let sample = producer.clone();
    let retained_still = sample.clone();
    drop(producer);
    drop(sample);
    assert!(!pool.available());
    assert!(
        pool.acquire(|| Ok::<_, ()>(99))
            .expect("capacity")
            .is_none()
    );
    drop(retained_still);
    assert!(pool.available());
    assert_eq!(
        *pool
            .acquire(|| Err::<i32, _>(()))
            .expect("reused")
            .expect("lease")
            .value(),
        42
    );
}

#[test]
fn allocation_failure_and_concurrent_returns_do_not_leak_capacity() {
    let pool = Arc::new(FramePool::new(4));
    for _ in 0..1000 {
        assert!(pool.acquire(|| Err::<usize, _>(())).is_err());
    }
    std::thread::scope(|scope| {
        for _ in 0..16 {
            let pool = pool.clone();
            scope.spawn(move || {
                for _ in 0..10_000 {
                    if let Some(lease) = pool.acquire(|| Ok::<_, ()>(7)).expect("allocate") {
                        assert_eq!(*lease.value(), 7);
                        std::thread::yield_now();
                    }
                }
            });
        }
    });
    let leases = (0..4)
        .map(|_| {
            pool.acquire(|| Ok::<_, ()>(7))
                .expect("available")
                .expect("lease")
        })
        .collect::<Vec<_>>();
    assert!(!pool.available());
    drop(leases);
    assert!(pool.available());
}
