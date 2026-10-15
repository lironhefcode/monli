//! Byte and error totals summed over every interface except loopback, read
//! fresh each time; `CounterRate` turns them into per-second rates.

use anyhow::Result;
use sysinfo::{NetworkData, Networks};

fn total(counter: fn(&NetworkData) -> u64) -> u64 {
    Networks::new_with_refreshed_list()
        .iter()
        .filter(|(name, _)| name.as_str() != "lo")
        .map(|(_, data)| counter(data))
        .sum()
}

pub fn received_bytes() -> Result<u64> {
    Ok(total(NetworkData::total_received))
}

pub fn transmitted_bytes() -> Result<u64> {
    Ok(total(NetworkData::total_transmitted))
}

pub fn errors() -> Result<u64> {
    Ok(total(|data| data.total_errors_on_received() + data.total_errors_on_transmitted()))
}
