use anyhow::Result;
use async_trait::async_trait;
use sysinfo::{Process, ProcessRefreshKind, ProcessStatus, ProcessesToUpdate, System};

use super::Collector;

/// Process list only (no CPU, memory, ...), the cheapest refresh.
fn processes() -> System {
    let mut system = System::new();
    system.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
    system
}

/// On Linux the list also contains threads; those are not processes.
fn is_process(process: &Process) -> bool {
    process.thread_kind().is_none()
}

pub struct ProcessCount;

#[async_trait]
impl Collector for ProcessCount {
    async fn collect(&self) -> Result<f64> {
        let system = processes();
        Ok(system.processes().values().filter(|p| is_process(p)).count() as f64)
    }
}

/// Exited processes whose parent has not collected them yet.
pub struct ZombieCount;

#[async_trait]
impl Collector for ZombieCount {
    async fn collect(&self) -> Result<f64> {
        let system = processes();
        let zombies = system
            .processes()
            .values()
            .filter(|p| is_process(p) && p.status() == ProcessStatus::Zombie)
            .count();
        Ok(zombies as f64)
    }
}
