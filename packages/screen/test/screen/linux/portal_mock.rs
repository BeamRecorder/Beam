#![cfg(test)]
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
use super::*;
use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicU32, Ordering},
    },
};
use zbus::{
    Connection,
    message::Header,
    zvariant::{OwnedObjectPath, OwnedValue, Value},
};
type Values = HashMap<String, OwnedValue>;
struct MockPortal {
    response: Arc<AtomicU32>,
}
struct MockSession;
#[zbus::interface(name = "org.freedesktop.portal.Session")]
impl MockSession {
    fn close(&self) {}
    #[zbus(property, name = "version")]
    fn version(&self) -> u32 {
        1
    }
}
fn object_path(header: &Header<'_>, options: &Values, kind: &str, token: &str) -> OwnedObjectPath {
    let sender = header
        .sender()
        .unwrap()
        .as_str()
        .trim_start_matches(':')
        .replace('.', "_");
    let token = <&str>::try_from(options.get(token).unwrap()).unwrap();
    OwnedObjectPath::try_from(format!(
        "/org/freedesktop/portal/desktop/{kind}/{sender}/{token}"
    ))
    .unwrap()
}
async fn response(connection: &Connection, path: &OwnedObjectPath, code: u32, values: Values) {
    connection
        .emit_signal(
            None::<&str>,
            path,
            "org.freedesktop.portal.Request",
            "Response",
            &(code, values),
        )
        .await
        .unwrap();
}
#[zbus::interface(name = "org.freedesktop.portal.ScreenCast")]
impl MockPortal {
    #[zbus(property, name = "version")]
    fn version(&self) -> u32 {
        5
    }
    #[zbus(property)]
    fn available_source_types(&self) -> u32 {
        3
    }
    #[zbus(property)]
    fn available_cursor_modes(&self) -> u32 {
        7
    }
    async fn create_session(
        &self,
        options: Values,
        #[zbus(header)] header: Header<'_>,
        #[zbus(connection)] connection: &Connection,
    ) -> OwnedObjectPath {
        let request = object_path(&header, &options, "request", "handle_token");
        let session = object_path(&header, &options, "session", "session_handle_token");
        connection
            .object_server()
            .at(&session, MockSession)
            .await
            .unwrap();
        let values = HashMap::from([(
            "session_handle".into(),
            OwnedValue::from(zbus::zvariant::Str::from(session.as_str())),
        )]);
        response(connection, &request, 0, values).await;
        request
    }
    async fn select_sources(
        &self,
        _session: OwnedObjectPath,
        options: Values,
        #[zbus(header)] header: Header<'_>,
        #[zbus(connection)] connection: &Connection,
    ) -> OwnedObjectPath {
        let request = object_path(&header, &options, "request", "handle_token");
        response(connection, &request, 0, Values::new()).await;
        request
    }
    async fn start(
        &self,
        _session: OwnedObjectPath,
        _parent: String,
        options: Values,
        #[zbus(header)] header: Header<'_>,
        #[zbus(connection)] connection: &Connection,
    ) -> OwnedObjectPath {
        let request = object_path(&header, &options, "request", "handle_token");
        let code = self.response.load(Ordering::SeqCst);
        let streams = if code == 3 {
            Vec::new()
        } else {
            vec![(
                42u32,
                HashMap::from([
                    (
                        "id".to_owned(),
                        OwnedValue::from(zbus::zvariant::Str::from("fixture")),
                    ),
                    ("source_type".to_owned(), OwnedValue::from(1u32)),
                    (
                        "position".to_owned(),
                        OwnedValue::try_from(Value::from((-1920_i32, 0_i32))).unwrap(),
                    ),
                    (
                        "size".to_owned(),
                        OwnedValue::try_from(Value::from((1920_i32, 1080_i32))).unwrap(),
                    ),
                ]),
            )]
        };
        let values = HashMap::from([(
            "streams".into(),
            OwnedValue::try_from(Value::from(streams)).unwrap(),
        )]);
        response(
            connection,
            &request,
            if code == 3 { 0 } else { code },
            values,
        )
        .await;
        request
    }
    async fn open_pipe_wire_remote(
        &self,
        _session: OwnedObjectPath,
        _options: Values,
    ) -> zbus::zvariant::OwnedFd {
        let file = std::fs::File::open("/dev/null").unwrap();
        zbus::zvariant::OwnedFd::from(OwnedFd::from(file))
    }
}
#[test]
fn isolated_portal_contract_covers_selection_cancel_denial_and_cleanup() {
    const CHILD: &str = "BEAM_TEST_ISOLATED_PORTAL";
    if std::env::var_os(CHILD).is_none() {
        let result=std::process::Command::new("timeout").args(["20s", "dbus-run-session", "--"]).arg(std::env::current_exe().unwrap())
            .args(["--exact","screen::linux::portal::mock_checks::isolated_portal_contract_covers_selection_cancel_denial_and_cleanup","--nocapture"])
            .env(CHILD,"1").output().expect("dbus-run-session test dependency");
        assert!(
            result.status.success(),
            "{}\n{}",
            String::from_utf8_lossy(&result.stdout),
            String::from_utf8_lossy(&result.stderr)
        );
        return;
    }
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .unwrap();
    let code = Arc::new(AtomicU32::new(0));
    let _connection = runtime.block_on(async {
        zbus::connection::Builder::session()
            .unwrap()
            .name("org.freedesktop.portal.Desktop")
            .unwrap()
            .serve_at(
                "/org/freedesktop/portal/desktop",
                MockPortal {
                    response: code.clone(),
                },
            )
            .unwrap()
            .build()
            .await
            .unwrap()
    });
    let properties =
        super::super::capabilities::probe_portal_properties(std::time::Duration::from_secs(2))
            .unwrap();
    assert_eq!(properties.version, 5);
    assert!(properties.monitor && properties.window && properties.metadata_cursor);
    let mut selected =
        prepare_portal(PortalSourceKind::Monitor, CursorSelection::Disabled).unwrap();
    assert_eq!(selected.node_id, 42);
    assert_eq!(selected.stream_id.as_deref(), Some("fixture"));
    assert_eq!(selected.geometry.position, Some((-1920, 0)));
    assert_eq!(selected.geometry.size, Some((1920, 1080)));
    assert!(selected.take_remote_fd().is_ok());
    assert!(selected.take_remote_fd().is_err());
    selected.close().unwrap();
    selected.close().unwrap();
    for (value, expected) in [
        (1, NativeCaptureErrorCode::PortalCancelled),
        (2, NativeCaptureErrorCode::PortalDenied),
        (3, NativeCaptureErrorCode::PortalInvalidStreamResponse),
    ] {
        code.store(value, Ordering::SeqCst);
        let result = prepare_portal(PortalSourceKind::Window, CursorSelection::Embedded);
        assert!(matches!(result,Err(CaptureError::Native{code,..}) if code==expected));
    }
    code.store(1, Ordering::SeqCst);
    for id in ["portal:monitor", "portal:window"] {
        let id = crate::model::SourceId::new(id).unwrap();
        let result = crate::screen::capture_source_preview(&id, 64, 64);
        assert_eq!(result.unwrap_err().code(), "portal-cancelled");
    }
    let direct = crate::model::SourceId::new("display:missing").unwrap();
    assert!(crate::screen::capture_source_preview(&direct, 64, 64).is_err());
}
