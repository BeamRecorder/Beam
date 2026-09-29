//! Newline framing is bounded before deserialization; stdout contains only MCP.
use beam_editor_domain::{EditorError, Result, protocol::MESSAGE_BUDGET};
use std::io::{BufRead, Read, Write};

pub fn read_message(reader: &mut impl BufRead) -> Result<Option<Vec<u8>>> {
    let mut bytes = Vec::new();
    reader
        .take(MESSAGE_BUDGET as u64 + 1)
        .read_until(b'\n', &mut bytes)
        .map_err(|error| beam_editor_domain::shared::storage("MCP stdin", error))?;
    if bytes.len() > MESSAGE_BUDGET {
        return Err(EditorError::Invalid("MCP message budget exceeded".into()));
    }
    if bytes.is_empty() {
        Ok(None)
    } else if bytes.last() != Some(&b'\n') {
        Err(EditorError::Invalid("incomplete MCP message".into()))
    } else {
        Ok(Some(bytes))
    }
}
pub fn write_message(output: &mut impl Write, value: &serde_json::Value) -> Result<()> {
    let bytes = serde_json::to_vec(value)?;
    if bytes.len() >= MESSAGE_BUDGET {
        return Err(EditorError::Invalid("MCP response budget exceeded".into()));
    }
    output
        .write_all(&bytes)
        .and_then(|_| output.write_all(b"\n"))
        .and_then(|_| output.flush())
        .map_err(|error| beam_editor_domain::shared::storage("MCP stdout", error))
}
