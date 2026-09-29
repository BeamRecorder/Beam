//! Port of src/media/playback/waveform-bands.ts: identical filters, RMS and dB mapping.
#[derive(Clone)]
struct Filter {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    z1: f64,
    z2: f64,
}
impl Filter {
    fn lowpass(frequency: f64, rate: f64) -> Self {
        let omega = 2. * std::f64::consts::PI * frequency / rate;
        let cosine = omega.cos();
        let alpha = omega.sin() / (2. * std::f64::consts::FRAC_1_SQRT_2);
        let a0 = 1. + alpha;
        Self {
            b0: (1. - cosine) / (2. * a0),
            b1: (1. - cosine) / a0,
            b2: (1. - cosine) / (2. * a0),
            a1: -2. * cosine / a0,
            a2: (1. - alpha) / a0,
            z1: 0.,
            z2: 0.,
        }
    }
    fn apply(&mut self, value: f64) -> f64 {
        let result = self.b0 * value + self.z1;
        self.z1 = self.b1 * value - self.a1 * result + self.z2;
        self.z2 = self.b2 * value - self.a2 * result;
        result
    }
}

pub struct Bands {
    filters: [Filter; 3],
    sums: [f64; 4],
    frames: usize,
    point: usize,
}
impl Bands {
    pub fn new(rate: u32) -> Self {
        let rate = rate.max(1) as f64;
        Self {
            filters: [
                Filter::lowpass(180_f64.min(rate * 0.2), rate),
                Filter::lowpass(900_f64.min(rate * 0.22), rate),
                Filter::lowpass(4000_f64.min(rate * 0.24), rate),
            ],
            sums: [0.; 4],
            frames: 0,
            point: 0,
        }
    }
    /// Pools 256-frame RMS blocks into each requested source-time bin.
    pub fn add(&mut self, mono: f64, point: usize, output: &mut [[f32; 5]]) {
        if point != self.point {
            self.flush(output);
            self.point = point;
        }
        let low = self.filters[0].apply(mono);
        let mid = self.filters[1].apply(mono);
        let high = self.filters[2].apply(mono);
        for (sum, value) in self
            .sums
            .iter_mut()
            .zip([low, mid - low, high - mid, mono - high])
        {
            *sum += value * value;
        }
        self.frames += 1;
        if self.frames == 256 {
            self.flush(output);
        }
    }
    pub fn flush(&mut self, output: &mut [[f32; 5]]) {
        if self.frames == 0 {
            return;
        }
        if let Some(point) = output.get_mut(self.point) {
            for (band, gain) in [1., 1.18, 1.42, 1.78].into_iter().enumerate() {
                let rms = (self.sums[band] / self.frames as f64).sqrt() * gain;
                let db = 20. * rms.max(1e-8).log10();
                let value = ((db + 60.) / 50.).clamp(0., 1.).powf(1.18) as f32;
                point[band + 1] = point[band + 1].max(value);
            }
        }
        self.sums.fill(0.);
        self.frames = 0;
    }
}
