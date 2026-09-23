use beam_media_engine::{
    API_VERSION, RecordingController, process,
    protocol::{Request, Response},
};
use std::{
    io::{self, BufRead, Write},
    sync::mpsc,
    time::Duration,
};

fn main() {
    if let Err(error) = run() {
        let _ = writeln!(io::stderr(), "{error}");
        std::process::exit(1);
    }
}
fn run() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::args().nth(1).as_deref() == Some("--help") {
        writeln!(
            io::stdout(),
            "beam-media-engine <projects-root>: versioned native media API {}",
            API_VERSION
        )?;
        return Ok(());
    }
    let root = std::env::args_os()
        .nth(1)
        .ok_or("usage: beam-media-engine <projects-root>")?;
    beam_screen::parent_watch::install_parent_death_guard()?;
    let controller = RecordingController::new(root)?;
    let (sender, incoming) = mpsc::sync_channel(16);
    std::thread::Builder::new()
        .name("media-command-reader".into())
        .spawn(move || {
            let mut input = io::stdin().lock();
            loop {
                let mut bytes = Vec::new();
                // A malformed client cannot allocate an unbounded command line.
                let read = std::io::Read::take(&mut input, 1_048_577).read_until(b'\n', &mut bytes);
                if matches!(read, Ok(0) | Err(_)) {
                    break;
                }
                if bytes.len() > 1_048_576 {
                    break;
                }
                if sender
                    .send(serde_json::from_slice::<Request>(&bytes))
                    .is_err()
                {
                    break;
                }
            }
        })?;
    let mut output = io::stdout().lock();
    while !beam_screen::parent_watch::parent_death_requested() {
        #[cfg(target_os = "macos")]
        beam_screen::cursor::mac::refresh_system_cursor();
        let response = match incoming.recv_timeout(Duration::from_millis(16)) {
            Ok(Ok(request)) => process::handle(&controller, request),
            Ok(Err(error)) => Response {
                version: API_VERSION,
                request_id: "invalid".into(),
                ok: false,
                result: None,
                error: Some(beam_media_engine::protocol::ProtocolError {
                    code: "invalid-json".into(),
                    message: error.to_string(),
                }),
            },
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        };
        serde_json::to_writer(&mut output, &response)?;
        writeln!(&mut output)?;
        output.flush()?;
    }
    drop(controller);
    beam_screen::input::shutdown_input_access();
    Ok(())
}
