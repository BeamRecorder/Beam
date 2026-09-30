use std::{
    io::{Read, Write},
    os::unix::net::UnixStream,
    path::PathBuf,
    time::Duration,
};

/// Resolves the filesystem path to the Hyprland IPC UNIX domain socket.
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

/// Returns true if the current desktop environment is an active Hyprland session.
pub(crate) fn is_hyprland() -> bool {
    socket_path().is_some()
}

/// Parses the `X, Y` coordinate string returned by Hyprland's `/cursorpos` command.
pub(crate) fn parse_cursor_pos(response: &str) -> Option<(i32, i32)> {
    let mut parts = response.trim().split(',');
    let x = parts.next()?.trim().parse::<i32>().ok()?;
    let y = parts.next()?.trim().parse::<i32>().ok()?;
    Some((x, y))
}

/// Queries the current physical cursor coordinates from Hyprland IPC.
pub(crate) fn query_cursor_pos() -> Option<(i32, i32)> {
    let path = socket_path()?;
    let mut stream = UnixStream::connect(path).ok()?;
    stream.set_read_timeout(Some(Duration::from_millis(10))).ok();
    stream.set_write_timeout(Some(Duration::from_millis(10))).ok();
    stream.write_all(b"/cursorpos").ok()?;
    let mut buf = Vec::with_capacity(32);
    stream.take(64).read_to_end(&mut buf).ok()?;
    let s = std::str::from_utf8(&buf).ok()?;
    parse_cursor_pos(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_cursor_coordinates() {
        assert_eq!(parse_cursor_pos("123, 456"), Some((123, 456)));
        assert_eq!(parse_cursor_pos("0, 0\n"), Some((0, 0)));
        assert_eq!(parse_cursor_pos("  1920, 1080 \r\n"), Some((1920, 1080)));
        assert_eq!(parse_cursor_pos("-50, -20"), Some((-50, -20)));
    }

    #[test]
    fn rejects_invalid_or_truncated_cursor_responses() {
        assert_eq!(parse_cursor_pos(""), None);
        assert_eq!(parse_cursor_pos("123"), None);
        assert_eq!(parse_cursor_pos("123,"), None);
        assert_eq!(parse_cursor_pos(", 456"), None);
        assert_eq!(parse_cursor_pos("abc, def"), None);
    }

    #[test]
    fn parses_fragmented_stream_accumulation() {
        // Simulates fragmented chunks arriving over a stream
        let chunks: &[&[u8]] = &[b"12", b"3, ", b"45", b"6\n"];
        let mut accumulated = Vec::new();
        for chunk in chunks {
            accumulated.extend_from_slice(chunk);
        }
        let s = std::str::from_utf8(&accumulated).unwrap_or_default();
        assert_eq!(parse_cursor_pos(s), Some((123, 456)));
    }
}
