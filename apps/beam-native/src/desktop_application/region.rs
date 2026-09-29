//! Monitor-sized native spotlight with anchored Solid presets and recording actions.

#[path = "region/capture.rs"]
mod capture;
#[path = "region/capture_geometry.rs"]
mod capture_geometry;
#[path = "region/events.rs"]
mod events;
#[path = "region/geometry.rs"]
mod geometry;
#[path = "region/interaction.rs"]
mod interaction;
#[path = "region/magnifier.rs"]
mod magnifier;
#[path = "region/placement.rs"]
mod placement;
#[path = "region/precision_view.rs"]
mod precision_view;
#[path = "region/services.rs"]
mod services;
#[cfg(target_os = "linux")]
#[path = "region/source_monitor.rs"]
mod source_monitor;
#[path = "region/types.rs"]
mod types;
#[path = "region/view.rs"]
mod view;

pub(crate) use services::register;
pub(crate) use types::{RegionSnapshot, RegionState};

use super::types::{NativeEvent, RegionBounds, UiAction};
use crate::ServiceRegistry;
use argui_core::{Point, Rect, Size};
use argui_platform::{WindowInputRegion, WindowKey};
use argui_runtime::{AppCommand, AppUpdate, ViewUpdate};
use geometry::{constrained, input_hole, moved};

pub(crate) const CONTROLS_SIZE: (f64, f64) = (300.0, 40.0);
pub(crate) const ACTIONS_SIZE: (f64, f64) = (620.0, 54.0);

impl RegionState {
    /// Gives the small Solid controls a snapshot only when the crop is settled.
    pub(crate) fn snapshot(&self) -> RegionSnapshot {
        let size = self.crop.map_or(Size::new(0.0, 0.0), |crop| crop.size);
        let crop = self.crop.unwrap_or(Rect::new(Point::new(0.0, 0.0), size));
        let controls = placement::controls(crop, self.viewport);
        let actions = placement::initial_actions(self.viewport);
        let (width, height) = self.capture_dimensions(size);
        let (monitor_x, monitor_y) = self
            .monitor
            .as_ref()
            .map_or((0, 0), |monitor| (monitor.x, monitor.y));
        RegionSnapshot {
            revision: self.revision,
            open: self.open,
            dragging: self.drag.is_some(),
            width,
            height,
            preset: self.preset.clone(),
            selected: self.open && self.drag.is_none() && self.crop.is_some(),
            can_record: self.open && self.drag.is_none() && self.crop.is_some_and(valid_crop),
            controls_x: monitor_x
                + (f64::from(controls.origin.x) * self.pixel_scale).round() as i32,
            controls_y: monitor_y
                + (f64::from(controls.origin.y) * self.pixel_scale).round() as i32,
            controls_width: f64::from(controls.size.width),
            controls_height: f64::from(controls.size.height),
            actions_x: monitor_x + (f64::from(actions.origin.x) * self.pixel_scale).round() as i32,
            actions_y: monitor_y + (f64::from(actions.origin.y) * self.pixel_scale).round() as i32,
            actions_width: f64::from(actions.size.width),
            actions_height: f64::from(actions.size.height),
        }
    }

    /// Requests the native mask rebuild; motion never updates the X11 input shape.
    fn repaint(&self) -> AppUpdate {
        AppUpdate::none().window(WindowKey::new("region"), ViewUpdate::Rebuild)
    }

    /// Preserves physical crop pixels and restores the native hole after a DPI change.
    fn scale_changed(&mut self, scale: f64, registry: &ServiceRegistry) -> AppUpdate {
        if !scale.is_finite() || scale <= 0.0 || scale == self.pixel_scale {
            return AppUpdate::none();
        }
        if let Some(drag) = self.drag.take() {
            self.crop = drag.previous;
        }
        let factor = (self.pixel_scale / scale) as f32;
        self.pixel_scale = scale;
        self.viewport = Size::new(self.viewport.width * factor, self.viewport.height * factor);
        self.crop = self.crop.map(|crop| {
            self.capture_rect(Rect::new(
                Point::new(crop.origin.x * factor, crop.origin.y * factor),
                Size::new(crop.size.width * factor, crop.size.height * factor),
            ))
        });
        self.magnifier = None;
        self.revision += 1;
        self.changed(registry);
        if self.passive {
            return self.repaint().command(AppCommand::SetWindowInputRegion {
                window: WindowKey::new("region"),
                region: WindowInputRegion::PassThrough,
            });
        }
        self.repaint()
            .command(AppCommand::HideWindow(WindowKey::new("regionControls")))
            .command(AppCommand::HideWindow(WindowKey::new("regionActions")))
            .command(AppCommand::SetWindowInputRegion {
                window: WindowKey::new("region"),
                region: self.input_region(),
            })
    }

    /// Uses the same clear crop for paint and OS input; its border remains draggable.
    fn input_region(&self) -> WindowInputRegion {
        if self.passive {
            return WindowInputRegion::PassThrough;
        }
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
        let scale = self.capture_scale();
        Some(
            (f64::from(width.parse::<f32>().ok()?) / f64::from(height.parse::<f32>().ok()?)
                * scale.y
                / scale.x) as f32,
        )
    }

    /// Applies a physical size or ratio to the current crop and keeps it on-screen.
    fn apply_preset(&mut self) {
        let Some(mut crop) = self.crop else {
            return;
        };
        if let Some((width, height)) = self.preset.split_once('×')
            && let (Ok(width), Ok(height)) = (width.parse::<f32>(), height.parse::<f32>())
        {
            let scale = self.capture_scale();
            let size = Size::new(width / scale.x as f32, height / scale.y as f32);
            let factor = (self.viewport.width / size.width)
                .min(self.viewport.height / size.height)
                .min(1.0);
            crop.size = Size::new(size.width * factor, size.height * factor);
            crop = moved(crop, Point::new(0.0, 0.0), self.viewport);
        }
        self.crop = Some(self.capture_rect(constrained(crop, self.ratio(), self.viewport)));
    }

    /// Publishes a settled crop for controls; raw native motion never enters QuickJS.
    fn changed(&self, registry: &ServiceRegistry) {
        if let Ok(event) = crate::json::encode(&NativeEvent::RegionChanged {
            snapshot: self.snapshot(),
        }) {
            registry.broadcast_event(&event);
        }
    }

    /// Confirms a click-through mask or cancels it, routing bounds only once.
    fn finish(&mut self, confirm: bool, registry: &ServiceRegistry) -> AppUpdate {
        if !self.open {
            if self.passive && !confirm {
                self.passive = false;
                return AppUpdate::none().command(AppCommand::HideWindow(WindowKey::new("region")));
            }
            return AppUpdate::none();
        }
        if confirm && self.drag.is_some() {
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
        self.passive = confirm;
        self.drag = None;
        self.magnifier = None;
        self.pixels = None;
        self.revision += 1;
        let event = NativeEvent::BeamUi {
            action: if confirm {
                UiAction::RegionSelected
            } else {
                UiAction::RegionCanceled
            },
            region: if confirm { region } else { None },
            source_id: if confirm {
                self.source_id.clone()
            } else {
                None
            },
        };
        if let Ok(event) = crate::json::encode(&event) {
            registry.route_event(&crate::services::ServiceResponse {
                session: u32::MAX,
                window: "main".into(),
                request_id: 0,
                outcome: crate::ServiceOutcome::Event(event),
            });
        }
        let update = self
            .repaint()
            .command(AppCommand::HideWindow(WindowKey::new("regionControls")))
            .command(AppCommand::HideWindow(WindowKey::new("regionActions")));
        if confirm {
            update.command(AppCommand::SetWindowInputRegion {
                window: WindowKey::new("region"),
                region: WindowInputRegion::PassThrough,
            })
        } else {
            update.command(AppCommand::HideWindow(WindowKey::new("region")))
        }
    }
}

/// Shares the minimum selectable UI dimensions between controls and confirmation.
fn valid_crop(crop: Rect) -> bool {
    crop.size.width.is_finite()
        && crop.size.height.is_finite()
        && crop.size.width >= 24.0
        && crop.size.height >= 24.0
}
