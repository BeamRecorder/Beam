use std::{path::PathBuf, sync::Arc};
fn main() {
    let mut arguments = std::env::args().skip(1);
    let endpoint = match (
        arguments.next().as_deref(),
        arguments.next(),
        arguments.next(),
    ) {
        (Some("--endpoint"), Some(endpoint), None) => PathBuf::from(endpoint),
        _ => {
            eprintln!("usage: beam-editor-mcp --endpoint <owner socket or named pipe>");
            std::process::exit(2);
        }
    };
    let executor = Arc::new(move |request| {
        beam_editor_engine::broker::Client::connect(&endpoint)?.request(request)
    });
    if let Err(error) =
        beam_editor_mcp::run(&mut std::io::stdin(), &mut std::io::stdout(), executor)
    {
        eprintln!("{error}");
        std::process::exit(2);
    }
}
