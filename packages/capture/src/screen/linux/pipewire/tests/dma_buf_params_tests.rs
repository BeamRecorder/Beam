use super::{
    *,
    buffer_params_tests::{
        AlignedBytes, POD_STORAGE_SIZE, buffers_pod, choice_flags, choice_range, decoded_object,
        filter_pods, property, serialized,
    },
};
use pipewire::spa::{
    self,
    param::ParamType,
    pod::{ChoiceValue, Object, Property, PropertyFlags, Value},
    utils::{Choice, ChoiceEnum, ChoiceFlags, SpaTypes},
};

fn dma_only_buffers_pod(blocks: i32) -> Vec<u8> {
    buffers_pod(
        choice_range(3, 2, 4),
        blocks,
        choice_flags(1_i32 << spa::sys::SPA_DATA_DmaBuf),
    )
}

fn niri_format_pod() -> Vec<u8> {
    serialized(Value::Object(Object {
        type_: SpaTypes::ObjectParamFormat.as_raw(),
        id: ParamType::EnumFormat.as_raw(),
        properties: vec![
            Property::new(
                spa::param::format::FormatProperties::MediaType.as_raw(),
                Value::Id(spa::utils::Id(
                    spa::param::format::MediaType::Video.as_raw(),
                )),
            ),
            Property::new(
                spa::param::format::FormatProperties::MediaSubtype.as_raw(),
                Value::Id(spa::utils::Id(
                    spa::param::format::MediaSubtype::Raw.as_raw(),
                )),
            ),
            Property::new(
                spa::param::format::FormatProperties::VideoFormat.as_raw(),
                Value::Id(spa::utils::Id(
                    spa::param::video::VideoFormat::BGRx.as_raw(),
                )),
            ),
            Property {
                key: spa::sys::SPA_FORMAT_VIDEO_modifier,
                flags: PropertyFlags::MANDATORY | PropertyFlags::DONT_FIXATE,
                value: Value::Choice(ChoiceValue::Long(Choice(
                    ChoiceFlags::empty(),
                    ChoiceEnum::Enum {
                        default: 0,
                        alternatives: vec![
                            72_057_594_037_927_937,
                            72_057_594_037_927_938,
                            72_057_594_037_927_942,
                            72_057_594_037_927_944,
                            72_057_594_037_927_935,
                        ],
                    },
                ))),
            },
            Property::new(
                spa::param::format::FormatProperties::VideoSize.as_raw(),
                Value::Rectangle(spa::utils::Rectangle {
                    width: 1294,
                    height: 1410,
                }),
            ),
            Property::new(
                spa::param::format::FormatProperties::VideoFramerate.as_raw(),
                Value::Fraction(spa::utils::Fraction { num: 0, denom: 1 }),
            ),
        ],
    }))
}

#[test]
fn shm_format_rejects_niri_bgrx_with_mandatory_modifiers() {
    let beam = format_parameter().expect("format parameter should serialize");

    assert_eq!(filter_pods(&beam, &niri_format_pod()), Err(-libc::EINVAL));
}

#[test]
fn dma_format_intersects_and_fixates_niri_modifier_choices() {
    let beam = dma_buf_format_parameter().expect("DMA-BUF format should serialize");
    let filtered = filter_pods(&beam, &niri_format_pod()).expect("DMA-BUF format should intersect");
    let storage = AlignedBytes::<POD_STORAGE_SIZE>::from_bytes(&filtered);
    let offered = decoded_object(&filtered);
    let offered_modifier = offered
        .properties
        .iter()
        .find(|property| property.key == spa::sys::SPA_FORMAT_VIDEO_modifier)
        .expect("filtered format should retain a modifier");
    assert!(offered_modifier.flags.contains(PropertyFlags::DONT_FIXATE));

    let selected = 72_057_594_037_927_944;
    let fixed = fixate_modifier_parameter(storage.pod(), selected)
        .expect("selected modifier should fixate");
    let fixed = decoded_object(&fixed);
    let fixed_modifier = fixed
        .properties
        .iter()
        .find(|property| property.key == spa::sys::SPA_FORMAT_VIDEO_modifier)
        .expect("fixed format should retain a modifier");
    assert_eq!(fixed_modifier.value, Value::Long(selected as i64));
    assert!(!fixed_modifier.flags.contains(PropertyFlags::DONT_FIXATE));
    assert!(fixed_modifier.flags.contains(PropertyFlags::MANDATORY));
}

#[test]
fn dma_buffer_layout_intersects_niri_multi_plane_allocation() {
    let format = negotiated(NativePixelFormat::Bgrx, 1920, 1080)
        .with_modifier(72_057_594_037_927_944, false);
    let beam = buffer_parameter(format).expect("DMA-BUF parameters should serialize");
    let object = decoded_object(&beam);

    assert_eq!(
        property(&object, spa::sys::SPA_PARAM_BUFFERS_blocks),
        &choice_range(1, 1, 4)
    );
    assert_eq!(
        property(&object, spa::sys::SPA_PARAM_BUFFERS_dataType),
        &Value::Int(1_i32 << spa::sys::SPA_DATA_DmaBuf)
    );
    assert!(filter_pods(&beam, &dma_only_buffers_pod(2)).is_ok());
    assert!(filter_pods(&beam, &dma_only_buffers_pod(4)).is_ok());
}

#[test]
fn shm_buffer_layout_rejects_dma_only_memory() {
    let beam = buffer_parameter(negotiated(NativePixelFormat::Bgra, 1920, 1080))
        .expect("buffer parameter should serialize");

    assert!(filter_pods(&beam, &dma_only_buffers_pod(1)).is_err());
}