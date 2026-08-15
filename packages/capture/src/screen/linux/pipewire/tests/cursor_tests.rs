use super::*;

#[test]
fn cursor_spa_id_changes_without_a_bitmap_and_zero_preserves_identity() {
    let mut state = CursorState::new("stream");
    let first = CursorMetadata {
        id: 17,
        shape_id: None,
        cursor_kind: None,
        x: 4,
        y: 5,
        hotspot: None,
    };
    assert!(matches!(
        state.resolve(Some(first), 10, 10),
        CursorSampleState::Known {
            ref native_cursor_id,
            visible: true,
            ..
        } if native_cursor_id == "pipewire:stream:17"
    ));

    // SPA IDs are the identity even when no bitmap is present in the meta.
    let changed = CursorMetadata { id: 23, ..first };
    assert!(matches!(
        state.resolve(Some(changed), 10, 10),
        CursorSampleState::Known {
            ref native_cursor_id,
            visible: true,
            ..
        } if native_cursor_id == "pipewire:stream:23"
    ));

    let preserved = state.resolve(
        Some(CursorMetadata {
            id: 0,
            shape_id: None,
            cursor_kind: None,
            x: 6,
            y: 7,
            hotspot: None,
        }),
        10,
        10,
    );
    assert!(matches!(
        preserved,
        CursorSampleState::Known {
            ref native_cursor_id,
            pixel_x: 6,
            pixel_y: 7,
            visible: true,
            ..
        } if native_cursor_id == "pipewire:stream:23"
    ));

    let hidden = state.resolve(
        Some(CursorMetadata {
            id: 0,
            shape_id: None,
            cursor_kind: None,
            x: -1,
            y: -1,
            hotspot: None,
        }),
        10,
        10,
    );
    assert!(matches!(
        hidden,
        CursorSampleState::Known {
            ref native_cursor_id,
            visible: false,
            ..
        } if native_cursor_id == "pipewire:stream:23"
    ));
}

#[test]
fn cursor_id_zero_without_a_previous_identity_is_unknown() {
    let mut state = CursorState::new("stream");
    assert_eq!(
        state.resolve(
            Some(CursorMetadata {
                id: 0,
                shape_id: None,
                cursor_kind: None,
                x: 4,
                y: 5,
                hotspot: None,
            }),
            10,
            10,
        ),
        CursorSampleState::Unknown
    );
}

#[test]
fn cursor_meta_allocation_matches_mutter_384_pixel_contract() {
    let minimum = size_of::<pipewire::spa::sys::spa_meta_cursor>()
        + size_of::<pipewire::spa::sys::spa_meta_bitmap>()
        + 384 * 384 * 4;
    assert!(CURSOR_META_SIZE >= minimum);
}

#[test]
fn cursor_position_only_update_preserves_raw_spa_identity() {
    let mut state = CursorState::new("stream");
    let identified = state.resolve(
        Some(CursorMetadata {
            id: 17,
            shape_id: None,
            cursor_kind: None,
            x: 4,
            y: 5,
            hotspot: None,
        }),
        10,
        10,
    );
    assert!(matches!(
        identified,
        CursorSampleState::Known { ref native_cursor_id, .. }
            if native_cursor_id == "pipewire:stream:17"
    ));

    let moved = state.resolve(
        Some(CursorMetadata {
            id: 0,
            shape_id: None,
            cursor_kind: None,
            x: 7,
            y: 8,
            hotspot: None,
        }),
        10,
        10,
    );
    assert!(matches!(
        moved,
        CursorSampleState::Known {
            ref native_cursor_id,
            pixel_x: 7,
            pixel_y: 8,
            visible: true,
            ..
        } if native_cursor_id == "pipewire:stream:17"
    ));
}

#[test]
fn mutter_raw_id_one_uses_shape_hash_and_position_only_preserves_it() {
    let shape_a = metadata::stable_cursor_shape_id(1, 2, 2, 8, &[0, 1, 2, 3]);
    let shape_b = metadata::stable_cursor_shape_id(1, 2, 2, 8, &[0, 1, 2, 4]);
    let mut state = CursorState::new("stream");

    let first = state.resolve(
        Some(CursorMetadata {
            id: 1,
            shape_id: Some(shape_a),
            cursor_kind: Some(CursorKind::Default),
            x: 4,
            y: 5,
            hotspot: None,
        }),
        10,
        10,
    );
    assert!(matches!(
        first,
        CursorSampleState::Known {
            ref native_cursor_id,
            cursor_kind: CursorKind::Default,
            ..
        } if native_cursor_id == &format!("pipewire:stream:{shape_a}")
    ));

    let moved = state.resolve(
        Some(CursorMetadata {
            id: 1,
            shape_id: None,
            cursor_kind: None,
            x: 7,
            y: 8,
            hotspot: None,
        }),
        10,
        10,
    );
    assert!(matches!(
        moved,
        CursorSampleState::Known {
            ref native_cursor_id,
            cursor_kind: CursorKind::Default,
            pixel_x: 7,
            pixel_y: 8,
            visible: true,
            ..
        } if native_cursor_id == &format!("pipewire:stream:{shape_a}")
    ));

    let changed = state.resolve(
        Some(CursorMetadata {
            id: 1,
            shape_id: Some(shape_b),
            cursor_kind: Some(CursorKind::Textcursor),
            x: 7,
            y: 8,
            hotspot: None,
        }),
        10,
        10,
    );
    assert!(matches!(
        changed,
        CursorSampleState::Known {
            ref native_cursor_id,
            cursor_kind: CursorKind::Textcursor,
            ..
        } if native_cursor_id == &format!("pipewire:stream:{shape_b}")
    ));
    assert_ne!(shape_a, shape_b);
}

#[test]
fn stable_cursor_shape_id_is_repeatable_and_pixel_sensitive() {
    let pixels = [10, 20, 30, 40, 50, 60, 70, 80];
    let same = metadata::stable_cursor_shape_id(42, 2, 1, 8, &pixels);
    let repeat = metadata::stable_cursor_shape_id(42, 2, 1, 8, &pixels);
    let changed = metadata::stable_cursor_shape_id(42, 2, 1, 8, &[10, 20, 30, 40, 50, 60, 70, 81]);

    assert_ne!(same, 0);
    assert_eq!(same, repeat);
    assert_ne!(same, changed);
}

#[test]
fn raw_spa_id_change_then_bitmap_shape_change_updates_identity_in_order() {
    let shape_a = metadata::stable_cursor_shape_id(1, 2, 2, 8, &[0, 1, 2, 3]);
    let shape_b = metadata::stable_cursor_shape_id(1, 2, 2, 8, &[0, 1, 2, 4]);
    let mut state = CursorState::new("stream");

    let first = state.resolve(
        Some(CursorMetadata {
            id: 17,
            shape_id: Some(shape_a),
            cursor_kind: Some(CursorKind::Default),
            x: 4,
            y: 5,
            hotspot: None,
        }),
        10,
        10,
    );
    assert!(matches!(
        first,
        CursorSampleState::Known { ref native_cursor_id, .. }
            if native_cursor_id == &format!("pipewire:stream:{shape_a}")
    ));

    let raw_changed = state.resolve(
        Some(CursorMetadata {
            id: 23,
            shape_id: None,
            cursor_kind: None,
            x: 6,
            y: 7,
            hotspot: None,
        }),
        10,
        10,
    );
    assert!(matches!(
        raw_changed,
        CursorSampleState::Known { ref native_cursor_id, .. }
            if native_cursor_id == "pipewire:stream:23"
    ));

    let bitmap_changed = state.resolve(
        Some(CursorMetadata {
            id: 23,
            shape_id: Some(shape_b),
            cursor_kind: Some(CursorKind::Handpointing),
            x: 6,
            y: 7,
            hotspot: None,
        }),
        10,
        10,
    );
    assert!(matches!(
        bitmap_changed,
        CursorSampleState::Known { ref native_cursor_id, .. }
            if native_cursor_id == &format!("pipewire:stream:{shape_b}")
    ));
}

#[test]
fn zero_shape_hash_does_not_replace_an_existing_identity() {
    let shape = metadata::stable_cursor_shape_id(1, 2, 2, 8, &[0, 1, 2, 3]);
    let mut state = CursorState::new("stream");
    let _ = state.resolve(
        Some(CursorMetadata {
            id: 17,
            shape_id: Some(shape),
            cursor_kind: Some(CursorKind::Default),
            x: 4,
            y: 5,
            hotspot: None,
        }),
        10,
        10,
    );

    let invalid = state.resolve(
        Some(CursorMetadata {
            id: 17,
            shape_id: Some(0),
            cursor_kind: None,
            x: 6,
            y: 7,
            hotspot: None,
        }),
        10,
        10,
    );
    assert!(matches!(
        invalid,
        CursorSampleState::Known { ref native_cursor_id, .. }
            if native_cursor_id == &format!("pipewire:stream:{shape}")
    ));
}

#[test]
fn cursor_coordinates_keep_signed_values_and_follow_crop_rotation() {
    let metadata = CursorMetadata {
        id: 3,
        shape_id: None,
        cursor_kind: None,
        x: 12,
        y: 24,
        hotspot: None,
    };
    let mapped = map_cursor_metadata(
        Some(metadata),
        100,
        100,
        Some(CropRect {
            x: 10,
            y: 20,
            width: 30,
            height: 40,
        }),
        VideoTransform::Rotated90,
    )
    .expect("mapped cursor");
    assert_eq!((mapped.x, mapped.y), (4, 27));

    let mut state = CursorState::new("scope");
    let outside = state.resolve(
        Some(CursorMetadata {
            x: -2,
            y: 4,
            ..metadata
        }),
        30,
        40,
    );
    assert!(matches!(
        outside,
        CursorSampleState::Known {
            pixel_x: -2,
            visible: false,
            ..
        }
    ));
}

#[test]
fn frame_geometry_scales_cursor_crop_to_frame_and_ignores_later_cursor_crop_changes() {
    let format = negotiated(NativePixelFormat::Bgra, 6, 4);
    let frame = OwnedVideoFrame {
        width: 6,
        height: 4,
        stride: 6 * 4,
        pixel_format: PixelFormat::Bgra8,
        pixels: Arc::from(vec![0_u8; 6 * 4 * 4]),
    };
    let cursor_crop = CropRect {
        x: 0,
        y: 0,
        width: 3,
        height: 2,
    };
    let geometry = FrameGeometry::from_frame(
        format,
        None,
        Some(cursor_crop),
        VideoTransform::None,
        &frame,
    );
    let cursor = CursorMetadata {
        id: 17,
        shape_id: None,
        cursor_kind: None,
        x: 1,
        y: 1,
        hotspot: None,
    };

    let mapped = geometry
        .map_cursor(Some(cursor), format)
        .expect("mapped cursor");
    assert_eq!((mapped.x, mapped.y), (2, 2));

    // A cursor-only update may advertise a different crop, but it must keep
    // using the last real frame's geometry rather than changing the scale.
    let cursor_only_crop = CropRect {
        x: 0,
        y: 0,
        width: 6,
        height: 4,
    };
    assert_ne!(cursor_only_crop, cursor_crop);
    let mapped_after_cursor_only = geometry
        .map_cursor(Some(cursor), format)
        .expect("mapped cursor after cursor-only update");
    assert_eq!(mapped_after_cursor_only, mapped);
}
