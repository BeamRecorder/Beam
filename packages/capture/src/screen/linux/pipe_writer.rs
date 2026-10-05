use std::{
    io::{self, Write},
    os::fd::AsRawFd,
    time::Instant,
};

pub(super) fn nonblocking(pipe: &impl AsRawFd) -> io::Result<()> {
    let descriptor = pipe.as_raw_fd();
    let flags = unsafe { libc::fcntl(descriptor, libc::F_GETFL) };
    if flags < 0 || unsafe { libc::fcntl(descriptor, libc::F_SETFL, flags | libc::O_NONBLOCK) } < 0
    {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

pub(super) fn write_all(
    pipe: &mut (impl Write + AsRawFd),
    mut bytes: &[u8],
    deadline: Instant,
) -> io::Result<()> {
    while !bytes.is_empty() {
        if Instant::now() >= deadline {
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "recording encoder stopped consuming video frames",
            ));
        }
        match pipe.write(bytes) {
            Ok(0) => {
                return Err(io::Error::new(
                    io::ErrorKind::WriteZero,
                    "recording encoder input made no progress",
                ));
            }
            Ok(written) => bytes = &bytes[written..],
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                let remaining = deadline.saturating_duration_since(Instant::now());
                let timeout = remaining.as_millis().min(i32::MAX as u128) as i32;
                let mut descriptor = libc::pollfd {
                    fd: pipe.as_raw_fd(),
                    events: libc::POLLOUT,
                    revents: 0,
                };
                let result = unsafe { libc::poll(&raw mut descriptor, 1, timeout.max(1)) };
                if result < 0 {
                    let error = io::Error::last_os_error();
                    if error.kind() != io::ErrorKind::Interrupted {
                        return Err(error);
                    }
                }
            }
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #![allow(clippy::expect_used)]
    use super::*;
    use std::{io::Read, os::unix::net::UnixStream, time::Duration};

    #[test]
    fn writes_the_entire_frame_to_a_ready_pipe() {
        let (mut writer, mut reader) = UnixStream::pair().expect("pipe");
        nonblocking(&writer).expect("nonblocking");
        write_all(
            &mut writer,
            &[1, 2, 3, 4],
            Instant::now() + Duration::from_secs(1),
        )
        .expect("frame");
        let mut received = [0; 4];
        reader.read_exact(&mut received).expect("read frame");
        assert_eq!(received, [1, 2, 3, 4]);
    }

    #[test]
    fn a_stalled_encoder_cannot_block_the_sink_forever() {
        let (mut writer, _reader) = UnixStream::pair().expect("pipe");
        nonblocking(&writer).expect("nonblocking");
        let started = Instant::now();
        let error = write_all(
            &mut writer,
            &vec![0; 4 * 1024 * 1024],
            started + Duration::from_millis(30),
        )
        .expect_err("stalled pipe");
        assert_eq!(error.kind(), io::ErrorKind::TimedOut);
        assert!(started.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn detects_a_disconnected_encoder_and_accepts_an_empty_frame() {
        let (mut writer, reader) = UnixStream::pair().expect("pipe");
        nonblocking(&writer).expect("nonblocking");
        drop(reader);
        let deadline = Instant::now() + Duration::from_secs(1);
        assert_eq!(
            write_all(&mut writer, &[1], deadline)
                .expect_err("closed pipe")
                .kind(),
            io::ErrorKind::BrokenPipe
        );
        assert!(write_all(&mut writer, &[], deadline).is_ok());
    }
}
