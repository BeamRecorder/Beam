use super::*;

fn candidate(kind: CursorKind, pixels: &[[u8; 4]], hotspot: Hotspot) -> ThemeCursor {
    let flat: Vec<u8> = pixels.iter().flatten().copied().collect();
    ThemeCursor {
        kind,
        width: 2,
        height: 2,
        hotspot,
        signature: image_signature(&flat, 2, 2).unwrap(),
    }
}

fn classifier(candidates: Vec<ThemeCursor>) -> CursorClassifier {
    CursorClassifier {
        candidates: candidates.into(),
        cache: HashMap::new(),
    }
}

#[test]
fn classifies_theme_pixels_without_persisting_them() {
    let pixels = [
        [0, 0, 0, 0],
        [20, 30, 40, 255],
        [0, 0, 0, 0],
        [80, 90, 100, 255],
    ];
    let mut classifier = classifier(vec![candidate(
        CursorKind::Handpointing,
        &pixels,
        Hotspot { x: 1, y: 0 },
    )]);
    let bgra: Vec<u8> = pixels
        .iter()
        .flat_map(|pixel| [pixel[2], pixel[1], pixel[0], pixel[3]])
        .collect();
    assert_eq!(
        classifier.classify(7, VideoFormat::BGRA, 2, 2, 8, &bgra, Hotspot { x: 1, y: 0 }),
        CursorKind::Handpointing
    );
}

#[test]
fn rejects_unknown_or_ambiguous_shapes() {
    let arrow = [
        [0, 0, 0, 0],
        [255, 255, 255, 255],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
    ];
    let mut unknown = classifier(vec![candidate(
        CursorKind::Default,
        &arrow,
        Hotspot { x: 0, y: 0 },
    )]);
    assert_eq!(
        unknown.classify(
            8,
            VideoFormat::RGBA,
            2,
            2,
            8,
            &[255; 16],
            Hotspot { x: 1, y: 1 }
        ),
        CursorKind::Custom
    );

    let mut ambiguous = classifier(vec![
        candidate(CursorKind::Default, &arrow, Hotspot { x: 0, y: 0 }),
        candidate(CursorKind::Cross, &arrow, Hotspot { x: 0, y: 0 }),
    ]);
    let rgba: Vec<u8> = arrow.iter().flatten().copied().collect();
    assert_eq!(
        ambiguous.classify(9, VideoFormat::RGBA, 2, 2, 8, &rgba, Hotspot { x: 0, y: 0 }),
        CursorKind::Custom
    );
}

#[test]
fn normalizes_channel_order_stride_and_transparency() {
    let bgra = [3, 2, 1, 255, 9, 8, 7, 0, 0, 0, 0, 0];
    assert_eq!(
        canonical_bitmap(VideoFormat::BGRA, 2, 1, 12, &bgra),
        Some(vec![1, 2, 3, 255, 0, 0, 0, 0])
    );
    assert!(canonical_bitmap(VideoFormat::RGB, 2, 1, 8, &bgra).is_none());
    assert!(canonical_bitmap(VideoFormat::RGBA, 2, 1, 4, &bgra).is_none());
}

#[test]
fn parses_quoted_and_ini_theme_values() {
    assert_eq!(clean_setting("  'Moga-Dark'\n"), Some("Moga-Dark".into()));
    assert_eq!(clean_setting("\"Breeze\""), Some("Breeze".into()));
    assert_eq!(clean_setting("   "), None);

    let directory = tempfile::tempdir().unwrap();
    let settings = directory.path().join("settings.ini");
    fs::write(
        &settings,
        "[Settings]\nother=x\ngtk-cursor-theme-name = TestTheme\n",
    )
    .unwrap();
    assert_eq!(
        setting_value(&settings, "gtk-cursor-theme-name"),
        Some("TestTheme".into())
    );
}
