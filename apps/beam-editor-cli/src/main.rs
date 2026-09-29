fn main() {
    let mut input = std::io::stdin();
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let stdio = matches!(
        arguments.first().map(String::as_str),
        Some("mcp" | "--stdio")
    );
    let invocation = beam_editor_cli::args::parse(arguments, &mut input);
    let result = invocation.and_then(|invocation| {
        beam_editor_cli::execute(invocation, &mut input, &mut std::io::stdout())
    });
    match result {
        Ok(code) => std::process::exit(code),
        Err(error) => {
            if stdio {
                eprintln!("{error}");
                std::process::exit(2);
            }
            let response = beam_editor_domain::protocol::Response::Error {
                error: (&error).into(),
            };
            if let Err(write_error) = beam_editor_cli::write_json(&mut std::io::stdout(), &response)
            {
                eprintln!("{write_error}");
            }
            std::process::exit(2);
        }
    }
}
