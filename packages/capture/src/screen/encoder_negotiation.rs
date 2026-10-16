use std::time::Instant;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum EncoderMode {
    Accelerated,
    Software,
}

impl EncoderMode {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Accelerated => "accelerated",
            Self::Software => "software",
        }
    }
}

#[derive(Clone, Debug)]
pub(crate) struct EncoderStartFailure {
    pub message: String,
    codec_rejected: bool,
}

impl EncoderStartFailure {
    pub(crate) fn terminal(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            codec_rejected: false,
        }
    }

    pub(crate) fn codec(stage: &str, code: u32, message: impl std::fmt::Display) -> Self {
        Self {
            message: format!("Windows encoder {stage}: {message} (0x{code:08X})"),
            // Media Foundation type negotiation / unavailable encoder. Storage,
            // permissions, resource exhaustion and deadlines must not be retried.
            codec_rejected: matches!(code, 0xC00D6D60 | 0xC00D36B4 | 0xC00D5212 | 0xC00DA412),
        }
    }

    pub(crate) fn unsupported(message: String) -> Self {
        Self {
            message,
            codec_rejected: true,
        }
    }
}

/// Select once, before any recording samples are submitted. Both candidates
/// share a deadline; this must never restart an in-progress media segment.
pub(crate) fn negotiate_encoder<T>(
    deadline: Instant,
    mut attempt: impl FnMut(EncoderMode) -> Result<T, EncoderStartFailure>,
) -> Result<T, String> {
    if Instant::now() >= deadline {
        return Err("Windows encoder initialization exceeded its deadline".into());
    }
    let accelerated = match attempt(EncoderMode::Accelerated) {
        Ok(encoder) => return Ok(encoder),
        Err(error) => error,
    };
    if !accelerated.codec_rejected {
        return Err(accelerated.message);
    }
    if Instant::now() >= deadline {
        return Err(format!(
            "{}; no time remains for software encoder initialization",
            accelerated.message
        ));
    }
    attempt(EncoderMode::Software).map_err(|software| {
        format!(
            "Accelerated encoder: {}; software encoder: {}",
            accelerated.message, software.message
        )
    })
}

#[cfg(test)]
#[path = "encoder_negotiation_tests.rs"]
mod tests;
