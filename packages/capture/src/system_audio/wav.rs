use std::{
    fs::File,
    io::{Seek, SeekFrom, Write},
    path::Path,
};

use crate::CaptureError;

use super::SystemAudioFormat;

pub(super) struct FloatWavWriter {
    file: File,
    format: SystemAudioFormat,
    data_bytes: u64,
}

impl FloatWavWriter {
    pub(super) fn create(path: &Path, format: SystemAudioFormat) -> Result<Self, CaptureError> {
        let mut file = File::create(path).map_err(|error| CaptureError::storage(path, error))?;
        file.write_all(&[0; 44])
            .map_err(|error| CaptureError::storage(path, error))?;
        Ok(Self {
            file,
            format,
            data_bytes: 0,
        })
    }

    pub(super) fn write(&mut self, samples: &[u8]) -> Result<(), CaptureError> {
        self.file.write_all(samples).map_err(|error| {
            CaptureError::Backend(format!("failed to write system audio WAV: {error}"))
        })?;
        self.data_bytes = self
            .data_bytes
            .checked_add(u64::try_from(samples.len()).map_err(|_| {
                CaptureError::Backend("system audio sample block is too large".into())
            })?)
            .ok_or_else(|| CaptureError::Backend("system audio WAV length overflowed".into()))?;
        Ok(())
    }

    pub(super) fn finish(mut self) -> Result<(), CaptureError> {
        let data_bytes = u32::try_from(self.data_bytes).map_err(|_| {
            CaptureError::Backend("system audio WAV exceeded the 4 GB container limit".into())
        })?;
        let channels = self.format.channels;
        let block_align = channels.checked_mul(4).ok_or_else(|| {
            CaptureError::Backend("system audio block alignment overflowed".into())
        })?;
        let byte_rate = self
            .format
            .sample_rate
            .checked_mul(u32::from(block_align))
            .ok_or_else(|| CaptureError::Backend("system audio byte rate overflowed".into()))?;
        let riff_size = data_bytes
            .checked_add(36)
            .ok_or_else(|| CaptureError::Backend("system audio WAV size overflowed".into()))?;
        let mut header = Vec::with_capacity(44);
        header.extend_from_slice(b"RIFF");
        header.extend_from_slice(&riff_size.to_le_bytes());
        header.extend_from_slice(b"WAVEfmt ");
        header.extend_from_slice(&16_u32.to_le_bytes());
        header.extend_from_slice(&3_u16.to_le_bytes());
        header.extend_from_slice(&channels.to_le_bytes());
        header.extend_from_slice(&self.format.sample_rate.to_le_bytes());
        header.extend_from_slice(&byte_rate.to_le_bytes());
        header.extend_from_slice(&block_align.to_le_bytes());
        header.extend_from_slice(&32_u16.to_le_bytes());
        header.extend_from_slice(b"data");
        header.extend_from_slice(&data_bytes.to_le_bytes());
        self.file
            .seek(SeekFrom::Start(0))
            .and_then(|_| self.file.write_all(&header))
            .and_then(|_| self.file.sync_all())
            .map_err(|error| {
                CaptureError::Backend(format!("failed to finalize system audio WAV: {error}"))
            })
    }
}

#[cfg(test)]
#[path = "wav_tests.rs"]
mod tests;
