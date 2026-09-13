use std::{io::Cursor, mem::MaybeUninit, ptr};

use super::*;
use pipewire::spa;
use spa::{
    param::ParamType,
    pod::{
        ChoiceValue, Object, Pod, Property, Value, deserialize::PodDeserializer,
        serialize::PodSerializer,
    },
    utils::{Choice, ChoiceEnum, ChoiceFlags, SpaTypes},
};

const POD_STORAGE_SIZE: usize = 1024;
const FILTER_STORAGE_SIZE: usize = 4096;

#[repr(align(8))]
struct AlignedBytes<const N: usize>([u8; N]);

impl<const N: usize> AlignedBytes<N> {
    fn from_bytes(bytes: &[u8]) -> Self {
        assert!(bytes.len() <= N, "test pod is larger than aligned storage");
        let mut aligned = Self([0; N]);
        aligned.0[..bytes.len()].copy_from_slice(bytes);
        aligned
    }

    fn pod(&self) -> &Pod {
        Pod::from_bytes(&self.0).expect("aligned bytes should contain a valid pod")
    }
}

fn serialized(value: Value) -> Vec<u8> {
    PodSerializer::serialize(Cursor::new(Vec::new()), &value)
        .expect("test pod should serialize")
        .0
        .into_inner()
}

fn choice_range(default: i32, min: i32, max: i32) -> Value {
    Value::Choice(ChoiceValue::Int(Choice(
        ChoiceFlags::empty(),
        ChoiceEnum::Range { default, min, max },
    )))
}

fn choice_flags(default: i32) -> Value {
    Value::Choice(ChoiceValue::Int(Choice(
        ChoiceFlags::empty(),
        ChoiceEnum::Flags {
            default,
            flags: Vec::new(),
        },
    )))
}

fn buffers_pod(buffers: Value, data_type: Value) -> Vec<u8> {
    serialized(Value::Object(Object {
        type_: SpaTypes::ObjectParamBuffers.as_raw(),
        id: ParamType::Buffers.as_raw(),
        properties: vec![
            Property::new(spa::sys::SPA_PARAM_BUFFERS_buffers, buffers),
            Property::new(spa::sys::SPA_PARAM_BUFFERS_blocks, Value::Int(1)),
            Property::new(
                spa::sys::SPA_PARAM_BUFFERS_size,
                Value::Int(1920 * 1080 * 4),
            ),
            Property::new(spa::sys::SPA_PARAM_BUFFERS_stride, Value::Int(1920 * 4)),
            Property::new(spa::sys::SPA_PARAM_BUFFERS_dataType, data_type),
        ],
    }))
}

fn kwin_buffers_pod() -> Vec<u8> {
    buffers_pod(
        choice_range(3, 2, 4),
        choice_flags(1_i32 << spa::sys::SPA_DATA_MemFd),
    )
}

fn fixed_buffers_pod(count: i32) -> Vec<u8> {
    buffers_pod(
        Value::Int(count),
        choice_flags(1_i32 << spa::sys::SPA_DATA_MemFd),
    )
}

fn dma_only_buffers_pod() -> Vec<u8> {
    buffers_pod(
        choice_range(3, 2, 4),
        choice_flags(1_i32 << spa::sys::SPA_DATA_DmaBuf),
    )
}

fn decoded_object(bytes: &[u8]) -> Object {
    let (remaining, value) =
        PodDeserializer::deserialize_any_from(bytes).expect("test pod should deserialize");
    assert!(
        remaining.is_empty(),
        "test pod should have no trailing bytes"
    );
    let object = match value {
        Value::Object(object) => Some(object),
        _ => None,
    };
    object.expect("expected an object pod")
}

fn property(object: &Object, key: u32) -> &Value {
    object
        .properties
        .iter()
        .find(|property| property.key == key)
        .map(|property| &property.value)
        .expect("expected buffer property")
}

fn filter_pods(pod_bytes: &[u8], filter_bytes: &[u8]) -> Result<Vec<u8>, i32> {
    let pod_storage = AlignedBytes::<POD_STORAGE_SIZE>::from_bytes(pod_bytes);
    let filter_storage = AlignedBytes::<POD_STORAGE_SIZE>::from_bytes(filter_bytes);
    let pod = pod_storage.pod();
    let filter = filter_storage.pod();
    let mut output = AlignedBytes::<FILTER_STORAGE_SIZE>([0; FILTER_STORAGE_SIZE]);
    let mut builder = MaybeUninit::<spa::sys::spa_pod_builder>::uninit();
    let mut result = ptr::null_mut();

    // SAFETY: the builder and all pods point into live, 8-byte-aligned storage. The
    // storage remains pinned for the entire call, and the output is large enough for
    // the small object pods used by these tests.
    let result_bytes = unsafe {
        spa::sys::spa_pod_builder_init(
            builder.as_mut_ptr(),
            output.0.as_mut_ptr().cast(),
            FILTER_STORAGE_SIZE as u32,
        );
        let status = spa::sys::spa_pod_filter(
            builder.as_mut_ptr(),
            &mut result,
            pod.as_raw_ptr(),
            filter.as_raw_ptr(),
        );
        if status < 0 {
            return Err(status);
        }
        if result.is_null() {
            return Err(-libc::EINVAL);
        }
        Pod::from_raw(result.cast_const()).as_bytes().to_vec()
    };

    Ok(result_bytes)
}

#[test]
fn requests_a_pipewire_compatible_buffer_layout() {
    let bytes = buffer_parameter(negotiated(NativePixelFormat::Bgra, 1920, 1080))
        .expect("buffer parameter should serialize");
    let object = decoded_object(&bytes);
    let memory_mask = (1_i32 << spa::sys::SPA_DATA_MemPtr) | (1_i32 << spa::sys::SPA_DATA_MemFd);

    assert_eq!(object.type_, SpaTypes::ObjectParamBuffers.as_raw());
    assert_eq!(object.id, ParamType::Buffers.as_raw());
    assert_eq!(
        property(&object, spa::sys::SPA_PARAM_BUFFERS_buffers),
        &choice_range(8, 2, 8)
    );
    assert_eq!(
        property(&object, spa::sys::SPA_PARAM_BUFFERS_blocks),
        &Value::Int(1)
    );
    assert_eq!(
        property(&object, spa::sys::SPA_PARAM_BUFFERS_size),
        &Value::Int(1920 * 1080 * 4)
    );
    assert_eq!(
        property(&object, spa::sys::SPA_PARAM_BUFFERS_stride),
        &Value::Int(1920 * 4)
    );
    assert_eq!(
        property(&object, spa::sys::SPA_PARAM_BUFFERS_dataType),
        &Value::Int(memory_mask)
    );
}

#[test]
fn intersects_kwin_buffer_range_and_memfd_choice() {
    let beam = buffer_parameter(negotiated(NativePixelFormat::Bgra, 1920, 1080))
        .expect("buffer parameter should serialize");
    let result = filter_pods(&beam, &kwin_buffers_pod()).expect("KWin layout should intersect");
    let object = decoded_object(&result);

    let range = match property(&object, spa::sys::SPA_PARAM_BUFFERS_buffers) {
        Value::Choice(ChoiceValue::Int(Choice(flags, ChoiceEnum::Range { default, min, max }))) => {
            Some((flags, default, min, max))
        }
        _ => None,
    };
    let (flags, default, min, max) = range.expect("expected a negotiated buffer count range");
    assert!(flags.is_empty());
    assert_eq!((*min, *max), (2, 4));
    // SPA versions may retain the producer's preference or clamp ours to the
    // intersection. Both are valid as long as the default is inside that range.
    assert!((*min..=*max).contains(default));
    let memory = match property(&object, spa::sys::SPA_PARAM_BUFFERS_dataType) {
        Value::Choice(ChoiceValue::Int(Choice(
            flags,
            ChoiceEnum::Flags {
                default,
                flags: values,
            },
        ))) => Some((flags, default, values)),
        _ => None,
    };
    let (flags, default, values) = memory.expect("expected negotiated memory type flags");
    let memfd = 1_i32 << spa::sys::SPA_DATA_MemFd;
    assert!(flags.is_empty());
    assert_eq!(*default, memfd);
    // SPA can repeat the default mask in the choice payload. Check the
    // negotiated memory types, not that version-dependent representation.
    assert!(values.iter().all(|value| *value == memfd));
}

#[test]
fn rejects_the_old_fixed_count_but_accepts_a_fixed_eight_buffer_peer() {
    let kwin = kwin_buffers_pod();
    let old = buffers_pod(
        Value::Int(8),
        Value::Int((1_i32 << spa::sys::SPA_DATA_MemPtr) | (1_i32 << spa::sys::SPA_DATA_MemFd)),
    );
    assert_eq!(filter_pods(&old, &kwin), Err(-libc::EINVAL));

    let beam = buffer_parameter(negotiated(NativePixelFormat::Bgra, 1920, 1080))
        .expect("buffer parameter should serialize");
    assert!(filter_pods(&beam, &fixed_buffers_pod(8)).is_ok());
}

#[test]
fn rejects_buffer_counts_outside_the_supported_range_and_dma_only_memory() {
    let beam = buffer_parameter(negotiated(NativePixelFormat::Bgra, 1920, 1080))
        .expect("buffer parameter should serialize");
    for count in [1, 9] {
        assert!(
            filter_pods(&beam, &fixed_buffers_pod(count)).is_err(),
            "buffer count {count} must not intersect Beam's 2..=8 range"
        );
    }
    assert!(filter_pods(&beam, &dma_only_buffers_pod()).is_err());
}

#[test]
fn reports_stride_and_buffer_size_overflows() {
    let stride_overflow = NegotiatedFormat {
        width: u32::MAX,
        height: 1,
        pixel_format: NativePixelFormat::Bgra,
    };
    let size_overflow = NegotiatedFormat {
        width: 1_000_000,
        height: 1_000,
        pixel_format: NativePixelFormat::Bgra,
    };

    assert!(
        buffer_parameter(stride_overflow)
            .expect_err("stride should overflow")
            .to_string()
            .contains("negotiated stride overflows")
    );
    assert!(
        buffer_parameter(size_overflow)
            .expect_err("buffer size should overflow")
            .to_string()
            .contains("negotiated buffer size overflows")
    );
}
