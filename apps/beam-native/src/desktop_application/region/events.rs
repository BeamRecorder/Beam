//! Window input and host-message routing for the native region selector.

use super::{RegionState, geometry::constrained, types::RegionMessage};
use crate::ServiceRegistry;
use argui_core::{Key, KeyInput, KeyState, PointerEvent, PointerPhase, Size};
use argui_platform::{PlatformEvent, WindowKey, WindowLevel};
use argui_runtime::{AppCommand, AppEvent, AppUpdate};

impl RegionState {
    /// Routes one window or host event without changing pointer ownership rules.
    pub(crate) fn update(&mut self, event: &AppEvent, registry: &ServiceRegistry) -> AppUpdate {
        match event {
            AppEvent::HostMessage { window, message } if window.as_str() == "region" => {
                self.host_message(message, registry)
            }
            AppEvent::Window { window, event } if window.as_str() == "region" => {
                self.window_event(event, registry)
            }
            _ => AppUpdate::none(),
        }
    }

    fn window_event(&mut self, event: &PlatformEvent, registry: &ServiceRegistry) -> AppUpdate {
        if matches!(event, PlatformEvent::CloseRequested) {
            return self.finish(false, registry);
        }
        if self.passive {
            return match event {
                PlatformEvent::ScaleFactorChanged(scale) => self.scale_changed(*scale, registry),
                PlatformEvent::Resized { width, height } => self.viewport_resized(*width, *height),
                PlatformEvent::Focused(true) | PlatformEvent::VisibilityChanged(true) => {
                    AppUpdate::none().command(AppCommand::SetWindowLevel {
                        window: WindowKey::new("region"),
                        level: WindowLevel::AlwaysOnTop,
                    })
                }
                _ => AppUpdate::none(),
            };
        }
        if !self.open {
            return AppUpdate::none();
        }
        match event {
            PlatformEvent::Pointer(pointer) => self.pointer(*pointer, registry),
            PlatformEvent::Keyboard(input) => self.keyboard_input(input, registry),
            PlatformEvent::ScaleFactorChanged(scale) => self.scale_changed(*scale, registry),
            PlatformEvent::Resized { width, height } => self.viewport_resized(*width, *height),
            PlatformEvent::Focused(false) => self.cancel_drag(registry),
            _ => AppUpdate::none(),
        }
    }

    fn keyboard_input(&mut self, input: &KeyInput, registry: &ServiceRegistry) -> AppUpdate {
        if input.state != KeyState::Pressed {
            return AppUpdate::none();
        }
        match input.key {
            Key::Escape => self.finish(false, registry),
            Key::Enter => self.finish(true, registry),
            _ => AppUpdate::none(),
        }
    }

    fn host_message(&mut self, message: &str, registry: &ServiceRegistry) -> AppUpdate {
        match crate::json::parse::<RegionMessage>(message) {
            Ok(RegionMessage::Confirm) => self.finish(true, registry),
            Ok(RegionMessage::Cancel) => self.finish(false, registry),
            Ok(RegionMessage::Present { revision }) => self.present_controls(revision),
            Ok(RegionMessage::Preset { value }) => self.select_preset(value, registry),
            Ok(RegionMessage::Refresh) => {
                self.changed(registry);
                self.repaint()
            }
            Err(error) => {
                eprintln!("Beam region message: {error}");
                AppUpdate::none()
            }
        }
    }

    fn present_controls(&self, revision: u64) -> AppUpdate {
        if !self.open || self.drag.is_some() || revision != self.revision {
            return AppUpdate::none();
        }
        let actions = WindowKey::new("regionActions");
        let controls = WindowKey::new("regionControls");
        let update = AppUpdate::none()
            .command(AppCommand::ShowWindow(actions.clone()))
            .command(AppCommand::SetWindowLevel {
                window: actions,
                level: WindowLevel::AlwaysOnTop,
            });
        if self.crop.is_some() {
            update
                .command(AppCommand::ShowWindow(controls.clone()))
                .command(AppCommand::SetWindowLevel {
                    window: controls,
                    level: WindowLevel::AlwaysOnTop,
                })
        } else {
            update.command(AppCommand::HideWindow(controls))
        }
    }

    fn select_preset(&mut self, value: String, registry: &ServiceRegistry) -> AppUpdate {
        if !self.open || self.drag.is_some() {
            return AppUpdate::none();
        }
        self.preset = value;
        self.apply_preset();
        self.revision += 1;
        self.changed(registry);
        self.repaint().command(AppCommand::SetWindowInputRegion {
            window: WindowKey::new("region"),
            region: self.input_region(),
        })
    }

    fn viewport_resized(&mut self, width: u32, height: u32) -> AppUpdate {
        if width > 0 && height > 0 {
            self.viewport = Size::new(
                (width as f64 / self.pixel_scale) as f32,
                (height as f64 / self.pixel_scale) as f32,
            );
            self.crop = self
                .crop
                .map(|crop| self.capture_rect(constrained(crop, None, self.viewport)));
        }
        self.repaint().command(AppCommand::SetWindowInputRegion {
            window: WindowKey::new("region"),
            region: self.input_region(),
        })
    }

    fn cancel_drag(&mut self, registry: &ServiceRegistry) -> AppUpdate {
        let Some(drag) = self.drag else {
            return AppUpdate::none();
        };
        self.pointer(
            PointerEvent {
                id: drag.id,
                ..PointerEvent::mouse(PointerPhase::Cancelled, drag.origin)
            },
            registry,
        )
    }
}
