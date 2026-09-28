//! Monitor-sized native spotlight with Solid controls in separate small windows.

mod geometry;
mod services;
mod types;
mod view;

pub(crate) use services::register;
use types::{Drag, DragMode, RegionMessage};
pub(crate) use types::{RegionSnapshot, RegionState};

use super::types::{NativeEvent, RegionBounds, UiAction};
use crate::ServiceRegistry;
use argui_core::{Key, KeyState, Point, PointerButton, PointerEvent, PointerPhase, Rect, Size};
use argui_platform::{PlatformEvent, WindowInputRegion, WindowKey};
use argui_runtime::{AppCommand, AppEvent, AppUpdate, ViewUpdate};
use geometry::{
    aspect_selection, constrained, contains, corner_at, input_hole, moved, opposite_corner,
    resized, selection,
};

pub(crate) const CONTROLS_SIZE: (f64, f64) = (300.0, 42.0);
pub(crate) const ACTIONS_SIZE: (f64, f64) = (100.0, 42.0);

impl RegionState {
    /// Gives the small Solid controls a snapshot only when the crop is settled.
    pub(crate) fn snapshot(&self) -> RegionSnapshot {
        let size = self.crop.map_or(Size::new(0.0, 0.0), |crop| crop.size);
        let crop = self.crop.unwrap_or(Rect::new(Point::new(0.0, 0.0), size));
        let x = f64::from(crop.origin.x)
            .max(8.0)
            .min((f64::from(self.viewport.width) - CONTROLS_SIZE.0 - 8.0).max(8.0));
        let controls_y = (f64::from(crop.origin.y) - CONTROLS_SIZE.1 - 8.0).max(8.0);
        let actions_y = (f64::from(crop.origin.y + crop.size.height) + 8.0)
            .min((f64::from(self.viewport.height) - ACTIONS_SIZE.1 - 8.0).max(8.0));
        let (monitor_x, monitor_y) = self
            .monitor
            .as_ref()
            .map_or((0, 0), |monitor| (monitor.x, monitor.y));
        RegionSnapshot {
            revision: self.revision,
            width: (f64::from(size.width) * self.pixel_scale).round() as u32,
            height: (f64::from(size.height) * self.pixel_scale).round() as u32,
            preset: self.preset.clone(),
            selected: self.open && self.drag.is_none() && self.crop.is_some(),
            can_record: self.open && self.drag.is_none() && self.crop.is_some_and(valid_crop),
            controls_x: monitor_x + (x * self.pixel_scale).round() as i32,
            controls_y: monitor_y + (controls_y * self.pixel_scale).round() as i32,
            actions_x: monitor_x + (x * self.pixel_scale).round() as i32,
            actions_y: monitor_y + (actions_y * self.pixel_scale).round() as i32,
        }
    }

    /// Routes native pointer and message events; `registry` wakes owning actors.
    pub(crate) fn update(&mut self, event: &AppEvent, registry: &ServiceRegistry) -> AppUpdate {
        match event {
            AppEvent::Window {
                window,
                event: PlatformEvent::Pointer(pointer),
            } if window.as_str() == "region" && self.open => self.pointer(*pointer, registry),
            AppEvent::Window {
                window,
                event: PlatformEvent::Keyboard(input),
            } if window.as_str() == "region" && self.open && input.state == KeyState::Pressed => {
                match input.key {
                    Key::Escape => self.finish(false, registry),
                    Key::Enter => self.finish(true, registry),
                    _ => AppUpdate::none(),
                }
            }
            AppEvent::HostMessage { window, message } if window.as_str() == "region" => {
                let result = crate::json::parse::<RegionMessage>(message);
                match result {
                    Ok(RegionMessage::Confirm) => self.finish(true, registry),
                    Ok(RegionMessage::Cancel) => self.finish(false, registry),
                    Ok(RegionMessage::Present { revision }) => {
                        if self.open
                            && self.drag.is_none()
                            && self.crop.is_some()
                            && revision == self.revision
                        {
                            AppUpdate::none()
                                .command(AppCommand::ShowWindow(WindowKey::new("regionControls")))
                                .command(AppCommand::ShowWindow(WindowKey::new("regionActions")))
                        } else {
                            AppUpdate::none()
                        }
                    }
                    Ok(RegionMessage::Preset { value }) if self.open && self.drag.is_none() => {
                        self.preset = value;
                        self.apply_preset();
                        self.revision += 1;
                        self.changed(registry);
                        self.repaint().command(AppCommand::SetWindowInputRegion {
                            window: WindowKey::new("region"),
                            region: self.input_region(),
                        })
                    }
                    Ok(RegionMessage::Preset { .. }) => AppUpdate::none(),
                    Ok(RegionMessage::Refresh) => self.repaint(),
                    Err(error) => {
                        eprintln!("Beam region message: {error}");
                        AppUpdate::none()
                    }
                }
            }
            AppEvent::Window {
                window,
                event: PlatformEvent::CloseRequested,
            } if window.as_str() == "region" => self.finish(false, registry),
            _ => AppUpdate::none(),
        }
    }

    /// Mirrors gallery `SpotlightState::pointer`, retaining native drag ownership.
    fn pointer(&mut self, pointer: PointerEvent, registry: &ServiceRegistry) -> AppUpdate {
        let key = WindowKey::new("region");
        match pointer.phase {
            PointerPhase::Pressed if pointer.button == Some(PointerButton::Secondary) => {
                self.finish(false, registry)
            }
            PointerPhase::Pressed if pointer.button == Some(PointerButton::Primary) => {
                if self.drag.is_some() {
                    return AppUpdate::none();
                }
                self.revision += 1;
                let mode = self.crop.map_or(DragMode::Draw, |crop| {
                    corner_at(crop, pointer.position).map_or_else(
                        || {
                            if contains(crop, pointer.position) {
                                DragMode::Move
                            } else {
                                DragMode::Draw
                            }
                        },
                        DragMode::Resize,
                    )
                });
                self.drag = Some(Drag {
                    id: pointer.id,
                    origin: pointer.position,
                    previous: self.crop,
                    mode,
                });
                if matches!(mode, DragMode::Draw) {
                    self.crop = Some(selection(pointer.position, pointer.position, self.viewport));
                }
                self.repaint()
                    .command(AppCommand::SetWindowInputRegion {
                        window: key,
                        region: WindowInputRegion::Full,
                    })
                    .command(AppCommand::HideWindow(WindowKey::new("regionControls")))
                    .command(AppCommand::HideWindow(WindowKey::new("regionActions")))
            }
            PointerPhase::Moved if self.drag.is_some_and(|drag| drag.id == pointer.id) => {
                self.move_pointer(pointer.position);
                self.repaint()
            }
            PointerPhase::Released | PointerPhase::Cancelled => {
                let Some(drag) = self.drag else {
                    return AppUpdate::none();
                };
                if drag.id != pointer.id
                    || (pointer.phase == PointerPhase::Released
                        && pointer.button != Some(PointerButton::Primary))
                {
                    return AppUpdate::none();
                }
                if pointer.phase == PointerPhase::Cancelled {
                    self.crop = drag.previous;
                } else {
                    self.move_pointer(pointer.position);
                }
                self.drag = None;
                self.revision += 1;
                if self.crop.is_some_and(|rect| !valid_crop(rect)) {
                    self.crop = drag.previous;
                }
                self.changed(registry);
                self.repaint().command(AppCommand::SetWindowInputRegion {
                    window: key,
                    region: self.input_region(),
                })
            }
            _ => AppUpdate::none(),
        }
    }

    /// Updates crop geometry directly from one native sample in UI coordinates.
    fn move_pointer(&mut self, at: Point) {
        let Some(drag) = self.drag else {
            return;
        };
        let crop = match (drag.mode, drag.previous) {
            (DragMode::Move, Some(previous)) => moved(
                previous,
                Point::new(at.x - drag.origin.x, at.y - drag.origin.y),
                self.viewport,
            ),
            (DragMode::Resize(corner), Some(previous)) => {
                if self.ratio().is_some() {
                    aspect_selection(
                        opposite_corner(previous, corner),
                        at,
                        self.ratio(),
                        self.viewport,
                    )
                } else {
                    resized(previous, corner, at, self.viewport)
                }
            }
            _ => aspect_selection(drag.origin, at, self.ratio(), self.viewport),
        };
        self.crop = Some(crop);
    }

    /// Requests the native mask rebuild; motion never updates the X11 input shape.
    fn repaint(&self) -> AppUpdate {
        AppUpdate::none().window(WindowKey::new("region"), ViewUpdate::Rebuild)
    }

    /// Uses the same clear crop for paint and OS input; its border remains draggable.
    fn input_region(&self) -> WindowInputRegion {
        if self.drag.is_some() || !self.input_holes {
            return WindowInputRegion::Full;
        }
        self.crop
            .and_then(input_hole)
            .map_or(WindowInputRegion::Full, WindowInputRegion::Exclude)
    }

    /// Resolves both aspect-only and physical-pixel presets to their ratio.
    fn ratio(&self) -> Option<f32> {
        let separator = if self.preset.contains('×') {
            '×'
        } else {
            ':'
        };
        let (width, height) = self.preset.split_once(separator)?;
        Some(width.parse::<f32>().ok()? / height.parse::<f32>().ok()?)
    }

    /// Applies a physical size or ratio to the current crop and keeps it on-screen.
    fn apply_preset(&mut self) {
        let Some(mut crop) = self.crop else {
            return;
        };
        if let Some((width, height)) = self.preset.split_once('×')
            && let (Ok(width), Ok(height)) = (width.parse::<f32>(), height.parse::<f32>())
        {
            let size = Size::new(
                width / self.pixel_scale as f32,
                height / self.pixel_scale as f32,
            );
            let factor = (self.viewport.width / size.width)
                .min(self.viewport.height / size.height)
                .min(1.0);
            crop.size = Size::new(size.width * factor, size.height * factor);
            crop = moved(crop, Point::new(0.0, 0.0), self.viewport);
        }
        self.crop = Some(constrained(crop, self.ratio(), self.viewport));
    }

    /// Publishes a settled crop for controls; raw native motion never enters QuickJS.
    fn changed(&self, registry: &ServiceRegistry) {
        if let Ok(event) = crate::json::encode(&NativeEvent::RegionChanged {
            snapshot: self.snapshot(),
        }) {
            registry.broadcast_event(&event);
        }
    }

    /// Ends selection, hides all crop windows, and sends normalized engine bounds.
    fn finish(&mut self, confirm: bool, registry: &ServiceRegistry) -> AppUpdate {
        if !self.open || (confirm && self.drag.is_some()) {
            return AppUpdate::none();
        }
        let region = self.crop.filter(|crop| valid_crop(*crop)).map(|crop| {
            let x = f64::from(crop.origin.x) / f64::from(self.viewport.width);
            let y = f64::from(crop.origin.y) / f64::from(self.viewport.height);
            RegionBounds {
                x,
                y,
                width: (f64::from(crop.size.width) / f64::from(self.viewport.width)).min(1.0 - x),
                height: (f64::from(crop.size.height) / f64::from(self.viewport.height))
                    .min(1.0 - y),
            }
        });
        if confirm && region.is_none() {
            return AppUpdate::none();
        }
        self.open = false;
        self.drag = None;
        self.revision += 1;
        let event = NativeEvent::BeamUi {
            action: if confirm {
                UiAction::RegionSelected
            } else {
                UiAction::RegionCanceled
            },
            region: if confirm { region } else { None },
            source_id: None,
        };
        if let Ok(event) = crate::json::encode(&event) {
            registry.route_event(&crate::services::ServiceResponse {
                session: u32::MAX,
                window: "main".into(),
                request_id: 0,
                outcome: crate::ServiceOutcome::Event(event),
            });
        }
        AppUpdate::none()
            .command(AppCommand::HideWindow(WindowKey::new("region")))
            .command(AppCommand::HideWindow(WindowKey::new("regionControls")))
            .command(AppCommand::HideWindow(WindowKey::new("regionActions")))
    }
}

/// Shares the minimum selectable UI dimensions between controls and confirmation.
fn valid_crop(crop: Rect) -> bool {
    crop.size.width.is_finite()
        && crop.size.height.is_finite()
        && crop.size.width >= 24.0
        && crop.size.height >= 24.0
}

#[cfg(test)]
#[path = "../../test/desktop_application/region/pointer.rs"]
mod tests;
