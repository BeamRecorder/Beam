use std::path::Path;

pub struct WavSegmentWriter {
    writer: Option<hound::WavWriter<std::io::BufWriter<std::fs::File>>>,
    samples: u64,
}
impl WavSegmentWriter {
    pub fn create(
        path: &Path,
        sample_rate: u32,
        channels: u16,
    ) -> Result<Self, crate::CaptureError> {
        let spec = hound::WavSpec {
            channels,
            sample_rate,
            // PCM16 is understood by Windows media APIs, Chromium and common
            // editors.  Float WAV is valid, but some consumers decode it as
            // integer PCM and turn an audio track into white noise.
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let writer = hound::WavWriter::create(path, spec)
            .map_err(|e| crate::CaptureError::Backend(e.to_string()))?;
        Ok(Self {
            writer: Some(writer),
            samples: 0,
        })
    }
    pub fn write(&mut self, samples: &[f32]) -> Result<(), crate::CaptureError> {
        let writer = self
            .writer
            .as_mut()
            .ok_or_else(|| crate::CaptureError::Backend("WAV writer already finalized".into()))?;
        for sample in samples {
            writer
                // Native APIs may report denormal, NaN or infinite samples while a
                // device is being reconfigured.  Persisting them would sound like
                // loud corruption in an otherwise valid recording.
                .write_sample(quantize_sample(*sample))
                .map_err(|e| crate::CaptureError::Backend(e.to_string()))?;
        }
        self.samples = self.samples.saturating_add(samples.len() as u64);
        Ok(())
    }
    pub fn finalize(&mut self) -> Result<(), crate::CaptureError> {
        if let Some(writer) = self.writer.take() {
            writer
                .finalize()
                .map_err(|e| crate::CaptureError::Backend(e.to_string()))?;
        }
        Ok(())
    }
    #[must_use]
    pub const fn samples_written(&self) -> u64 {
        self.samples
    }
}

fn quantize_sample(sample: f32) -> i16 {
    let sample = if sample.is_finite() {
        sample.clamp(-1.0, 1.0)
    } else {
        0.0
    };
    (sample * f32::from(i16::MAX)).round() as i16
}

#[cfg(test)]
mod tests {
    use super::quantize_sample;

    #[test]
    fn preserves_normal_samples() {
        assert_eq!(quantize_sample(0.0), 0);
        assert_eq!(quantize_sample(1.0), i16::MAX);
    }

    #[test]
    fn clamps_out_of_range_samples() {
        assert_eq!(quantize_sample(2.0), i16::MAX);
        assert_eq!(quantize_sample(-2.0), -i16::MAX);
    }

    #[test]
    fn replaces_non_finite_samples_with_silence() {
        assert_eq!(quantize_sample(f32::NAN), 0);
        assert_eq!(quantize_sample(f32::INFINITY), 0);
    }
}
