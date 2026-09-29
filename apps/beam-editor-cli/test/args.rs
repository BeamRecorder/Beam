use beam_editor_cli::{args::parse, types::Invocation};
use beam_editor_domain::protocol::Request;
use std::io::Cursor;
fn command(value: &str) -> beam_editor_domain::Result<Invocation> {
    parse(
        value.split_whitespace().map(String::from),
        &mut std::io::empty(),
    )
}
#[test]
fn simple_commands_map_to_service_requests() {
    for name in [
        "discover",
        "project",
        "transport",
        "play",
        "pause",
        "events",
    ] {
        assert!(matches!(
            command(&format!("{name} --endpoint owner")).unwrap(),
            Invocation::Call { .. }
        ));
    }
    assert!(matches!(
        command("seek --endpoint owner --ms 10").unwrap(),
        Invocation::Call {
            request: Request::Seek { position_ms: 10 },
            ..
        }
    ));
    let context = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(context.path(),r#"{"projectId":"00000000-0000-4000-8000-000000000001","sequenceId":"00000000-0000-4000-8000-000000000001","expectedRevision":0,"idempotencyKey":"key"}"#).unwrap();
    assert!(matches!(
        command(&format!(
            "export --endpoint owner --grant g --name out.webm --container webm --context {}",
            context.path().display()
        ))
        .unwrap(),
        Invocation::Call {
            request: Request::Export { .. },
            ..
        }
    ));
    for name in ["status", "cancel", "artifact"] {
        assert!(
            command(&format!(
                "{name} --endpoint owner --id 00000000-0000-4000-8000-000000000001"
            ))
            .is_ok()
        );
    }
    let time = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(time.path(), r#"{"ticks":0,"timescale":1000}"#).unwrap();
    for quality in ["full", "half", "quarter"] {
        assert!(
            command(&format!(
                "preview --endpoint owner --context {} --time {} --quality {quality}",
                context.path().display(),
                time.path().display()
            ))
            .is_ok()
        );
    }
    assert!(
        command(&format!(
            "preview --endpoint owner --context {} --time {} --quality bad",
            context.path().display(),
            time.path().display()
        ))
        .is_err()
    );
    assert!(
        command(&format!(
            "export --endpoint owner --grant g --name out.mp4 --container mp4 --context {}",
            context.path().display()
        ))
        .is_ok()
    );
    assert!(matches!(
        command("create --endpoint owner --grant g --name Project").unwrap(),
        Invocation::Call {
            request: Request::Create { .. },
            ..
        }
    ));
    assert!(matches!(
        command("open --endpoint owner --grant g").unwrap(),
        Invocation::Call {
            request: Request::Open { .. },
            ..
        }
    ));
    assert!(
        matches!(command(&format!("import --endpoint owner --grant a --grant b --context {}",context.path().display())).unwrap(),Invocation::Call{request:Request::Import{source_grants,..},..} if source_grants.len()==2)
    );
    assert!(command("import --endpoint owner --grant a").is_err());
}
#[test]
fn bootstrap_only_accepts_explicit_trusted_paths() {
    assert!(
        matches!(command("serve --endpoint owner --project-root project --source one --source two --destination-root dest").unwrap(),Invocation::Serve(options) if options.sources.len()==2)
    );
    assert!(matches!(
        command("mcp --endpoint owner").unwrap(),
        Invocation::Mcp { .. }
    ));
    assert!(matches!(
        command("--stdio --endpoint owner").unwrap(),
        Invocation::Mcp { .. }
    ));
    assert!(matches!(command("schema").unwrap(), Invocation::Schema));
}
#[test]
fn source_jobs_use_asset_context_and_explicit_proxy_settings() {
    let context = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(context.path(),r#"{"projectId":"00000000-0000-4000-8000-000000000001","assetId":"00000000-0000-4000-8000-000000000002","expectedRevision":7,"idempotencyKey":"source-job"}"#).unwrap();
    assert!(matches!(
        command(&format!(
            "analyze --endpoint owner --context {}",
            context.path().display()
        ))
        .unwrap(),
        Invocation::Call {
            request: Request::AnalysisStart { .. },
            ..
        }
    ));
    assert!(
        command(&format!(
            "analyze --endpoint owner --context {} --algorithm fake",
            context.path().display()
        ))
        .is_err()
    );
    assert!(command("analyze --endpoint owner").is_err());
    let settings = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(settings.path(),r#"{"container":"webm","width":128,"height":96,"frameRate":{"numerator":30000,"denominator":1001}}"#).unwrap();
    assert!(matches!(
        command(&format!(
            "proxy --endpoint owner --context {} --settings {}",
            context.path().display(),
            settings.path().display()
        ))
        .unwrap(),
        Invocation::Call {
            request: Request::ProxyStart { .. },
            ..
        }
    ));
    assert!(
        command(&format!(
            "proxy --endpoint owner --context {}",
            context.path().display()
        ))
        .is_err()
    );
    std::fs::write(settings.path(),r#"{"container":"webm","width":128,"height":96,"frameRate":{"numerator":30,"denominator":1},"path":"/private"}"#).unwrap();
    assert!(
        command(&format!(
            "proxy --endpoint owner --context {} --settings {}",
            context.path().display(),
            settings.path().display()
        ))
        .is_err()
    );
}
#[test]
fn garbage_collection_passes_scope_and_revision_and_rejects_malformed_context() {
    assert!(matches!(
        command("garbage-collect --endpoint owner --project-id 00000000-0000-4000-8000-000000000001 --revision 7").unwrap(),
        Invocation::Call {request:Request::GarbageCollect {expected_revision:7,..},..}
    ));
    for arguments in [
        "garbage-collect --endpoint owner --project-id invalid --revision 7",
        "garbage-collect --endpoint owner --project-id 00000000-0000-4000-8000-000000000001 --revision -1",
        "garbage-collect --endpoint owner --project-id 00000000-0000-4000-8000-000000000001",
    ] {
        assert!(command(arguments).is_err());
    }
}
#[test]
fn invalid_and_ambiguous_arguments_fail() {
    for value in [
        "",
        "unknown --endpoint x",
        "open",
        "open --endpoint x --grant",
        "schema --extra x",
        "open --endpoint a --endpoint b --grant c",
        "seek --endpoint x --ms -1",
        "status --endpoint x --id invalid",
        "cancel --endpoint x --id invalid",
        "artifact --endpoint x --id invalid",
        "artifact --endpoint x --id 00000000-0000-4000-8000-000000000001 --offset x",
        "artifact --endpoint x --id 00000000-0000-4000-8000-000000000001 --length x",
        "export --endpoint x --grant g --name x --container avi",
        "events --endpoint x --after bad",
        "events --endpoint x --limit bad",
        "import --endpoint x",
        "schema positional",
    ] {
        assert!(command(value).is_err(), "{value}");
    }
}
#[test]
fn structured_queries_and_requests_decode_stdin_or_file() {
    for (command_name, body) in [
        ("call", r#"{"method":"discovery"}"#),
        ("query", r#"{"kind":"project"}"#),
    ] {
        assert!(matches!(
            parse(
                format!("{command_name} --endpoint x --file -")
                    .split_whitespace()
                    .map(String::from),
                &mut Cursor::new(body)
            )
            .unwrap(),
            Invocation::Call { .. }
        ));
        let file = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(file.path(), body).unwrap();
        assert!(
            parse(
                vec![
                    command_name.into(),
                    "--endpoint".into(),
                    "x".into(),
                    "--file".into(),
                    file.path().to_string_lossy().into_owned()
                ],
                &mut std::io::empty()
            )
            .is_ok()
        );
    }
    assert!(command("call --endpoint x --file /missing/request.json").is_err());
    assert!(
        parse(
            ["call", "--endpoint", "x", "--file", "-"].map(String::from),
            &mut Cursor::new("{}")
        )
        .is_err()
    );
    assert!(
        parse(
            ["call", "--endpoint", "x", "--file", "-"].map(String::from),
            &mut Cursor::new(vec![b' '; beam_editor_domain::protocol::MESSAGE_BUDGET + 1])
        )
        .is_err()
    );
}

#[test]
fn presets_and_pack_sealing_map_to_generated_shared_commands() {
    assert!(matches!(
        command("presets --endpoint owner --offset 1 --limit 2").unwrap(),
        Invocation::Call {
            request: Request::Query {
                query: beam_editor_domain::protocol::Query::Presets {
                    offset: 1,
                    limit: 2
                }
            },
            ..
        }
    ));
    assert!(command("presets --endpoint owner --offset bad").is_err());
    assert!(command("presets --endpoint owner --limit bad").is_err());
    let body =
        r#"{"id":"example.pack","namespace":"example","version":1,"definitions":[],"presets":[]}"#;
    assert!(matches!(
        parse(
            ["seal-pack", "--endpoint", "owner", "--file", "-"].map(String::from),
            &mut Cursor::new(body)
        )
        .unwrap(),
        Invocation::Call {
            request: Request::SealPack { .. },
            ..
        }
    ));
    let context = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(context.path(),r#"{"projectId":"00000000-0000-4000-8000-000000000001","sequenceId":"00000000-0000-4000-8000-000000000001","expectedRevision":0,"idempotencyKey":"preset"}"#).unwrap();
    let target = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(target.path(),r#"{"kind":"effect","clipId":"00000000-0000-4000-8000-000000000001","instanceId":"00000000-0000-4000-8000-000000000001"}"#).unwrap();
    let value = format!(
        "preset --endpoint owner --context {} --target {} --id beam.opacity.fadeIn",
        context.path().display(),
        target.path().display()
    );
    let Invocation::Call {
        request: Request::Transaction { transaction },
        ..
    } = command(&value).unwrap()
    else {
        panic!("expected shared transaction")
    };
    assert_eq!(transaction.expected_revision, 0);
    assert!(matches!(
        &transaction.commands[0].operation,
        beam_editor_domain::commands::types::Operation::ApplyPreset {
            preset_version: 1,
            ..
        }
    ));
    assert!(command(&format!("{value} --version bad")).is_err());
}

#[test]
fn relink_and_single_asset_queries_use_explicit_opaque_scope() {
    assert!(matches!(
        command("asset --endpoint owner --id 00000000-0000-4000-8000-000000000001").unwrap(),
        Invocation::Call {
            request: Request::Query {
                query: beam_editor_domain::protocol::Query::Asset { .. }
            },
            ..
        }
    ));
    assert!(command("asset --endpoint owner --id invalid").is_err());
    let context = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(context.path(),r#"{"projectId":"00000000-0000-4000-8000-000000000001","sequenceId":"00000000-0000-4000-8000-000000000002","expectedRevision":7,"idempotencyKey":"source-version"}"#).unwrap();
    let clips = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(clips.path(), r#"["00000000-0000-4000-8000-000000000003"]"#).unwrap();
    let arguments = format!(
        "relink --endpoint owner --context {} --asset-id 00000000-0000-4000-8000-000000000004 --grant source-grant --clips {}",
        context.path().display(),
        clips.path().display()
    );
    let Invocation::Call {
        request:
            Request::Relink {
                context,
                source_grant,
                clip_ids,
                ..
            },
        ..
    } = command(&arguments).unwrap()
    else {
        panic!("expected source publication request")
    };
    assert_eq!(context.expected_revision, 7);
    assert_eq!(source_grant, "source-grant");
    assert_eq!(clip_ids.len(), 1);
    assert!(
        command(&arguments.replace(
            "--asset-id 00000000-0000-4000-8000-000000000004",
            "--asset-id invalid"
        ))
        .is_err()
    );
}

#[test]
fn header_and_parameter_commands_preserve_explicit_read_scopes() {
    use beam_editor_domain::protocol::{Query, ReadTarget};
    let id = "00000000-0000-4000-8000-000000000001";
    assert!(matches!(
        command(&format!("clip-headers --endpoint owner --sequence-id {id}")).unwrap(),
        Invocation::Call {
            request: Request::Query {
                query: Query::ClipHeaders {
                    offset: 0,
                    limit: 256,
                    ..
                }
            },
            ..
        }
    ));
    for invalid in [
        "clip-headers --endpoint owner --sequence-id bad",
        "clip-headers --endpoint owner --sequence-id 00000000-0000-4000-8000-000000000001 --offset -1",
        "parameters --endpoint owner",
    ] {
        assert!(command(invalid).is_err());
    }
    let target = tempfile::NamedTempFile::new().unwrap();
    let time = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(
        target.path(),
        format!(r#"{{"kind":"track","sequenceId":"{id}","trackId":"{id}"}}"#),
    )
    .unwrap();
    std::fs::write(time.path(), r#"{"ticks":1500,"timescale":1000}"#).unwrap();
    let args = format!(
        "parameters --endpoint owner --target {} --time {}",
        target.path().display(),
        time.path().display()
    );
    assert!(matches!(
        command(&args).unwrap(),
        Invocation::Call {
            request: Request::Query {
                query: Query::ScopedParameterValues {
                    target: ReadTarget::Track { .. },
                    ..
                }
            },
            ..
        }
    ));
    std::fs::write(
        target.path(),
        format!(r#"{{"kind":"track","sequenceId":"{id}","clipId":"{id}"}}"#),
    )
    .unwrap();
    assert!(command(&args).is_err());
}

#[test]
fn serve_can_derive_a_private_endpoint_from_the_authorized_project() {
    assert!(matches!(
        command("serve --project-root private").unwrap(),
        Invocation::Serve(beam_editor_cli::types::ServeOptions { endpoint: None, .. })
    ));
}

#[test]
fn async_import_maps_directly_to_a_contextual_job_request() {
    let context = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(context.path(),r#"{"projectId":"00000000-0000-4000-8000-000000000001","sequenceId":"00000000-0000-4000-8000-000000000001","expectedRevision":0,"idempotencyKey":"job"}"#).unwrap();
    let args = format!(
        "import-start --endpoint owner --context {} --grant one --grant two",
        context.path().display()
    );
    let Invocation::Call {
        request: Request::ImportStart { source_grants, .. },
        ..
    } = command(&args).unwrap()
    else {
        panic!("expected native import job");
    };
    assert_eq!(source_grants, vec!["one", "two"]);
    assert!(command("import-start --endpoint owner --grant one").is_err());
    assert!(
        command(&format!(
            "import-start --endpoint owner --context {}",
            context.path().display()
        ))
        .is_err()
    );
}
