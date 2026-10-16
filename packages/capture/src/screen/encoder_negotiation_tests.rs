#![allow(clippy::expect_used)]
use super::*;
use std::time::Duration;

fn deadline() -> Instant {
    Instant::now() + Duration::from_secs(5)
}

#[test]
fn accepted_accelerated_encoder_never_opens_a_second_candidate() {
    let mut calls = Vec::new();
    let result = negotiate_encoder(deadline(), |mode| {
        calls.push(mode);
        Ok(42)
    });
    assert_eq!(result.expect("accepted encoder"), 42);
    assert_eq!(calls, [EncoderMode::Accelerated]);
    assert_eq!(EncoderMode::Accelerated.label(), "accelerated");
    assert_eq!(EncoderMode::Software.label(), "software");
}

#[test]
fn type_negotiation_and_missing_codecs_can_select_software_exactly_once() {
    for code in [0xC00D6D60, 0xC00D36B4, 0xC00D5212, 0xC00DA412] {
        let mut calls = Vec::new();
        let result = negotiate_encoder(deadline(), |mode| {
            calls.push(mode);
            match mode {
                EncoderMode::Accelerated => {
                    Err(EncoderStartFailure::codec("prepare", code, "rejected"))
                }
                EncoderMode::Software => Ok(1466 * 1178),
            }
        });
        assert_eq!(result.expect("software accepted"), 1466 * 1178);
        assert_eq!(calls, [EncoderMode::Accelerated, EncoderMode::Software]);
    }
}

#[test]
fn resource_permission_storage_device_and_timeout_errors_never_retry() {
    // Out of memory, access denied, disk full, cancellation, timeout, DXGI
    // device removed and an unknown failure are not codec negotiation errors.
    for code in [
        0x8007000E, 0x80070005, 0x80070070, 0x80004004, 0x800705B4, 0x887A0005, 0x80004005,
    ] {
        let mut calls = 0;
        let error = negotiate_encoder::<()>(deadline(), |_| {
            calls += 1;
            Err(EncoderStartFailure::codec("prepare", code, "fatal"))
        })
        .expect_err("terminal failure");
        assert_eq!(calls, 1);
        assert!(error.contains(&format!("0x{code:08X}")));
        assert!(error.contains("prepare"));
    }
}

#[test]
fn both_failures_retain_their_distinct_stages_and_hresult_codes() {
    let mut calls = Vec::new();
    let error = negotiate_encoder::<()>(deadline(), |mode| {
        calls.push(mode);
        Err(match mode {
            EncoderMode::Accelerated => {
                EncoderStartFailure::codec("transcode", 0xC00D6D60, "type not set")
            }
            EncoderMode::Software => {
                EncoderStartFailure::codec("prepare", 0xC00DA412, "no encoder")
            }
        })
    })
    .expect_err("neither candidate works");
    assert_eq!(calls.len(), 2);
    for part in [
        "Accelerated",
        "software",
        "transcode",
        "prepare",
        "0xC00D6D60",
        "0xC00DA412",
    ] {
        assert!(error.contains(part), "lost diagnostic: {error}");
    }
}

#[test]
fn expired_initialization_budget_never_starts_a_candidate() {
    let mut calls = 0;
    let result = negotiate_encoder(Instant::now(), |_| {
        calls += 1;
        Ok(())
    });
    assert!(result.expect_err("expired").contains("deadline"));
    assert_eq!(calls, 0);
}

#[test]
fn candidates_share_one_budget_rather_than_restarting_the_timeout() {
    let mut calls = 0;
    let error = negotiate_encoder::<()>(Instant::now() + Duration::from_millis(10), |_| {
        calls += 1;
        std::thread::sleep(Duration::from_millis(20));
        Err(EncoderStartFailure::codec(
            "prepare",
            0xC00D6D60,
            "type not set",
        ))
    })
    .expect_err("no time to retry");
    assert_eq!(calls, 1);
    assert!(error.contains("0xC00D6D60"));
    assert!(error.contains("no time remains"));
}

#[test]
fn capability_rejection_can_select_software_but_setup_failures_cannot() {
    for retry in [true, false] {
        let mut calls = 0;
        let result = negotiate_encoder(deadline(), |mode| {
            calls += 1;
            if mode == EncoderMode::Software {
                return Ok(());
            }
            Err(if retry {
                EncoderStartFailure::unsupported("unsupported hardware profile".into())
            } else {
                EncoderStartFailure::terminal("failed to open output")
            })
        });
        assert_eq!(result.is_ok(), retry);
        assert_eq!(calls, if retry { 2 } else { 1 });
    }
}

#[test]
fn ten_thousand_mixed_starts_do_not_keep_retrying_or_lose_failures() {
    for index in 0..10_000 {
        let mut calls = 0;
        let result = negotiate_encoder(deadline(), |mode| {
            calls += 1;
            if index % 3 == 0 || (index % 3 == 1 && mode == EncoderMode::Software) {
                Ok(index)
            } else {
                Err(EncoderStartFailure::codec(
                    mode.label(),
                    0xC00D6D60,
                    "rejected",
                ))
            }
        });
        assert_eq!(result.is_ok(), index % 3 != 2);
        assert_eq!(calls, if index % 3 == 0 { 1 } else { 2 });
    }
}
