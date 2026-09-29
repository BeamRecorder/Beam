//! Windows uses a local named pipe with owner-only ACL and no remote clients.
use super::*;
use std::{
    fs::File,
    os::windows::io::{AsRawHandle, FromRawHandle},
    thread::JoinHandle,
};
use windows_sys::Win32::{
    Foundation::{ERROR_PIPE_CONNECTED, GetLastError, INVALID_HANDLE_VALUE, LocalFree},
    Security::{
        Authorization::ConvertStringSecurityDescriptorToSecurityDescriptorW, SECURITY_ATTRIBUTES,
    },
    Storage::FileSystem::{FILE_FLAG_FIRST_PIPE_INSTANCE, PIPE_ACCESS_DUPLEX},
    System::Pipes::{
        ConnectNamedPipe, CreateNamedPipeW, DisconnectNamedPipe, PIPE_READMODE_BYTE,
        PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE, PIPE_WAIT,
    },
};

pub(super) struct Server {
    endpoint: PathBuf,
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}
fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}
fn listener(endpoint: &Path, first: bool) -> Result<File> {
    let name = wide(&endpoint.to_string_lossy());
    let descriptor = wide("D:P(A;;GA;;;OW)");
    let mut security = std::ptr::null_mut();
    // The descriptor is owned until CreateNamedPipe has copied its ACL.
    unsafe {
        if ConvertStringSecurityDescriptorToSecurityDescriptorW(
            descriptor.as_ptr(),
            1,
            &mut security,
            std::ptr::null_mut(),
        ) == 0
        {
            return Err(crate::shared::storage(
                "pipe ACL",
                std::io::Error::last_os_error(),
            ));
        }
        let attributes = SECURITY_ATTRIBUTES {
            nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: security,
            bInheritHandle: 0,
        };
        let handle = CreateNamedPipeW(
            name.as_ptr(),
            PIPE_ACCESS_DUPLEX
                | if first {
                    FILE_FLAG_FIRST_PIPE_INSTANCE
                } else {
                    0
                },
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
            2,
            65_536,
            65_536,
            0,
            &attributes,
        );
        LocalFree(security);
        if handle == INVALID_HANDLE_VALUE {
            return Err(crate::shared::storage(
                endpoint,
                std::io::Error::last_os_error(),
            ));
        }
        Ok(File::from_raw_handle(handle))
    }
}
impl Server {
    pub fn start(endpoint: PathBuf, service: Arc<EditorService>) -> Result<Self> {
        let token = uuid::Uuid::new_v4().to_string();
        let mut initial = listener(&endpoint, true)?;
        std::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(token_file(&endpoint))
            .and_then(|mut file| file.write_all(token.as_bytes()))
            .map_err(|e| crate::shared::storage(token_file(&endpoint), e))?;
        let stop = Arc::new(AtomicBool::new(false));
        let stopping = stop.clone();
        let address = endpoint.clone();
        let worker = std::thread::spawn(move || {
            loop {
                let connected = unsafe {
                    ConnectNamedPipe(initial.as_raw_handle(), std::ptr::null_mut()) != 0
                        || GetLastError() == ERROR_PIPE_CONNECTED
                };
                if stopping.load(Ordering::Acquire) {
                    break;
                }
                if connected {
                    if let Err(error) = handle(&mut initial, &service, &token, &stopping) {
                        eprintln!("Beam editor broker: {error}");
                    }
                }
                unsafe {
                    DisconnectNamedPipe(initial.as_raw_handle());
                }
                // Retain the first handle until replacement exists so ownership has no gap.
                match listener(&address, false) {
                    Ok(next) => initial = next,
                    Err(error) => {
                        eprintln!("Beam editor pipe: {error}");
                        break;
                    }
                }
            }
        });
        Ok(Self {
            endpoint,
            stop,
            worker: Some(worker),
        })
    }
    pub fn stop(&mut self) {
        self.stop.store(true, Ordering::Release);
        let _ = connect(&self.endpoint);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
        let _ = std::fs::remove_file(token_file(&self.endpoint));
    }
}
pub(super) fn connect(endpoint: &Path) -> Result<File> {
    File::options()
        .read(true)
        .write(true)
        .open(endpoint)
        .map_err(|e| crate::shared::storage(endpoint, e))
}
pub(super) fn endpoint_for(project: &Path) -> Result<PathBuf> {
    let hash = super::endpoint::project_hash(project)?;
    Ok(PathBuf::from(format!(r"\\.\pipe\beam-editor-{hash}")))
}
