//! CLI is a transport adapter. It never edits documents directly.
pub mod args;
pub mod types;
use beam_editor_domain::{Result, protocol::Response};
use beam_editor_engine::{
    broker,
    service::{EditorService, grants::GrantRegistry},
    video::controller::EditorController,
};
use std::{
    io::{Read, Write},
    sync::Arc,
};
use types::{Invocation, Ready, ReadyGrants};

pub fn execute(
    invocation: Invocation,
    input: &mut (impl Read + Send),
    output: &mut (impl Write + Send),
) -> Result<i32> {
    match invocation {
        Invocation::Schema => {
            write_json(output, &beam_editor_domain::protocol::schema()?)?;
            Ok(0)
        }
        Invocation::Call { endpoint, request } => {
            let response = broker::Client::connect(&endpoint)?.request(request)?;
            let exit = matches!(response, Response::Error { .. }) as i32;
            write_json(output, &response)?;
            Ok(exit)
        }
        Invocation::Mcp { endpoint } => {
            beam_editor_mcp::run(
                input,
                output,
                Arc::new(move |request| broker::Client::connect(&endpoint)?.request(request)),
            )?;
            Ok(0)
        }
        Invocation::Serve(options) => {
            let grants = Arc::new(GrantRegistry::default());
            let project = grants.authorize_project(&options.project)?;
            let endpoint = match options.endpoint {
                Some(endpoint) => endpoint,
                None => broker::endpoint_for(&options.project)?,
            };
            let sources = options
                .sources
                .into_iter()
                .map(|path| grants.authorize_source(&path))
                .collect::<Result<Vec<_>>>()?;
            let destination = options
                .destination
                .map(|path| grants.authorize_destination(&path))
                .transpose()?;
            let service = Arc::new(EditorService::new(
                Arc::new(EditorController::new()?),
                grants,
            ));
            let owner = broker::serve(endpoint.clone(), service)?;
            write_json(
                output,
                &Ready {
                    endpoint: endpoint.to_string_lossy().into_owned(),
                    token_file: broker::token_file(&endpoint).to_string_lossy().into_owned(),
                    grants: ReadyGrants {
                        project,
                        sources,
                        destination,
                    },
                },
            )?;
            // EOF is the portable, explicit lifetime boundary of a headless owner.
            let mut byte = [0];
            while input
                .read(&mut byte)
                .map_err(|e| beam_editor_domain::shared::storage("stdin", e))?
                != 0
            {}
            drop(owner);
            Ok(0)
        }
    }
}

pub fn write_json(output: &mut impl Write, value: &impl serde::Serialize) -> Result<()> {
    serde_json::to_writer(&mut *output, value)?;
    output
        .write_all(b"\n")
        .and_then(|_| output.flush())
        .map_err(|e| beam_editor_domain::shared::storage("stdout", e))
}
