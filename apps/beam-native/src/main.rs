//! Beam's first native window, rendered by the locally pinned Argui source.

use argui_runtime::{
    ApplicationConfig, ApplicationIdentity, Color, Context, Element, Render, RendererConfig,
    SingleWindowModel, WindowConfig, run_application,
};
use argui_text::TextStyle;
use argui_ui::{CornerRadii, LayoutInsets, length, percent};

struct App;

impl Render for App {
    /// Builds the native welcome screen.
    ///
    /// `_cx` is the current Argui render context, unused by this static screen.
    /// The returned element fills the window.
    fn render(&mut self, _cx: &mut Context<Self>) -> Element {
        let accent = Color::srgb(0.78, 0.88, 1.0);
        let card = Element::column([
            Element::text("BEAM / NATIVE REWRITE").text_style(TextStyle {
                font_size: 13.0,
                line_height: 18.0,
                weight: 700,
                color: accent,
                ..Default::default()
            }),
            Element::text("A new window for Beam").text_style(TextStyle {
                font_size: 30.0,
                line_height: 38.0,
                weight: 700,
                ..Default::default()
            }),
            Element::text("Argui is running from Beam's pinned local source checkout. The recording engine is ready for the next integration step.")
                .text_style(TextStyle {
                    color: Color::srgb(0.68, 0.72, 0.8),
                    ..Default::default()
                }),
            Element::container([])
                .width(length(72.0))
                .height(length(4.0))
                .background(accent)
                .radius(CornerRadii::all(2.0)),
        ])
        .width(length(560.0))
        .gap(20.0)
        .layout_padding(LayoutInsets::all(32.0))
        .background(Color::srgb(0.11, 0.14, 0.21))
        .radius(CornerRadii::all(18.0));
        Element::column([card])
            .width(percent(1.0))
            .height(percent(1.0))
            .layout_padding(LayoutInsets::all(56.0))
            .background(Color::srgb(0.055, 0.07, 0.11))
    }
}

/// Starts the Beam native window.
///
/// Returns an error if the display or renderer cannot start.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = ApplicationConfig::new(
        ApplicationIdentity::development("Beam Native"),
        WindowConfig {
            title: "Beam Native".into(),
            ..WindowConfig::default()
        },
    );
    run_application(
        config,
        RendererConfig::default(),
        SingleWindowModel::new(App),
        |_| {},
    )?;
    Ok(())
}
