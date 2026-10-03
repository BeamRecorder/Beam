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

/// Queries the current cursor coordinates from Hyprland IPC, converted to
/// physical (pixel) space using the focused monitor's scale and layout offset.
pub(crate) fn query_cursor_pos() -> Option<(i32, i32)> {
    let path = socket_path()?;
    // Query cursor position (logical compositor coordinates).
    let (lx, ly) = {
        let mut stream = UnixStream::connect(&path).ok()?;
        stream.set_read_timeout(Some(Duration::from_millis(10))).ok();
        stream.set_write_timeout(Some(Duration::from_millis(10))).ok();
        stream.write_all(b"/cursorpos").ok()?;
        let mut buf = Vec::with_capacity(32);
        stream.take(64).read_to_end(&mut buf).ok()?;
        let s = std::str::from_utf8(&buf).ok()?;
        parse_cursor_pos(s)?
    };
    // Query the focused monitor's scale and layout offset to convert to physical pixels.
    let (scale, mon_x, mon_y) = query_focused_monitor(&path).unwrap_or((1.0, 0, 0));
    #[allow(clippy::cast_possible_truncation)]
    let px = ((f64::from(lx) - f64::from(mon_x)) * scale) as i32;
    #[allow(clippy::cast_possible_truncation)]
    let py = ((f64::from(ly) - f64::from(mon_y)) * scale) as i32;
    Some((px, py))
}

/// Queries the focused monitor's scale factor and layout origin from Hyprland IPC.
/// Returns `(scale, x_offset, y_offset)`.
fn query_focused_monitor(path: &std::path::Path) -> Option<(f64, i32, i32)> {
    let mut stream = UnixStream::connect(path).ok()?;
    stream.set_read_timeout(Some(Duration::from_millis(20))).ok();
    stream.set_write_timeout(Some(Duration::from_millis(10))).ok();
    stream.write_all(b"j/monitors").ok()?;
    let mut buf = Vec::with_capacity(2048);
    stream.take(8192).read_to_end(&mut buf).ok()?;
    let s = std::str::from_utf8(&buf).ok()?;
    parse_focused_monitor(s)
}

/// Parses the JSON response from Hyprland's `j/monitors` command and extracts
/// the focused monitor's `(scale, x, y)`.
fn parse_focused_monitor(json: &str) -> Option<(f64, i32, i32)> {
    // Minimal JSON parsing without pulling in serde: scan for the focused monitor object.
    // Each monitor entry has "focused":true/false, "scale":N, "x":N, "y":N.
    // We find the focused entry and extract its fields.
    let monitors: Vec<&str> = split_monitor_objects(json);
    for entry in monitors {
        if !entry.contains("\"focused\":true") && !entry.contains("\"focused\": true") {
            continue;
        }
        let scale = extract_f64(entry, "scale").unwrap_or(1.0);
        let x = extract_i32(entry, "\"x\"").unwrap_or(0);
        let y = extract_i32(entry, "\"y\"").unwrap_or(0);
        return Some((scale, x, y));
    }
    None
}

/// Splits the top-level JSON array into individual monitor object strings.
fn split_monitor_objects(json: &str) -> Vec<&str> {
    let mut result = Vec::new();
    let mut depth = 0i32;
    let mut start = None;
    for (i, ch) in json.char_indices() {
        match ch {
            '{' => {
                if depth == 0 { start = Some(i); }
                depth += 1;
            }
            '}' => {
                depth -= 1;
                if depth == 0 && let Some(s) = start {
                    result.push(&json[s..=i]);
                    start = None;
                }
            }
            _ => {}
        }
    }
    result
}

fn extract_f64(s: &str, key: &str) -> Option<f64> {
    let idx = s.find(&format!("\"{key}\""))?;
    let after_key = &s[idx + key.len() + 2..];
    let colon = after_key.find(':')?;
    let after_colon = after_key[colon + 1..].trim_start();
    // Take until comma, brace, or whitespace-then-punctuation.
    let end = after_colon.find([',', '}', '\n']).unwrap_or(after_colon.len());
    after_colon[..end].trim().parse::<f64>().ok()
}

fn extract_i32(s: &str, key: &str) -> Option<i32> {
    let idx = s.find(key)?;
    let after_key = &s[idx + key.len()..];
    let colon = after_key.find(':')?;
    let after_colon = after_key[colon + 1..].trim_start();
    let end = after_colon.find([',', '}', '\n']).unwrap_or(after_colon.len());
    after_colon[..end].trim().parse::<i32>().ok()
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

    #[test]
    fn parses_focused_monitor_from_json() {
        let json = r#"[{"name":"DP-1","x":0,"y":0,"scale":1.25,"focused":true},{"name":"HDMI-1","x":1920,"y":0,"scale":1.0,"focused":false}]"#;
        assert_eq!(parse_focused_monitor(json), Some((1.25, 0, 0)));
    }

    #[test]
    fn parses_focused_monitor_with_offset() {
        let json = r#"[{"name":"DP-1","x":0,"y":0,"scale":1.0,"focused":false},{"name":"DP-2","x":1536,"y":0,"scale":2.0,"focused": true}]"#;
        assert_eq!(parse_focused_monitor(json), Some((2.0, 1536, 0)));
    }

    #[test]
    fn returns_none_when_no_monitor_is_focused() {
        let json = r#"[{"name":"DP-1","x":0,"y":0,"scale":1.0,"focused":false}]"#;
        assert_eq!(parse_focused_monitor(json), None);
    }

    #[test]
    fn logical_to_physical_conversion() {
        // Simulates scale=1.25, monitor at origin, cursor at logical (768, 432)
        // Physical = 768 * 1.25 = 960, 432 * 1.25 = 540
        let scale = 1.25_f64;
        let (lx, ly) = (768_i32, 432_i32);
        #[allow(clippy::cast_possible_truncation)]
        let px = (f64::from(lx) * scale) as i32;
        #[allow(clippy::cast_possible_truncation)]
        let py = (f64::from(ly) * scale) as i32;
        assert_eq!(px, 960);
        assert_eq!(py, 540);
    }

    #[test]
    fn logical_to_physical_with_monitor_offset() {
        // Second monitor at logical x=1536, scale=2.0
        // Cursor at logical (1600, 100) → monitor-relative (64, 100) → physical (128, 200)
        let scale = 2.0_f64;
        let (lx, ly, mon_x, mon_y) = (1600_i32, 100_i32, 1536_i32, 0_i32);
        #[allow(clippy::cast_possible_truncation)]
        let px = ((f64::from(lx) - f64::from(mon_x)) * scale) as i32;
        #[allow(clippy::cast_possible_truncation)]
        let py = ((f64::from(ly) - f64::from(mon_y)) * scale) as i32;
        assert_eq!(px, 128);
        assert_eq!(py, 200);
    }
}
