//! Server URL and enrollment token that the server appends to a Windows exe
//! download, so that double-clicking the exe can enroll without arguments.
//!
//! Layout at the end of the downloaded file (written by the backend):
//!
//!   <exe> <JSON {"server", "token"}> <JSON length: u32 little-endian> <MAGIC>
//!
//! Windows only loads the parts of an exe its headers describe, so the
//! appended bytes don't stop it from running.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};

use anyhow::{Context, Result, bail};
use serde::Deserialize;

pub const MAGIC: &[u8; 8] = b"MONLICFG";
/// Far more than a URL and a token need; a larger length means corruption.
const MAX_PAYLOAD: u32 = 4096;
const TRAILER_LEN: u64 = 4 + MAGIC.len() as u64;

const CORRUPT: &str = "the downloaded agent is damaged; download it again from the Monli UI";

#[derive(Debug, Deserialize)]
pub struct Baked {
    pub server: String,
    pub token: String,
    /// Size of the exe without the baked data (where the JSON starts).
    #[serde(skip)]
    pub exe_len: u64,
}

/// The baked data of the running exe; `None` for a plain build.
pub fn read_current_exe() -> Result<Option<Baked>> {
    let path = std::env::current_exe().context("locating this exe")?;
    let mut file = File::open(&path).with_context(|| format!("opening {}", path.display()))?;
    read(&mut file)
}

fn read(file: &mut (impl Read + Seek)) -> Result<Option<Baked>> {
    let size = file.seek(SeekFrom::End(0))?;
    if size < TRAILER_LEN {
        return Ok(None);
    }

    let mut trailer = [0u8; TRAILER_LEN as usize];
    file.seek(SeekFrom::Start(size - TRAILER_LEN))?;
    file.read_exact(&mut trailer)?;
    let (len, magic) = trailer.split_at(4);
    if magic != MAGIC {
        return Ok(None);
    }

    let len = u32::from_le_bytes(len.try_into().expect("split_at(4)"));
    if len > MAX_PAYLOAD || u64::from(len) > size - TRAILER_LEN {
        bail!(CORRUPT);
    }
    let exe_len = size - TRAILER_LEN - u64::from(len);

    let mut payload = vec![0; len as usize];
    file.seek(SeekFrom::Start(exe_len))?;
    file.read_exact(&mut payload)?;
    let mut baked: Baked = serde_json::from_slice(&payload).context(CORRUPT)?;
    if baked.server.trim().is_empty() || baked.token.trim().is_empty() {
        bail!(CORRUPT);
    }
    baked.exe_len = exe_len;
    Ok(Some(baked))
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use super::*;

    const EXE: &[u8] = b"MZ pretend this is an exe";

    fn with_trailer(json: &str) -> Vec<u8> {
        let mut file = EXE.to_vec();
        file.extend_from_slice(json.as_bytes());
        file.extend_from_slice(&(json.len() as u32).to_le_bytes());
        file.extend_from_slice(MAGIC);
        file
    }

    #[test]
    fn plain_exe_has_none() {
        assert!(read(&mut Cursor::new(EXE)).unwrap().is_none());
    }

    #[test]
    fn tiny_file_has_none() {
        assert!(read(&mut Cursor::new(b"MZ")).unwrap().is_none());
    }

    #[test]
    fn reads_server_token_and_exe_length() {
        let file = with_trailer(r#"{"server":"http://monli:8080/api","token":"abc"}"#);
        let baked = read(&mut Cursor::new(file)).unwrap().unwrap();
        assert_eq!(baked.server, "http://monli:8080/api");
        assert_eq!(baked.token, "abc");
        assert_eq!(baked.exe_len, EXE.len() as u64);
    }

    #[test]
    fn length_past_start_of_file_is_an_error() {
        let mut file = EXE.to_vec();
        file.extend_from_slice(&1000u32.to_le_bytes());
        file.extend_from_slice(MAGIC);
        assert!(read(&mut Cursor::new(file)).is_err());
    }

    #[test]
    fn invalid_json_is_an_error() {
        assert!(read(&mut Cursor::new(with_trailer("not json"))).is_err());
    }

    #[test]
    fn empty_token_is_an_error() {
        let file = with_trailer(r#"{"server":"http://monli:8080/api","token":" "}"#);
        assert!(read(&mut Cursor::new(file)).is_err());
    }
}
