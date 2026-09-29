#[path = "io.rs"]
mod io;
#[path = "main.rs"]
mod main;
mod resources;
#[path = "server.rs"]
mod server;
#[path = "subscriptions.rs"]
mod subscriptions;
#[path = "tools.rs"]
mod tools;
#[path = "types.rs"]
mod types;
use std::sync::Arc;
#[test]
fn stdio_handles_parse_errors_and_immediate_requests_without_backend() {
    let mut input =
        std::io::Cursor::new(b"{\n{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}\n");
    let mut output = Vec::new();
    beam_editor_mcp::run(
        &mut input,
        &mut output,
        Arc::new(|_| panic!("ping must not call service")),
    )
    .unwrap();
    let responses: Vec<serde_json::Value> = String::from_utf8(output)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(responses.len(), 2);
    assert_eq!(responses[0]["error"]["code"], -32700);
    assert_eq!(responses[1]["result"], serde_json::json!({}));
}
#[test]
fn stdio_budget_and_empty_input_end_cleanly() {
    let execute = Arc::new(|_| Ok(beam_editor_domain::protocol::Response::Acknowledged));
    beam_editor_mcp::run(&mut std::io::empty(), &mut Vec::new(), execute.clone()).unwrap();
    assert!(
        beam_editor_mcp::run(
            &mut std::io::Cursor::new(vec![b'x'; beam_editor_domain::protocol::MESSAGE_BUDGET + 1]),
            &mut Vec::new(),
            execute
        )
        .is_err()
    );
}

#[test]
fn stdio_propagates_output_failure_without_a_protocol_response() {
    struct BrokenOutput;
    impl std::io::Write for BrokenOutput {
        fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
            Err(std::io::Error::other("closed output"))
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let mut input = std::io::Cursor::new(b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}\n");
    let error = beam_editor_mcp::run(
        &mut input,
        &mut BrokenOutput,
        Arc::new(|_| panic!("ping must not execute")),
    )
    .unwrap_err();
    assert!(error.to_string().contains("closed output"));
}

#[cfg(unix)]
#[test]
fn stdio_bounds_inflight_calls_and_suppresses_cancelled_results() {
    use std::{
        io::{BufRead, Read, Write},
        os::unix::net::UnixStream,
        sync::{Condvar, Mutex},
    };
    let (mut client, mut input) = UnixStream::pair().unwrap();
    let mut output = input.try_clone().unwrap();
    let gate = Arc::new((Mutex::new(false), Condvar::new()));
    let worker_gate = Arc::clone(&gate);
    let (entered, observed) = std::sync::mpsc::channel();
    let server = std::thread::spawn(move || {
        beam_editor_mcp::run(
            &mut input,
            &mut output,
            Arc::new(move |_| {
                entered.send(()).unwrap();
                let (lock, ready) = &*worker_gate;
                let guard = lock.lock().unwrap();
                drop(ready.wait_while(guard, |released| !*released).unwrap());
                Ok(beam_editor_domain::protocol::Response::Acknowledged)
            }),
        )
        .unwrap()
    });
    client
        .set_read_timeout(Some(std::time::Duration::from_secs(5)))
        .unwrap();
    let mut reader = std::io::BufReader::new(client.try_clone().unwrap());
    let request = |id| serde_json::json!({"jsonrpc":"2.0","id":id,"method":"tools/call","params":{"name":"beam_discovery","arguments":{},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}});
    writeln!(client, "{}", request(0)).unwrap();
    observed
        .recv_timeout(std::time::Duration::from_secs(5))
        .unwrap();
    writeln!(client, "{}", request(0)).unwrap();
    let mut line = String::new();
    reader.read_line(&mut line).unwrap();
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&line).unwrap()["error"]["code"],
        -32600
    );
    for id in 1..32 {
        writeln!(client, "{}", request(id)).unwrap();
        observed
            .recv_timeout(std::time::Duration::from_secs(5))
            .unwrap();
    }
    writeln!(client, "{}", request(32)).unwrap();
    line.clear();
    reader.read_line(&mut line).unwrap();
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&line).unwrap()["error"]["code"],
        -32600
    );
    writeln!(client,"{}",serde_json::json!({"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":0}})).unwrap();
    writeln!(
        client,
        "{}",
        serde_json::json!({"jsonrpc":"2.0","id":99,"method":"ping"})
    )
    .unwrap();
    line.clear();
    reader.read_line(&mut line).unwrap();
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&line).unwrap()["id"],
        99
    );
    client.shutdown(std::net::Shutdown::Write).unwrap();
    *gate.0.lock().unwrap() = true;
    gate.1.notify_all();
    let mut replies = String::new();
    reader.read_to_string(&mut replies).unwrap();
    for line in replies.lines() {
        let reply: serde_json::Value = serde_json::from_str(line).unwrap();
        assert_ne!(reply["id"], 0);
    }
    server.join().unwrap();
}

#[cfg(unix)]
#[test]
fn stdio_executes_service_calls_and_subscriptions_over_real_streams() {
    use std::{
        io::{BufRead, Read, Write},
        os::unix::net::UnixStream,
    };
    let (mut client, mut input) = UnixStream::pair().unwrap();
    let mut output = input.try_clone().unwrap();
    let server = std::thread::spawn(move || {
        beam_editor_mcp::run(
            &mut input,
            &mut output,
            Arc::new(|_| {
                Err(beam_editor_domain::EditorError::Unauthorized(
                    "revoked".into(),
                ))
            }),
        )
        .unwrap()
    });
    client
        .set_read_timeout(Some(std::time::Duration::from_secs(5)))
        .unwrap();
    let mut reader = std::io::BufReader::new(client.try_clone().unwrap());
    let meta = serde_json::json!({"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}});
    writeln!(client,"{}",serde_json::json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"beam_discovery","arguments":{},"_meta":meta}})).unwrap();
    let mut line = String::new();
    reader.read_line(&mut line).unwrap();
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&line).unwrap()["result"]["isError"],
        true
    );
    writeln!(client,"{}",serde_json::json!({"jsonrpc":"2.0","id":2,"method":"subscriptions/listen","params":{"notifications":{"resourceSubscriptions":["beam://project"]},"_meta":meta}})).unwrap();
    line.clear();
    reader.read_line(&mut line).unwrap();
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&line).unwrap()["method"],
        "notifications/subscriptions/acknowledged"
    );
    writeln!(client,"{}",serde_json::json!({"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":2}})).unwrap();
    client.shutdown(std::net::Shutdown::Write).unwrap();
    let mut rest = String::new();
    reader.read_to_string(&mut rest).unwrap();
    assert!(rest.is_empty());
    server.join().unwrap();
}
