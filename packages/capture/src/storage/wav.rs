use std::{
    fs::File,
    io::{Seek, SeekFrom, Write},
    path::Path,
};

use crate::CaptureError;

pub struct WavWriter {
    file: File,
    sample_rate: u32,
    channels: u16,
    data_bytes: u64,
}

impl WavWriter {
    pub fn create(path: &Path, sample_rate: u32, channels: u16) -> Result<Self, CaptureError> {
        if sample_rate == 0 || channels == 0 {
            return Err(CaptureError::InvalidConfiguration(
                "WAV format must have a sample rate and channels".into(),
            ));
        }
        let mut file = File::create(path).map_err(|error| CaptureError::storage(path, error))?;
        file.write_all(&[0u8; 44])
            .map_err(|error| CaptureError::storage(path, error))?;
        Ok(Self {
            file,
            sample_rate,
            channels,
            data_bytes: 0,
        })
    }

    pub fn write_f32(&mut self, samples: &[f32]) -> Result<(), CaptureError> {
        let mut bytes = Vec::with_capacity(samples.len() * 4);
        for sample in samples {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        self.file
            .write_all(&bytes)
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        self.data_bytes = self.data_bytes.saturating_add(bytes.len() as u64);
        Ok(())
    }

    pub fn finish(mut self) -> Result<u64, CaptureError> {
        let data_len = u32::try_from(self.data_bytes).map_err(|_| {
            CaptureError::Backend("WAV segment is larger than the RIFF limit".into())
        })?;
        let byte_rate = self
            .sample_rate
            .saturating_mul(u32::from(self.channels))
            .saturating_mul(4);
        let block_align = self.channels.saturating_mul(4);
        let riff_len = 36u32.saturating_add(data_len);
        self.file
            .seek(SeekFrom::Start(0))
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        self.file
            .write_all(b"RIFF")
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        self.file
            .write_all(&riff_len.to_le_bytes())
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        self.file
            .write_all(b"WAVEfmt ")
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        self.file
            .write_all(&16u32.to_le_bytes())
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        self.file
            .write_all(&3u16.to_le_bytes())
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        self.file
            .write_all(&self.channels.to_le_bytes())
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        self.file
            .write_all(&self.sample_rate.to_le_bytes())
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        self.file
            .write_all(&byte_rate.to_le_bytes())
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        self.file
            .write_all(&block_align.to_le_bytes())
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        self.file
            .write_all(&32u16.to_le_bytes())
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        self.file
            .write_all(b"data")
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        self.file
            .write_all(&data_len.to_le_bytes())
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        self.file
            .flush()
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        self.file
            .sync_all()
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        Ok(u64::from(data_len) + 44)
    }
}
