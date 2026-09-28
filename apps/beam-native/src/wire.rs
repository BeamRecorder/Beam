//! Compact QuickJS transaction transport decoded before the native host queue.

use argui_runtime::{WireHostId, WireOperation, WireValue};
use serde_json::Value;

/// Decodes one compact QuickJS batch into native host wire operations.
///
/// `json` contains arrays tagged with operation numbers 0 through 5:
/// create `[0, slot, generation, native_type]`, property
/// `[1, slot, generation, property, value_type, value]`, listener
/// `[2, slot, generation, event, callback]`, insert
/// `[3, parent_slot, parent_generation, child_slot, child_generation,
/// before_slot, before_generation]`, remove `[4, slot, generation]`, and root
/// `[5, slot, generation]`. Optional identities use two nulls, and optional
/// property values use two nulls. Returns the ordered operations only after
/// every row validates, or an error for malformed JSON, fields, or arity.
///
/// # Errors
/// Returns an error when any operation cannot be decoded without ambiguity.
pub fn decode_wire_operations(json: &str) -> Result<Vec<WireOperation>, String> {
    let rows: Vec<Vec<Value>> = serde_json::from_str(json)
        .map_err(|error| format!("invalid QuickJS operation batch: {error}"))?;
    rows.iter()
        .enumerate()
        .map(|(index, row)| {
            decode_row(row).map_err(|error| format!("invalid QuickJS operation {index}: {error}"))
        })
        .collect()
}

/// Decodes one fixed-arity tagged row into a wire operation.
///
/// `row` is the compact array emitted by the QuickJS bridge. Returns the typed
/// operation, or an error when its tag or fields are invalid.
fn decode_row(row: &[Value]) -> Result<WireOperation, &'static str> {
    match row {
        [tag, slot, generation, native_type] if tag == 0 => Ok(WireOperation::Create {
            id: id(slot, generation)?,
            native_type: u32_field(native_type)?,
        }),
        [tag, slot, generation, property, value_type, value] if tag == 1 => {
            let value = match (value_type, value) {
                (Value::Null, Value::Null) => None,
                (Value::String(value_type), value) => Some(WireValue {
                    value_type: value_type.clone(),
                    value: value.clone(),
                }),
                _ => return Err("invalid property value"),
            };
            Ok(WireOperation::SetProperty {
                id: id(slot, generation)?,
                property: u16_field(property)?,
                value,
            })
        }
        [tag, slot, generation, event, callback] if tag == 2 => Ok(WireOperation::SetListener {
            id: id(slot, generation)?,
            event: u16_field(event)?,
            callback: optional_u32(callback)?,
        }),
        [
            tag,
            parent_slot,
            parent_generation,
            child_slot,
            child_generation,
            before_slot,
            before_generation,
        ] if tag == 3 => Ok(WireOperation::Insert {
            parent: id(parent_slot, parent_generation)?,
            child: id(child_slot, child_generation)?,
            before: optional_id(before_slot, before_generation)?,
        }),
        [tag, slot, generation] if tag == 4 => Ok(WireOperation::Remove {
            id: id(slot, generation)?,
        }),
        [tag, slot, generation] if tag == 5 => Ok(WireOperation::SetRoot {
            id: optional_id(slot, generation)?,
        }),
        _ => Err("unknown operation tag or field count"),
    }
}

/// Converts a JSON integer to a host field without truncation.
///
/// `value` must hold an unsigned 32-bit number. Returns that number or an error.
fn u32_field(value: &Value) -> Result<u32, &'static str> {
    value
        .as_u64()
        .and_then(|number| u32::try_from(number).ok())
        .ok_or("expected unsigned 32-bit integer")
}

/// Converts a JSON integer to a schema field without truncation.
///
/// `value` must hold an unsigned 16-bit number. Returns that number or an error.
fn u16_field(value: &Value) -> Result<u16, &'static str> {
    value
        .as_u64()
        .and_then(|number| u16::try_from(number).ok())
        .ok_or("expected unsigned 16-bit integer")
}

/// Decodes a required host identity from its slot and generation.
///
/// `slot` and `generation` must be unsigned 32-bit numbers. Returns the identity
/// or an error; the host validates whether that identity is live.
fn id(slot: &Value, generation: &Value) -> Result<WireHostId, &'static str> {
    Ok(WireHostId {
        slot: u32_field(slot)?,
        generation: u32_field(generation)?,
    })
}

/// Decodes an optional unsigned 32-bit field represented by JSON null.
///
/// `value` is either null or an unsigned number. Returns the optional field.
fn optional_u32(value: &Value) -> Result<Option<u32>, &'static str> {
    if value.is_null() {
        Ok(None)
    } else {
        u32_field(value).map(Some)
    }
}

/// Decodes an optional identity whose two fields must both be null or numbers.
///
/// `slot` and `generation` are the paired identity fields. Returns the optional
/// identity, or an error when only one field is null or a number is invalid.
fn optional_id(slot: &Value, generation: &Value) -> Result<Option<WireHostId>, &'static str> {
    if slot.is_null() && generation.is_null() {
        Ok(None)
    } else {
        id(slot, generation).map(Some)
    }
}
