use crate::{GpuDevice, GpuEngine, GpuSample};
use std::{
    collections::{BTreeMap, HashMap},
    fs,
    time::Instant,
};

#[derive(Clone, Debug, Default)]
struct Counter {
    busy: u64,
    total: Option<u64>,
    capacity: u64,
}
#[derive(Clone, Debug)]
struct Client {
    id: String,
    device: String,
    driver: String,
    engines: BTreeMap<String, Counter>,
}

fn parse(text: &str) -> Option<Client> {
    let fields: HashMap<_, _> = text
        .lines()
        .filter_map(|line| line.split_once(':'))
        .map(|(key, value)| (key, value.trim()))
        .collect();
    let driver = fields.get("drm-driver")?.to_string();
    let device = fields
        .get("drm-pdev")
        .copied()
        .unwrap_or(&driver)
        .to_string();
    let id = format!("{device}:{}", fields.get("drm-client-id")?);
    let mut engines = BTreeMap::new();
    for (key, value) in &fields {
        let (name, total) = if let Some(name) = key.strip_prefix("drm-engine-") {
            if name.starts_with("capacity-") || !value.ends_with(" ns") {
                continue;
            }
            (name, None)
        } else if let Some(name) = key.strip_prefix("drm-cycles-") {
            let Some(total) = fields
                .get(format!("drm-total-cycles-{name}").as_str())
                .and_then(|value| value.parse().ok())
            else {
                continue;
            };
            (name, Some(total))
        } else {
            continue;
        };
        let busy = value
            .strip_suffix(" ns")
            .unwrap_or(value)
            .parse::<u64>()
            .ok()?;
        // The DRM ABI explicitly defines omitted engine capacity as one.
        let capacity = fields
            .get(format!("drm-engine-capacity-{name}").as_str())
            .map_or(Some(1), |value| value.parse::<u64>().ok())?;
        if capacity == 0 {
            return None;
        }
        // Prefer the GPU clock domain when both counter formats are available.
        if total.is_some() || !engines.contains_key(name) {
            engines.insert(
                name.to_string(),
                Counter {
                    busy,
                    total,
                    capacity,
                },
            );
        }
    }
    (!engines.is_empty()).then_some(Client {
        id,
        device,
        driver,
        engines,
    })
}

#[derive(Default)]
pub(super) struct Sampler {
    previous: HashMap<String, Client>,
    sampled_at: Option<Instant>,
}
impl Sampler {
    pub fn sample(&mut self, pids: &[u32]) -> GpuSample {
        let mut clients = HashMap::new();
        let mut denied = false;
        for pid in pids {
            let directory = format!("/proc/{pid}/fdinfo");
            let Ok(entries) = fs::read_dir(directory) else {
                denied = true;
                continue;
            };
            for entry in entries.take(512).flatten() {
                match fs::read_to_string(entry.path()) {
                    Ok(text) if text.len() <= 65536 => {
                        if let Some(client) = parse(&text) {
                            clients.insert(client.id.clone(), client);
                        }
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
                        denied = true
                    }
                    _ => {}
                }
            }
        }
        if clients.is_empty() {
            self.previous.clear();
            self.sampled_at = None;
            return GpuSample::unavailable(
                if denied {
                    "permission-denied"
                } else {
                    "counters-unavailable"
                },
                "No accessible DRM engine counters for Beam's GPU processes",
            );
        }
        self.update(clients, Instant::now())
    }
    fn update(&mut self, mut clients: HashMap<String, Client>, now: Instant) -> GpuSample {
        let elapsed_ns = self
            .sampled_at
            .map(|time| now.duration_since(time).as_nanos() as f64);
        let mut devices: BTreeMap<String, GpuDevice> = BTreeMap::new();
        for client in clients.values_mut() {
            let Some(previous) = self.previous.get(&client.id) else {
                continue;
            };
            for (name, counter) in &mut client.engines {
                let Some(old) = previous.engines.get(name) else {
                    continue;
                };
                if old.capacity != counter.capacity
                    || old.total.is_some() != counter.total.is_some()
                {
                    continue;
                }
                // Some DRM drivers briefly regress counters. Preserve the high-water mark.
                counter.busy = counter.busy.max(old.busy);
                let elapsed = match (counter.total, old.total) {
                    (Some(total), Some(old_total)) => {
                        counter.total = Some(total.max(old_total));
                        total.saturating_sub(old_total) as f64
                    }
                    (None, None) => elapsed_ns.unwrap_or(0.0),
                    _ => continue,
                };
                if elapsed <= 0.0 {
                    continue;
                }
                let percent =
                    (counter.busy - old.busy) as f64 / elapsed / counter.capacity as f64 * 100.0;
                let device = devices
                    .entry(client.device.clone())
                    .or_insert_with(|| GpuDevice {
                        id: client.device.clone(),
                        name: client.driver.clone(),
                        engines: vec![],
                    });
                if let Some(engine) = device
                    .engines
                    .iter_mut()
                    .find(|engine| engine.name == *name)
                {
                    engine.busy_percent = (engine.busy_percent + percent).min(100.0);
                } else {
                    device.engines.push(GpuEngine {
                        name: name.clone(),
                        busy_percent: percent.min(100.0),
                    });
                }
            }
        }
        self.previous = clients;
        self.sampled_at = Some(now);
        if devices.is_empty() {
            GpuSample::warming("linux-drm", "process")
        } else {
            GpuSample::sampled("linux-drm", "process", devices.into_values().collect())
        }
    }
}

#[cfg(test)]
#[path = "linux_tests.rs"]
mod tests;
