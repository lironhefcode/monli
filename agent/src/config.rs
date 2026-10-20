//! Credentials persisted after enrollment. Their presence is what separates a
//! reboot (load and go) from a first install (register with a token).

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

#[cfg(not(windows))]
pub const DEFAULT_PATH: &str = "/var/lib/monli/credentials.toml";
#[cfg(windows)]
pub const DEFAULT_PATH: &str = r"C:\ProgramData\Monli\credentials.toml";

#[derive(Debug, Serialize, Deserialize)]
pub struct Credentials {
    pub server_url: String,
    pub target_id: i64,
    pub api_key: String,
}

#[derive(Debug, thiserror::Error)]
pub enum LoadError {
    #[error("not enrolled: {} not found; run the install command", .0.display())]
    Missing(PathBuf),
    #[error(
        "credentials file {} is invalid: {reason}; re-run the install command with a new token",
        path.display()
    )]
    Invalid { path: PathBuf, reason: String },
    #[error("could not read credentials file {}: {source}", path.display())]
    Unreadable { path: PathBuf, source: io::Error },
}

pub fn load(path: &Path) -> Result<Credentials, LoadError> {
    let text = fs::read_to_string(path).map_err(|source| match source.kind() {
        io::ErrorKind::NotFound => LoadError::Missing(path.to_owned()),
        _ => LoadError::Unreadable { path: path.to_owned(), source },
    })?;

    let invalid = |reason: String| LoadError::Invalid { path: path.to_owned(), reason };

    // Missing fields or wrong types fail here.
    let creds: Credentials = toml::from_str(&text).map_err(|e| invalid(e.message().to_owned()))?;

    // Present-but-empty counts as missing.
    if creds.server_url.trim().is_empty() {
        return Err(invalid("server_url is empty".into()));
    }
    if creds.api_key.trim().is_empty() {
        return Err(invalid("api_key is empty".into()));
    }
    if creds.target_id <= 0 {
        return Err(invalid(format!("target_id {} is not a valid id", creds.target_id)));
    }
    Ok(creds)
}

/// Writes to a temp file and renames it into place, so a crash mid-write
/// leaves either the old file or the new one, never a half-written file.
pub fn save(path: &Path, creds: &Credentials) -> Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).with_context(|| format!("creating {}", dir.display()))?;
    }

    let text = toml::to_string(creds).context("serializing credentials")?;
    let tmp = path.with_extension("toml.tmp");

    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    // Only the owning user may read the API key. Windows has no mode bits;
    // there the file inherits the directory's ACL, which the installer
    // limits to SYSTEM and Administrators (install.rs).
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }

    let mut file = options
        .open(&tmp)
        .with_context(|| format!("creating {}", tmp.display()))?;
    file.write_all(text.as_bytes())
        .and_then(|()| file.sync_all())
        .with_context(|| format!("writing {}", tmp.display()))?;

    fs::rename(&tmp, path)
        .with_context(|| format!("moving {} into place", path.display()))?;
    Ok(())
}
