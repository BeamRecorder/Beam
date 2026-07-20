use std::io::{self, Write};

use capture::{
    catalog::{NativeCatalog, SourceCatalog},
    protocol::write_json_line,
};

fn main() {
    let code = match run() {
        Ok(()) => 0,
        Err(error) => {
            let _result = writeln!(io::stderr().lock(), "{error}");
            1
        }
    };
    std::process::exit(code);
}

fn run() -> Result<(), capture::CaptureError> {
    let command = std::env::args().nth(1).unwrap_or_else(|| "discover".into());
    let snapshot = NativeCatalog::default().snapshot()?;
    let value = match command.as_str() {
        "discover" => serde_json::to_value(snapshot)?,
        "capabilities" => serde_json::to_value(snapshot.capabilities)?,
        "permissions" => serde_json::to_value(snapshot.permissions)?,
        "formats" => {
            let source = argument_value("--source")?;
            serde_json::to_value(
                snapshot
                    .sources
                    .iter()
                    .find(|entry| entry.id.as_str() == source)
                    .ok_or_else(|| capture::CaptureError::SourceNotFound(source.clone()))?
                    .capabilities
                    .formats
                    .clone(),
            )?
        }
        other => {
            return Err(capture::CaptureError::Protocol(format!(
                "unknown probe command: {other}"
            )));
        }
    };
    write_json_line(&mut io::stdout().lock(), &value)
}

fn argument_value(name: &str) -> Result<String, capture::CaptureError> {
    let mut arguments = std::env::args();
    while let Some(value) = arguments.next() {
        if value == name {
            return arguments.next().ok_or_else(|| {
                capture::CaptureError::Protocol(format!("missing value for {name}"))
            });
        }
    }
    Err(capture::CaptureError::Protocol(format!(
        "missing argument {name}"
    )))
}
