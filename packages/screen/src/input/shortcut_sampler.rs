use std::collections::{HashMap, HashSet};

use crate::input::{InputEvent, InputKey, InputModifier};

const MODIFIERS: [InputModifier; 4] = [
    InputModifier::Control,
    InputModifier::Shift,
    InputModifier::Alt,
    InputModifier::Meta,
];

const KEYS: [(InputKey, bool); 63] = [
    (InputKey::A, true),
    (InputKey::B, true),
    (InputKey::C, true),
    (InputKey::D, true),
    (InputKey::E, true),
    (InputKey::F, true),
    (InputKey::G, true),
    (InputKey::H, true),
    (InputKey::I, true),
    (InputKey::J, true),
    (InputKey::K, true),
    (InputKey::L, true),
    (InputKey::M, true),
    (InputKey::N, true),
    (InputKey::O, true),
    (InputKey::P, true),
    (InputKey::Q, true),
    (InputKey::R, true),
    (InputKey::S, true),
    (InputKey::T, true),
    (InputKey::U, true),
    (InputKey::V, true),
    (InputKey::W, true),
    (InputKey::X, true),
    (InputKey::Y, true),
    (InputKey::Z, true),
    (InputKey::Digit0, true),
    (InputKey::Digit1, true),
    (InputKey::Digit2, true),
    (InputKey::Digit3, true),
    (InputKey::Digit4, true),
    (InputKey::Digit5, true),
    (InputKey::Digit6, true),
    (InputKey::Digit7, true),
    (InputKey::Digit8, true),
    (InputKey::Digit9, true),
    (InputKey::ArrowUp, false),
    (InputKey::ArrowDown, false),
    (InputKey::ArrowLeft, false),
    (InputKey::ArrowRight, false),
    (InputKey::Escape, false),
    (InputKey::Enter, false),
    (InputKey::Tab, false),
    (InputKey::Backspace, false),
    (InputKey::Delete, false),
    (InputKey::Insert, false),
    (InputKey::Home, false),
    (InputKey::End, false),
    (InputKey::PageUp, false),
    (InputKey::PageDown, false),
    (InputKey::Space, true),
    (InputKey::F1, false),
    (InputKey::F2, false),
    (InputKey::F3, false),
    (InputKey::F4, false),
    (InputKey::F5, false),
    (InputKey::F6, false),
    (InputKey::F7, false),
    (InputKey::F8, false),
    (InputKey::F9, false),
    (InputKey::F10, false),
    (InputKey::F11, false),
    (InputKey::F12, false),
];

#[derive(Debug, Clone)]
struct ActiveShortcut {
    modifiers: Vec<InputModifier>,
}

#[derive(Debug, Default)]
pub struct ShortcutSampler {
    previous_keys: HashSet<InputKey>,
    active: HashMap<InputKey, ActiveShortcut>,
}

impl ShortcutSampler {
    pub fn sample(
        &mut self,
        session_ns: u64,
        modifier_pressed: impl Fn(InputModifier) -> bool,
        key_pressed: impl Fn(InputKey) -> bool,
    ) -> Vec<InputEvent> {
        let modifiers = MODIFIERS
            .into_iter()
            .filter(|modifier| modifier_pressed(*modifier))
            .collect::<Vec<_>>();
        let safe_printable = modifiers.iter().any(|modifier| {
            matches!(
                modifier,
                InputModifier::Control | InputModifier::Alt | InputModifier::Meta
            )
        });
        let mut events = Vec::new();
        for (key, printable) in KEYS {
            let pressed = key_pressed(key);
            let was_pressed = self.previous_keys.contains(&key);
            if pressed && !was_pressed {
                self.previous_keys.insert(key);
                if !printable || safe_printable {
                    self.active.insert(
                        key,
                        ActiveShortcut {
                            modifiers: modifiers.clone(),
                        },
                    );
                    events.push(InputEvent::Shortcut {
                        session_ns,
                        pressed: true,
                        modifiers: modifiers.clone(),
                        key,
                    });
                }
            } else if !pressed && was_pressed {
                self.previous_keys.remove(&key);
                if let Some(active) = self.active.remove(&key) {
                    events.push(InputEvent::Shortcut {
                        session_ns,
                        pressed: false,
                        modifiers: active.modifiers,
                        key,
                    });
                }
            }
        }
        events
    }
}
