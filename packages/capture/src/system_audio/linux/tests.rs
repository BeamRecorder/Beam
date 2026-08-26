#![allow(clippy::expect_used)]

use super::format::{parse_audio_format_event, peak_f32le};

use std::io::Cursor;

use pipewire::spa;
use spa::{
    param::{ParamType, format::MediaSubtype, format::MediaType},
    pod::{Pod, Value},
};

fn serialized_pod(object: spa::pod::Object) -> Vec<u8> {
    spa::pod::serialize::PodSerializer::serialize(Cursor::new(Vec::new()), &Value::Object(object))
        .expect("test pod should serialize")
        .0
        .into_inner()
}

fn non_audio_format_pod() -> Vec<u8> {
    serialized_pod(spa::pod::object!(
        spa::utils::SpaTypes::ObjectParamFormat,
        ParamType::EnumFormat,
        spa::pod::property!(
            spa::param::format::FormatProperties::MediaType,
            Id,
            MediaType::Video
        ),
        spa::pod::property!(
            spa::param::format::FormatProperties::MediaSubtype,
            Id,
            MediaSubtype::Raw
        ),
    ))
}

fn valid_audio_format_pod() -> Vec<u8> {
    let mut info = spa::param::audio::AudioInfoRaw::new();
    info.set_format(spa::param::audio::AudioFormat::F32LE);
    info.set_rate(48_000);
    info.set_channels(2);
    serialized_pod(spa::pod::Object {
        type_: spa::utils::SpaTypes::ObjectParamFormat.as_raw(),
        id: ParamType::EnumFormat.as_raw(),
        properties: info.into(),
    })
}

fn format_pod(bytes: &[u8]) -> &Pod {
    Pod::from_bytes(bytes).expect("test bytes should contain a pod")
}

#[test]
fn ignores_a_pipewire_format_clear_during_system_audio_negotiation() {
    let bytes = valid_audio_format_pod();
    let pod = format_pod(&bytes);

    assert!(
        parse_audio_format_event(Some(pod))
            .expect("valid audio format should be accepted")
            .is_some()
    );
    assert!(
        parse_audio_format_event(None)
            .expect("PipeWire format clear is a renegotiation event")
            .is_none()
    );
    assert!(
        parse_audio_format_event(Some(pod))
            .expect("audio format after renegotiation should be accepted")
            .is_some()
    );
}

#[test]
fn rejects_an_invalid_some_audio_format_but_not_a_clear_event() {
    let bytes = non_audio_format_pod();
    let pod = format_pod(&bytes);

    assert!(parse_audio_format_event(Some(pod)).is_err());
    assert!(parse_audio_format_event(None).is_ok());
}

#[test]
fn peak_uses_the_loudest_absolute_finite_sample() {
    let bytes = [0.1_f32, -0.75, f32::NAN, 0.25]
        .into_iter()
        .flat_map(f32::to_le_bytes)
        .collect::<Vec<_>>();

    assert_eq!(peak_f32le(&bytes), 0.75);
}

#[test]
fn peak_clamps_overdriven_audio_and_ignores_partial_samples() {
    let mut bytes = 1.5_f32.to_le_bytes().to_vec();
    bytes.extend_from_slice(&[1, 2, 3]);

    assert_eq!(peak_f32le(&bytes), 1.0);
}

#[test]
fn peak_is_zero_for_silence_or_non_finite_samples() {
    let bytes = [0.0_f32, f32::INFINITY]
        .into_iter()
        .flat_map(f32::to_le_bytes)
        .collect::<Vec<_>>();

    assert_eq!(peak_f32le(&bytes), 0.0);
}
