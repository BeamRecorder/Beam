//! Time comparisons never accumulate floating-point frame increments.
pub mod clock_types;
pub mod sequence_types;
pub mod types;
use crate::{EditorError, Result};
pub use clock_types::ClipClock;
pub use sequence_types::SequenceClock;
pub use types::*;

impl Time {
    pub const ZERO: Self = Self {
        ticks: 0,
        timescale: 1000,
    };
    pub fn milliseconds(value: i64) -> Self {
        Self {
            ticks: value,
            timescale: 1000,
        }
    }
    pub fn validate(self) -> Result<()> {
        if self.timescale == 0 || self.ticks.unsigned_abs() > MAX_TICKS as u64 {
            return Err(EditorError::Invalid(
                "time exceeds exact integer budget or has zero timescale".into(),
            ));
        }
        Ok(())
    }
    pub fn compare(self, other: Self) -> std::cmp::Ordering {
        (i128::from(self.ticks) * i128::from(other.timescale))
            .cmp(&(i128::from(other.ticks) * i128::from(self.timescale)))
    }
    /// Rounds once, at a backend boundary; ties round away from zero.
    pub fn rescale(self, scale: u32) -> Result<Self> {
        self.validate()?;
        if scale == 0 {
            return Err(EditorError::Invalid("zero timescale".into()));
        }
        let value = i128::from(self.ticks) * i128::from(scale);
        let divisor = i128::from(self.timescale);
        let rounded = (value.abs() + divisor / 2) / divisor * value.signum();
        let result = Self {
            ticks: i64::try_from(rounded)
                .map_err(|_| EditorError::Invalid("time overflow".into()))?,
            timescale: scale,
        };
        result.validate()?;
        Ok(result)
    }
    pub fn seconds(self) -> f64 {
        self.ticks as f64 / self.timescale as f64
    }
    pub fn nanoseconds(self) -> Result<u64> {
        let ticks = self.rescale(1_000_000_000)?.ticks;
        u64::try_from(ticks).map_err(|_| EditorError::Invalid("negative backend time".into()))
    }
}
impl FrameRate {
    pub fn time_at_frame(self, frame: i64) -> Result<Time> {
        if self.numerator == 0 || self.denominator == 0 {
            return Err(EditorError::Invalid("invalid frame rate".into()));
        }
        let time = Time {
            ticks: frame
                .checked_mul(i64::from(self.denominator))
                .ok_or_else(|| EditorError::Invalid("frame time overflow".into()))?,
            timescale: self.numerator,
        };
        time.validate()?;
        Ok(time)
    }
}
impl TimeRange {
    pub fn validate(self) -> Result<()> {
        self.start.validate()?;
        self.end.validate()?;
        if self.start.compare(self.end).is_ge() {
            return Err(EditorError::Invalid(
                "range must be nonempty and half-open".into(),
            ));
        }
        Ok(())
    }
    pub fn contains(self, time: Time) -> bool {
        time.compare(self.start).is_ge() && time.compare(self.end).is_lt()
    }
}
impl Rate {
    pub fn validate(self) -> Result<()> {
        if self.numerator == 0 || self.denominator == 0 {
            return Err(EditorError::Invalid("speed must be positive".into()));
        }
        Ok(())
    }
    pub fn source_offset(self, local_ms: u64) -> Result<u64> {
        self.validate()?;
        let result =
            u128::from(local_ms) * u128::from(self.numerator) / u128::from(self.denominator);
        u64::try_from(result).map_err(|_| EditorError::Invalid("source mapping overflow".into()))
    }
}
/// Converts an absolute sequence time through one clip's mapping, also for handles.
pub fn map_time<T: ClipClock + ?Sized>(clip: &T, sequence: Time, space: TimeSpace) -> Result<Time> {
    sequence.validate()?;
    clip.validate_space(space)?;
    if space == TimeSpace::Sequence {
        return Ok(sequence);
    }
    validate_mapping(clip)?;
    let scale = i128::from(sequence.timescale);
    let local = add(
        mul(i128::from(sequence.ticks), 1000)?,
        -mul(i128::from(clip.start_ms()), scale)?,
    )?;
    let (numerator, denominator) = match space {
        TimeSpace::Sequence => unreachable!(),
        TimeSpace::ClipLocal => (
            add(local, mul(i128::from(clip.animation_offset_ms()), scale)?)?,
            mul(1000, scale)?,
        ),
        TimeSpace::Source => (
            add(
                mul(
                    mul(i128::from(clip.source_in_ms()), scale)?,
                    i128::from(clip.rate().denominator),
                )?,
                mul(local, i128::from(clip.rate().numerator))?,
            )?,
            mul(mul(1000, scale)?, i128::from(clip.rate().denominator))?,
        ),
    };
    rational_time(numerator, denominator)
}

/// Converts immutable source time to sequence time, including transition handles.
pub fn sequence_time<T: ClipClock + ?Sized>(clip: &T, source: Time) -> Result<Time> {
    source.validate()?;
    clip.validate_space(TimeSpace::Source)?;
    validate_mapping(clip)?;
    let scale = i128::from(source.timescale);
    let rate = i128::from(clip.rate().numerator);
    let source_offset = add(
        mul(i128::from(source.ticks), 1000)?,
        -mul(i128::from(clip.source_in_ms()), scale)?,
    )?;
    let numerator = add(
        mul(mul(i128::from(clip.start_ms()), scale)?, rate)?,
        mul(source_offset, i128::from(clip.rate().denominator))?,
    )?;
    rational_time(numerator, mul(mul(scale, rate)?, 1000)?)
}

/// Inverse of map_time; consumers never reproduce source/local mapping formulas.
pub fn unmap_time<T: ClipClock + ?Sized>(clip: &T, time: Time, space: TimeSpace) -> Result<Time> {
    time.validate()?;
    clip.validate_space(space)?;
    match space {
        TimeSpace::Sequence => Ok(time),
        TimeSpace::Source => sequence_time(clip, time),
        TimeSpace::ClipLocal => {
            validate_mapping(clip)?;
            rational_time(
                add(
                    mul(i128::from(time.ticks), 1000)?,
                    mul(
                        i128::from(clip.start_ms()) - i128::from(clip.animation_offset_ms()),
                        i128::from(time.timescale),
                    )?,
                )?,
                mul(i128::from(time.timescale), 1000)?,
            )
        }
    }
}
fn rational_time(numerator: i128, denominator: i128) -> Result<Time> {
    if denominator <= 0 {
        return Err(mapping_error());
    }
    let (mut a, mut b) = (
        numerator.checked_abs().ok_or_else(mapping_error)?,
        denominator,
    );
    while b != 0 {
        let remainder = a % b;
        a = b;
        b = remainder;
    }
    let divisor = a.max(1);
    let (ticks, timescale) = (numerator / divisor, denominator / divisor);
    let result = if timescale <= u32::MAX as i128 {
        Time {
            ticks: i64::try_from(ticks)
                .map_err(|_| EditorError::Invalid("mapped time overflow".into()))?,
            timescale: timescale as u32,
        }
    } else {
        // Split whole seconds and the remainder before multiplying. Even an
        // invalid enormous input then returns an error instead of overflowing.
        let whole = mul(ticks / timescale, 1_000_000_000)?;
        let remainder = ticks % timescale;
        let partial = add(mul(remainder.abs(), 1_000_000_000)?, timescale / 2)? / timescale;
        let ticks = add(whole, partial * remainder.signum())?;
        Time {
            ticks: i64::try_from(ticks)
                .map_err(|_| EditorError::Invalid("mapped time overflow".into()))?,
            timescale: 1_000_000_000,
        }
    };
    result.validate()?;
    Ok(result)
}
fn validate_mapping<T: ClipClock + ?Sized>(clip: &T) -> Result<()> {
    clip.rate().validate()?;
    if clip.start_ms() > crate::project::types::MAX_DURATION_MS
        || clip.source_in_ms() > crate::project::types::MAX_DURATION_MS
        || clip.animation_offset_ms().unsigned_abs() > MAX_TICKS as u64
    {
        return Err(EditorError::Invalid(
            "clip origins exceed the exact mapping budget".into(),
        ));
    }
    Ok(())
}
fn mapping_error() -> EditorError {
    EditorError::Invalid("mapped time exceeds the exact rational budget".into())
}
fn mul(a: i128, b: i128) -> Result<i128> {
    a.checked_mul(b).ok_or_else(mapping_error)
}
fn add(a: i128, b: i128) -> Result<i128> {
    a.checked_add(b).ok_or_else(mapping_error)
}
