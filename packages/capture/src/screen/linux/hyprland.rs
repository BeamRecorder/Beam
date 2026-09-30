use std::{
    io::{Read, Write},
    os::unix::net::UnixStream,
    path::PathBuf,
    time::Duration,
};

fn socket_path() -> Option<PathBuf> {
    let runtime_dir = std::env::var_os("XDG_RUNTIME_DIR")?;
    let sig = std::env::var_os("HYPRLAND_INSTANCE_SIGNATURE")?;
    let mut path = PathBuf::from(runtime_dir);
    path.push("hypr");
    path.push(sig);
    path.push(".socket.sock");
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

pub(crate) fn is_hyprland() -> bool {
    socket_path().is_some()
}

pub(crate) fn query_cursor_pos() -> Option<(i32, i32)> {
    let path = socket_path()?;
    let mut stream = UnixStream::connect(path).ok()?;
    stream.set_read_timeout(Some(Duration::from_millis(10))).ok();
    stream.set_write_timeout(Some(Duration::from_millis(10))).ok();
    stream.write_all(b"/cursorpos").ok()?;
    let mut buf = [0u8; 64];
    let n = stream.read(&mut buf).ok()?;
    let s = std::str::from_utf8(&buf[..n]).ok()?;
    let mut parts = s.trim().split(',');
    let x = parts.next()?.trim().parse::<i32>().ok()?;
    let y = parts.next()?.trim().parse::<i32>().ok()?;
    Some((x, y))
}
