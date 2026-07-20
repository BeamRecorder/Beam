use std::{
    path::Path,
    ptr::{self, NonNull},
    sync::Arc,
    thread::JoinHandle,
    time::Duration,
};

use crossbeam_channel::{Receiver, Sender, bounded};
use objc2::runtime::AnyObject;
use objc2_av_foundation::{
    AVAssetWriter, AVAssetWriterInput, AVAssetWriterInputPixelBufferAdaptor, AVFileTypeMPEG4,
    AVMediaTypeVideo, AVVideoCodecKey, AVVideoCodecTypeH264, AVVideoHeightKey, AVVideoWidthKey,
};
use objc2_core_foundation::CFRetained;
use objc2_core_media::CMTime;
use objc2_core_video::{
    CVPixelBuffer, CVPixelBufferCreate, CVPixelBufferGetBaseAddress, CVPixelBufferGetBytesPerRow,
    CVPixelBufferLockBaseAddress, CVPixelBufferLockFlags, CVPixelBufferUnlockBaseAddress,
    kCVPixelFormatType_32BGRA,
};
use objc2_foundation::{NSDictionary, NSNumber, NSString, NSURL};

use crate::CaptureError;

use super::capture::MacCameraMetrics;

pub(super) struct VideoFrame {
    pub rgba: Vec<u8>,
    pub timestamp_ns: i64,
}

pub(super) struct WriterHandle {
    thread: Option<JoinHandle<Result<(), CaptureError>>>,
}

impl WriterHandle {
    pub fn finish(mut self) -> Result<(), CaptureError> {
        self.thread
            .take()
            .ok_or_else(|| CaptureError::Backend("macOS camera writer missing".into()))?
            .join()
            .map_err(|_| CaptureError::Backend("macOS camera writer panicked".into()))?
    }
}

pub(super) fn spawn_writer(
    output: &Path,
    width: u32,
    height: u32,
    capacity: usize,
    metrics: Arc<MacCameraMetrics>,
) -> Result<(Sender<VideoFrame>, WriterHandle), CaptureError> {
    let (frame_sender, frame_receiver) = bounded(capacity);
    let (ready_sender, ready_receiver) = std::sync::mpsc::sync_channel(1);
    let output = output.to_owned();
    let thread = std::thread::Builder::new()
        .name("capture-macos-camera-writer".into())
        .spawn(move || {
            writer_loop(
                &output,
                width,
                height,
                frame_receiver,
                metrics,
                &ready_sender,
            )
        })
        .map_err(backend_error)?;
    ready_receiver.recv().map_err(|_| {
        CaptureError::Backend("macOS camera writer startup channel closed".into())
    })??;
    Ok((
        frame_sender,
        WriterHandle {
            thread: Some(thread),
        },
    ))
}

fn writer_loop(
    output: &Path,
    width: u32,
    height: u32,
    frames: Receiver<VideoFrame>,
    metrics: Arc<MacCameraMetrics>,
    ready: &std::sync::mpsc::SyncSender<Result<(), CaptureError>>,
) -> Result<(), CaptureError> {
    let initialized = create_writer(output, width, height);
    let (writer, input, adaptor) = match initialized {
        Ok(value) => value,
        Err(error) => {
            let _sent = ready.send(Err(CaptureError::Backend(error.to_string())));
            return Err(error);
        }
    };
    ready
        .send(Ok(()))
        .map_err(|_| CaptureError::Backend("macOS camera writer startup receiver closed".into()))?;
    for frame in frames {
        while !unsafe { input.isReadyForMoreMediaData() } {
            std::thread::sleep(Duration::from_millis(1));
        }
        let buffer = pixel_buffer(&frame.rgba, width, height)?;
        let timestamp = unsafe { CMTime::new(frame.timestamp_ns, 1_000_000_000) };
        if !unsafe { adaptor.appendPixelBuffer_withPresentationTime(&buffer, timestamp) } {
            return Err(writer_error(&writer, "could not append camera frame"));
        }
        metrics.encoded_one();
    }
    unsafe { input.markAsFinished() };
    if !unsafe { writer.finishWriting() } {
        return Err(writer_error(&writer, "could not finalize camera MP4"));
    }
    Ok(())
}

type InitializedWriter = (
    objc2::rc::Retained<AVAssetWriter>,
    objc2::rc::Retained<AVAssetWriterInput>,
    objc2::rc::Retained<AVAssetWriterInputPixelBufferAdaptor>,
);

fn create_writer(
    output: &Path,
    width: u32,
    height: u32,
) -> Result<InitializedWriter, CaptureError> {
    let path = NSString::from_str(&output.to_string_lossy());
    let url = NSURL::fileURLWithPath(&path);
    let file_type = unsafe { AVFileTypeMPEG4 }.ok_or_else(|| {
        CaptureError::Backend("MPEG-4 is unavailable on this macOS version".into())
    })?;
    let writer = unsafe { AVAssetWriter::assetWriterWithURL_fileType_error(&url, file_type) }
        .map_err(|error| backend_error(format!("{error:?}")))?;
    let codec_key = unsafe { AVVideoCodecKey }
        .ok_or_else(|| CaptureError::Backend("AVVideoCodecKey is unavailable".into()))?;
    let width_key = unsafe { AVVideoWidthKey }
        .ok_or_else(|| CaptureError::Backend("AVVideoWidthKey is unavailable".into()))?;
    let height_key = unsafe { AVVideoHeightKey }
        .ok_or_else(|| CaptureError::Backend("AVVideoHeightKey is unavailable".into()))?;
    let codec = unsafe { AVVideoCodecTypeH264 }.ok_or_else(|| {
        CaptureError::Backend("H.264 is unavailable on this macOS version".into())
    })?;
    let width_value = NSNumber::new_u32(width);
    let height_value = NSNumber::new_u32(height);
    let keys = [codec_key, width_key, height_key];
    let values: [&AnyObject; 3] = [codec, &width_value, &height_value];
    let settings = NSDictionary::from_slices(&keys, &values);
    let media_type = unsafe { AVMediaTypeVideo }
        .ok_or_else(|| CaptureError::Backend("video media type is unavailable".into()))?;
    let input = unsafe {
        AVAssetWriterInput::assetWriterInputWithMediaType_outputSettings(
            media_type,
            Some(&settings),
        )
    };
    unsafe { input.setExpectsMediaDataInRealTime(true) };
    if !unsafe { writer.canAddInput(&input) } {
        return Err(CaptureError::Backend(
            "AVAssetWriter rejected the camera input".into(),
        ));
    }
    unsafe { writer.addInput(&input) };
    let adaptor = unsafe {
        AVAssetWriterInputPixelBufferAdaptor::assetWriterInputPixelBufferAdaptorWithAssetWriterInput_sourcePixelBufferAttributes(
            &input,
            None,
        )
    };
    if !unsafe { writer.startWriting() } {
        return Err(writer_error(&writer, "could not start camera MP4 writer"));
    }
    unsafe { writer.startSessionAtSourceTime(CMTime::new(0, 1_000_000_000)) };
    Ok((writer, input, adaptor))
}

fn pixel_buffer(
    rgba: &[u8],
    width: u32,
    height: u32,
) -> Result<CFRetained<CVPixelBuffer>, CaptureError> {
    let mut raw = ptr::null_mut();
    let status = unsafe {
        CVPixelBufferCreate(
            None,
            width as usize,
            height as usize,
            kCVPixelFormatType_32BGRA,
            None,
            NonNull::from(&mut raw),
        )
    };
    if status != 0 {
        return Err(backend_error(format!(
            "CVPixelBufferCreate returned {status}"
        )));
    }
    let raw = NonNull::new(raw)
        .ok_or_else(|| CaptureError::Backend("CVPixelBufferCreate returned null".into()))?;
    let buffer = unsafe { CFRetained::from_raw(raw) };
    let flags = CVPixelBufferLockFlags::empty();
    let lock_status = unsafe { CVPixelBufferLockBaseAddress(&buffer, flags) };
    if lock_status != 0 {
        return Err(backend_error(format!(
            "CVPixelBufferLockBaseAddress returned {lock_status}"
        )));
    }
    let copy_result = copy_rgba_as_bgra(&buffer, rgba, width as usize, height as usize);
    let unlock_status = unsafe { CVPixelBufferUnlockBaseAddress(&buffer, flags) };
    copy_result?;
    if unlock_status != 0 {
        return Err(backend_error(format!(
            "CVPixelBufferUnlockBaseAddress returned {unlock_status}"
        )));
    }
    Ok(buffer)
}

fn copy_rgba_as_bgra(
    buffer: &CVPixelBuffer,
    rgba: &[u8],
    width: usize,
    height: usize,
) -> Result<(), CaptureError> {
    let row_bytes = width.saturating_mul(4);
    if rgba.len() < row_bytes.saturating_mul(height) {
        return Err(CaptureError::Backend(
            "camera returned an undersized RGBA frame".into(),
        ));
    }
    let destination_stride = CVPixelBufferGetBytesPerRow(buffer);
    let base = NonNull::new(CVPixelBufferGetBaseAddress(buffer).cast::<u8>())
        .ok_or_else(|| CaptureError::Backend("CVPixelBuffer has no base address".into()))?;
    for row in 0..height {
        let source = &rgba[row * row_bytes..(row + 1) * row_bytes];
        let destination = unsafe {
            std::slice::from_raw_parts_mut(base.as_ptr().add(row * destination_stride), row_bytes)
        };
        for (source_pixel, destination_pixel) in
            source.chunks_exact(4).zip(destination.chunks_exact_mut(4))
        {
            destination_pixel.copy_from_slice(&[
                source_pixel[2],
                source_pixel[1],
                source_pixel[0],
                source_pixel[3],
            ]);
        }
    }
    Ok(())
}

fn writer_error(writer: &AVAssetWriter, context: &str) -> CaptureError {
    let detail = unsafe { writer.error() }.map_or_else(
        || context.to_owned(),
        |error| format!("{context}: {error:?}"),
    );
    backend_error(detail)
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("macOS H.264 camera writer failed: {error}"))
}
