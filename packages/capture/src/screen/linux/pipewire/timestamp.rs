use crate::screen::{FrameTimestamp, ScreenDiscontinuity, TimestampSource};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct HeaderMetadata {
    pub pts_ns: Option<u64>,
    pub sequence: u64,
    pub discont: bool,
    pub corrupted: bool,
    pub gap: bool,
}

#[derive(Debug)]
pub(crate) struct TimestampMapper {
    segment_start_ns: u64,
    source: Option<TimestampSource>,
    first_native_pts_ns: Option<u64>,
    first_arrival_ns: Option<u64>,
    last_native_pts_ns: Option<u64>,
    last_session_ns: Option<u64>,
}

impl TimestampMapper {
    #[must_use]
    pub(crate) fn new(segment_start_ns: u64) -> Self {
        Self {
            segment_start_ns,
            source: None,
            first_native_pts_ns: None,
            first_arrival_ns: None,
            last_native_pts_ns: None,
            last_session_ns: None,
        }
    }

    pub(crate) fn map(
        &mut self,
        header: HeaderMetadata,
        arrival_ns: u64,
    ) -> Result<FrameTimestamp, ScreenDiscontinuity> {
        if header.corrupted || header.gap || header.discont {
            return Err(self.discontinuity(
                "pipewire-timestamp-discontinuity",
                "PipeWire marked the buffer discontinuous, corrupt, or a gap",
            ));
        }
        let source = *self.source.get_or_insert(if header.pts_ns.is_some() {
            TimestampSource::NativePresentation
        } else {
            TimestampSource::MonotonicArrival
        });
        let session_ns = match source {
            TimestampSource::NativePresentation => {
                let pts = header.pts_ns.ok_or_else(|| {
                    self.discontinuity(
                        "pipewire-timestamp-discontinuity",
                        "native PTS disappeared within a segment",
                    )
                })?;
                if self.last_native_pts_ns.is_some_and(|last| pts < last) {
                    return Err(self.discontinuity(
                        "pipewire-timestamp-discontinuity",
                        "native PTS regressed within a segment",
                    ));
                }
                let first = *self.first_native_pts_ns.get_or_insert(pts);
                self.segment_start_ns
                    .checked_add(pts - first)
                    .ok_or_else(|| {
                        self.discontinuity(
                            "pipewire-timestamp-discontinuity",
                            "mapped native PTS overflowed the session timeline",
                        )
                    })?
            }
            TimestampSource::MonotonicArrival => {
                let first = *self.first_arrival_ns.get_or_insert(arrival_ns);
                let elapsed = arrival_ns.checked_sub(first).ok_or_else(|| {
                    self.discontinuity(
                        "pipewire-timestamp-discontinuity",
                        "monotonic arrival timestamp regressed",
                    )
                })?;
                self.segment_start_ns.checked_add(elapsed).ok_or_else(|| {
                    self.discontinuity(
                        "pipewire-timestamp-discontinuity",
                        "arrival timestamp overflowed the session timeline",
                    )
                })?
            }
        };
        if self.last_session_ns.is_some_and(|last| session_ns < last) {
            return Err(self.discontinuity(
                "pipewire-timestamp-discontinuity",
                "mapped session timestamp regressed",
            ));
        }
        let native_pts_ns = match source {
            TimestampSource::NativePresentation => header.pts_ns,
            TimestampSource::MonotonicArrival => None,
        };
        self.last_native_pts_ns = native_pts_ns;
        self.last_session_ns = Some(session_ns);
        Ok(FrameTimestamp {
            session_ns,
            native_pts_ns,
            source,
        })
    }

    fn discontinuity(&self, code: &str, message: &str) -> ScreenDiscontinuity {
        ScreenDiscontinuity {
            session_ns: self.last_session_ns.unwrap_or(self.segment_start_ns),
            lost_frames: 1,
            code: code.into(),
            message: message.into(),
        }
    }
}
