use std::sync::{Arc, Mutex};

use crossbeam_channel::Receiver;

use crate::CaptureError;
use crate::system_audio::{SystemAudioFormat, SystemAudioSegment, wav::FloatWavWriter};

use super::{
    SinkMessage,
    support::{set_fatal, take_fatal},
};

pub(super) fn writer_worker(
    receiver: Receiver<SinkMessage>,
    format: SystemAudioFormat,
    initial: Option<FloatWavWriter>,
    fatal: Arc<Mutex<Option<CaptureError>>>,
) -> Result<(), CaptureError> {
    let mut writer = initial;
    while let Ok(message) = receiver.recv() {
        let result = match message {
            SinkMessage::Samples(samples) => writer
                .as_mut()
                .map_or(Ok(()), |writer| writer.write(&samples)),
            SinkMessage::Begin(segment, reply) => {
                let result = begin_segment(&mut writer, format, segment);
                let failed = result.is_err();
                let _ = reply.send(result);
                if failed {
                    break;
                }
                continue;
            }
            SinkMessage::End(reply) => {
                let result = writer
                    .take()
                    .ok_or_else(|| {
                        CaptureError::Backend("system audio segment is not open".into())
                    })?
                    .finish();
                let failed = result.is_err();
                let _ = reply.send(result);
                if failed {
                    break;
                }
                continue;
            }
            SinkMessage::Finish => {
                if let Some(writer) = writer.take() {
                    writer.finish()?;
                }
                return Ok(());
            }
        };
        if let Err(error) = result {
            set_fatal(&fatal, error);
            break;
        }
    }
    take_fatal(&fatal)
}

fn begin_segment(
    writer: &mut Option<FloatWavWriter>,
    format: SystemAudioFormat,
    segment: SystemAudioSegment,
) -> Result<(), CaptureError> {
    let _ = segment.start_ns;
    if writer.is_some() {
        return Err(CaptureError::Backend(
            "system audio segment is already open".into(),
        ));
    }
    *writer = Some(FloatWavWriter::create(&segment.path, format)?);
    Ok(())
}
