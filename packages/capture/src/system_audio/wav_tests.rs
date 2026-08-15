use std::fs;

use crate::CaptureError;

use super::{FloatWavWriter, SystemAudioFormat};

fn format(sample_rate: u32, channels: u16) -> SystemAudioFormat {
    SystemAudioFormat {
        sample_rate,
        channels,
    }
}

fn little_u16(bytes: &[u8]) -> u16 {
    u16::from_le_bytes([bytes[0], bytes[1]])
}

fn little_u32(bytes: &[u8]) -> u32 {
    u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
}

#[test]
fn writes_float32_wav_header_and_samples() -> Result<(), Box<dyn std::error::Error>> {
    let directory = tempfile::tempdir()?;
    let path = directory.path().join("system-audio.wav");
    let samples = [
        0x00, 0x00, 0x80, 0x3f, // 1.0
        0x00, 0x00, 0x00, 0xbf, // -0.5
    ];

    let mut writer = FloatWavWriter::create(&path, format(48_000, 2))?;
    writer.write(&samples)?;
    writer.finish()?;

    let bytes = fs::read(path)?;
    assert_eq!(&bytes[0..4], b"RIFF");
    assert_eq!(little_u32(&bytes[4..8]), 36 + samples.len() as u32);
    assert_eq!(&bytes[8..12], b"WAVE");
    assert_eq!(&bytes[12..16], b"fmt ");
    assert_eq!(little_u32(&bytes[16..20]), 16);
    assert_eq!(little_u16(&bytes[20..22]), 3);
    assert_eq!(little_u16(&bytes[22..24]), 2);
    assert_eq!(little_u32(&bytes[24..28]), 48_000);
    assert_eq!(little_u32(&bytes[28..32]), 48_000 * 2 * 4);
    assert_eq!(little_u16(&bytes[32..34]), 2 * 4);
    assert_eq!(little_u16(&bytes[34..36]), 32);
    assert_eq!(&bytes[36..40], b"data");
    assert_eq!(little_u32(&bytes[40..44]), samples.len() as u32);
    assert_eq!(&bytes[44..], samples);
    Ok(())
}

#[test]
fn accumulates_multiple_sample_blocks_and_updates_container_sizes()
-> Result<(), Box<dyn std::error::Error>> {
    let directory = tempfile::tempdir()?;
    let path = directory.path().join("system-audio.wav");
    let first = [0x01, 0x02, 0x03, 0x04];
    let second = [0x05, 0x06, 0x07, 0x08, 0x09, 0x0a];

    let mut writer = FloatWavWriter::create(&path, format(44_100, 1))?;
    writer.write(&first)?;
    writer.write(&second)?;
    writer.finish()?;

    let bytes = fs::read(path)?;
    let data_len = (first.len() + second.len()) as u32;
    assert_eq!(bytes.len(), 44 + data_len as usize);
    assert_eq!(little_u32(&bytes[4..8]), 36 + data_len);
    assert_eq!(little_u32(&bytes[40..44]), data_len);
    assert_eq!(&bytes[44..], [first.as_slice(), second.as_slice()].concat());
    Ok(())
}

#[test]
fn rejects_a_wav_larger_than_the_four_gibibyte_container_limit()
-> Result<(), Box<dyn std::error::Error>> {
    let directory = tempfile::tempdir()?;
    let path = directory.path().join("system-audio.wav");
    let mut writer = FloatWavWriter::create(&path, format(48_000, 2))?;
    writer.data_bytes = u64::from(u32::MAX) + 1;

    let result = writer.finish();
    assert!(matches!(
        result,
        Err(CaptureError::Backend(message))
            if message == "system audio WAV exceeded the 4 GB container limit"
    ));
    Ok(())
}

#[test]
fn rejects_wav_format_size_overflows() -> Result<(), Box<dyn std::error::Error>> {
    let directory = tempfile::tempdir()?;
    let path = directory.path().join("system-audio.wav");
    let writer = FloatWavWriter::create(&path, format(u32::MAX, 2))?;

    let result = writer.finish();
    assert!(matches!(
        result,
        Err(CaptureError::Backend(message)) if message == "system audio byte rate overflowed"
    ));
    Ok(())
}
