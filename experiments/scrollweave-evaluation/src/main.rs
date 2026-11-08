use scrollweave::layered::ContentRect;
use scrollweave::{
    BasicOptions, Image, LayeredOptions, read_image, reconstruct_layered, stitch_basic, write_image,
};
use std::{error::Error, fs, path::Path, time::Instant};
use types::{Case, Manifest, Measurement, Mode};

#[cfg(test)]
mod tests;
mod types;

type Result<T> = std::result::Result<T, Box<dyn Error>>;

fn read_bounded(path: &Path, max_pixels: usize) -> Result<Image> {
    // Inspect our PNG fixture dimensions before the candidate decoder allocates.
    if fs::metadata(path)?.len() > 8_000_000 {
        return Err("PNG fixture exceeds the byte budget".into());
    }
    let bytes = fs::read(path)?;
    if bytes.len() < 24
        || bytes[..8] != [137, 80, 78, 71, 13, 10, 26, 10]
        || &bytes[12..16] != b"IHDR"
    {
        return Err("Expected a bounded PNG fixture".into());
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into()?) as usize;
    let height = u32::from_be_bytes(bytes[20..24].try_into()?) as usize;
    if width == 0 || height == 0 || width.checked_mul(height).is_none_or(|n| n > max_pixels) {
        return Err("Fixture exceeds the evaluation pixel budget".into());
    }
    Ok(read_image(path)?)
}

fn compare(actual: &Image, expected: &Image) -> (Option<f64>, Option<f64>) {
    if actual.width != expected.width || actual.height != expected.height {
        return (None, None);
    }
    let difference: u64 = actual
        .rgb
        .iter()
        .zip(&expected.rgb)
        .map(|(a, b)| a.abs_diff(*b) as u64)
        .sum();
    let exact = actual
        .rgb
        .as_chunks::<3>()
        .0
        .iter()
        .zip(expected.rgb.as_chunks::<3>().0.iter())
        .filter(|(a, b)| a == b)
        .count();
    (
        Some(difference as f64 / actual.rgb.len() as f64),
        Some(exact as f64 / (actual.width * actual.height) as f64),
    )
}

fn measure(case: &Case, directory: &Path, output: &Path, mode: Mode) -> Result<Measurement> {
    if !(2..=6).contains(&case.frames.len()) || case.frames.len() != case.positions.len() {
        return Err("Each case requires 2–6 frames and one ground-truth position per frame".into());
    }
    if case.name.is_empty()
        || !case
            .name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-')
    {
        return Err("Invalid evaluation case name".into());
    }
    let frames = case
        .frames
        .iter()
        .map(|path| read_bounded(&directory.join(path), 1_000_000))
        .collect::<Result<Vec<_>>>()?;
    let truth = read_bounded(&directory.join(&case.truth), 5_000_000)?;
    let label = match mode {
        Mode::Automatic => "automatic",
        Mode::KnownPositions => "known-positions-control",
        Mode::KnownGeometry => "known-geometry-control",
    };
    let start = Instant::now();
    let mut warnings = Vec::new();
    let mut positions = Vec::new();
    let reconstruction = (|| -> Result<Image> {
        if !matches!(mode, Mode::Automatic) {
            positions.clone_from(&case.positions);
        } else {
            let basic = stitch_basic(
                &frames,
                &BasicOptions {
                    diagnostics: false,
                    ..Default::default()
                },
            )?;
            warnings.clone_from(&basic.warnings);
            positions = basic
                .positions
                .iter()
                .map(|p| p.map(|(_, y)| y).ok_or_else(|| "Unmatched frame".into()))
                .collect::<Result<Vec<_>>>()?;
            // Its full basic output is deliberately dropped before layered reconstruction.
        }
        let first = positions.iter().min().ok_or("No positions")?;
        let last = positions.iter().max().ok_or("No positions")?;
        let rows = i64::from(*last) - i64::from(*first) + frames[0].height as i64;
        if rows <= 0 || rows as u64 * frames[0].width as u64 > 5_000_000 {
            return Err("Estimated output exceeds the evaluation pixel budget".into());
        }
        let [left, top, right, bottom] = case.content;
        let options = LayeredOptions {
            content: matches!(mode, Mode::KnownGeometry).then_some(ContentRect {
                left,
                top,
                right,
                bottom,
            }),
            ..Default::default()
        };
        Ok(reconstruct_layered(&frames, &positions, &options)?.image)
    })();
    let elapsed_ms = start.elapsed().as_millis();
    let expected_dimensions = [truth.width, truth.height];
    match reconstruction {
        Ok(image) => {
            let (mean_absolute_error, exact_pixel_ratio) = compare(&image, &truth);
            let origin = positions[0];
            let normalized: Vec<_> = positions.iter().map(|y| y - origin).collect();
            let expected_origin = case.positions[0];
            let expected: Vec<_> = case.positions.iter().map(|y| y - expected_origin).collect();
            let passed =
                warnings.is_empty() && normalized == expected && exact_pixel_ratio == Some(1.0);
            write_image(output.join(format!("{}-{label}.png", case.name)), &image)?;
            Ok(Measurement {
                name: case.name.clone(),
                mode: label,
                elapsed_ms,
                positions,
                expected_positions: case.positions.clone(),
                dimensions: [image.width, image.height],
                expected_dimensions,
                mean_absolute_error,
                exact_pixel_ratio,
                warnings,
                passed,
                error: None,
            })
        }
        Err(error) => Ok(Measurement {
            name: case.name.clone(),
            mode: label,
            elapsed_ms,
            positions,
            expected_positions: case.positions.clone(),
            dimensions: [0, 0],
            expected_dimensions,
            mean_absolute_error: None,
            exact_pixel_ratio: None,
            warnings,
            passed: false,
            error: Some(error.to_string()),
        }),
    }
}

fn run() -> Result<()> {
    let mut args = std::env::args_os().skip(1);
    let manifest_path = args
        .next()
        .ok_or("Usage: beam-scrollweave-evaluation MANIFEST.json OUTPUT_DIRECTORY")?;
    let output = args.next().ok_or("Missing output directory")?;
    if args.next().is_some() {
        return Err("Unexpected evaluation argument".into());
    }
    let path = Path::new(&manifest_path);
    let directory = path.parent().ok_or("Missing fixture directory")?;
    let manifest: Manifest = serde_json::from_slice(&fs::read(path)?)?;
    if !(1..=8).contains(&manifest.cases.len()) {
        return Err("Expected 1–8 evaluation cases".into());
    }
    fs::create_dir_all(&output)?;
    let mut measurements = Vec::new();
    for case in &manifest.cases {
        for mode in [Mode::Automatic, Mode::KnownPositions, Mode::KnownGeometry] {
            measurements.push(measure(case, directory, Path::new(&output), mode)?);
        }
    }
    let json = serde_json::to_string_pretty(&measurements)?;
    fs::write(Path::new(&output).join("measurements.json"), &json)?;
    println!("{json}");
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("ScrollWeave evaluation failed: {error}");
        std::process::exit(1);
    }
}
