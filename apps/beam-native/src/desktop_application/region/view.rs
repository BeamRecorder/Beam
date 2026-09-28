//! Native crop mask derived from ARGUI gallery's screen spotlight.

use super::types::RegionState;
use argui_core::{Color, Point, Rect, Size};
use argui_text::TextStyle;
use argui_ui::{
    AlignItems, Border, CornerRadii, Element, JustifyContent, LengthPercentageAuto, Sides, auto,
    length, percent, sides,
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
            ),
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
            ),
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
            ),
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
            ),
        ];
        if let Some(crop) = self.crop {
            layers.push(
                mask(
                    at(crop.origin.x, crop.origin.y),
                    Some(crop.size.width),
                    Some(crop.size.height),
                    Color::TRANSPARENT,
                )
                .border(Border::all(2.0, self.accent)),
            );
            for (x, y) in [(x, y), (right, y), (x, bottom), (right, bottom)] {
                layers.push(
                    mask(at(x - 4.0, y - 4.0), Some(8.0), Some(8.0), self.accent)
                        .radius(CornerRadii::all(2.0))
                        .border(Border::all(1.0, self.border)),
                );
            }
            if self.drag.is_some() {
                let label = format!(
                    "{} × {}",
                    (f64::from(crop.size.width) * self.pixel_scale).round() as u32,
                    (f64::from(crop.size.height) * self.pixel_scale).round() as u32
                );
                layers.push(self.caption(
                    label,
                    (x.max(8.0)).min((self.viewport.width - 128.0).max(8.0)),
                    (y - 34.0).max(8.0),
                    Some(120.0),
                ));
            }
        } else {
            layers.push(self.caption(
                self.instruction.clone(),
                (self.viewport.width - 208.0) / 2.0,
                self.viewport.height * 0.45,
                Some(208.0),
            ));
        }
        Element::container(layers)
            .keyed("beam-region-mask")
            .user_select(argui_ui::UserSelect::None)
            .width(percent(1.0))
            .height(percent(1.0))
    }
    /// Displays centered feedback using the same theme as the crop's native controls.
    fn caption(&self, label: impl Into<String>, x: f32, y: f32, width: Option<f32>) -> Element {
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
fn at(x: f32, y: f32) -> Sides<LengthPercentageAuto> {
    Sides {
        left: length(x),
        right: auto(),
        top: length(y),
        bottom: auto(),
    }
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
