use scrollweave::layered::ContentRect;
use scrollweave::{
    BasicOptions, ErrorKind, Image, LayeredOptions, SwResult, reconstruct_layered, stitch_basic,
};

fn document(width: usize, height: usize) -> SwResult<Image> {
    let mut image = Image::solid(width, height, [250, 250, 250])?;
    for y in 0..height {
        for x in 0..width {
            image.set(
                x,
                y,
                [
                    ((x * 17 + y * 9 + x * y % 251) % 256) as u8,
                    ((x * 5 + y * 3) % 256) as u8,
                    ((x * 7 + y * 11) % 256) as u8,
                ],
            );
        }
    }
    Ok(image)
}

fn frames_at(page: &Image, height: usize, offsets: &[usize]) -> SwResult<Vec<Image>> {
    offsets
        .iter()
        .map(|&offset| page.crop(0, offset, page.width, height))
        .collect()
}

fn assert_original_pixels(actual: &Image, expected: &Image) {
    assert_eq!(actual.width, expected.width, "output width changed");
    assert_eq!(actual.height, expected.height, "output height changed");
    let mismatch = actual
        .rgb
        .iter()
        .zip(&expected.rgb)
        .enumerate()
        .find(|(_, (actual, expected))| actual != expected);
    assert_eq!(mismatch, None, "original source pixels were modified");
}

#[test]
fn automatic_offsets_reconstruct_unique_overlapping_content_without_resampling() -> SwResult<()> {
    let page = document(100, 260)?;
    let frames = frames_at(&page, 160, &[0, 59, 100])?;
    let result = stitch_basic(
        &frames,
        &BasicOptions {
            auto_trim: false,
            diagnostics: false,
            ..Default::default()
        },
    )?;
    assert_eq!(
        result.positions,
        vec![Some((0, 0)), Some((0, 59)), Some((0, 100))]
    );
    assert!(result.warnings.is_empty(), "{:?}", result.warnings);
    assert_original_pixels(&result.image, &page);
    Ok(())
}

#[test]
fn known_positions_and_content_region_remove_fixed_header_and_footer() -> SwResult<()> {
    let page = document(100, 240)?;
    let positions = [0, 60, 120];
    let mut frames = Vec::new();
    for position in positions {
        let mut frame = Image::solid(100, 160, [20, 30, 40])?;
        let content = page.crop(0, position as usize, 100, 120)?;
        frame.blit(&content, 0, 20)?;
        for y in 140..160 {
            for x in 0..100 {
                frame.set(x, y, [70, 80, 90]);
            }
        }
        frames.push(frame);
    }
    let result = reconstruct_layered(
        &frames,
        &positions,
        &LayeredOptions {
            content: Some(ContentRect {
                left: 0,
                top: 20,
                right: 100,
                bottom: 140,
            }),
            appearance: false,
            texture_strength: 0.,
            ..Default::default()
        },
    )?;
    assert_original_pixels(&result.image, &page);
    Ok(())
}

#[test]
fn layered_reconstruction_with_known_positions_preserves_unframed_content() -> SwResult<()> {
    let page = document(100, 260)?;
    let frames = frames_at(&page, 160, &[0, 59, 100])?;
    let result = reconstruct_layered(
        &frames,
        &[0, 59, 100],
        &LayeredOptions {
            viewport: Some((0, 160)),
            appearance: false,
            texture_strength: 0.,
            ..Default::default()
        },
    )?;
    assert_original_pixels(&result.image, &page);
    Ok(())
}

#[test]
fn mismatched_frame_geometry_is_rejected_by_both_pipelines() -> SwResult<()> {
    let frames = vec![
        Image::solid(100, 160, [0, 0, 0])?,
        Image::solid(99, 160, [0, 0, 0])?,
    ];
    let basic =
        stitch_basic(&frames, &BasicOptions::default()).expect_err("mixed widths must fail");
    let layered = reconstruct_layered(&frames, &[0, 60], &LayeredOptions::default())
        .expect_err("mixed widths must fail");
    assert_eq!(basic.kind, ErrorKind::Input);
    assert_eq!(layered.kind, ErrorKind::Input);
    Ok(())
}

#[test]
fn malformed_positions_and_empty_capture_are_rejected() -> SwResult<()> {
    let frame = document(100, 160)?;
    assert_eq!(
        stitch_basic(&[], &BasicOptions::default())
            .expect_err("empty capture must fail")
            .kind,
        ErrorKind::Input,
    );
    assert_eq!(
        reconstruct_layered(
            std::slice::from_ref(&frame),
            &[],
            &LayeredOptions::default()
        )
        .expect_err("missing offset must fail")
        .kind,
        ErrorKind::Input,
    );
    assert_eq!(
        stitch_basic(
            &[frame],
            &BasicOptions {
                known_positions: Some(vec![]),
                ..Default::default()
            }
        )
        .expect_err("missing offset must fail")
        .kind,
        ErrorKind::Input,
    );
    Ok(())
}

#[test]
fn blank_content_cannot_prove_the_true_scroll_distance() -> SwResult<()> {
    let page = Image::solid(100, 260, [255, 255, 255])?;
    let frames = frames_at(&page, 160, &[0, 100])?;
    let result = stitch_basic(
        &frames,
        &BasicOptions {
            auto_trim: false,
            diagnostics: false,
            ..Default::default()
        },
    )?;
    // Characterize an integration hazard: this successful result gives no warning
    // even though two identical views also fit infinitely many real scroll offsets.
    assert_eq!(result.positions, vec![Some((0, 0)), Some((0, 0))]);
    assert!(result.warnings.is_empty());
    assert_eq!(result.image.height, 160);
    assert_ne!(result.image.height, page.height);
    Ok(())
}

#[test]
fn known_scroll_offsets_keep_blank_content_from_being_silently_shortened() -> SwResult<()> {
    let page = Image::solid(64, 260, [255, 255, 255])?;
    let frames = frames_at(&page, 160, &[0, 100])?;
    let result = reconstruct_layered(
        &frames,
        &[0, 100],
        &LayeredOptions {
            viewport: Some((0, 160)),
            appearance: false,
            texture_strength: 0.,
            ..Default::default()
        },
    )?;
    assert_original_pixels(&result.image, &page);
    Ok(())
}

#[test]
fn periodic_content_exposes_the_same_zero_offset_ambiguity() -> SwResult<()> {
    let mut page = Image::solid(192, 300, [255, 255, 255])?;
    for y in 0..page.height {
        for x in 0..page.width {
            let value = if (x + y % 20) % 2 == 0 { 20 } else { 230 };
            page.set(x, y, [value, value, value]);
        }
    }
    let frames = frames_at(&page, 240, &[0, 60])?;
    let result = stitch_basic(
        &frames,
        &BasicOptions {
            auto_trim: false,
            diagnostics: false,
            ..Default::default()
        },
    )?;
    assert_eq!(result.positions, vec![Some((0, 0)), Some((0, 0))]);
    assert!(result.warnings.is_empty());
    assert_eq!(result.image.height, 240);
    assert_ne!(result.image.height, page.height);
    Ok(())
}
