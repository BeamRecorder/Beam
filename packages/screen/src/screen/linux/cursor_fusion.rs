#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct CursorInputEvent {
    pub(crate) session_ns: u64,
    pub(crate) delta_x: i32,
    pub(crate) delta_y: i32,
}

impl CursorInputEvent {
    fn session_ns(self) -> u64 {
        self.session_ns
    }
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct FusedCursorEvent {
    pub(crate) session_ns: u64,
    pub(crate) pixel_x: i32,
    pub(crate) pixel_y: i32,
    pub(crate) normalized_x: f64,
    pub(crate) normalized_y: f64,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct CursorAnchor {
    pub(crate) session_ns: u64,
    pub(crate) pixel_x: i32,
    pub(crate) pixel_y: i32,
    pub(crate) normalized_x: f64,
    pub(crate) normalized_y: f64,
}

#[derive(Default)]
pub(crate) struct CursorFusion {
    anchor: Option<CursorAnchor>,
    pending: Vec<CursorInputEvent>,
}

impl CursorFusion {
    pub(crate) fn push(&mut self, event: CursorInputEvent) {
        self.pending.push(event);
    }

    pub(crate) fn reconcile(&mut self, target: CursorAnchor) -> Vec<FusedCursorEvent> {
        self.pending.sort_by_key(|event| event.session_ns());
        let Some(start) = self.anchor else {
            self.anchor = Some(target);
            let split = self
                .pending
                .partition_point(|event| event.session_ns() <= target.session_ns);
            self.pending.drain(..split);
            return Vec::new();
        };
        if target.session_ns <= start.session_ns {
            self.pending
                .retain(|event| event.session_ns() > start.session_ns);
            return Vec::new();
        }
        self.anchor = Some(target);

        let split = self
            .pending
            .partition_point(|event| event.session_ns() <= target.session_ns);
        let mut interval = self.pending.drain(..split).collect::<Vec<_>>();
        interval.retain(|event| event.session_ns() > start.session_ns);

        map_interval(interval, start, target)
    }

    pub(crate) fn finish(&mut self) -> Vec<FusedCursorEvent> {
        self.pending.clear();
        self.anchor = None;
        Vec::new()
    }
}

fn map_interval(
    interval: Vec<CursorInputEvent>,
    start: CursorAnchor,
    target: CursorAnchor,
) -> Vec<FusedCursorEvent> {
    let interval_duration = target.session_ns.saturating_sub(start.session_ns);

    interval
        .into_iter()
        .map(|event| {
            let progress = if interval_duration == 0 {
                1.0
            } else {
                event.session_ns.saturating_sub(start.session_ns) as f64 / interval_duration as f64
            }
            .clamp(0.0, 1.0);

            FusedCursorEvent {
                session_ns: event.session_ns,
                pixel_x: round_i32(lerp(
                    f64::from(start.pixel_x),
                    f64::from(target.pixel_x),
                    progress,
                )),
                pixel_y: round_i32(lerp(
                    f64::from(start.pixel_y),
                    f64::from(target.pixel_y),
                    progress,
                )),
                normalized_x: lerp(start.normalized_x, target.normalized_x, progress),
                normalized_y: lerp(start.normalized_y, target.normalized_y, progress),
            }
        })
        .collect()
}

fn lerp(start: f64, target: f64, progress: f64) -> f64 {
    start + (target - start) * progress
}

fn round_i32(value: f64) -> i32 {
    value
        .round()
        .clamp(f64::from(i32::MIN), f64::from(i32::MAX)) as i32
}

#[path = "../../../test/screen/linux/cursor_fusion.rs"]
mod cursor_fusion_checks;
