use super::super::types::Artifact;
use super::{VerifiedPackage, stage_package, trusted_url, validate_artifact};
use argui_updater::install::Format;
use argui_updater::{CancellationToken, DownloadEvent, Error, Progress};
use sha2::{Digest, Sha256};
use std::io::{self, Cursor, Read};

const PACKAGE_LIMIT: u64 = 1024 * 1024 * 1024;

/// Builds a complete Beam release reference without requesting or installing it.
fn artifact(format: Format) -> Artifact {
    let name = match format {
        Format::AppImage => "Beam-0.4.0-linux-x64.AppImage",
        Format::AppBundle => "Beam-0.4.0-mac-arm64.app.tar.gz",
        Format::Nsis => "Beam-Setup-0.4.0.exe",
        Format::Msi => "Beam-Setup-0.4.0.msi",
        Format::Executable => "beam-native",
    };
    Artifact {
        url: format!("https://github.com/BeamRecorder/Beam/releases/download/0.4.0/{name}"),
        sha256: "ab".repeat(32),
        size: 256,
        format,
    }
}

#[test]
fn release_urls_accept_github_and_its_https_cdn_redirects_on_port_443() {
    for value in [
        "https://github.com/BeamRecorder/Beam/releases/latest/download/native-updates.json",
        "https://github.com:443/BeamRecorder/Beam/releases/download/0.4.0/Beam-Setup-0.4.0.exe",
        "https://GITHUB.COM/BeamRecorder/Beam/releases/latest/download/native-updates.json",
        "https://release-assets.githubusercontent.com/github-production-release-asset/1/file?download=1",
        "https://objects.githubusercontent.com/github-production-release-asset/1/file",
    ] {
        let url = trusted_url(value).unwrap_or_else(|error| panic!("{value}: {error}"));
        assert_eq!(url.scheme(), "https");
        assert_eq!(url.port_or_known_default(), Some(443));
    }
}

#[test]
fn release_urls_reject_insecure_transport_credentials_and_nonstandard_ports() {
    for value in [
        "http://github.com/BeamRecorder/Beam/releases/latest",
        "http://127.0.0.1/feed",
        "file:///tmp/native-updates.json",
        "ftp://github.com/BeamRecorder/Beam/releases/latest",
        "https://user@github.com/BeamRecorder/Beam/releases/latest",
        "https://user:password@github.com/BeamRecorder/Beam/releases/latest",
        "https://:password@github.com/BeamRecorder/Beam/releases/latest",
        "https://github.com:80/BeamRecorder/Beam/releases/latest",
        "https://github.com:444/BeamRecorder/Beam/releases/latest",
        "https://github.com:0/BeamRecorder/Beam/releases/latest",
        "https://release-assets.githubusercontent.com:444/file",
    ] {
        assert!(trusted_url(value).is_err(), "accepted {value}");
    }
}

#[test]
fn release_urls_reject_untrusted_hosts_lookalikes_and_malformed_urls() {
    for value in [
        "https://example.com/native-updates.json",
        "https://github.com.example.com/BeamRecorder/Beam/releases/latest",
        "https://github.com./BeamRecorder/Beam/releases/latest",
        "https://raw.githubusercontent.com/BeamRecorder/Beam/main/feed.json",
        "https://api.github.com/repos/BeamRecorder/Beam/releases/latest",
        "https://release-assets.githubusercontent.com.example.com/file",
        "/BeamRecorder/Beam/releases/latest",
        "not a URL",
        "",
    ] {
        assert!(trusted_url(value).is_err(), "accepted {value:?}");
    }
}

#[test]
fn complete_packages_accept_the_three_published_formats_and_size_boundaries() {
    for format in [Format::AppImage, Format::AppBundle, Format::Nsis] {
        for size in [1, PACKAGE_LIMIT] {
            let mut value = artifact(format);
            value.size = size;
            validate_artifact(&value)
                .unwrap_or_else(|error| panic!("{format:?}, {size} bytes: {error}"));
        }
    }
    let mut uppercase = artifact(Format::AppImage);
    uppercase.sha256 = "AB".repeat(32);
    validate_artifact(&uppercase).unwrap();
}

#[test]
fn complete_packages_reject_wrong_repositories_and_non_artifact_paths() {
    for url in [
        "https://github.com/OtherOwner/Beam/releases/download/0.4.0/Beam.AppImage",
        "https://github.com/BeamRecorder/OtherApp/releases/download/0.4.0/Beam.AppImage",
        "https://github.com/BeamRecorder/Beam/releases/latest/download/Beam.AppImage",
        "https://github.com/BeamRecorder/Beam/blob/main/Beam.AppImage",
        "https://github.com/BeamRecorder/Beam/releases/download",
        "https://github.com/BeamRecorder/Beam/releases/download/",
        "https://github.com/BeamRecorder/Beam/releases/download/0.4.0",
        "https://github.com/BeamRecorder/Beam/releases/download/0.4.0/",
        "https://github.com/BeamRecorder/Beam/releases/download/0.4.0/folder/Beam.AppImage",
        "https://github.com/BeamRecorder/Beam/releases/download/0.4.0/Beam.AppImage?version=next",
        "https://github.com/BeamRecorder/Beam/releases/download/0.4.0/Beam.AppImage#fragment",
        "https://release-assets.githubusercontent.com/github-production-release-asset/1/Beam.AppImage",
    ] {
        let mut value = artifact(Format::AppImage);
        value.url = url.into();
        assert!(validate_artifact(&value).is_err(), "accepted {url}");
    }
}

#[test]
fn complete_packages_reject_empty_oversized_and_malformed_hash_metadata() {
    for size in [0, PACKAGE_LIMIT + 1, u64::MAX] {
        let mut value = artifact(Format::AppImage);
        value.size = size;
        assert!(validate_artifact(&value).is_err(), "accepted {size} bytes");
    }
    for sha256 in [
        String::new(),
        "a".repeat(63),
        "a".repeat(65),
        "g".repeat(64),
        format!("{} ", "a".repeat(63)),
        "é".repeat(32),
    ] {
        let mut value = artifact(Format::AppImage);
        value.sha256 = sha256;
        assert!(
            validate_artifact(&value).is_err(),
            "accepted invalid SHA-256 {:?}",
            value.sha256
        );
    }
}

#[test]
fn standalone_companion_executables_cannot_replace_the_complete_beam_application() {
    let value = artifact(Format::Executable);
    assert!(validate_artifact(&value).is_err());
}

fn artifact_for_bytes(bytes: &[u8]) -> Artifact {
    let mut value = artifact(Format::AppImage);
    value.size = bytes.len() as u64;
    value.sha256 = format!("{:x}", Sha256::digest(bytes));
    value
}

fn assert_backend_failure(result: argui_updater::Result<VerifiedPackage>, expected: &str) {
    match result {
        Err(Error::Backend(message)) => {
            assert!(
                message.contains(expected),
                "unexpected backend error: {message}"
            );
        }
        Err(error) => panic!("expected backend failure containing {expected:?}, got {error}"),
        Ok(_) => panic!("accepted an unverified package"),
    }
}

struct Reader<F>(F);

impl<F: FnMut(&mut [u8]) -> io::Result<usize>> Read for Reader<F> {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        (self.0)(buffer)
    }
}

#[test]
fn staged_packages_preserve_verified_bytes_and_emit_bounded_progress_before_verifying() {
    let bytes = vec![0x5a; 2 * 64 * 1024 + 17];
    let mut value = artifact_for_bytes(&bytes);
    value.sha256 = value.sha256.to_ascii_uppercase();
    let mut events = Vec::new();
    let package = stage_package(
        &value,
        &CancellationToken::default(),
        Cursor::new(&bytes),
        &mut |event| events.push(event),
    )
    .unwrap_or_else(|error| panic!("valid bytes were rejected: {error}"));

    let path = package.0.path().to_path_buf();
    assert_eq!(std::fs::read(&path).unwrap(), bytes);
    let (last, download_events) = events.split_last().expect("missing download events");
    assert!(matches!(last, DownloadEvent::Verifying));
    let progress: Vec<Progress> = download_events
        .iter()
        .map(|event| match event {
            DownloadEvent::Progress(progress) => *progress,
            DownloadEvent::Verifying => panic!("verification started before download completed"),
        })
        .collect();
    assert!(!progress.is_empty());
    assert_eq!(progress.last().unwrap().downloaded, value.size);
    assert!(progress.iter().all(|step| {
        step.downloaded > 0 && step.downloaded <= value.size && step.total == Some(value.size)
    }));
    assert!(
        progress
            .windows(2)
            .all(|steps| steps[0].downloaded < steps[1].downloaded)
    );
    drop(package);
    assert!(
        !path.exists(),
        "verified staging file survived package disposal"
    );
}

#[test]
fn staged_packages_reject_same_size_bytes_with_a_different_frozen_digest() {
    let expected = vec![0x11; 257];
    let downloaded = vec![0x22; expected.len()];
    let value = artifact_for_bytes(&expected);
    let mut events = Vec::new();
    let result = stage_package(
        &value,
        &CancellationToken::default(),
        Cursor::new(downloaded),
        &mut |event| events.push(event),
    );
    assert_backend_failure(result, "checksum");
    assert!(matches!(events.last(), Some(DownloadEvent::Verifying)));
}

#[test]
fn staged_packages_reject_truncated_downloads_including_an_empty_body() {
    let bytes = vec![0x33; 64 * 1024 + 19];
    let value = artifact_for_bytes(&bytes);
    for downloaded_size in [0, bytes.len() - 1] {
        let mut events = Vec::new();
        let result = stage_package(
            &value,
            &CancellationToken::default(),
            Cursor::new(&bytes[..downloaded_size]),
            &mut |event| events.push(event),
        );
        assert_backend_failure(result, "checksum");
        assert!(matches!(events.last(), Some(DownloadEvent::Verifying)));
        assert!(events.iter().all(|event| match event {
            DownloadEvent::Progress(progress) => progress.downloaded <= downloaded_size as u64,
            DownloadEvent::Verifying => true,
        }));
    }
}

#[test]
fn staged_packages_reject_excess_bytes_before_verifying_or_publishing_excess_progress() {
    let expected = vec![0x44; 64 * 1024];
    let value = artifact_for_bytes(&expected);
    let mut downloaded = expected;
    downloaded.push(0x45);
    let mut events = Vec::new();
    let result = stage_package(
        &value,
        &CancellationToken::default(),
        Cursor::new(downloaded),
        &mut |event| events.push(event),
    );
    assert_backend_failure(result, "exceeds");
    assert!(!events.is_empty());
    assert!(events.iter().all(|event| matches!(
        event,
        DownloadEvent::Progress(progress) if progress.downloaded <= value.size
    )));
}

#[test]
fn staged_packages_surface_reader_failures_without_entering_verification() {
    let bytes = vec![0x55; 64 * 1024 + 1];
    let value = artifact_for_bytes(&bytes);
    let mut cursor = Cursor::new(bytes);
    let mut reads = 0;
    let reader = Reader(|buffer: &mut [u8]| {
        reads += 1;
        if reads > 1 {
            Err(io::Error::other("fixture read failed"))
        } else {
            cursor.read(buffer)
        }
    });
    let mut events = Vec::new();
    let result = stage_package(
        &value,
        &CancellationToken::default(),
        reader,
        &mut |event| events.push(event),
    );
    assert_backend_failure(result, "fixture read failed");
    assert_eq!(reads, 2);
    assert!(cursor.position() > 0 && cursor.position() < value.size);
    assert!(matches!(events.as_slice(), [DownloadEvent::Progress(_)]));
}

#[test]
fn staged_packages_observe_existing_cancellation_before_reading_or_emitting() {
    let bytes = vec![0x66; 2 * 64 * 1024 + 1];
    let value = artifact_for_bytes(&bytes);
    let cancel = CancellationToken::default();
    cancel.cancel();
    let mut cursor = Cursor::new(bytes);
    let mut events = Vec::new();
    let result = stage_package(&value, &cancel, &mut cursor, &mut |event| {
        events.push(event)
    });
    assert!(matches!(result, Err(Error::Cancelled)));
    assert_eq!(cursor.position(), 0);
    assert!(events.is_empty());
}

#[test]
fn staged_packages_stop_after_mid_download_cancellation_without_reading_the_rest() {
    let bytes = vec![0x77; 2 * 64 * 1024 + 1];
    let value = artifact_for_bytes(&bytes);
    let cancel = CancellationToken::default();
    let mut cursor = Cursor::new(bytes);
    let mut events = Vec::new();
    let result = stage_package(&value, &cancel, &mut cursor, &mut |event| {
        events.push(event);
        if matches!(event, DownloadEvent::Progress(_)) {
            cancel.cancel();
        }
    });
    assert!(matches!(result, Err(Error::Cancelled)));
    assert!(cursor.position() > 0 && cursor.position() < value.size);
    assert!(
        matches!(events.as_slice(), [DownloadEvent::Progress(progress)]
        if progress.downloaded == cursor.position() && progress.total == Some(value.size))
    );
}

#[test]
fn staged_packages_reject_cancellation_from_verifying_even_for_matching_bytes() {
    let bytes = vec![0x88; 64 * 1024 + 1];
    let value = artifact_for_bytes(&bytes);
    let cancel = CancellationToken::default();
    let mut cursor = Cursor::new(bytes);
    let mut events = Vec::new();
    let result = stage_package(&value, &cancel, &mut cursor, &mut |event| {
        events.push(event);
        if matches!(event, DownloadEvent::Verifying) {
            cancel.cancel();
        }
    });
    assert!(matches!(result, Err(Error::Cancelled)));
    assert_eq!(cursor.position(), value.size);
    assert!(matches!(events.last(), Some(DownloadEvent::Verifying)));
}
