use crate::CaptureError;
use std::{
    io,
    os::fd::AsRawFd,
    time::{Duration, Instant},
};
use x11rb::{
    reexports::x11rb_protocol::{
        parse_display::{ConnectAddress, parse_display},
        xauth::get_auth,
    },
    rust_connection::{DefaultStream, PollMode, RustConnection, Stream},
    utils::RawFdContainer,
};

pub(super) type Connection = RustConnection<DeadlineStream>;
pub(super) struct DeadlineStream(DefaultStream);
impl Stream for DeadlineStream {
    fn poll(&self, mode: PollMode) -> io::Result<()> {
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            let mut descriptor = libc::pollfd {
                fd: self.0.as_raw_fd(),
                events: 0,
                revents: 0,
            };
            if mode.readable() {
                descriptor.events |= libc::POLLIN;
            }
            if mode.writable() {
                descriptor.events |= libc::POLLOUT;
            }
            let timeout = i32::try_from(
                deadline
                    .saturating_duration_since(Instant::now())
                    .as_millis(),
            )
            .unwrap_or(0);
            // SAFETY: poll borrows one initialized descriptor for the duration of the call.
            let result = unsafe { libc::poll(&raw mut descriptor, 1, timeout) };
            if result > 0 {
                return Ok(());
            }
            if result == 0 {
                return Err(io::Error::new(
                    io::ErrorKind::TimedOut,
                    "X11 server stopped responding",
                ));
            }
            let error = io::Error::last_os_error();
            if error.kind() != io::ErrorKind::Interrupted {
                return Err(error);
            }
        }
    }
    fn read(&self, bytes: &mut [u8], fds: &mut Vec<RawFdContainer>) -> io::Result<usize> {
        self.0.read(bytes, fds)
    }
    fn write(&self, bytes: &[u8], fds: &mut Vec<RawFdContainer>) -> io::Result<usize> {
        self.0.write(bytes, fds)
    }
}
pub(super) fn connect() -> Result<(Connection, usize), CaptureError> {
    if !super::session_supported() {
        return Err(error(
            "Direct capture is unavailable outside a local X11 session",
        ));
    }
    let display = parse_display(None).map_err(error)?;
    for address in display.connect_instruction() {
        // Direct recording is local-only, never an implicit network X11 connection.
        if !matches!(address, ConnectAddress::Socket(_)) {
            continue;
        }
        let (stream, (family, address)) = DefaultStream::connect(&address).map_err(error)?;
        let (name, auth) = get_auth(family, &address, display.display)
            .map_err(error)?
            .unwrap_or_default();
        let index = usize::from(display.screen);
        let connection = RustConnection::connect_to_stream_with_auth_info(
            DeadlineStream(stream),
            index,
            name,
            auth,
        )
        .map_err(error)?;
        return Ok((connection, index));
    }
    Err(error("A local X11 display is required"))
}
pub(super) fn error(value: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("X11 capture: {value}"))
}
