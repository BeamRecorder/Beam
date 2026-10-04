use std::{
    sync::Mutex,
    time::{Duration, Instant},
};

const INPUT_STREAM_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Default)]
pub(super) struct InputStreamHealth {
    last_message: Mutex<Option<Instant>>,
}

impl InputStreamHealth {
    pub(super) fn received(&self, now: Instant) {
        if let Ok(mut last) = self.last_message.lock() {
            *last = Some(now);
        }
    }

    pub(super) fn responsive(&self, now: Instant) -> bool {
        self.last_message.lock().is_ok_and(|last| {
            last.is_some_and(|last| now.saturating_duration_since(last) <= INPUT_STREAM_TIMEOUT)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_stream_without_any_valid_message_is_not_responsive() {
        assert!(!InputStreamHealth::default().responsive(Instant::now()));
    }

    #[test]
    fn idle_stream_heartbeats_remain_healthy_without_clicks() {
        let health = InputStreamHealth::default();
        let now = Instant::now();
        health.received(now);
        assert!(health.responsive(now + INPUT_STREAM_TIMEOUT));
        health.received(now + Duration::from_secs(2));
        assert!(health.responsive(now + Duration::from_secs(4)));
    }

    #[test]
    fn a_stalled_stream_expires_just_after_the_timeout() {
        let health = InputStreamHealth::default();
        let now = Instant::now();
        health.received(now);
        assert!(!health.responsive(now + INPUT_STREAM_TIMEOUT + Duration::from_nanos(1)));
    }

    #[test]
    fn receiving_a_new_message_restores_liveness() {
        let health = InputStreamHealth::default();
        let now = Instant::now();
        health.received(now);
        let later = now + Duration::from_secs(20);
        assert!(!health.responsive(later));
        health.received(later);
        assert!(health.responsive(later));
    }
}
