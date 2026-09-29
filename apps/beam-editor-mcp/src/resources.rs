//! Opaque Beam resource URIs contain IDs and bounded offsets, never filesystem paths.
use beam_editor_domain::protocol::{ARTIFACT_CHUNK_BYTES, Query, Request};
use serde_json::{Value, json};
pub fn list() -> Value {
    json!({"resources":[
        {"uri":"beam://project","name":"Current project","mimeType":"application/json"},
        {"uri":"beam://definitions","name":"Effect definitions, first page","mimeType":"application/json"},
        {"uri":"beam://jobs","name":"Render jobs, first page","mimeType":"application/json"},
        {"uri":"beam://artifacts","name":"Rendered artifacts, first page","mimeType":"application/json"}
    ]})
}
pub fn templates() -> Value {
    json!({"resourceTemplates":[
        {"uriTemplate":"beam://jobs/{id}","name":"Render job","mimeType":"application/json"},
        {"uriTemplate":"beam://artifacts/{id}{?offset,length}","name":"Artifact byte chunk","mimeType":"application/json"}
    ]})
}
pub fn request(uri: &str) -> Option<Request> {
    match uri {
        "beam://project" => {
            return Some(Request::Query {
                query: Query::Project,
            });
        }
        "beam://definitions" => {
            return Some(Request::Query {
                query: Query::Definitions {
                    offset: 0,
                    limit: 256,
                },
            });
        }
        "beam://jobs" => {
            return Some(Request::Query {
                query: Query::Jobs {
                    offset: 0,
                    limit: 256,
                },
            });
        }
        "beam://artifacts" => {
            return Some(Request::Query {
                query: Query::Artifacts {
                    offset: 0,
                    limit: 256,
                },
            });
        }
        _ => {}
    }
    if let Some(id) = uri.strip_prefix("beam://jobs/") {
        return Some(Request::JobGet {
            id: id.parse().ok()?,
        });
    }
    let artifact = uri.strip_prefix("beam://artifacts/")?;
    let (id, query) = artifact.split_once('?').unwrap_or((artifact, ""));
    let mut offset = None;
    let mut length = None;
    for pair in query.split('&').filter(|pair| !pair.is_empty()) {
        let (key, value) = pair.split_once('=')?;
        match key {
            "offset" if offset.is_none() => offset = Some(value.parse::<u64>().ok()?),
            "length" if length.is_none() => length = Some(value.parse::<usize>().ok()?),
            _ => return None,
        }
    }
    let length = length.unwrap_or(ARTIFACT_CHUNK_BYTES);
    if length == 0 || length > ARTIFACT_CHUNK_BYTES {
        return None;
    }
    Some(Request::ArtifactRead {
        id: id.parse().ok()?,
        offset: offset.unwrap_or(0),
        length,
    })
}
