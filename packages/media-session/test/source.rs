#![cfg(test)]
#![allow(clippy::expect_used)]

use std::sync::{Arc, Mutex};

use beam_audio::{AudioError, AudioEvent, TimedAudioPacket};
use beam_camera::{CameraError, CameraEvent, CameraFormat, CameraFrame, PixelFormat};
use beam_media_core::{LatestFrame, VideoFrame};

use super::{AudioSource, CameraSource, CapturedCameraFrame};

#[test]
fn platform_capture_types_implement_the_shared_source_contracts() {
    fn audio<T: AudioSource>() {}
    fn camera<T: CameraSource>() {}

    audio::<beam_audio::AudioCapture>();
    audio::<beam_audio::SystemAudioCapture>();
    camera::<beam_camera::CameraCapture>();
}

struct TestAudio {
    event: Mutex<Option<AudioEvent>>,
    halted: bool,
}

impl AudioSource for TestAudio {
    fn format(&self) -> (u32, u16) {
        (48_000, 2)
    }

    fn queue_depth(&self) -> (usize, usize) {
        (0, 0)
    }

    fn try_packet(&self) -> Result<Option<TimedAudioPacket>, AudioError> {
        Ok(None)
    }

    fn try_event(&self) -> Option<AudioEvent> {
        self.event.lock().expect("event lock").take()
    }

    fn halt(&mut self) -> Result<(), AudioError> {
        self.halted = true;
        Ok(())
    }
}

struct TestCamera {
    latest: Arc<LatestFrame<CapturedCameraFrame>>,
    halted: bool,
}

impl CameraSource for TestCamera {
    fn format(&self) -> CameraFormat {
        CameraFormat {
            width: 2,
            height: 2,
            fps: 30,
            pixel_format: PixelFormat::Yuyv,
            stride: 4,
        }
    }

    fn queue_depth(&self) -> (usize, usize) {
        (0, 0)
    }

    fn try_frame(&self) -> Result<Option<CapturedCameraFrame>, CameraError> {
        Ok(None)
    }

    fn latest_preview(&self) -> Option<CapturedCameraFrame> {
        self.latest.take()
    }

    fn preview_handle(&self) -> Arc<LatestFrame<CapturedCameraFrame>> {
        self.latest.clone()
    }

    fn try_event(&self) -> Option<CameraEvent> {
        None
    }

    fn halt(&mut self) -> Result<(), CameraError> {
        self.halted = true;
        Ok(())
    }
}

#[test]
fn platform_neutral_audio_source_preserves_format_events_and_halt() {
    let mut source: Box<dyn AudioSource> = Box::new(TestAudio {
        event: Mutex::new(Some(AudioEvent::DeviceChanged("output changed".into()))),
        halted: false,
    });
    assert_eq!(source.format(), (48_000, 2));
    assert_eq!(source.queue_depth(), (0, 0));
    assert!(source.try_packet().expect("packet").is_none());
    assert!(matches!(
        source.try_event(),
        Some(AudioEvent::DeviceChanged(_))
    ));
    assert!(source.try_event().is_none());
    source.halt().expect("halt");
}

#[test]
fn camera_source_shares_one_latest_frame_mailbox_with_the_preview() {
    let latest = Arc::new(LatestFrame::new());
    let mut source: Box<dyn CameraSource> = Box::new(TestCamera {
        latest: latest.clone(),
        halted: false,
    });
    source.preview_handle().publish(VideoFrame {
        captured_ns: 42,
        width: 2,
        height: 2,
        data: CameraFrame {
            format: source.format(),
            native_timestamp_ns: Some(100),
            sequence: 7,
            data: Arc::from([16_u8, 128, 16, 128, 16, 128, 16, 128]),
        },
    });
    assert_eq!(source.latest_preview().expect("frame").captured_ns, 42);
    assert!(latest.take().is_none());
    assert!(source.try_frame().expect("queued frame").is_none());
    assert!(source.try_event().is_none());
    source.halt().expect("halt");
}
