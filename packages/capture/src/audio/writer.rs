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
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
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
                .write_sample(*sample)
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
