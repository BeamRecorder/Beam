use std::path::Path;
use walkdir::WalkDir;

fn rust_sources() -> impl Iterator<Item = walkdir::DirEntry> {
    WalkDir::new(Path::new(env!("CARGO_MANIFEST_DIR")).join("src"))
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .path()
                .extension()
                .is_some_and(|extension| extension == "rs")
        })
}

#[test]
fn source_files_stay_below_500_lines() {
    let oversized: Vec<_> = rust_sources()
        .filter_map(|entry| {
            let text = std::fs::read_to_string(entry.path()).ok()?;
            let count = text.lines().count();
            (count > 500).then(|| format!("{}: {count}", entry.path().display()))
        })
        .collect();
    assert!(oversized.is_empty(), "files over 500 lines: {oversized:#?}");
}

#[test]
fn forbidden_macros_are_absent_from_sources() {
    let forbidden = [
        "println!(",
        "eprintln!(",
        "dbg!(",
        "todo!(",
        "unimplemented!(",
    ];
    let violations: Vec<_> = rust_sources()
        .flat_map(|entry| {
            let path = entry.path().display().to_string();
            std::fs::read_to_string(entry.path())
                .unwrap_or_default()
                .lines()
                .enumerate()
                .filter(|(_, text)| forbidden.iter().any(|needle| text.contains(needle)))
                .map(move |(line, _)| format!("{path}:{}", line + 1))
                .collect::<Vec<_>>()
        })
        .collect();
    assert!(violations.is_empty(), "forbidden macros: {violations:#?}");
}

#[test]
fn native_imports_remain_inside_platform_directories() {
    let rules = [
        ("windows::", "/win/"),
        ("windows_capture::", "/win/"),
        ("screencapturekit::", "/mac/"),
    ];
    let mut violations = Vec::new();
    for entry in rust_sources() {
        let path = entry.path().to_string_lossy().replace('\\', "/");
        let contents = std::fs::read_to_string(entry.path()).unwrap_or_default();
        for (needle, directory) in rules {
            if contents.contains(needle) && !path.contains(directory) {
                violations.push(format!("{path}: {needle}"));
            }
        }
    }
    assert!(
        violations.is_empty(),
        "OS boundary violations: {violations:#?}"
    );
}
