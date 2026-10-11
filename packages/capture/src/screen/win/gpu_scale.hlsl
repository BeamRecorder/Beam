struct Vertex { float4 position : SV_Position; float2 uv : TEXCOORD0; };
Vertex vertex(uint id : SV_VertexID) {
    Vertex output;
    output.uv = float2((id << 1) & 2, id & 2);
    output.position = float4(output.uv * float2(2, -2) + float2(-1, 1), 0, 1);
    return output;
}
Texture2D image : register(t0);
SamplerState linearClamp : register(s0);
float4 pixel(Vertex input) : SV_Target { return image.Sample(linearClamp, input.uv); }
