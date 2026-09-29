//! Native pointer ownership, crop resizing and cursor-aligned magnification.

use super::{
    geometry::*,
    types::{Drag, DragMode, Edge, RegionState},
    valid_crop,
};
use crate::ServiceRegistry;
use argui_core::{Point, PointerButton, PointerEvent, PointerPhase};
use argui_platform::{WindowInputRegion, WindowKey};
use argui_runtime::{AppCommand, AppUpdate};

impl RegionState {
    /// Mirrors gallery `SpotlightState::pointer`, retaining native drag ownership.
    pub(super) fn pointer(
        &mut self,
        pointer: PointerEvent,
        registry: &ServiceRegistry,
    ) -> AppUpdate {
        match pointer.phase {
            PointerPhase::Pressed if pointer.button == Some(PointerButton::Secondary) => {
                self.finish(false, registry)
            }
            PointerPhase::Pressed if pointer.button == Some(PointerButton::Primary) => {
                self.start_drag(pointer)
            }
            PointerPhase::Moved if self.drag.is_some_and(|drag| drag.id == pointer.id) => {
                self.move_pointer(pointer.position);
                self.repaint()
            }
            PointerPhase::Released | PointerPhase::Cancelled => self.finish_drag(pointer, registry),
            _ => AppUpdate::none(),
        }
    }

    fn start_drag(&mut self, pointer: PointerEvent) -> AppUpdate {
        if self.drag.is_some() {
            return AppUpdate::none();
        }
        self.revision += 1;
        let mode = self.drag_mode(pointer.position);
        self.drag = Some(Drag {
            id: pointer.id,
            origin: if matches!(mode, DragMode::Draw) {
                self.capture_point(pointer.position)
            } else {
                pointer.position
            },
            previous: self.crop,
            mode,
            grip_offset: self.grip_offset(mode, pointer.position),
        });
        if matches!(mode, DragMode::Draw) {
            let origin = self.capture_point(pointer.position);
            self.crop = Some(selection(origin, origin, self.viewport));
        }
        self.move_pointer(pointer.position);
        self.repaint()
            .command(AppCommand::SetWindowInputRegion {
                window: WindowKey::new("region"),
                region: WindowInputRegion::Full,
            })
            .command(AppCommand::HideWindow(WindowKey::new("regionControls")))
            .command(AppCommand::HideWindow(WindowKey::new("regionActions")))
    }

    fn finish_drag(&mut self, pointer: PointerEvent, registry: &ServiceRegistry) -> AppUpdate {
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
        self.magnifier = None;
        self.revision += 1;
        if self.crop.is_some_and(|rect| !valid_crop(rect)) {
            self.crop = drag.previous;
        }
        self.changed(registry);
        self.repaint().command(AppCommand::SetWindowInputRegion {
            window: WindowKey::new("region"),
            region: self.input_region(),
        })
    }

    fn drag_mode(&self, at: Point) -> DragMode {
        self.crop.map_or(DragMode::Draw, |crop| {
            corner_at(crop, at).map_or_else(
                || {
                    if let Some(edge) = edge_at(crop, at) {
                        DragMode::ResizeEdge(edge)
                    } else if contains(crop, at) {
                        DragMode::Move
                    } else {
                        DragMode::Draw
                    }
                },
                DragMode::Resize,
            )
        })
    }

    fn grip_offset(&self, mode: DragMode, at: Point) -> Point {
        if let (DragMode::Resize(corner), Some(crop)) = (mode, self.crop) {
            let opposite = opposite_corner(crop, corner);
            Point::new(
                at.x - (2.0 * crop.origin.x + crop.size.width - opposite.x),
                at.y - (2.0 * crop.origin.y + crop.size.height - opposite.y),
            )
        } else if let (DragMode::ResizeEdge(edge), Some(crop)) = (mode, self.crop) {
            match edge {
                Edge::North => Point::new(0.0, at.y - crop.origin.y),
                Edge::South => Point::new(0.0, at.y - crop.origin.y - crop.size.height),
                Edge::West => Point::new(at.x - crop.origin.x, 0.0),
                Edge::East => Point::new(at.x - crop.origin.x - crop.size.width, 0.0),
            }
        } else {
            Point::new(0.0, 0.0)
        }
    }

    /// Updates crop geometry directly from one native sample in UI coordinates.
    fn move_pointer(&mut self, at: Point) {
        let Some(drag) = self.drag else {
            return;
        };
        let cursor = self.capture_point(at);
        let at = self.capture_point(Point::new(
            at.x - drag.grip_offset.x,
            at.y - drag.grip_offset.y,
        ));
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
            (DragMode::ResizeEdge(edge), Some(previous)) => {
                resized_edge(previous, edge, at, self.ratio(), self.viewport)
            }
            _ => aspect_selection(drag.origin, at, self.ratio(), self.viewport),
        };
        let crop = self.capture_rect(crop);
        self.crop = Some(crop);
        if matches!(drag.mode, DragMode::Move) {
            self.magnifier = None;
        } else {
            self.magnify(cursor);
        }
    }
}
