struct Layout { scale: vec2<f32>, padding: vec2<f32> }
@group(0) @binding(0) var frame: texture_2d<f32>;
@group(0) @binding(1) var filtering: sampler;
@group(0) @binding(2) var<uniform> viewport: Layout;
struct Vertex { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> }
@vertex fn vertex(@builtin(vertex_index) index: u32) -> Vertex {
    let positions = array<vec2<f32>, 3>(vec2(-1., -1.), vec2(3., -1.), vec2(-1., 3.));
    var output: Vertex;
    output.position = vec4(positions[index], 0., 1.);
    output.uv = positions[index] * vec2(0.5, -0.5) + vec2(0.5);
    return output;
}
@fragment fn fragment(input: Vertex) -> @location(0) vec4<f32> {
    let uv = (input.uv - vec2(0.5)) / viewport.scale + vec2(0.5);
    if any(uv < vec2(0.)) || any(uv > vec2(1.)) { return vec4(0.); }
    return textureSample(frame, filtering, uv);
}
