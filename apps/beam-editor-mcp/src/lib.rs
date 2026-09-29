//! MCP is a thin adapter to the same local owner as UI, CLI and the SDK.
pub mod io;
pub mod resources;
pub mod server;
pub mod subscriptions;
pub mod tools;
pub mod types;
use beam_editor_domain::{Result, protocol::Response};
use server::Server;
use std::{
    collections::HashMap,
    io::{BufReader, Read, Write},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
};
use types::{Action, Executor, Pending};

pub fn run(
    input: &mut (impl Read + Send),
    output: &mut (impl Write + Send),
    executor: Executor,
) -> Result<()> {
    let pending: Pending = Arc::new(Mutex::new(HashMap::new()));
    let (sender, receiver) = mpsc::sync_channel::<(serde_json::Value, Option<Arc<AtomicBool>>)>(32);
    std::thread::scope(|scope| {
        let active = Arc::clone(&pending);
        let reader = scope.spawn(move || -> Result<()> {
            let mut input = BufReader::new(input);
            let mut server = Server::default();
            let read_result = (|| -> Result<()> {
                while let Some(bytes) = io::read_message(&mut input)? {
                    let action = server.prepare(&bytes);
                    match action {
                        Action::Reply(value) => {
                            if sender.send((value, None)).is_err() {
                                break;
                            }
                        }
                        Action::Ignore => {}
                        Action::Cancel { id } => {
                            if let Some(cancelled) = active
                                .lock()
                                .unwrap_or_else(|p| p.into_inner())
                                .get(&id.to_string())
                            {
                                cancelled.store(true, Ordering::Release);
                            }
                        }
                        Action::Service {
                            id,
                            modern,
                            request,
                            style,
                        } => {
                            let Some(cancelled) = register(&active, &id) else {
                                if sender
                                    .send((
                                        server::failure(
                                            id,
                                            -32600,
                                            "Duplicate request ID or request budget reached",
                                        ),
                                        None,
                                    ))
                                    .is_err()
                                {
                                    break;
                                }
                                continue;
                            };
                            let execute = Arc::clone(&executor);
                            let outgoing = sender.clone();
                            let running = Arc::clone(&active);
                            scope.spawn(move || {
                                let response =
                                    execute(request).unwrap_or_else(|error| Response::Error {
                                        error: (&error).into(),
                                    });
                                if !cancelled.load(Ordering::Acquire) {
                                    let reply =
                                        server::service_result(id.clone(), response, style, modern);
                                    let _ = outgoing.send((reply, Some(Arc::clone(&cancelled))));
                                }
                                running
                                    .lock()
                                    .unwrap_or_else(|p| p.into_inner())
                                    .remove(&id.to_string());
                            });
                        }
                        Action::Subscribe { id, uris } => {
                            let Some(cancelled) = register(&active, &id) else {
                                if sender
                                    .send((
                                        server::failure(id, -32600, "Subscription budget reached"),
                                        None,
                                    ))
                                    .is_err()
                                {
                                    break;
                                }
                                continue;
                            };
                            let execute = Arc::clone(&executor);
                            let outgoing = sender.clone();
                            let running = Arc::clone(&active);
                            scope.spawn(move || {
                                subscriptions::watch(
                                    id.clone(),
                                    uris,
                                    execute,
                                    Arc::clone(&cancelled),
                                    |value| {
                                        let _ =
                                            outgoing.send((value, Some(Arc::clone(&cancelled))));
                                    },
                                );
                                running
                                    .lock()
                                    .unwrap_or_else(|p| p.into_inner())
                                    .remove(&id.to_string());
                            });
                        }
                    }
                }
                Ok(())
            })();
            for cancelled in active.lock().unwrap_or_else(|p| p.into_inner()).values() {
                cancelled.store(true, Ordering::Release);
            }
            read_result
        });
        let mut write_error = None;
        for (value, cancellation) in receiver {
            if cancellation.is_some_and(|cancelled| cancelled.load(Ordering::Acquire)) {
                continue;
            }
            if let Err(error) = io::write_message(output, &value) {
                write_error = Some(error);
                break;
            }
        }
        let read_result = reader
            .join()
            .unwrap_or(Err(beam_editor_domain::EditorError::Stopped));
        match write_error {
            Some(error) => Err(error),
            None => read_result,
        }
    })
}

fn register(pending: &Pending, id: &serde_json::Value) -> Option<Arc<AtomicBool>> {
    let mut pending = pending.lock().unwrap_or_else(|p| p.into_inner());
    if pending.len() >= 32 || pending.contains_key(&id.to_string()) {
        return None;
    }
    let cancelled = Arc::new(AtomicBool::new(false));
    pending.insert(id.to_string(), Arc::clone(&cancelled));
    Some(cancelled)
}
