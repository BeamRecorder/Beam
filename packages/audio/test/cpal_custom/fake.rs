use std::{
    fmt,
    hash::{Hash, Hasher},
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

use cpal::{
    Data, DeviceDescription, DeviceDescriptionBuilder, DeviceId, Error, ErrorKind, FrameCount,
    InputCallbackInfo, OutputCallbackInfo, SampleFormat, StreamConfig, StreamInstant,
    SupportedStreamConfig, SupportedStreamConfigRange,
    traits::{DeviceTrait, HostTrait, StreamTrait},
};

type DataCallback = Box<dyn FnMut(&Data, &InputCallbackInfo) + Send>;
type ErrorCallback = Box<dyn FnMut(Error) + Send>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct RequestedConfig {
    pub(super) channels: u16,
    pub(super) sample_rate: u32,
    pub(super) format: SampleFormat,
    pub(super) timeout: Option<Duration>,
}

#[derive(Default)]
pub(super) struct Controls {
    data_callback: Mutex<Option<DataCallback>>,
    error_callback: Mutex<Option<ErrorCallback>>,
    pub(super) play_count: AtomicUsize,
    pub(super) pause_count: AtomicUsize,
    pub(super) build_count: AtomicUsize,
    pub(super) requested_config: Mutex<Option<RequestedConfig>>,
}

impl Controls {
    pub(super) fn emit_f32(&self, samples: &mut [f32]) {
        // SAFETY: The live slice owns the pointer and its length matches F32 samples.
        let data = unsafe {
            Data::from_parts(
                samples.as_mut_ptr().cast(),
                samples.len(),
                SampleFormat::F32,
            )
        };
        let info = InputCallbackInfo::new(cpal::InputStreamTimestamp {
            capture: StreamInstant::from_nanos(1_000_000_000),
            callback: StreamInstant::from_nanos(1_001_000_000),
        });
        if let Some(callback) = self
            .data_callback
            .lock()
            .expect("data callback lock")
            .as_mut()
        {
            callback(&data, &info);
        }
    }

    pub(super) fn emit_error(&self, kind: ErrorKind) {
        if let Some(callback) = self
            .error_callback
            .lock()
            .expect("error callback lock")
            .as_mut()
        {
            callback(Error::new(kind));
        }
    }

    pub(super) fn built(&self) -> usize {
        self.build_count.load(Ordering::Acquire)
    }

    pub(super) fn played(&self) -> usize {
        self.play_count.load(Ordering::Acquire)
    }

    pub(super) fn paused(&self) -> usize {
        self.pause_count.load(Ordering::Acquire)
    }
}

#[derive(Clone)]
pub(super) struct FakeDevice {
    pub(super) key: &'static str,
    pub(super) name: &'static str,
    pub(super) input: bool,
    pub(super) output: bool,
    pub(super) id_error: Option<ErrorKind>,
    pub(super) description_error: Option<ErrorKind>,
    pub(super) default_input_error: Option<ErrorKind>,
    pub(super) default_output_error: Option<ErrorKind>,
    pub(super) input_ranges_error: Option<ErrorKind>,
    pub(super) output_ranges_error: Option<ErrorKind>,
    pub(super) default_input: SupportedStreamConfig,
    pub(super) default_output: SupportedStreamConfig,
    pub(super) input_ranges: Vec<SupportedStreamConfigRange>,
    pub(super) output_ranges: Vec<SupportedStreamConfigRange>,
    pub(super) build_error: Option<ErrorKind>,
    pub(super) play_error: Option<ErrorKind>,
    pub(super) pause_error: Option<ErrorKind>,
    pub(super) controls: Arc<Controls>,
}

impl FakeDevice {
    pub(super) fn new(key: &'static str, name: &'static str) -> Self {
        let config = SupportedStreamConfig::new(
            2,
            48_000,
            cpal::SupportedBufferSize::Unknown,
            SampleFormat::F32,
        );
        let range = SupportedStreamConfigRange::new(
            2,
            44_100,
            96_000,
            cpal::SupportedBufferSize::Unknown,
            SampleFormat::F32,
        );
        Self {
            key,
            name,
            input: true,
            output: false,
            id_error: None,
            description_error: None,
            default_input_error: None,
            default_output_error: None,
            input_ranges_error: None,
            output_ranges_error: None,
            default_input: config,
            default_output: config,
            input_ranges: vec![range],
            output_ranges: vec![range],
            build_error: None,
            play_error: None,
            pause_error: None,
            controls: Arc::new(Controls::default()),
        }
    }

    fn device_id(&self) -> DeviceId {
        DeviceId::new(cpal::HostId::Custom, self.key)
    }
}

impl PartialEq for FakeDevice {
    fn eq(&self, other: &Self) -> bool {
        self.key == other.key
    }
}
impl Eq for FakeDevice {}
impl Hash for FakeDevice {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.key.hash(state);
    }
}
impl fmt::Debug for FakeDevice {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_tuple("FakeDevice").field(&self.key).finish()
    }
}
impl fmt::Display for FakeDevice {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.name)
    }
}

pub(super) struct FakeStream {
    controls: Arc<Controls>,
    play_error: Option<ErrorKind>,
    pause_error: Option<ErrorKind>,
}

impl StreamTrait for FakeStream {
    fn play(&self) -> Result<(), Error> {
        self.controls.play_count.fetch_add(1, Ordering::AcqRel);
        self.play_error.map_or(Ok(()), |kind| Err(Error::new(kind)))
    }

    fn pause(&self) -> Result<(), Error> {
        self.controls.pause_count.fetch_add(1, Ordering::AcqRel);
        self.pause_error
            .map_or(Ok(()), |kind| Err(Error::new(kind)))
    }

    fn now(&self) -> StreamInstant {
        StreamInstant::from_nanos(0)
    }

    fn buffer_size(&self) -> Result<FrameCount, Error> {
        Ok(64)
    }
}

impl DeviceTrait for FakeDevice {
    type SupportedInputConfigs = std::vec::IntoIter<SupportedStreamConfigRange>;
    type SupportedOutputConfigs = std::vec::IntoIter<SupportedStreamConfigRange>;
    type Stream = FakeStream;

    fn description(&self) -> Result<DeviceDescription, Error> {
        self.description_error.map_or_else(
            || Ok(DeviceDescriptionBuilder::new(self.name).build()),
            |kind| Err(Error::new(kind)),
        )
    }

    fn id(&self) -> Result<DeviceId, Error> {
        self.id_error
            .map_or_else(|| Ok(self.device_id()), |kind| Err(Error::new(kind)))
    }

    fn supports_input(&self) -> bool {
        self.input
    }

    fn supports_output(&self) -> bool {
        self.output
    }

    fn supported_input_configs(&self) -> Result<Self::SupportedInputConfigs, Error> {
        self.input_ranges_error.map_or_else(
            || Ok(self.input_ranges.clone().into_iter()),
            |kind| Err(Error::new(kind)),
        )
    }

    fn supported_output_configs(&self) -> Result<Self::SupportedOutputConfigs, Error> {
        self.output_ranges_error.map_or_else(
            || Ok(self.output_ranges.clone().into_iter()),
            |kind| Err(Error::new(kind)),
        )
    }

    fn default_input_config(&self) -> Result<SupportedStreamConfig, Error> {
        self.default_input_error
            .map_or_else(|| Ok(self.default_input), |kind| Err(Error::new(kind)))
    }

    fn default_output_config(&self) -> Result<SupportedStreamConfig, Error> {
        self.default_output_error
            .map_or_else(|| Ok(self.default_output), |kind| Err(Error::new(kind)))
    }

    fn build_input_stream_raw<D, E>(
        &self,
        config: StreamConfig,
        format: SampleFormat,
        data_callback: D,
        error_callback: E,
        timeout: Option<Duration>,
    ) -> Result<Self::Stream, Error>
    where
        D: FnMut(&Data, &InputCallbackInfo) + Send + 'static,
        E: FnMut(Error) + Send + 'static,
    {
        self.controls.build_count.fetch_add(1, Ordering::AcqRel);
        if let Some(kind) = self.build_error {
            return Err(Error::new(kind));
        }
        *self.controls.requested_config.lock().expect("config lock") = Some(RequestedConfig {
            channels: config.channels,
            sample_rate: config.sample_rate,
            format,
            timeout,
        });
        *self.controls.data_callback.lock().expect("data lock") = Some(Box::new(data_callback));
        *self.controls.error_callback.lock().expect("error lock") = Some(Box::new(error_callback));
        Ok(FakeStream {
            controls: self.controls.clone(),
            play_error: self.play_error,
            pause_error: self.pause_error,
        })
    }

    fn build_output_stream_raw<D, E>(
        &self,
        _: StreamConfig,
        _: SampleFormat,
        _: D,
        _: E,
        _: Option<Duration>,
    ) -> Result<Self::Stream, Error>
    where
        D: FnMut(&mut Data, &OutputCallbackInfo) + Send + 'static,
        E: FnMut(Error) + Send + 'static,
    {
        Err(Error::new(ErrorKind::UnsupportedOperation))
    }
}

#[derive(Clone)]
pub(super) struct FakeHost {
    pub(super) devices: Vec<FakeDevice>,
    pub(super) default_input: Option<&'static str>,
    pub(super) default_output: Option<&'static str>,
    pub(super) default_input_override: Option<FakeDevice>,
    pub(super) enumeration_error: Option<ErrorKind>,
}

impl FakeHost {
    pub(super) fn new(devices: Vec<FakeDevice>, default_input: Option<&'static str>) -> Self {
        Self {
            devices,
            default_input,
            default_output: None,
            default_input_override: None,
            enumeration_error: None,
        }
    }
}

impl HostTrait for FakeHost {
    type Device = FakeDevice;
    type Devices = std::vec::IntoIter<FakeDevice>;

    fn is_available() -> bool {
        true
    }

    fn devices(&self) -> Result<Self::Devices, Error> {
        self.enumeration_error.map_or_else(
            || Ok(self.devices.clone().into_iter()),
            |kind| Err(Error::new(kind)),
        )
    }

    fn default_input_device(&self) -> Option<Self::Device> {
        if let Some(device) = &self.default_input_override {
            return Some(device.clone());
        }
        let key = self.default_input?;
        self.devices
            .iter()
            .find(|device| device.key == key)
            .cloned()
    }

    fn default_output_device(&self) -> Option<Self::Device> {
        let key = self.default_output?;
        self.devices
            .iter()
            .find(|device| device.key == key)
            .cloned()
    }
}

pub(super) fn host(fake: FakeHost) -> cpal::Host {
    cpal::Host::from(cpal::platform::CustomHost::from_host(fake))
}

pub(super) fn device(fake: FakeDevice) -> cpal::Device {
    cpal::Device::from(cpal::platform::CustomDevice::from_device(fake))
}
