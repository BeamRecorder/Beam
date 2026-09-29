use beam_editor_domain::protocol::Request;
pub use beam_editor_domain::protocol::{OwnerGrants as ReadyGrants, OwnerReady as Ready};
use std::path::PathBuf;

pub enum Invocation {
    Schema,
    Serve(ServeOptions),
    Mcp { endpoint: PathBuf },
    Call { endpoint: PathBuf, request: Request },
}
pub struct ServeOptions {
    pub endpoint: Option<PathBuf>,
    pub project: PathBuf,
    pub sources: Vec<PathBuf>,
    pub destination: Option<PathBuf>,
}
