#![cfg(test)]
use super::hardware_pcm;

#[test]
fn only_resolvable_numeric_capture_pcm_ids_are_hardware_candidates() {
    assert_eq!(hardware_pcm("plughw:CARD=2,DEV=1"), Some((2, 1)));
    assert_eq!(hardware_pcm("plughw:CARD=0,DEV=0"), Some((0, 0)));
    for id in [
        "default",
        "null",
        "hw:CARD=0,DEV=0",
        "plughw:CARD=PCH,DEV=0",
        "plughw:CARD=1,DEV=0,SUBDEV=2",
        "plughw:CARD=1,DEV=",
        "plughw:CARD=1,DEV=2,DEV=3",
    ] {
        assert_eq!(hardware_pcm(id), None, "{id}");
    }
}
