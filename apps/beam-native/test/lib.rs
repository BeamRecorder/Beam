use beam_native::QuickJsGallery;

fn mount(source: &str) -> QuickJsGallery {
    QuickJsGallery::new(source, r#"{"abiHash":"test"}"#, "mountGallery", |_| {
        String::new()
    })
    .unwrap()
}

#[test]
fn quickjs_provides_console_for_all_log_levels_and_structured_values() {
    let app = mount(
        r#"export function mountGallery() {
        const cyclic = {}; cyclic.self = cyclic;
        for (const level of ['log','info','warn','error','debug'])
            console[level]('Bonjour', { value: 42 }, cyclic, new Error('diagnostic'));
        return () => {};
    }"#,
    );
    app.dispose().unwrap();
}

#[test]
fn a_rejected_service_promise_can_report_its_error_without_a_missing_console() {
    let app = mount(
        r#"export function mountGallery() {
        Promise.reject(new Error('service failure')).catch(console.error);
        return () => {};
    }"#,
    );
    app.tick(0.0).unwrap();
    app.dispose().unwrap();
}

#[test]
fn delayed_window_callbacks_can_use_console_error() {
    let app = mount(
        r#"export function mountGallery() {
        setTimeout(() => Promise.reject(new Error('window failure')).catch(console.error), 10);
        return () => {};
    }"#,
    );
    app.tick(0.0).unwrap();
    app.tick(20.0).unwrap();
    app.dispose().unwrap();
}
