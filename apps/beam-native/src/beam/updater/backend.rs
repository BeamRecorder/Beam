//! GitHub HTTPS feed adapter for ARGUI's update transaction and native installer.

use super::types::{Artifact, Feed};
pub(super) use super::types::{GitHubBackend, VerifiedPackage};
use argui_updater::install::{Format, Installer, NativeInstaller};
use argui_updater::{
    Backend, CancellationToken, DownloadEvent, Error, InstallOutcome, Progress, Release,
    ReleaseInfo, Result,
};
use reqwest::{Url, blocking::Client, redirect::Policy};
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    time::Duration,
};
use tempfile::NamedTempFile;

pub(super) const FEED_URL: &str =
    "https://github.com/BeamRecorder/Beam/releases/latest/download/native-updates.json";
const MAX_PACKAGE_BYTES: u64 = 1024 * 1024 * 1024;

impl GitHubBackend {
    /// Constructs on the service worker; startup performs no HTTP requests.
    pub(super) fn new(version: &str) -> Result<Self> {
        Ok(Self {
            current: semver::Version::parse(version).map_err(Error::backend)?,
            client: Client::builder()
                .user_agent("Beam native updater")
                .connect_timeout(Duration::from_secs(15))
                .timeout(Duration::from_secs(300))
                .redirect(Policy::custom(|attempt| {
                    if attempt.previous().len() >= 10
                        || trusted_url(attempt.url().as_str()).is_err()
                    {
                        attempt.error("untrusted Beam update redirect")
                    } else {
                        attempt.follow()
                    }
                }))
                .build()
                .map_err(Error::backend)?,
            installer: NativeInstaller::detect()?,
            target: format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH),
        })
    }
}

impl Backend for GitHubBackend {
    type Artifact = Artifact;
    type Package = VerifiedPackage;

    fn check(&self) -> Result<Option<Release<Artifact>>> {
        let response = self.client.get(FEED_URL).send().map_err(Error::backend)?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(Error::backend(
                "This release does not publish native update metadata yet.",
            ));
        }
        let mut bytes = Vec::new();
        response
            .error_for_status()
            .map_err(Error::backend)?
            .take(1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(Error::backend)?;
        if bytes.len() > 1024 * 1024 {
            return Err(Error::backend("Beam update feed exceeds 1 MiB"));
        }
        let mut feed: Feed = crate::json::parse_bytes(&bytes).map_err(Error::backend)?;
        if feed.schema_version != 1 {
            return Err(Error::backend("unsupported Beam update feed schema"));
        }
        if !feed.version.pre.is_empty() || feed.version.cmp_precedence(&self.current).is_le() {
            return Ok(None);
        }
        let artifact = feed
            .platforms
            .remove(&self.target)
            .ok_or_else(|| Error::backend(format!("no Beam update for {}", self.target)))?;
        validate_artifact(&artifact)?;
        Ok(Some(Release {
            info: ReleaseInfo {
                version: feed.version.to_string(),
                notes: feed.notes,
            },
            artifact,
        }))
    }

    fn download(
        &self,
        artifact: &Artifact,
        cancel: &CancellationToken,
        emit: &mut dyn FnMut(DownloadEvent),
    ) -> Result<VerifiedPackage> {
        validate_artifact(artifact)?;
        cancel.check()?;
        let response = self
            .client
            .get(trusted_url(&artifact.url)?)
            .send()
            .map_err(Error::backend)?
            .error_for_status()
            .map_err(Error::backend)?;
        if response
            .content_length()
            .is_some_and(|size| size != artifact.size)
        {
            return Err(Error::backend(
                "Beam update size does not match the checked release",
            ));
        }
        stage_package(artifact, cancel, response, emit)
    }

    fn install(&self, artifact: &Artifact, package: VerifiedPackage) -> Result<InstallOutcome> {
        self.installer.install(artifact.format, package.0.path())
    }
}

/// Streams bounded bytes into temporary storage and authenticates their frozen digest.
fn stage_package(
    artifact: &Artifact,
    cancel: &CancellationToken,
    mut reader: impl Read,
    emit: &mut dyn FnMut(DownloadEvent),
) -> Result<VerifiedPackage> {
    validate_artifact(artifact)?;
    cancel.check()?;
    let mut file = NamedTempFile::new().map_err(Error::backend)?;
    let mut hash = Sha256::new();
    let mut progress = Progress {
        downloaded: 0,
        total: Some(artifact.size),
    };
    let mut buffer = [0; 64 * 1024];
    loop {
        cancel.check()?;
        let size = reader.read(&mut buffer).map_err(Error::backend)?;
        if size == 0 {
            break;
        }
        progress.downloaded += size as u64;
        if progress.downloaded > artifact.size {
            return Err(Error::backend("Beam update exceeds its checked size"));
        }
        file.write_all(&buffer[..size]).map_err(Error::backend)?;
        hash.update(&buffer[..size]);
        emit(DownloadEvent::Progress(progress));
    }
    cancel.check()?;
    emit(DownloadEvent::Verifying);
    cancel.check()?;
    if progress.downloaded != artifact.size
        || format!("{:x}", hash.finalize()) != artifact.sha256.to_ascii_lowercase()
    {
        return Err(Error::backend(
            "Beam update checksum does not match the checked release",
        ));
    }
    file.as_file().sync_all().map_err(Error::backend)?;
    Ok(VerifiedPackage(file))
}

#[cfg(test)]
#[path = "../../../test/beam/updater/backend.rs"]
mod tests;

/// Restricts HTTPS metadata and redirects to GitHub's actual release hosts.
pub(super) fn trusted_url(value: &str) -> Result<Url> {
    let url = Url::parse(value).map_err(Error::backend)?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port_or_known_default() != Some(443)
        || !matches!(
            url.host_str(),
            Some(
                "github.com"
                    | "release-assets.githubusercontent.com"
                    | "objects.githubusercontent.com"
            )
        )
    {
        return Err(Error::backend(
            "Beam update URLs must use GitHub HTTPS release hosts",
        ));
    }
    Ok(url)
}

/// Rejects invalid or partial packages before any download or installation.
pub(super) fn validate_artifact(artifact: &Artifact) -> Result<()> {
    let url = trusted_url(&artifact.url)?;
    if url.host_str() != Some("github.com")
        || !url
            .path()
            .starts_with("/BeamRecorder/Beam/releases/download/")
    {
        return Err(Error::backend(
            "Beam update packages must belong to BeamRecorder/Beam",
        ));
    }
    let package_path = url
        .path()
        .trim_start_matches("/BeamRecorder/Beam/releases/download/");
    if !package_path
        .split_once('/')
        .is_some_and(|(tag, asset)| !tag.is_empty() && !asset.is_empty() && !asset.contains('/'))
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(Error::backend(
            "Beam update packages need a pinned release tag and asset",
        ));
    }
    if artifact.size == 0
        || artifact.size > MAX_PACKAGE_BYTES
        || artifact.sha256.len() != 64
        || !artifact.sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(Error::backend("invalid Beam update size or SHA-256"));
    }
    if matches!(artifact.format, Format::Executable) {
        return Err(Error::backend(
            "Beam updates require a complete application package",
        ));
    }
    Ok(())
}
