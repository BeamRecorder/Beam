//! Parks the exclusive GES actor and dispatches typed editor commands.
use super::{Command, Worker, no_project};
use crate::{export::render::Exporter, video::preview::Frames};
use std::{
    sync::mpsc::{Receiver, RecvTimeoutError},
    time::Duration,
};

pub(crate) fn run(
    commands: Receiver<Command>,
    frames: Frames,
    exporter: Exporter,
    changes: std::sync::Arc<super::super::change_types::Changes>,
) {
    let context = gst::glib::MainContext::new();
    if let Err(error) = context.with_thread_default(|| {
        let mut worker = Worker {
            preload_task: None,
            preview_window: Default::default(),
            store: None,
            document: None,
            pipeline: None,
            frames,
            pipeline_frames: Frames::default(),
            playing: false,
            position: 0,
            error: None,
            recovered: false,
            exporter,
            changes,
        };
        loop {
            let command = if worker.playing || worker.preload_task.is_some() {
                match commands.recv_timeout(Duration::from_millis(33)) {
                    Ok(c) => Some(c),
                    Err(RecvTimeoutError::Timeout) => None,
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            } else {
                match commands.recv() {
                    Ok(c) => Some(c),
                    Err(_) => break,
                }
            };
            if let Some(command) = command {
                match command {
                    Command::Shutdown => break,
                    Command::Open(root, reply) => {
                        let _ = reply.send(worker.open(root, None));
                    }
                    Command::Create(root, name, reply) => {
                        let _ = reply.send(worker.open(root, Some(name)));
                    }
                    Command::Snapshot(reply) => {
                        let _ = reply.send(worker.snapshot());
                    }
                    Command::Retry(reply) => {
                        let result = worker
                            .document
                            .clone()
                            .ok_or_else(no_project)
                            .and_then(|document| worker.commit(document));
                        let _ = reply.send(result);
                    }
                    Command::Quality(quality, reply) => {
                        let previous = *worker
                            .frames
                            .quality
                            .lock()
                            .unwrap_or_else(|p| p.into_inner());
                        *worker
                            .frames
                            .quality
                            .lock()
                            .unwrap_or_else(|p| p.into_inner()) = quality;
                        let result = worker
                            .document
                            .clone()
                            .ok_or_else(no_project)
                            .and_then(|doc| worker.commit(doc));
                        if result.is_err() {
                            *worker
                                .frames
                                .quality
                                .lock()
                                .unwrap_or_else(|p| p.into_inner()) = previous;
                        }
                        let _ = reply.send(result);
                    }
                    Command::Source(id, reply) => {
                        let _ = reply.send(worker.source(&id));
                    }
                    Command::Transport(reply) => {
                        let _ = reply.send(Ok(worker.transport()));
                    }
                    Command::Seek(time, reply) => {
                        let _ = reply.send(worker.seek(time));
                    }
                    Command::Play(value, reply) => {
                        let _ = reply.send(worker.play(value));
                    }
                    Command::Edit(revision, edit, reply) => {
                        let _ = reply.send(worker.edit(revision, edit));
                    }
                    Command::Transaction(request, reply) => {
                        let _ = reply.send(worker.transaction(request));
                    }
                    Command::ValidateTransaction(request, reply) => {
                        let result =
                            worker
                                .document
                                .as_ref()
                                .ok_or_else(no_project)
                                .and_then(|doc| {
                                    beam_editor_domain::commands::prepare(doc, &request)
                                        .map(|p| p.receipt)
                                });
                        let _ = reply.send(result);
                    }
                    Command::Document(reply) => {
                        let _ = reply.send(worker.document.clone().ok_or_else(no_project));
                    }
                    Command::ProjectRoot(reply) => {
                        let _ = reply.send(
                            worker
                                .store
                                .as_ref()
                                .map(|s| s.root.clone())
                                .ok_or_else(no_project),
                        );
                    }
                    Command::GarbageCollect(project_id, revision, pins, reply) => {
                        let result = (|| {
                            if worker.playing {
                                return Err(crate::EditorError::Invalid(
                                    "pause playback before collecting decision blocks".into(),
                                ));
                            }
                            let document = worker.document.as_ref().ok_or_else(no_project)?;
                            if document.project.id != project_id {
                                return Err(crate::EditorError::Invalid(
                                    "garbage collection project scope is stale".into(),
                                ));
                            }
                            if document.revision != revision {
                                return Err(crate::EditorError::Conflict {
                                    expected: revision,
                                    actual: document.revision,
                                });
                            }
                            worker
                                .store
                                .as_ref()
                                .ok_or_else(no_project)?
                                .garbage_collect(&pins)
                        })();
                        let _ = reply.send(result);
                    }
                    Command::Import(paths, reply) => {
                        let _ = reply.send(worker.import(paths));
                    }
                    Command::ImportPublication(context, paths, reply) => {
                        let _ = reply.send(worker.import_publication(context, paths));
                    }
                    Command::PublishImport(root, context, prepared, cancel, reply) => {
                        let _ =
                            reply.send(worker.publish_import(root, context, *prepared, &cancel));
                    }
                    Command::Relink(context, asset, clips, source, reply) => {
                        let _ = reply.send(worker.relink(context, asset, clips, source));
                    }
                    Command::Export(destination, container, reply) => {
                        let result = (|| {
                            let project = worker
                                .document
                                .as_ref()
                                .ok_or_else(no_project)?
                                .project
                                .clone();
                            let root = worker.store.as_ref().ok_or_else(no_project)?.root.clone();
                            worker.exporter.start(root, project, destination, container)
                        })();
                        let _ = reply.send(result);
                    }
                }
            }
            while context.pending() {
                context.iteration(false);
            }
            worker.messages();
            worker.preload();
        }
    }) {
        eprintln!("Beam editor context: {error}");
    }
}
