use capture::input::{InputEvent, InputKey, InputModifier, ShortcutSampler};

#[test]
fn held_shortcut_emits_one_press_and_one_release() {
    let mut sampler = ShortcutSampler::default();
    let held = |key| key == InputKey::A;
    let first = sampler.sample(1, |modifier| modifier == InputModifier::Control, held);
    let second = sampler.sample(2, |modifier| modifier == InputModifier::Control, held);
    let released = sampler.sample(3, |modifier| modifier == InputModifier::Control, |_| false);
    assert_eq!(first.len(), 1);
    assert!(second.is_empty());
    assert_eq!(released.len(), 1);
    assert!(matches!(
        first[0],
        InputEvent::Shortcut { pressed: true, .. }
    ));
    assert!(matches!(
        released[0],
        InputEvent::Shortcut { pressed: false, .. }
    ));
}
