//! Unix sockets use owner-only token and socket permissions.
use super::*;
use std::{
    fs::{self, File, OpenOptions},
    os::unix::{
        fs::{OpenOptionsExt, PermissionsExt},
        net::{UnixListener, UnixStream},
    },
    thread::JoinHandle,
    time::Duration,
};

pub(super) struct Server {
    endpoint: PathBuf,
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
    _owner_lock: File,
}
impl Server {
    pub fn start(endpoint: PathBuf, service: Arc<EditorService>) -> Result<Self> {
        let owner_lock = super::ownership::acquire(&endpoint)?;
        super::ownership::recover(&endpoint)?;
        let token = uuid::Uuid::new_v4().to_string();
        let listener =
            UnixListener::bind(&endpoint).map_err(|e| crate::shared::storage(&endpoint, e))?;
        let setup = (|| {
            fs::set_permissions(&endpoint, fs::Permissions::from_mode(0o600))
                .map_err(|e| crate::shared::storage(&endpoint, e))?;
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .mode(0o600)
                .open(token_file(&endpoint))
                .map_err(|e| crate::shared::storage(token_file(&endpoint), e))?;
            file.write_all(token.as_bytes())
                .map_err(|e| crate::shared::storage(token_file(&endpoint), e))
        })();
        if let Err(error) = setup {
            let _ = fs::remove_file(&endpoint);
            return Err(error);
        }
        let stop = Arc::new(AtomicBool::new(false));
        let stopping = stop.clone();
        let worker = std::thread::Builder::new()
            .name("beam-editor-broker".into())
            .spawn(move || {
                for connection in listener.incoming() {
                    if stopping.load(Ordering::Acquire) {
                        break;
                    }
                    let Ok(mut stream) = connection else {
                        break;
                    };
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(15)));
                    let _ = stream.set_write_timeout(Some(Duration::from_secs(120)));
                    if let Err(error) = handle(&mut stream, &service, &token, &stopping) {
                        eprintln!("Beam editor broker: {error}");
                    }
                }
            })
            .map_err(|e| crate::shared::storage("broker thread", e))?;
        Ok(Self {
            endpoint,
            stop,
            worker: Some(worker),
            _owner_lock: owner_lock,
        })
    }
    pub fn stop(&mut self) {
        self.stop.store(true, Ordering::Release);
        let _ = UnixStream::connect(&self.endpoint);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
        let _ = fs::remove_file(&self.endpoint);
        let _ = fs::remove_file(token_file(&self.endpoint));
    }
}
pub(super) fn connect(endpoint: &Path) -> Result<UnixStream> {
    let stream = UnixStream::connect(endpoint).map_err(|e| crate::shared::storage(endpoint, e))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(120)))
        .map_err(|e| crate::shared::storage(endpoint, e))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(15)))
        .map_err(|e| crate::shared::storage(endpoint, e))?;
    Ok(stream)
}
pub(super) fn endpoint_for(project: &Path) -> Result<PathBuf> {
    let hash = super::endpoint::project_hash(project)?;
    Ok(super::endpoint::private_runtime()?.join(format!("{hash}.sock")))
}
