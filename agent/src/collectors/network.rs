//! Byte and error totals per network interface, read fresh each time;
//! `DeviceCounterRate` turns them into per-second rates. Loopback and
//! container `veth` pairs are left out: they carry no external traffic.

use std::collections::HashMap;

use anyhow::Result;
use sysinfo::{NetworkData, Networks};

fn is_external(name: &str) -> bool {
    name != "lo" && !name.starts_with("veth")
}

fn per_interface(counter: fn(&NetworkData) -> u64) -> HashMap<String, u64> {
    Networks::new_with_refreshed_list()
        .iter()
        .filter(|(name, _)| is_external(name))
        .map(|(name, data)| (name.clone(), counter(data)))
        .collect()
}

pub fn received_bytes() -> Result<HashMap<String, u64>> {
    Ok(per_interface(NetworkData::total_received))
}

pub fn transmitted_bytes() -> Result<HashMap<String, u64>> {
    Ok(per_interface(NetworkData::total_transmitted))
}

pub fn errors() -> Result<HashMap<String, u64>> {
    Ok(per_interface(|data| data.total_errors_on_received() + data.total_errors_on_transmitted()))
}
