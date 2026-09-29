// WGSL port of timeline/waveform/blick-waveform-shaders.ts.
// Compute the same Blick mountain envelopes once per column, then draw four strips.
struct Params { length: u32, columns: u32, width: f32, duration: f32 }
@group(0) @binding(0) var<storage, read> data: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> output: array<vec4f>;
@group(0) @binding(2) var<uniform> params: Params;
fn sampleRow(t: f32, row: u32) -> vec4f {
    let p = clamp(t, 0.f, 1.f) * f32(params.length) - .5f;
    let a = i32(floor(p));
    let first = u32(clamp(a, 0, i32(params.length) - 1)) * 2u + row;
    let second = u32(clamp(a + 1, 0, i32(params.length) - 1)) * 2u + row;
    return mix(data[first], data[second], fract(p));
}
fn master(t: f32) -> f32 { return sampleRow(t, 0u).r; }
fn band(t: f32, index: u32) -> f32 { return sampleRow(t, 1u)[index]; }
fn mountainMaster(t: f32) -> f32 {
    let raw = master(t);
    let pixelTime = max(1.f / params.width, 1.f / f32(max(2u, params.length)));
    let dt = max(mix(.0035f, .0075f, .78f) / max(params.duration, .001f), pixelTime * mix(.45f, .85f, .78f));
    let decay: f32 = mix(.70f, .86f, .78f);
    var weight = decay;
    var envelope = raw;
    for (var i = 1; i <= 8; i++) {
        let offset = dt * f32(i);
        envelope = max(envelope, max(master(t - offset), master(t + offset)) * weight);
        weight *= decay;
    }
    let blur = (master(t - dt * 2.f) + master(t - dt) * 2.f + raw * 3.f + master(t + dt) * 2.f + master(t + dt * 2.f)) / 9.f;
    envelope = max(envelope, blur * mix(.92f, 1.08f, .78f));
    return mix(raw, clamp(envelope, 0.f, 1.f), .78f * .72f);
}
fn mountainBand(t: f32, index: u32) -> f32 {
    let raw = band(t, index);
    let pixelTime = max(1.f / params.width, 1.f / f32(max(2u, params.length)));
    let baseSeconds = vec4f(.018f, .015f, .0115f, .0085f)[index];
    let radius = mix(vec4f(.85f, .75f, .65f, .50f), vec4f(1.55f, 1.35f, 1.12f, .90f), vec4f(.78f))[index];
    let dt = max(baseSeconds * mix(.55f, 1.25f, .78f) / max(params.duration, .001f), pixelTime * radius);
    let decay = mix(vec4f(.78f, .76f, .73f, .69f), vec4f(.925f, .915f, .895f, .865f), vec4f(.78f))[index];
    var envelope = raw;
    var weight = decay;
    for (var i = 1; i <= 10; i++) {
        let offset = dt * f32(i);
        envelope = max(envelope, max(band(t - offset, index), band(t + offset, index)) * weight);
        weight *= decay;
    }
    let blur = (band(t - dt * 2.f, index) + band(t - dt, index) * 2.f + raw * 3.f + band(t + dt, index) * 2.f + band(t + dt * 2.f, index)) / 9.f;
    envelope = max(envelope, blur * mix(.96f, 1.12f, .78f));
    return mix(raw, clamp(envelope, 0.f, 1.f), .78f);
}
fn gatedBand(t: f32, index: u32) -> f32 {
    let threshold = vec4f(.055f, .065f, .075f, .090f)[index];
    let exponent = vec4f(.82f, .84f, .87f, .90f)[index];
    return pow(clamp((mountainBand(t, index) - threshold) / (1.f - threshold), 0.f, 1.f), exponent);
}
@compute @workgroup_size(64)
fn analysis(@builtin(global_invocation_id) id: vec3u) {
    if (id.x > params.columns) { return; }
    let t = f32(id.x) / f32(params.columns);
    let point = min(u32(t * f32(params.length)), params.length - 1u);
    if (data[point * 2u].a < .5f) { output[id.x] = vec4f(0.f); return; }
    let a0 = pow(mountainMaster(t), .86f) * .97f;
    let a3 = min(a0 * .48f, gatedBand(t, 3u) * .56f);
    let a2 = min(a0 * .70f, max(gatedBand(t, 2u) * .70f, a3 + a0 * .040f));
    let a1 = min(a0 * .87f, max(max(gatedBand(t, 1u) * .84f, gatedBand(t, 0u) * .72f), a2 + a0 * .050f));
    output[id.x] = vec4f(a0, a1, a2, a3);
}
