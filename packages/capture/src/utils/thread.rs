pub fn join_named(
    handle: std::thread::JoinHandle<()>,
    name: &str,
) -> Result<(), crate::CaptureError> {
    handle
        .join()
        .map_err(|_| crate::CaptureError::Backend(format!("thread {name} panicked")))
}
