use std::{
    sync::mpsc::{self, Receiver, RecvTimeoutError, SyncSender, sync_channel},
    thread::{self, JoinHandle},
    time::Duration,
};

use nokhwa::{
    Camera,
    pixel_format::RgbFormat,
    utils::{CameraFormat, CameraIndex, FrameFormat, RequestedFormat, RequestedFormatType},
};

use crate::{CaptureError, model::SourceId};

use super::preview_stream::{PreviewPublisher, PreviewStream};

pub struct CameraPreview {
    source_id: SourceId,
    stream: Option<PreviewStream>,
    publisher: Option<PreviewPublisher>,
    stop: Option<mpsc::Sender<()>>,
    capture: Option<JoinHandle<Result<(), CaptureError>>>,
}

pub struct CameraPreviewResources {
    pub(crate) _stream: PreviewStream,
    pub(crate) publisher: PreviewPublisher,
}

impl CameraPreview {
    pub fn start(source_id: &SourceId) -> Result<Self, CaptureError> {
        let index = camera_index(source_id)?;
        let (stream, publisher) = PreviewStream::start()?;
        let capture_publisher = publisher.clone();
        let (stop, stop_receiver) = mpsc::channel();
        let (ready, ready_receiver) = sync_channel(1);
        let capture = thread::Builder::new()
            .name("capture-camera-preview".into())
            .spawn(move || capture_frames(index, capture_publisher, stop_receiver, ready))
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        match ready_receiver.recv_timeout(Duration::from_secs(30)) {
            Ok(Ok(())) => {}
            Ok(Err(error)) => {
                let _ = stop.send(());
                let _ = capture.join();
                let _ = stream.stop();
                return Err(CaptureError::Backend(error));
            }
            Err(RecvTimeoutError::Timeout) => {
                let _ = stop.send(());
                let _ = capture.join();
                let _ = stream.stop();
                return Err(CaptureError::Backend(
                    "native camera preview did not become ready".into(),
                ));
            }
            Err(RecvTimeoutError::Disconnected) => {
                let _ = stop.send(());
                let _ = capture.join();
                let _ = stream.stop();
                return Err(CaptureError::Backend(
                    "native camera preview stopped before becoming ready".into(),
                ));
            }
        }
        Ok(Self {
            source_id: source_id.clone(),
            stream: Some(stream),
            publisher: Some(publisher),
            stop: Some(stop),
            capture: Some(capture),
        })
    }

    #[must_use]
    pub fn source_id(&self) -> &SourceId {
        &self.source_id
    }

    #[must_use]
    pub fn url(&self) -> &str {
        self.stream.as_ref().map_or("", PreviewStream::url)
    }

    pub fn stop(mut self) -> Result<(), CaptureError> {
        self.shutdown()
    }

    pub fn into_recording(mut self) -> Result<CameraPreviewResources, CaptureError> {
        self.stop_capture()?;
        Ok(CameraPreviewResources {
            _stream: self
                .stream
                .take()
                .ok_or_else(|| CaptureError::Backend("camera preview stream missing".into()))?,
            publisher: self
                .publisher
                .take()
                .ok_or_else(|| CaptureError::Backend("camera preview publisher missing".into()))?,
        })
    }

    fn shutdown(&mut self) -> Result<(), CaptureError> {
        self.stop_capture()?;
        if let Some(stream) = self.stream.take() {
            stream.stop()?;
        }
        Ok(())
    }

    fn stop_capture(&mut self) -> Result<(), CaptureError> {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        if let Some(capture) = self.capture.take() {
            let capture_result = capture
                .join()
                .map_err(|_| CaptureError::Backend("camera preview capture panicked".into()))?;
            capture_result?;
        }
        Ok(())
    }
}

impl Drop for CameraPreview {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}

fn capture_frames(
    index: CameraIndex,
    publisher: PreviewPublisher,
    stop: Receiver<()>,
    ready: SyncSender<Result<(), String>>,
) -> Result<(), CaptureError> {
    let mut camera = match open_camera(index) {
        Ok(camera) => camera,
        Err(error) => {
            let message = error.to_string();
            let _ = ready.send(Err(message.clone()));
            return Err(error);
        }
    };
    let _ = ready.send(Ok(()));
    loop {
        if stop.try_recv().is_ok() {
            return Ok(());
        }
        let frame = camera.frame().map_err(backend_error)?;
        let resolution = frame.resolution();
        let image = frame.decode_image::<RgbFormat>().map_err(backend_error)?;
        publisher.publish_rgb(image.as_raw(), resolution.width_x, resolution.height_y)?;
    }
}

pub(crate) fn open_camera(index: CameraIndex) -> Result<Camera, CaptureError> {
    let requested = RequestedFormat::new::<RgbFormat>(RequestedFormatType::Closest(
        CameraFormat::new_from(1280, 720, FrameFormat::MJPEG, 30),
    ));
    let fallback = RequestedFormat::new::<RgbFormat>(RequestedFormatType::None);
    let mut camera = Camera::new(index.clone(), requested)
        .or_else(|_| Camera::new(index, fallback))
        .map_err(backend_error)?;
    camera.open_stream().map_err(backend_error)?;
    Ok(camera)
}

fn camera_index(source_id: &SourceId) -> Result<CameraIndex, CaptureError> {
    let value = source_id
        .as_str()
        .strip_prefix("camera:nokhwa:")
        .ok_or_else(|| {
            CaptureError::InvalidConfiguration(format!("{source_id} is not a Nokhwa camera source"))
        })?;
    let index = value.parse::<u32>().map_err(|error| {
        CaptureError::InvalidConfiguration(format!("invalid camera index: {error}"))
    })?;
    Ok(CameraIndex::Index(index))
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("native camera preview failed: {error}"))
}
