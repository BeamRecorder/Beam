use std::{
    io::Read,
    process::ExitStatus,
    sync::{Arc, Mutex},
    thread::JoinHandle,
};

use crate::CaptureError;

const DIAGNOSTIC_LIMIT: usize = 4_096;

pub(super) struct HelperDiagnostics {
    bytes: Arc<Mutex<Vec<u8>>>,
    reader: JoinHandle<()>,
}

impl HelperDiagnostics {
    pub(super) fn start(mut reader: impl Read + Send + 'static) -> Result<Self, CaptureError> {
        let bytes = Arc::new(Mutex::new(Vec::new()));
        let captured = Arc::clone(&bytes);
        let reader = std::thread::Builder::new()
            .name("beam-input-diagnostics".into())
            .spawn(move || {
                let mut buffer = [0; 1_024];
                loop {
                    match reader.read(&mut buffer) {
                        Ok(0) => break,
                        Ok(count) => {
                            if let Ok(mut bytes) = captured.lock() {
                                let retained =
                                    count.min(DIAGNOSTIC_LIMIT.saturating_sub(bytes.len()));
                                bytes.extend_from_slice(&buffer[..retained]);
                            }
                            // Continue draining after the limit so stderr cannot block the helper.
                        }
                        Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                        Err(_) => break,
                    }
                }
            })
            .map_err(|error| {
                CaptureError::Backend(format!("input diagnostics failed to start: {error}"))
            })?;
        Ok(Self { bytes, reader })
    }

    pub(super) fn snapshot(&self) -> String {
        diagnostic_text(&self.bytes)
    }

    pub(super) fn finish(self) -> String {
        let _ = self.reader.join();
        diagnostic_text(&self.bytes)
    }
}

fn diagnostic_text(bytes: &Mutex<Vec<u8>>) -> String {
    bytes.lock().map_or_else(
        |_| String::new(),
        |bytes| {
            String::from_utf8_lossy(&bytes)
                .chars()
                .filter(|character| !character.is_control() || matches!(character, '\n' | '\t'))
                .collect::<String>()
                .trim()
                .to_owned()
        },
    )
}

pub(super) fn startup_error(status: Option<ExitStatus>, stderr: &str) -> CaptureError {
    if status.and_then(|status| status.code()) == Some(126) {
        return CaptureError::Cancelled;
    }
    // pkexec also uses 127 for execution errors, so it does not establish a permission denial.
    let status = status.map_or_else(|| "unknown exit status".into(), |status| status.to_string());
    let detail = if stderr.is_empty() {
        "No readiness response was received."
    } else {
        stderr
    };
    CaptureError::Backend(format!("Input helper failed to start ({status}). {detail}"))
}
