#![allow(clippy::expect_used)]

use super::*;

fn candidate(kind: CursorKind, pixels: &[[u8; 4]], hotspot: Hotspot) -> ThemeCursor {
    let flat: Vec<u8> = pixels.iter().flatten().copied().collect();
    ThemeCursor {
        kind,
        width: 2,
        height: 2,
        hotspot,
        signature: image_signature(&flat, 2, 2).expect("valid 2x2 cursor signature"),
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
fn recognizes_figma_resize_without_a_matching_desktop_theme() {
    let (width, height, pixels) = crate::cursor::resize_classifier::tests::figma_bitmap();
    let mut classifier = classifier(vec![]);
    assert_eq!(
        classifier.classify(
            77,
            VideoFormat::RGBA,
            width,
            height,
            width as i32 * 4,
            &pixels,
            Hotspot { x: 20, y: 20 }
        ),
        CursorKind::Resizenorthwestsoutheast
    );
    assert_eq!(
        classifier.cache.get(&77),
        Some(&CursorKind::Resizenorthwestsoutheast)
    );
}

#[test]
fn figma_recognition_accepts_padded_bgra_rows_from_pipewire() {
    let (width, height, pixels) = crate::cursor::resize_classifier::tests::figma_bitmap();
    let mut bgra = Vec::new();
    for row in pixels.chunks_exact(width as usize * 4) {
        for pixel in row.as_chunks::<4>().0 {
            bgra.extend_from_slice(&[pixel[2], pixel[1], pixel[0], pixel[3]]);
        }
        bgra.extend_from_slice(&[0; 16]);
    }
    assert_eq!(
        classifier(vec![]).classify(
            78,
            VideoFormat::BGRA,
            width,
            height,
            width as i32 * 4 + 16,
            &bgra,
            Hotspot { x: 20, y: 20 }
        ),
        CursorKind::Resizenorthwestsoutheast
    );
}

#[test]
fn exact_theme_match_takes_precedence_over_generic_shape_recognition() {
    let (width, height, pixels) = crate::cursor::resize_classifier::tests::figma_bitmap();
    let known = ThemeCursor {
        kind: CursorKind::Cross,
        width,
        height,
        hotspot: Hotspot { x: 20, y: 20 },
        signature: image_signature(&pixels, width, height).expect("valid fixture signature"),
    };
    assert_eq!(
        classifier(vec![known]).classify(
            79,
            VideoFormat::RGBA,
            width,
            height,
            width as i32 * 4,
            &pixels,
            Hotspot { x: 20, y: 20 }
        ),
        CursorKind::Cross
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
fn detects_fully_transparent_cursor_bitmap_with_nonzero_color_channels() {
    assert!(CursorClassifier::is_fully_transparent(
        VideoFormat::BGRA,
        2,
        1,
        8,
        &[30, 20, 10, 0, 60, 50, 40, 0],
    ));
}

#[test]
fn cursor_bitmap_with_any_visible_alpha_is_not_transparent() {
    assert!(!CursorClassifier::is_fully_transparent(
        VideoFormat::RGBA,
        2,
        1,
        8,
        &[10, 20, 30, 0, 40, 50, 60, 1],
    ));
}

#[test]
fn unsupported_cursor_bitmap_format_is_not_assumed_transparent() {
    assert!(!CursorClassifier::is_fully_transparent(
        VideoFormat::RGB,
        2,
        1,
        8,
        &[0; 8],
    ));
}

#[test]
fn parses_quoted_and_ini_theme_values() {
    assert_eq!(clean_setting("  'Moga-Dark'\n"), Some("Moga-Dark".into()));
    assert_eq!(clean_setting("\"Breeze\""), Some("Breeze".into()));
    assert_eq!(clean_setting("   "), None);

    let directory = tempfile::tempdir().expect("temporary settings directory");
    let settings = directory.path().join("settings.ini");
    fs::write(
        &settings,
        "[Settings]\nother=x\ngtk-cursor-theme-name = TestTheme\n",
    )
    .expect("write GTK settings fixture");
    assert_eq!(
        setting_value(&settings, "gtk-cursor-theme-name"),
        Some("TestTheme".into())
    );
}
