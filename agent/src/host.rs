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
    })
}
