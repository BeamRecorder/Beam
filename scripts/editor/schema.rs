//! Domain-only contract emission; no media runtime or desktop libraries are loaded.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    serde_json::to_writer_pretty(
        std::io::stdout().lock(),
        &beam_editor_domain::protocol::schema()?,
    )?;
    Ok(())
}
