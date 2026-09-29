use super::*;
#[test]
fn parameter_edits_keep_header_validation_but_changed_headers_detach_it() {
    let mut values = collection(1);
    let calls = AtomicUsize::new(0);
    let check = || {
        calls.fetch_add(1, Ordering::SeqCst);
        Ok(())
    };
    values.try_validate_headers("catalog", check).unwrap();
    let history = values.clone();
    values
        .try_by_id_mut(Item::new(0).id)
        .unwrap()
        .unwrap()
        .payload[0] = 9;
    values.try_validate_headers("catalog", check).unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    values
        .try_by_id_mut(Item::new(0).id)
        .unwrap()
        .unwrap()
        .label = "Changed".into();
    values.try_validate_headers("catalog", check).unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    history.try_validate_headers("catalog", check).unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    for index in 0..10 {
        values
            .try_validate_headers(&index.to_string(), check)
            .unwrap();
    }
    assert!(
        values
            .try_validate_headers("bad", || Err(beam_editor_domain::EditorError::Invalid(
                "invalid".into()
            )))
            .is_err()
    );
    values.try_validate_headers("bad", check).unwrap();
}
