#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;
use spa::pod::deserialize::PodDeserializer;

fn negotiated_pod(format: spa::param::audio::AudioFormat, rate: u32, channels: u32) -> Vec<u8> {
    let mut info = AudioInfoRaw::new();
    info.set_format(format);
    info.set_rate(rate);
    info.set_channels(channels);
    let object = spa::pod::Object {
        type_: spa::utils::SpaTypes::ObjectParamFormat.as_raw(),
        id: ParamType::Format.as_raw(),
        properties: info.into(),
    };
    spa::pod::serialize::PodSerializer::serialize(Cursor::new(Vec::new()), &Value::Object(object))
        .expect("valid SPA format")
        .0
        .into_inner()
}

#[test]
fn negotiated_f32_format_keeps_exact_rate_and_channel_count() {
    let bytes = negotiated_pod(spa::param::audio::AudioFormat::F32LE, 48_000, 2);
    let pod = Pod::from_bytes(&bytes).expect("SPA pod");
    assert_eq!(
        parse_format(pod).expect("raw F32LE"),
        NegotiatedFormat {
            sample_rate: 48_000,
            channels: 2,
        }
    );
}

#[test]
fn unsupported_or_incomplete_negotiation_is_rejected() {
    let bytes = negotiated_pod(spa::param::audio::AudioFormat::S16LE, 48_000, 2);
    assert!(matches!(
        parse_format(Pod::from_bytes(&bytes).expect("SPA pod")),
        Err(AudioError::Unsupported(_))
    ));
    let bytes = negotiated_pod(spa::param::audio::AudioFormat::F32LE, 0, 2);
    assert!(matches!(
        parse_format(Pod::from_bytes(&bytes).expect("SPA pod")),
        Err(AudioError::Unsupported(_))
    ));
    let bytes = format_parameter().expect("requested format");
    assert!(parse_format(Pod::from_bytes(&bytes).expect("SPA pod")).is_err());
}

#[test]
fn requests_header_metadata_with_the_native_structure_size() {
    let bytes = header_meta_parameter().expect("header request");
    let (remaining, value) = PodDeserializer::deserialize_any_from(&bytes).expect("SPA parameter");
    assert!(remaining.is_empty());
    assert!(matches!(value, Value::Object(_)));
    let Value::Object(object) = value else { return };
    assert_eq!(object.type_, spa::utils::SpaTypes::ObjectParamMeta.as_raw());
    assert_eq!(object.id, ParamType::Meta.as_raw());
    assert!(object.properties.iter().any(|property| {
        property.key == spa::sys::SPA_PARAM_META_type
            && property.value == Value::Id(spa::utils::Id(spa::sys::SPA_META_Header))
    }));
    assert!(object.properties.iter().any(|property| {
        property.key == spa::sys::SPA_PARAM_META_size
            && property.value == Value::Int(std::mem::size_of::<spa::sys::spa_meta_header>() as i32)
    }));
}

#[test]
fn negotiated_zero_channels_are_rejected_even_at_a_valid_rate() {
    let bytes = negotiated_pod(spa::param::audio::AudioFormat::F32LE, 48_000, 0);
    assert!(matches!(
        parse_format(Pod::from_bytes(&bytes).expect("SPA pod")),
        Err(AudioError::Unsupported(reason)) if reason.contains("zero rate or channels")
    ));
}

#[test]
fn malformed_pipewire_parameter_is_rejected_before_reading_audio_fields() {
    let bytes =
        spa::pod::serialize::PodSerializer::serialize(Cursor::new(Vec::new()), &Value::Int(123))
            .expect("integer pod")
            .0
            .into_inner();
    let pod = Pod::from_bytes(&bytes).expect("SPA pod");
    assert!(matches!(parse_format(pod), Err(AudioError::Backend(_))));
}

#[test]
fn negotiated_channel_count_beyond_spa_range_is_rejected() {
    let bytes = negotiated_pod(spa::param::audio::AudioFormat::F32LE, 48_000, 65_536);
    let result = parse_format(Pod::from_bytes(&bytes).expect("SPA pod"));
    assert!(
        matches!(
            result,
            Err(AudioError::Backend(ref reason)) if reason.contains("Channel number out of range")
        ),
        "unexpected negotiation: {result:?}"
    );
}
