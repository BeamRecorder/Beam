use std::{
    io::Write,
    net::{TcpListener, TcpStream},
    thread::{self, JoinHandle},
    time::Duration,
};

use crossbeam_channel::{Receiver, RecvTimeoutError, Sender, TrySendError, bounded};

use crate::CaptureError;

const PREVIEW_QUEUE_CAPACITY: usize = 2;
const MAX_PREVIEW_WIDTH: usize = 640;
const FRAME_BOUNDARY: &[u8] = b"frame";

struct PreviewFrame {
    rgb: Vec<u8>,
    width: u32,
    height: u32,
}

#[derive(Clone)]
pub(crate) struct PreviewPublisher {
    frames: Sender<PreviewFrame>,
}

impl PreviewPublisher {
    pub(crate) fn publish_rgb(
        &self,
        rgb: &[u8],
        width: u32,
        height: u32,
    ) -> Result<(), CaptureError> {
        if self.frames.is_full() {
            return Ok(());
        }
        let frame = PreviewFrame {
            rgb: rgb.to_vec(),
            width,
            height,
        };
        match self.frames.try_send(frame) {
            Ok(()) | Err(TrySendError::Full(_)) => Ok(()),
            Err(TrySendError::Disconnected(_)) => Err(CaptureError::Backend(
                "native camera preview stream is no longer available".into(),
            )),
        }
    }
}

pub(crate) struct PreviewStream {
    url: String,
    stop: Option<Sender<()>>,
    worker: Option<JoinHandle<()>>,
}

impl PreviewStream {
    pub(crate) fn start() -> Result<(Self, PreviewPublisher), CaptureError> {
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(backend_error)?;
        listener.set_nonblocking(true).map_err(backend_error)?;
        let address = listener.local_addr().map_err(backend_error)?;
        let (frames, receiver) = bounded::<PreviewFrame>(PREVIEW_QUEUE_CAPACITY);
        let (stop, stop_receiver) = bounded(1);
        let worker = thread::Builder::new()
            .name("capture-camera-preview-server".into())
            .spawn(move || serve(listener, receiver, stop_receiver))
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        Ok((
            Self {
                url: format!("http://127.0.0.1:{}/", address.port()),
                stop: Some(stop),
                worker: Some(worker),
            },
            PreviewPublisher { frames },
        ))
    }

    #[must_use]
    pub(crate) fn url(&self) -> &str {
        &self.url
    }

    pub(crate) fn stop(mut self) -> Result<(), CaptureError> {
        self.shutdown()
    }

    fn shutdown(&mut self) -> Result<(), CaptureError> {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        if let Some(worker) = self.worker.take() {
            worker
                .join()
                .map_err(|_| CaptureError::Backend("camera preview server panicked".into()))?;
        }
        Ok(())
    }
}

impl Drop for PreviewStream {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}

fn serve(listener: TcpListener, frames: Receiver<PreviewFrame>, stop: Receiver<()>) {
    let mut client = None;
    let mut header_written = false;
    while stop.try_recv().is_err() {
        if client.is_none() {
            match listener.accept() {
                Ok((stream, _)) => {
                    client = Some(stream);
                    header_written = false;
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(20));
                    continue;
                }
                Err(_) => break,
            }
        }
        let Some(stream) = client.as_mut() else {
            continue;
        };
        if !header_written && write_header(stream).is_err() {
            client = None;
            continue;
        }
        header_written = true;
        match frames.recv_timeout(Duration::from_millis(100)) {
            Ok(frame) => match encode_preview_bmp(frame) {
                Ok(encoded) if write_frame(stream, &encoded).is_ok() => {}
                Ok(_) | Err(_) => {
                    client = None;
                }
            },
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
}

fn write_header(stream: &mut TcpStream) -> std::io::Result<()> {
    stream.set_write_timeout(Some(Duration::from_millis(250)))?;
    stream.write_all(
        b"HTTP/1.1 200 OK\r\n\
Cache-Control: no-cache, no-store, must-revalidate\r\n\
Pragma: no-cache\r\n\
Connection: close\r\n\
Content-Type: multipart/x-mixed-replace; boundary=frame\r\n\r\n",
    )
}

fn write_frame(stream: &mut TcpStream, frame: &[u8]) -> std::io::Result<()> {
    write!(
        stream,
        "--{}\r\nContent-Type: image/bmp\r\nContent-Length: {}\r\n\r\n",
        String::from_utf8_lossy(FRAME_BOUNDARY),
        frame.len()
    )?;
    stream.write_all(frame)?;
    stream.write_all(b"\r\n")
}

fn encode_bmp(rgb: &[u8], width: u32, height: u32) -> Result<Vec<u8>, CaptureError> {
    let width = usize::try_from(width)
        .map_err(|_| CaptureError::InvalidConfiguration("preview width is too large".into()))?;
    let height = usize::try_from(height)
        .map_err(|_| CaptureError::InvalidConfiguration("preview height is too large".into()))?;
    let source_len = width
        .checked_mul(height)
        .and_then(|pixels| pixels.checked_mul(3))
        .ok_or_else(|| CaptureError::InvalidConfiguration("preview dimensions overflow".into()))?;
    if rgb.len() != source_len {
        return Err(CaptureError::Backend(
            "native camera preview returned an unexpected frame size".into(),
        ));
    }
    let row_bytes = width
        .checked_mul(3)
        .ok_or_else(|| CaptureError::InvalidConfiguration("preview row is too large".into()))?;
    let row_stride = (row_bytes + 3) & !3;
    let pixel_bytes = row_stride
        .checked_mul(height)
        .ok_or_else(|| CaptureError::InvalidConfiguration("preview bitmap is too large".into()))?;
    let file_size = 54usize
        .checked_add(pixel_bytes)
        .ok_or_else(|| CaptureError::InvalidConfiguration("preview bitmap is too large".into()))?;
    let mut bmp = vec![0u8; file_size];
    bmp[0..2].copy_from_slice(b"BM");
    write_u32(&mut bmp[2..6], u32::try_from(file_size).unwrap_or(u32::MAX));
    write_u32(&mut bmp[10..14], 54);
    write_u32(&mut bmp[14..18], 40);
    write_u32(&mut bmp[18..22], u32::try_from(width).unwrap_or(u32::MAX));
    write_u32(&mut bmp[22..26], u32::try_from(height).unwrap_or(u32::MAX));
    write_u16(&mut bmp[26..28], 1);
    write_u16(&mut bmp[28..30], 24);
    write_u32(
        &mut bmp[34..38],
        u32::try_from(pixel_bytes).unwrap_or(u32::MAX),
    );
    for row in 0..height {
        let source_row = height - row - 1;
        let source_start = source_row * row_bytes;
        let target_start = 54 + row * row_stride;
        for pixel in 0..width {
            let source = source_start + pixel * 3;
            let target = target_start + pixel * 3;
            bmp[target..target + 3].copy_from_slice(&[
                rgb[source + 2],
                rgb[source + 1],
                rgb[source],
            ]);
        }
    }
    Ok(bmp)
}

fn encode_preview_bmp(frame: PreviewFrame) -> Result<Vec<u8>, CaptureError> {
    let width = usize::try_from(frame.width)
        .map_err(|_| CaptureError::InvalidConfiguration("preview width is too large".into()))?;
    let height = usize::try_from(frame.height)
        .map_err(|_| CaptureError::InvalidConfiguration("preview height is too large".into()))?;
    if width <= MAX_PREVIEW_WIDTH {
        return encode_bmp(&frame.rgb, frame.width, frame.height);
    }
    let target_width = MAX_PREVIEW_WIDTH;
    let target_height = height
        .saturating_mul(target_width)
        .checked_div(width)
        .unwrap_or(1)
        .max(1);
    let mut scaled = vec![0u8; target_width * target_height * 3];
    for y in 0..target_height {
        let source_y = y * height / target_height;
        for x in 0..target_width {
            let source_x = x * width / target_width;
            let source = (source_y * width + source_x) * 3;
            let target = (y * target_width + x) * 3;
            scaled[target..target + 3].copy_from_slice(&frame.rgb[source..source + 3]);
        }
    }
    encode_bmp(
        &scaled,
        u32::try_from(target_width).unwrap_or(u32::MAX),
        u32::try_from(target_height).unwrap_or(u32::MAX),
    )
}

fn write_u16(target: &mut [u8], value: u16) {
    target.copy_from_slice(&value.to_le_bytes());
}

fn write_u32(target: &mut [u8], value: u32) {
    target.copy_from_slice(&value.to_le_bytes());
}

fn backend_error(error: std::io::Error) -> CaptureError {
    CaptureError::Backend(format!("native camera preview server failed: {error}"))
}

#[cfg(test)]
mod tests {
    use super::encode_bmp;

    #[test]
    fn encodes_rgb_as_bottom_up_bmp() {
        let bmp = encode_bmp(&[1, 2, 3, 4, 5, 6], 2, 1).unwrap_or_default();
        assert_eq!(&bmp[0..2], b"BM");
        assert_eq!(&bmp[54..60], &[3, 2, 1, 6, 5, 4]);
    }

    #[test]
    fn rejects_invalid_rgb_size() {
        assert!(encode_bmp(&[1, 2], 1, 1).is_err());
    }
}
