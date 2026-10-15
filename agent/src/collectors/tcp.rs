use anyhow::Result;
use async_trait::async_trait;

use super::Collector;
use super::sampler::read_kernel_file;

/// Connection state code for ESTABLISHED in /proc/net/tcp.
const ESTABLISHED: &str = "01";

fn established_in(path: &str) -> Result<usize> {
    let table = read_kernel_file(path)?;
    // Skip the header; the 4th column is the connection state.
    Ok(table
        .lines()
        .skip(1)
        .filter(|line| line.split_whitespace().nth(3) == Some(ESTABLISHED))
        .count())
}

/// Established TCP connections, IPv4 and IPv6.
pub struct TcpEstablishedCount;

#[async_trait]
impl Collector for TcpEstablishedCount {
    async fn collect(&self) -> Result<f64> {
        let ipv4 = established_in("/proc/net/tcp")?;
        // Missing when IPv6 is disabled.
        let ipv6 = established_in("/proc/net/tcp6").unwrap_or(0);
        Ok((ipv4 + ipv6) as f64)
    }
}
