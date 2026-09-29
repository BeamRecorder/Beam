//! Authenticated local owner transport; no TCP listener or media bytes in JSON.
mod endpoint;
#[cfg(unix)]
mod ownership;
#[cfg(unix)]
mod unix;
#[cfg(windows)]
mod windows;
use crate::{EditorError, Result, service::EditorService};
use beam_editor_domain::protocol::*;
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};
#[cfg(unix)]
use unix as platform;
#[cfg(windows)]
use windows as platform;

pub struct Broker {
    inner: platform::Server,
}
pub struct Client {
    endpoint: PathBuf,
    token: String,
}

pub fn token_file(endpoint: &Path) -> PathBuf {
    #[cfg(unix)]
    {
        endpoint.with_extension("token")
    }
    #[cfg(windows)]
    {
        let path = endpoint.to_string_lossy();
        let name = path.rsplit('\\').next().unwrap_or("beam-editor");
        std::env::temp_dir().join(format!("{name}.token"))
    }
}
pub fn endpoint_for(project: &Path) -> Result<PathBuf> {
    platform::endpoint_for(project)
}
pub fn serve(endpoint: PathBuf, service: Arc<EditorService>) -> Result<Broker> {
    Ok(Broker {
        inner: platform::Server::start(endpoint, service)?,
    })
}
impl Drop for Broker {
    fn drop(&mut self) {
        self.inner.stop();
    }
}
impl Client {
    pub fn connect(endpoint: &Path) -> Result<Self> {
        #[cfg(unix)]
        {
            endpoint::private_directory(endpoint.parent().ok_or_else(|| {
                EditorError::Invalid("broker endpoint requires a parent directory".into())
            })?)?;
            endpoint::private_file(endpoint, true)?;
            endpoint::private_file(&token_file(endpoint), false)?;
        }
        let token = std::fs::read_to_string(token_file(endpoint))
            .map_err(|e| crate::shared::storage(token_file(endpoint), e))?;
        if token.len() > 128 || token.trim().is_empty() {
            return Err(EditorError::Unauthorized(
                "invalid broker session token".into(),
            ));
        }
        Ok(Self {
            endpoint: endpoint.to_owned(),
            token: token.trim().to_owned(),
        })
    }
    pub fn request(&self, request: Request) -> Result<Response> {
        let envelope = RequestEnvelope {
            api_version: API_VERSION,
            request_id: uuid::Uuid::new_v4().to_string(),
            token: self.token.clone(),
            request,
        };
        let mut connection = platform::connect(&self.endpoint)?;
        write_message(&mut connection, &envelope)?;
        let response: ResponseEnvelope = read_message(&mut connection)?;
        if response.api_version != API_VERSION || response.request_id != envelope.request_id {
            return Err(EditorError::Invalid(
                "broker response identity mismatch".into(),
            ));
        }
        Ok(response.response)
    }
}
pub(super) fn handle(
    connection: &mut (impl Read + Write),
    service: &EditorService,
    token: &str,
    stopped: &AtomicBool,
) -> Result<()> {
    if stopped.load(Ordering::Acquire) {
        return Ok(());
    }
    let request: RequestEnvelope = read_message(connection)?;
    let response = if request.token != token {
        Response::Error {
            error: ServiceError::from(&EditorError::Unauthorized(
                "invalid broker session token".into(),
            )),
        }
    } else if request.api_version != API_VERSION
        || request.request_id.is_empty()
        || request.request_id.len() > 128
    {
        Response::Error {
            error: ServiceError::from(&EditorError::Invalid(
                "invalid broker API version or request ID".into(),
            )),
        }
    } else {
        service
            .request(request.request)
            .unwrap_or_else(|error| Response::Error {
                error: ServiceError::from(&error),
            })
    };
    write_message(
        connection,
        &ResponseEnvelope {
            api_version: API_VERSION,
            request_id: request.request_id,
            response,
        },
    )
}
fn read_message<T: serde::de::DeserializeOwned>(connection: &mut impl Read) -> Result<T> {
    let mut bytes = vec![];
    BufReader::new(connection.take(MESSAGE_BUDGET as u64 + 1))
        .read_until(b'\n', &mut bytes)
        .map_err(|e| crate::shared::storage("broker read", e))?;
    if bytes.len() > MESSAGE_BUDGET || bytes.last() != Some(&b'\n') {
        return Err(EditorError::Invalid(
            "incomplete or over-budget broker message".into(),
        ));
    }
    Ok(serde_json::from_slice(&bytes)?)
}
fn write_message(connection: &mut impl Write, value: &impl serde::Serialize) -> Result<()> {
    let mut bytes = serde_json::to_vec(value)?;
    bytes.push(b'\n');
    if bytes.len() > MESSAGE_BUDGET {
        return Err(EditorError::Invalid("broker message exceeds 8 MiB".into()));
    }
    connection
        .write_all(&bytes)
        .and_then(|()| connection.flush())
        .map_err(|e| crate::shared::storage("broker write", e))
}
