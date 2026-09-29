//! Tool names and parameter schemas are projections of Rust's Request enum.
use beam_editor_domain::{
    EditorError, Result,
    protocol::{Request, schema},
};
use serde_json::{Value, json};

fn snake(name: &str) -> String {
    let mut result = String::new();
    for character in name.chars() {
        if character.is_uppercase() {
            result.push('_');
            result.extend(character.to_lowercase());
        } else {
            result.push(character);
        }
    }
    result
}

pub fn tools() -> Result<Vec<Value>> {
    let contracts = schema()?;
    let definitions = &contracts["definitions"];
    let variants = definitions["Request"]["oneOf"]
        .as_array()
        .ok_or_else(|| EditorError::Invalid("Request schema has no variants".into()))?;
    let mut tools = Vec::new();
    for variant in variants {
        let method = variant["properties"]["method"]["enum"][0]
            .as_str()
            .ok_or_else(|| {
                EditorError::Invalid("Request schema has no method discriminator".into())
            })?;
        if method == "artifactRead" {
            continue;
        }
        let mut input = variant.clone();
        if let Some(properties) = input.get_mut("properties").and_then(Value::as_object_mut) {
            properties.remove("method");
        }
        if let Some(required) = input.get_mut("required").and_then(Value::as_array_mut) {
            required.retain(|key| key != "method");
        }
        input["definitions"] = definitions.clone();
        input["$schema"] = json!("http://json-schema.org/draft-07/schema#");
        let mut output = definitions["Response"].clone();
        output["definitions"] = definitions.clone();
        output["$schema"] = json!("http://json-schema.org/draft-07/schema#");
        let read_only = matches!(
            method,
            "discovery"
                | "sealPack"
                | "schema"
                | "query"
                | "events"
                | "transport"
                | "jobGet"
                | "validateTransaction"
        );
        tools.push(json!({
            "name": format!("beam_{}", snake(method)),
            "title": format!("Beam {method}"),
            "description": variant.get("description").and_then(Value::as_str).unwrap_or("Invoke the shared, revisioned Beam editor service."),
            "inputSchema": input, "outputSchema": output,
            "annotations": { "readOnlyHint": read_only, "destructiveHint": matches!(method,"transaction"|"garbageCollect"|"relink"), "openWorldHint": false },
        }));
    }
    tools.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
    Ok(tools)
}

pub fn request(name: &str, arguments: Value) -> Result<Request> {
    let contracts = schema()?;
    let variants = contracts["definitions"]["Request"]["oneOf"]
        .as_array()
        .ok_or_else(|| EditorError::Invalid("invalid Request schema".into()))?;
    let method = variants
        .iter()
        .filter_map(|variant| variant["properties"]["method"]["enum"][0].as_str())
        .find(|method| *method != "artifactRead" && format!("beam_{}", snake(method)) == name)
        .ok_or_else(|| EditorError::Invalid("unknown Beam tool".into()))?;
    let mut arguments = arguments
        .as_object()
        .cloned()
        .ok_or_else(|| EditorError::Invalid("tool arguments must be an object".into()))?;
    if arguments.contains_key("method") {
        return Err(EditorError::Invalid(
            "method is supplied by the tool name".into(),
        ));
    }
    arguments.insert("method".into(), json!(method));
    serde_json::from_value(Value::Object(arguments)).map_err(Into::into)
}
