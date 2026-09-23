#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
#[cfg(test)]
mod checks {
    use crate::{RecordingState, events::EventLog};
    #[test]
    fn empty_log_has_idle_snapshot() {
        let log = EventLog::new();
        let events = log.read(0);
        assert!(events.events.is_empty());
        assert_eq!(events.missed, 0);
        assert_eq!(events.status.state, RecordingState::Idle);
    }
    #[test]
    fn saturated_log_reports_gap_and_retains_terminal_failure() {
        let log = EventLog::new();
        let mut status = log.read(0).status;
        for i in 0..100 {
            status.state = RecordingState::Failed;
            status.error = Some(format!("error {i}"));
            log.publish(status.clone());
        }
        let events = log.read(0);
        assert_eq!(events.events.len(), 64);
        assert_eq!(events.missed, 36);
        assert_eq!(events.cursor, 100);
        assert_eq!(events.status.error.as_deref(), Some("error 99"));
        assert!(log.read(events.cursor).events.is_empty());
    }
    #[test]
    fn unchanged_snapshots_do_not_fill_log() {
        let log = EventLog::new();
        let mut status = log.read(0).status;
        status.manifest = Some(crate::backend::backend_checks::fixtures::manifest());
        log.publish(status.clone());
        for _ in 0..100 {
            log.publish(status.clone());
        }
        assert_eq!(log.read(0).events.len(), 1);
    }
}
