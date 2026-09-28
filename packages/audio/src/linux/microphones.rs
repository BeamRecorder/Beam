//! Linux microphone choices follow the desktop audio server and real capture PCMs.

use crate::{AudioDevice, AudioError};
use cpal::traits::{DeviceTrait, HostTrait};
use std::{collections::HashSet, str::FromStr, sync::mpsc, time::Duration};

pub(crate) fn list(host: &cpal::Host) -> Result<Vec<AudioDevice>, AudioError> {
    let devices = if host.id() == cpal::HostId::PipeWire {
        super::catalog::list_microphones()?
    } else if host.id() == cpal::HostId::PulseAudio {
        let sources = pulse_sources()?;
        crate::cpal_capture::list_inputs_with_host(host)?
            .into_iter()
            .filter(|device| sources.contains(&device.id))
            .collect()
    } else if host.id() == cpal::HostId::Alsa {
        alsa_microphones(host)?
    } else {
        return crate::cpal_capture::list_inputs_with_host(host);
    };
    with_default(devices, host)
}

fn with_default(
    mut devices: Vec<AudioDevice>,
    host: &cpal::Host,
) -> Result<Vec<AudioDevice>, AudioError> {
    if let Some(default) = host.default_input_device() {
        let id = default.id().map_err(AudioError::from)?.to_string();
        if let Some(device) = devices.iter_mut().find(|device| device.id == id) {
            device.is_default = true;
        } else if !devices.is_empty() && host.id() != cpal::HostId::PulseAudio {
            // CPAL's PipeWire input_default is a real, resolvable capture ID.
            devices.insert(
                0,
                AudioDevice {
                    id,
                    name: "Default microphone".into(),
                    is_default: true,
                },
            );
        }
    }
    Ok(devices)
}

/// Monitor sources carry sink identity in Pulse's protocol, independent of labels.
fn pulse_sources() -> Result<HashSet<String>, AudioError> {
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let result = (|| {
            let name = c"Beam microphone discovery";
            let client = pulseaudio::Client::from_env(name)
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            let sources = futures::executor::block_on(client.list_sources())
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            Ok(sources
                .into_iter()
                .filter(|source| {
                    source.monitor_of_sink_index.is_none() && source.monitor_of_sink_name.is_none()
                })
                .map(|source| format!("pulseaudio:{}", source.name.to_string_lossy()))
                .collect::<HashSet<_>>())
        })();
        let _ = sender.send(result);
    });
    receiver
        .recv_timeout(Duration::from_secs(2))
        .map_err(|error| AudioError::Backend(format!("PulseAudio microphone discovery: {error}")))?
}

/// CPAL creates these exact numeric plughw IDs; hints are routes, not extra microphones.
fn alsa_microphones(host: &cpal::Host) -> Result<Vec<AudioDevice>, AudioError> {
    let inputs = crate::cpal_capture::list_inputs_with_host(host)?;
    let mut devices = Vec::new();
    for device in inputs {
        let id = cpal::DeviceId::from_str(&device.id).map_err(AudioError::from)?;
        if let Some((card, pcm)) = hardware_pcm(id.id()) {
            let ctl = alsa::Ctl::new(&format!("hw:{card}"), false)
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            if let Ok(info) = ctl.pcm_info(pcm, 0, alsa::Direction::Capture) {
                let title = info.get_name().unwrap_or("Microphone");
                devices.push(AudioDevice {
                    name: format!("{} · {title}", device.name),
                    ..device
                });
            }
        }
    }
    Ok(devices)
}

fn hardware_pcm(id: &str) -> Option<(u32, u32)> {
    let mut parts = id.strip_prefix("plughw:CARD=")?.split(",DEV=");
    let card = parts.next()?.parse().ok()?;
    let pcm = parts.next()?.parse().ok()?;
    (parts.next().is_none()).then_some((card, pcm))
}

#[path = "../../test/linux/microphones.rs"]
mod microphone_checks;
