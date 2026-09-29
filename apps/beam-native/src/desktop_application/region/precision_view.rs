//! Native pixel magnification with a boundary crosshair and desktop coordinates.

use super::{
    geometry::pixel_point,
    magnifier::{SAMPLE_SIZE, ZOOM},
    placement,
    types::{Magnifier, RegionState},
    view::{at, layer},
};
use argui_core::{Point, Rect, Size};
use argui_ui::{Border, CornerRadii, Element, ImageFit, ImageSampling, length};

impl RegionState {
    /// Paints the native sample with no filtering and an exact pixel-boundary marker.
    pub(super) fn precision_view(&self, magnifier: &Magnifier) -> Element {
        let inset = (6.0 * self.pixel_scale).round() as f32 / self.pixel_scale as f32;
        let available = (self.viewport.width - inset * 2.0)
            .min(self.viewport.height - inset * 2.0 - 44.0)
            .max(SAMPLE_SIZE as f32);
        let zoom = ((available / SAMPLE_SIZE as f32).min(ZOOM) * self.pixel_scale as f32)
            .floor()
            .max(1.0)
            / self.pixel_scale as f32;
        let extent = SAMPLE_SIZE as f32 * zoom;
        let size = Size::new(extent + inset * 2.0, extent + inset * 2.0 + 44.0);
        let rect = placement::feedback(magnifier.at, size, self.viewport);
        let origin = pixel_point(rect.origin, self.viewport, self.pixel_scale);
        let one_pixel = 1.0 / self.pixel_scale as f32;
        let image = Element::image(magnifier.image.id)
            .keyed("region-magnifier-pixels")
            .absolute(at(inset, inset))
            .width(length(extent))
            .height(length(extent))
            .image_fit(ImageFit::Fill)
            .image_sampling(ImageSampling::Nearest);
        let center = inset + extent / 2.0;
        let vertical = Rect::new(Point::new(center, inset), Size::new(one_pixel, extent));
        let horizontal = Rect::new(Point::new(inset, center), Size::new(extent, one_pixel));
        let monitor = self
            .monitor
            .as_ref()
            .map_or((0, 0), |monitor| (monitor.x, monitor.y));
        let x = monitor.0 + (f64::from(magnifier.at.x) * self.pixel_scale).round() as i32;
        let y = monitor.1 + (f64::from(magnifier.at.y) * self.pixel_scale).round() as i32;
        let crop = self.crop.map_or(Size::new(0.0, 0.0), |crop| crop.size);
        let (width, height) = self.capture_dimensions(crop);
        let label = format!("{width} × {height}");
        Element::container([
            image,
            layer(
                "region-crosshair-vertical-contrast",
                Rect::new(
                    Point::new(center - one_pixel, inset),
                    Size::new(one_pixel * 3.0, extent),
                ),
                self.surface,
            ),
            layer(
                "region-crosshair-horizontal-contrast",
                Rect::new(
                    Point::new(inset, center - one_pixel),
                    Size::new(extent, one_pixel * 3.0),
                ),
                self.surface,
            ),
            layer("region-crosshair-vertical", vertical, self.accent),
            layer("region-crosshair-horizontal", horizontal, self.accent),
            self.caption(
                format!("X {x} · Y {y}"),
                1.0,
                extent + 10.0,
                Some(size.width - 2.0),
            )
            .height(length(20.0))
            .border(Border::all(0.0, self.border)),
            self.caption(label, 1.0, extent + 30.0, Some(size.width - 2.0))
                .height(length(20.0))
                .border(Border::all(0.0, self.border)),
        ])
        .keyed("region-magnifier")
        .absolute(at(origin.x, origin.y))
        .width(length(size.width))
        .height(length(size.height))
        .background(self.surface)
        .radius(CornerRadii::all(7.0))
        .border(Border::all(one_pixel, self.border))
    }
}
