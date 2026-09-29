struct Params { length: u32, columns: u32, width: f32, duration: f32 }
@group(0) @binding(0) var<storage, read> envelopes: array<vec4f>;
@group(0) @binding(1) var<uniform> params: Params;
struct Vertex { @builtin(position) position: vec4f, @location(0) color: vec3f }
@vertex fn vertex(@builtin(vertex_index) id: u32, @builtin(instance_index) layer: u32) -> Vertex {
    let column = id / 2u;
    let t = f32(column) / f32(params.columns);
    let amplitude = select(0., envelopes[column][layer], id % 2u == 1u);
    var result: Vertex;
    result.position = vec4f(t * 2. - 1., amplitude * 2. - 1., 0., 1.);
    let gray = vec4f(.955, .770, .565, .350)[layer];
    // Argui's sRGB target encodes linear output; preserve Blick's authored grays.
    result.color = vec3f(pow((gray + .055) / 1.055, 2.4));
    return result;
}
@fragment fn fragment(vertex: Vertex) -> @location(0) vec4f { return vec4f(vertex.color, 1.); }
