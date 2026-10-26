//! Self-detected identity sent to the server at enrollment. The server pairs
//! the hostname with the request's source IP to decide whether this is a
//! re-install of an existing target or a new one.

use anyhow::{Context, Result};
use serde::Serialize;

// Field names match the `registerAgentSchema` body on the server, so this
// struct is posted as-is as the JSON body.
#[derive(Debug, Serialize)]
pub struct HostIdentity {
    pub hostname: String,
    /// "linux", "macos", "windows", ... (Rust's `std::env::consts::OS`).
    pub os: &'static str,
    /// "x86_64", "aarch64", ... (Rust's `std::env::consts::ARCH`).
    pub arch: &'static str,
    /// e.g. "Ubuntu 22.04 (WSL)" or "Windows 11 Pro". Detected at runtime;
    /// omitted when unknown.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distro: Option<String>,
}

pub fn identity() -> Result<HostIdentity> {
    let hostname = hostname::get()
        .context("reading hostname")?
        .to_string_lossy()
        .into_owned();
    Ok(HostIdentity {
        hostname,
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        distro: distro(),
    })
}

/// Linux distribution from /etc/os-release, with " (WSL)" appended under WSL.
/// `None` if it can't be read: enrollment never fails because of it.
#[cfg(target_os = "linux")]
fn distro() -> Option<String> {
    let os_release = std::fs::read_to_string("/etc/os-release").ok()?;
    // WSL kernels report e.g. "5.15.153.1-microsoft-standard-WSL2". The
    // WSL_DISTRO_NAME variable isn't set inside the systemd service.
    let wsl = std::fs::read_to_string("/proc/sys/kernel/osrelease")
        .map(|release| release.to_lowercase().contains("microsoft"))
        .unwrap_or(false);
    format_distro(&os_release, wsl)
}

/// Windows edition from the registry, e.g. "Windows 11 Pro".
#[cfg(windows)]
fn distro() -> Option<String> {
    sysinfo::System::long_os_version()
}

#[cfg(not(any(target_os = "linux", windows)))]
fn distro() -> Option<String> {
    None
}

/// "NAME VERSION_ID" (e.g. "Ubuntu 22.04"); falls back to PRETTY_NAME, then NAME.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn format_distro(os_release: &str, wsl: bool) -> Option<String> {
    let field = |key: &str| {
        os_release.lines().find_map(|line| {
            let value = line.strip_prefix(key)?.strip_prefix('=')?;
            let value = value.trim().trim_matches('"').trim_matches('\'').trim();
            (!value.is_empty()).then(|| value.to_string())
        })
    };

    let name = match (field("NAME"), field("VERSION_ID")) {
        (Some(name), Some(version)) => format!("{name} {version}"),
        (name, None) => field("PRETTY_NAME").or(name)?,
        (None, Some(_)) => field("PRETTY_NAME")?,
    };
    Some(if wsl { format!("{name} (WSL)") } else { name })
}

#[cfg(test)]
mod tests {
    use super::format_distro;

    const UBUNTU: &str = r#"PRETTY_NAME="Ubuntu 22.04.4 LTS"
NAME="Ubuntu"
VERSION_ID="22.04"
VERSION="22.04.4 LTS (Jammy Jellyfish)"
ID=ubuntu
"#;

    #[test]
    fn name_and_version() {
        assert_eq!(
            format_distro(UBUNTU, false).as_deref(),
            Some("Ubuntu 22.04")
        );
    }

    #[test]
    fn wsl_suffix() {
        assert_eq!(
            format_distro(UBUNTU, true).as_deref(),
            Some("Ubuntu 22.04 (WSL)")
        );
    }

    #[test]
    fn rolling_release_uses_pretty_name() {
        // Arch has no VERSION_ID.
        let arch = "NAME=\"Arch Linux\"\nPRETTY_NAME=\"Arch Linux\"\nID=arch\n";
        assert_eq!(format_distro(arch, false).as_deref(), Some("Arch Linux"));
    }

    #[test]
    fn name_only() {
        assert_eq!(
            format_distro("NAME=Alpine\n", false).as_deref(),
            Some("Alpine")
        );
    }

    #[test]
    fn version_id_is_not_mistaken_for_version() {
        let os_release = "VERSION=\"1 (x)\"\nNAME=Foo\nVERSION_ID=1\n";
        assert_eq!(format_distro(os_release, false).as_deref(), Some("Foo 1"));
    }

    #[test]
    fn empty_file() {
        assert_eq!(format_distro("", false), None);
    }
}
