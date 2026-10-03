#[cfg(windows)]
use crate::{GpuDevice, GpuEngine, GpuSample};
#[cfg(windows)]
use windows::{
    Win32::System::Performance::*,
    core::{PCWSTR, w},
};

fn instance(name: &str) -> Option<(u32, String, String)> {
    let (pid, remainder) = name.strip_prefix("pid_")?.split_once("_luid_")?;
    let (device, engine) = remainder.split_once("_eng_")?;
    let (index, kind) = engine.split_once("_engtype_")?;
    if device.is_empty() || index.parse::<u32>().is_err() || kind.is_empty() {
        return None;
    }
    pid.parse::<u32>()
        .ok()
        .filter(|pid| *pid > 0)
        .map(|pid| (pid, device.to_string(), format!("{kind}:{index}")))
}

#[cfg(windows)]
#[derive(Default)]
pub(super) struct Sampler {
    query: Option<PDH_HQUERY>,
    counter: PDH_HCOUNTER,
    primed: bool,
}
#[cfg(windows)]
impl Drop for Sampler {
    fn drop(&mut self) {
        if let Some(query) = self.query.take() {
            unsafe {
                PdhCloseQuery(query);
            }
        }
    }
}
#[cfg(windows)]
impl Sampler {
    pub fn sample(&mut self, pids: &[u32]) -> GpuSample {
        match self.read(pids) {
            Ok(Some(devices)) if !devices.is_empty() => {
                GpuSample::sampled("windows-pdh", "process", devices)
            }
            Ok(None) => GpuSample::warming("windows-pdh", "process"),
            Ok(_) => GpuSample::unavailable(
                "counters-unavailable",
                "No WDDM GPU Engine counters for Beam's GPU processes",
            ),
            Err(code) => GpuSample::unavailable(
                "pdh-error",
                format!("Windows GPU counter query failed: 0x{code:08x}"),
            ),
        }
    }
    fn read(&mut self, pids: &[u32]) -> Result<Option<Vec<GpuDevice>>, u32> {
        if self.query.is_none() {
            let mut query = PDH_HQUERY::default();
            check(unsafe { PdhOpenQueryW(PCWSTR::null(), 0, &mut query) })?;
            self.query = Some(query);
            // English counter names are locale independent; PDH formats wildcard instances as an array.
            check(unsafe {
                PdhAddEnglishCounterW(
                    query,
                    w!("\\GPU Engine(*)\\Utilization Percentage"),
                    0,
                    &mut self.counter,
                )
            })?;
        }
        let query = self.query.ok_or(PDH_INVALID_HANDLE)?;
        check(unsafe { PdhCollectQueryData(query) })?;
        if !self.primed {
            self.primed = true;
            return Ok(None);
        }
        let mut bytes = 0;
        let mut count = 0;
        let result = unsafe {
            PdhGetFormattedCounterArrayW(self.counter, PDH_FMT_DOUBLE, &mut bytes, &mut count, None)
        };
        if result != PDH_MORE_DATA {
            check(result)?;
            return Ok(Some(vec![]));
        }
        if bytes == 0 || bytes > 8 * 1024 * 1024 {
            return Err(PDH_INVALID_DATA);
        }
        // u64 storage provides the alignment required by PDH's pointer/value structures.
        let mut storage = vec![0_u64; (bytes as usize).div_ceil(8)];
        let buffer = storage.as_mut_ptr().cast::<PDH_FMT_COUNTERVALUE_ITEM_W>();
        check(unsafe {
            PdhGetFormattedCounterArrayW(
                self.counter,
                PDH_FMT_DOUBLE,
                &mut bytes,
                &mut count,
                Some(buffer),
            )
        })?;
        if count as usize > bytes as usize / std::mem::size_of::<PDH_FMT_COUNTERVALUE_ITEM_W>() {
            return Err(PDH_INVALID_DATA);
        }
        let values = unsafe { std::slice::from_raw_parts(buffer, count as usize) };
        let mut devices = std::collections::BTreeMap::<String, GpuDevice>::new();
        for item in values {
            if ![PDH_CSTATUS_VALID_DATA, PDH_CSTATUS_NEW_DATA].contains(&item.FmtValue.CStatus) {
                continue;
            }
            let Ok(name) = (unsafe { item.szName.to_string() }) else {
                continue;
            };
            let Some((pid, device_id, engine_name)) = instance(&name) else {
                continue;
            };
            if !pids.contains(&pid) {
                continue;
            }
            let percent = unsafe { item.FmtValue.Anonymous.doubleValue };
            if !percent.is_finite() || percent < 0.0 {
                continue;
            }
            let device = devices
                .entry(device_id.clone())
                .or_insert_with(|| GpuDevice {
                    id: device_id.clone(),
                    name: format!("WDDM {device_id}"),
                    engines: vec![],
                });
            if let Some(engine) = device
                .engines
                .iter_mut()
                .find(|engine| engine.name == engine_name)
            {
                engine.busy_percent = (engine.busy_percent + percent).min(100.0);
            } else {
                device.engines.push(GpuEngine {
                    name: engine_name,
                    busy_percent: percent.min(100.0),
                });
            }
        }
        Ok(Some(devices.into_values().collect()))
    }
}
#[cfg(windows)]
fn check(code: u32) -> Result<(), u32> {
    if code == 0 { Ok(()) } else { Err(code) }
}

#[cfg(test)]
mod tests {
    use super::instance;
    #[test]
    fn identifies_process_device_and_engine() {
        assert_eq!(
            instance("pid_42_luid_0x00_0xab_phys_0_eng_2_engtype_VideoDecode"),
            Some((42, "0x00_0xab_phys_0".into(), "VideoDecode:2".into()))
        );
    }
    #[test]
    fn does_not_confuse_similar_process_identifiers() {
        assert_eq!(
            instance("pid_420_luid_0_0_phys_1_eng_0_engtype_3D").map(|row| row.0),
            Some(420)
        );
    }
    #[test]
    fn rejects_unrecognised_instances() {
        for name in [
            "",
            "pid_0_luid_0_eng_1_engtype_3D",
            "pid_no_luid_0_eng_1_engtype_3D",
            "pid_1_engtype_3D",
        ] {
            assert!(instance(name).is_none());
        }
    }
}
