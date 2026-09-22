use std::{
    collections::HashMap,
    error::Error,
    time::{Duration, Instant},
};

use beam_media_session::ProcessSample;
use sysinfo::{Pid, Process, ProcessesToUpdate, System, get_current_pid};

pub struct ProcessSampler {
    system: System,
    root: Pid,
    last: Instant,
}

impl ProcessSampler {
    pub fn new() -> Result<Self, Box<dyn Error>> {
        let root = get_current_pid().map_err(str::to_owned)?;
        let mut system = System::new();
        system.refresh_processes(ProcessesToUpdate::All, true);
        Ok(Self {
            system,
            root,
            last: Instant::now(),
        })
    }

    pub fn sample(
        &mut self,
        session_ns: u64,
        gpu_memory_bytes: Option<u64>,
        preview_frames_uploaded: Option<u64>,
    ) -> Option<ProcessSample> {
        if self.last.elapsed() < Duration::from_secs(1) {
            return None;
        }
        self.last = Instant::now();
        self.system.refresh_processes(ProcessesToUpdate::All, true);
        let processes = self.system.processes();
        let mut process_count = 0_u32;
        let mut rss_bytes = 0_u64;
        let mut cpu_percent = 0_f32;
        for (pid, process) in processes {
            if process.thread_kind().is_none() && belongs_to_tree(*pid, self.root, processes) {
                process_count = process_count.saturating_add(1);
                rss_bytes = rss_bytes.saturating_add(process.memory());
                cpu_percent += process.cpu_usage();
            }
        }
        Some(ProcessSample {
            session_ns,
            process_count,
            rss_bytes,
            cpu_percent_x100: (cpu_percent.max(0.0) * 100.0).min(u32::MAX as f32) as u32,
            gpu_memory_bytes,
            preview_frames_uploaded,
        })
    }
}

fn belongs_to_tree(pid: Pid, root: Pid, processes: &HashMap<Pid, Process>) -> bool {
    let mut current = Some(pid);
    for _ in 0..64 {
        if current == Some(root) {
            return true;
        }
        let Some(pid) = current else { return false };
        current = processes.get(&pid).and_then(Process::parent);
    }
    false
}
