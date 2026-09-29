//! Native crop mask derived from ARGUI gallery's screen spotlight.

use super::{placement, types::RegionState};
use argui_core::{Color, Point, Rect, Size};
use argui_text::{TextStyle, TextWrap};
use argui_ui::{
    AlignItems, Border, CornerRadii, CursorIcon, Element, Interaction, JustifyContent,
    LengthPercentageAuto, Sides, auto, length, percent, sides,
};

impl RegionState {
    /// Paints four absolute masks from the exact rectangle used for native input.
    pub(crate) fn view(&self) -> Element {
        let hole = self
            .crop
            .unwrap_or(Rect::new(Point::new(0.0, 0.0), Size::new(0.0, 0.0)));
        let x = hole.origin.x;
        let y = hole.origin.y;
        let right = x + hole.size.width;
        let bottom = y + hole.size.height;
        let dim = self.dim;
        let mut layers = vec![
            mask(
                Sides {
                    left: length(0.0),
                    right: length(0.0),
                    top: length(0.0),
                    bottom: auto(),
                },
                None,
                Some(y),
                dim,
            )
            .keyed("region-dim-top"),
            mask(
                Sides {
                    left: length(0.0),
                    right: auto(),
                    top: length(y),
                    bottom: auto(),
                },
                Some(x),
                Some(hole.size.height),
                dim,
            )
            .keyed("region-dim-left"),
            mask(
                Sides {
                    left: length(right),
                    right: length(0.0),
                    top: length(y),
                    bottom: auto(),
                },
                None,
                Some(hole.size.height),
                dim,
            )
            .keyed("region-dim-right"),
            mask(
                Sides {
                    left: length(0.0),
                    right: length(0.0),
                    top: length(bottom),
                    bottom: length(0.0),
                },
                None,
                None,
                dim,
            )
            .keyed("region-dim-bottom"),
        ];
        if let Some(crop) = self
            .crop
            .filter(|crop| crop.size.width > 0.0 && crop.size.height > 0.0)
            .filter(|_| !self.passive)
        {
            let stroke = (2.0 * self.pixel_scale).round().max(1.0) as f32 / self.pixel_scale as f32;
            for (key, edge) in [
                (
                    "region-edge-top",
                    Rect::new(Point::new(x, y), Size::new(crop.size.width, stroke)),
                ),
                (
                    "region-edge-bottom",
                    Rect::new(
                        Point::new(x, (bottom - stroke).max(y)),
                        Size::new(crop.size.width, stroke),
                    ),
                ),
                (
                    "region-edge-left",
                    Rect::new(Point::new(x, y), Size::new(stroke, crop.size.height)),
                ),
                (
                    "region-edge-right",
                    Rect::new(
                        Point::new((right - stroke).max(x), y),
                        Size::new(stroke, crop.size.height),
                    ),
                ),
            ] {
                layers.push(layer(key, edge, self.accent));
            }
            let handle =
                (4.0 * self.pixel_scale).round().max(1.0) as f32 * 2.0 / self.pixel_scale as f32;
            for (key, x, y) in [
                ("region-nw", x, y),
                ("region-ne", right, y),
                ("region-sw", x, bottom),
                ("region-se", right, bottom),
            ] {
                layers.push(
                    layer(
                        key,
                        Rect::new(
                            Point::new(x - handle / 2.0, y - handle / 2.0),
                            Size::new(handle, handle),
                        ),
                        self.accent,
                    )
                    .radius(CornerRadii::all(2.0)),
                );
            }
            // These native hit regions mirror the pointer geometry exactly. The
            // outer band resizes; its inner half remains available for moving.
            for (key, rect, cursor) in [
                (
                    "region-move-top",
                    Rect::new(Point::new(x, y), Size::new(crop.size.width, 8.0)),
                    CursorIcon::Move,
                ),
                (
                    "region-move-bottom",
                    Rect::new(Point::new(x, bottom - 8.0), Size::new(crop.size.width, 8.0)),
                    CursorIcon::Move,
                ),
                (
                    "region-move-left",
                    Rect::new(Point::new(x, y), Size::new(8.0, crop.size.height)),
                    CursorIcon::Move,
                ),
                (
                    "region-move-right",
                    Rect::new(Point::new(right - 8.0, y), Size::new(8.0, crop.size.height)),
                    CursorIcon::Move,
                ),
                (
                    "region-resize-n",
                    Rect::new(Point::new(x, y - 4.0), Size::new(crop.size.width, 8.0)),
                    CursorIcon::NsResize,
                ),
                (
                    "region-resize-s",
                    Rect::new(Point::new(x, bottom - 4.0), Size::new(crop.size.width, 8.0)),
                    CursorIcon::NsResize,
                ),
                (
                    "region-resize-w",
                    Rect::new(Point::new(x - 4.0, y), Size::new(8.0, crop.size.height)),
                    CursorIcon::EwResize,
                ),
                (
                    "region-resize-e",
                    Rect::new(Point::new(right - 4.0, y), Size::new(8.0, crop.size.height)),
                    CursorIcon::EwResize,
                ),
                (
                    "region-resize-nw",
                    Rect::new(Point::new(x - 8.0, y - 8.0), Size::new(16.0, 16.0)),
                    CursorIcon::NwseResize,
                ),
                (
                    "region-resize-ne",
                    Rect::new(Point::new(right - 8.0, y - 8.0), Size::new(16.0, 16.0)),
                    CursorIcon::NeswResize,
                ),
                (
                    "region-resize-sw",
                    Rect::new(Point::new(x - 8.0, bottom - 8.0), Size::new(16.0, 16.0)),
                    CursorIcon::NeswResize,
                ),
                (
                    "region-resize-se",
                    Rect::new(Point::new(right - 8.0, bottom - 8.0), Size::new(16.0, 16.0)),
                    CursorIcon::NwseResize,
                ),
            ] {
                layers.push(
                    Element::container([])
                        .keyed(key)
                        .absolute(at(rect.origin.x, rect.origin.y))
                        .width(length(rect.size.width))
                        .height(length(rect.size.height))
                        .interaction(Interaction::default().cursor(cursor)),
                );
            }
            if self.drag.is_some() {
                let (width, height) = self.capture_dimensions(crop.size);
                let label = format!("{} × {}", width, height);
                let rect = placement::dimensions(crop, self.viewport);
                layers.push(self.dimensions_caption(label, rect));
            }
        } else if self.crop.is_none() {
            layers.push(self.caption(
                self.instruction.clone(),
                (self.viewport.width - 208.0) / 2.0,
                self.viewport.height * 0.45,
                Some(208.0),
            ));
        }
        if let Some(magnifier) = &self.magnifier {
            layers.push(self.precision_view(magnifier));
        }
        Element::container(layers)
            .keyed("beam-region-mask")
            .user_select(argui_ui::UserSelect::None)
            .interaction(Interaction::default().cursor(CursorIcon::Crosshair))
            .width(percent(1.0))
            .height(percent(1.0))
    }
    /// Keeps live dimensions as compact as the settled, themed measurement pill.
    fn dimensions_caption(&self, label: String, rect: Rect) -> Element {
        let text = Element::text(label).text_style(TextStyle {
            font_size: 11.0,
            line_height: 16.0,
            weight: 600,
            color: self.foreground,
            wrap: TextWrap::None,
            ..TextStyle::default()
        });
        Element::row([text])
            .keyed("region-dimensions")
            .absolute(at(rect.origin.x, rect.origin.y))
            .max_width(length(rect.size.width))
            .height(length(rect.size.height))
            .align_items(AlignItems::CENTER)
            .justify_content(JustifyContent::CENTER)
            .background(self.surface)
            .border(Border::all(1.0, self.border))
            .radius(CornerRadii::all(11.0))
            .padding(sides(6.0, 0.0))
    }

    /// Displays centered feedback using the same theme as the crop's native controls.
    pub(super) fn caption(
        &self,
        label: impl Into<String>,
        x: f32,
        y: f32,
        width: Option<f32>,
    ) -> Element {
        let text = Element::text(label.into()).text_style(TextStyle {
            font_size: 12.0,
            line_height: 18.0,
            color: self.foreground,
            ..TextStyle::default()
        });
        let mut element = Element::row([text])
            .absolute(at(x, y))
            .height(length(28.0))
            .align_items(AlignItems::CENTER)
            .justify_content(JustifyContent::CENTER)
            .background(self.surface)
            .border(Border::all(1.0, self.border))
            .radius(CornerRadii::all(7.0))
            .padding(sides(8.0, 0.0));
        if let Some(width) = width {
            element = element.width(length(width));
        }
        element
    }
}

/// Anchors a crop layer without adding a second block to the layout flow.
pub(super) fn at(x: f32, y: f32) -> Sides<LengthPercentageAuto> {
    Sides {
        left: length(x),
        right: auto(),
        top: length(y),
        bottom: auto(),
    }
}

/// Paints one retained, axis-aligned layer in the crop's pixel-snapped coordinates.
pub(super) fn layer(key: &str, rect: Rect, color: Color) -> Element {
    mask(
        at(rect.origin.x, rect.origin.y),
        Some(rect.size.width),
        Some(rect.size.height),
        color,
    )
    .keyed(key)
}

/// Creates one translucent side with the same absolute insets as the gallery.
fn mask(
    inset: Sides<LengthPercentageAuto>,
    width: Option<f32>,
    height: Option<f32>,
    color: Color,
) -> Element {
    let mut element = Element::container([]).absolute(inset).background(color);
    if let Some(width) = width {
        element = element.width(length(width.max(0.0)));
    }
    if let Some(height) = height {
        element = element.height(length(height.max(0.0)));
    }
    element
}
