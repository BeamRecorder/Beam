//! Command-line options authorize paths only during explicit owner bootstrap.
use crate::types::{Invocation, ServeOptions};
use beam_editor_domain::{
    EditorError, Result,
    commands::types::{Command, Operation, Transaction},
    protocol::{AnalysisAlgorithm, Container, Query, RenderContext, RenderQuality, Request},
};
use std::{collections::BTreeMap, io::Read, path::PathBuf};

fn invalid(message: &str) -> EditorError {
    EditorError::Invalid(message.into())
}

pub fn parse(
    arguments: impl IntoIterator<Item = String>,
    input: &mut impl Read,
) -> Result<Invocation> {
    let mut arguments = arguments.into_iter();
    let command = arguments
        .next()
        .ok_or_else(|| invalid("usage: beam-editor schema|serve|call|query|transact|mcp"))?;
    let mut flags: BTreeMap<String, Vec<String>> = BTreeMap::new();
    while let Some(flag) = arguments.next() {
        if !flag.starts_with("--") {
            return Err(invalid("options must use --name value"));
        }
        let value = arguments
            .next()
            .ok_or_else(|| invalid("option requires a value"))?;
        flags.entry(flag).or_default().push(value);
    }
    let invocation = match command.as_str() {
        "schema" => Invocation::Schema,
        "serve" => Invocation::Serve(ServeOptions {
            endpoint: optional(&mut flags, "--endpoint")?.map(PathBuf::from),
            project: required(&mut flags, "--project-root")?.into(),
            sources: flags
                .remove("--source")
                .unwrap_or_default()
                .into_iter()
                .map(PathBuf::from)
                .collect(),
            destination: optional(&mut flags, "--destination-root")?.map(PathBuf::from),
        }),
        "mcp" | "--stdio" => Invocation::Mcp {
            endpoint: required(&mut flags, "--endpoint")?.into(),
        },
        other => {
            let endpoint = required(&mut flags, "--endpoint")?.into();
            let request = match other {
                "call" => decode::<Request>(&required(&mut flags, "--file")?, input)?,
                "garbage-collect" => Request::GarbageCollect {
                    project_id: required(&mut flags, "--project-id")?
                        .parse()
                        .map_err(|_| invalid("--project-id must be a UUID"))?,
                    expected_revision: required(&mut flags, "--revision")?
                        .parse()
                        .map_err(|_| invalid("--revision must be an unsigned integer"))?,
                },
                "seal-pack" => Request::SealPack {
                    pack: decode(&required(&mut flags, "--file")?, input)?,
                },
                "presets" => Request::Query {
                    query: Query::Presets {
                        offset: optional(&mut flags, "--offset")?
                            .unwrap_or_else(|| "0".into())
                            .parse()
                            .map_err(|_| invalid("invalid page offset"))?,
                        limit: optional(&mut flags, "--limit")?
                            .unwrap_or_else(|| "256".into())
                            .parse()
                            .map_err(|_| invalid("invalid page limit"))?,
                    },
                },
                "preset" => {
                    let context =
                        decode::<RenderContext>(&required(&mut flags, "--context")?, input)?;
                    let target = decode(&required(&mut flags, "--target")?, input)?;
                    Request::Transaction {
                        transaction: Transaction {
                            api_version: beam_editor_domain::protocol::API_VERSION,
                            project_id: context.project_id,
                            sequence_id: context.sequence_id,
                            expected_revision: context.expected_revision,
                            idempotency_key: context.idempotency_key,
                            commands: vec![Command {
                                command_id: "preset".into(),
                                operation: Operation::ApplyPreset {
                                    target,
                                    preset_id: required(&mut flags, "--id")?,
                                    preset_version: optional(&mut flags, "--version")?
                                        .unwrap_or_else(|| "1".into())
                                        .parse()
                                        .map_err(|_| invalid("invalid preset version"))?,
                                },
                            }],
                        },
                    }
                }
                "transact" | "validate" => {
                    let transaction =
                        decode::<Transaction>(&required(&mut flags, "--file")?, input)?;
                    if other == "validate" {
                        Request::ValidateTransaction { transaction }
                    } else {
                        Request::Transaction { transaction }
                    }
                }
                "query" => Request::Query {
                    query: decode::<Query>(&required(&mut flags, "--file")?, input)?,
                },
                "clip-headers" => Request::Query {
                    query: Query::ClipHeaders {
                        sequence_id: required(&mut flags, "--sequence-id")?
                            .parse()
                            .map_err(|_| invalid("--sequence-id must be a UUID"))?,
                        offset: optional(&mut flags, "--offset")?
                            .unwrap_or_else(|| "0".into())
                            .parse()
                            .map_err(|_| invalid("invalid page offset"))?,
                        limit: optional(&mut flags, "--limit")?
                            .unwrap_or_else(|| "256".into())
                            .parse()
                            .map_err(|_| invalid("invalid page limit"))?,
                    },
                },
                "parameters" => Request::Query {
                    query: Query::ScopedParameterValues {
                        target: decode(&required(&mut flags, "--target")?, input)?,
                        time: decode(&required(&mut flags, "--time")?, input)?,
                    },
                },
                "discover" => Request::Discovery,
                "project" => Request::Query {
                    query: Query::Project,
                },
                "create" => Request::Create {
                    project_grant: required(&mut flags, "--grant")?,
                    name: required(&mut flags, "--name")?,
                },
                "open" => Request::Open {
                    project_grant: required(&mut flags, "--grant")?,
                },
                "import" => Request::Import {
                    context: decode(&required(&mut flags, "--context")?, input)?,
                    source_grants: flags
                        .remove("--grant")
                        .ok_or_else(|| invalid("import requires --grant"))?,
                },
                "import-start" => Request::ImportStart {
                    context: decode(&required(&mut flags, "--context")?, input)?,
                    source_grants: flags
                        .remove("--grant")
                        .ok_or_else(|| invalid("import-start requires --grant"))?,
                },
                "asset" => Request::Query {
                    query: Query::Asset {
                        id: required(&mut flags, "--id")?
                            .parse()
                            .map_err(|_| invalid("--id must be a UUID"))?,
                    },
                },
                "relink" => Request::Relink {
                    context: decode(&required(&mut flags, "--context")?, input)?,
                    asset_id: required(&mut flags, "--asset-id")?
                        .parse()
                        .map_err(|_| invalid("--asset-id must be a UUID"))?,
                    source_grant: required(&mut flags, "--grant")?,
                    clip_ids: decode(&required(&mut flags, "--clips")?, input)?,
                },
                "export" => Request::Export {
                    context: decode::<RenderContext>(&required(&mut flags, "--context")?, input)?,
                    destination_grant: required(&mut flags, "--grant")?,
                    file_name: required(&mut flags, "--name")?,
                    container: match required(&mut flags, "--container")?.as_str() {
                        "mp4" => Container::Mp4,
                        "webm" => Container::Webm,
                        _ => return Err(invalid("container must be mp4 or webm")),
                    },
                },
                "preview" => Request::PreviewRender {
                    context: decode::<RenderContext>(&required(&mut flags, "--context")?, input)?,
                    time: decode(&required(&mut flags, "--time")?, input)?,
                    quality: match optional(&mut flags, "--quality")?
                        .as_deref()
                        .unwrap_or("full")
                    {
                        "full" => RenderQuality::Full,
                        "half" => RenderQuality::Half,
                        "quarter" => RenderQuality::Quarter,
                        _ => return Err(invalid("quality must be full, half or quarter")),
                    },
                },
                "analyze" => Request::AnalysisStart {
                    context: decode(&required(&mut flags, "--context")?, input)?,
                    algorithm: match optional(&mut flags, "--algorithm")?
                        .as_deref()
                        .unwrap_or("zoomClicksV1")
                    {
                        "zoomClicksV1" => AnalysisAlgorithm::ZoomClicksV1,
                        _ => return Err(invalid("analysis algorithm must be zoomClicksV1")),
                    },
                },
                "proxy" => Request::ProxyStart {
                    context: decode(&required(&mut flags, "--context")?, input)?,
                    settings: decode(&required(&mut flags, "--settings")?, input)?,
                },
                "status" => Request::JobGet {
                    id: required(&mut flags, "--id")?
                        .parse()
                        .map_err(|_| invalid("--id must be a UUID"))?,
                },
                "cancel" => Request::JobCancel {
                    id: required(&mut flags, "--id")?
                        .parse()
                        .map_err(|_| invalid("--id must be a UUID"))?,
                },
                "artifact" => Request::ArtifactRead {
                    id: required(&mut flags, "--id")?
                        .parse()
                        .map_err(|_| invalid("--id must be a UUID"))?,
                    offset: optional(&mut flags, "--offset")?
                        .unwrap_or_else(|| "0".into())
                        .parse()
                        .map_err(|_| invalid("invalid byte offset"))?,
                    length: optional(&mut flags, "--length")?
                        .unwrap_or_else(|| "262144".into())
                        .parse()
                        .map_err(|_| invalid("invalid byte length"))?,
                },
                "transport" => Request::Transport,
                "seek" => Request::Seek {
                    position_ms: required(&mut flags, "--ms")?
                        .parse()
                        .map_err(|_| invalid("--ms must be an unsigned integer"))?,
                },
                "play" | "pause" => Request::Play {
                    playing: other == "play",
                },
                "events" => Request::Events {
                    after_revision: optional(&mut flags, "--after")?
                        .unwrap_or_else(|| "0".into())
                        .parse()
                        .map_err(|_| invalid("invalid revision"))?,
                    limit: optional(&mut flags, "--limit")?
                        .unwrap_or_else(|| "256".into())
                        .parse()
                        .map_err(|_| invalid("invalid page limit"))?,
                },
                _ => return Err(invalid("unknown command")),
            };
            Invocation::Call { endpoint, request }
        }
    };
    if !flags.is_empty() {
        return Err(invalid("unknown or unused options"));
    }
    Ok(invocation)
}

fn optional(flags: &mut BTreeMap<String, Vec<String>>, name: &str) -> Result<Option<String>> {
    match flags.remove(name) {
        None => Ok(None),
        Some(mut values) if values.len() == 1 => Ok(values.pop()),
        Some(_) => Err(invalid("option may appear only once")),
    }
}
fn required(flags: &mut BTreeMap<String, Vec<String>>, name: &str) -> Result<String> {
    optional(flags, name)?.ok_or_else(|| invalid(&format!("missing {name}")))
}
fn decode<T: serde::de::DeserializeOwned>(file: &str, input: &mut impl Read) -> Result<T> {
    let mut bytes = Vec::new();
    if file == "-" {
        input
            .take(beam_editor_domain::protocol::MESSAGE_BUDGET as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| beam_editor_domain::shared::storage("stdin", e))?;
    } else {
        let source =
            std::fs::File::open(file).map_err(|e| beam_editor_domain::shared::storage(file, e))?;
        source
            .take(beam_editor_domain::protocol::MESSAGE_BUDGET as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| beam_editor_domain::shared::storage(file, e))?;
    }
    if bytes.len() > beam_editor_domain::protocol::MESSAGE_BUDGET {
        return Err(invalid("input message budget exceeded"));
    }
    serde_json::from_slice(&bytes).map_err(Into::into)
}
