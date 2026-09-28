//! Embedded Beam typography with cached system fallbacks for other writing systems.

use std::sync::OnceLock;

static BEAM_FONTS: OnceLock<fontdb::Database> = OnceLock::new();

/// Each window owns its shaper; font discovery and file loading happen once.
pub(super) fn beam_text_engine() -> argui_text::TextEngine {
    let mut engine = embedded_engine();
    let database = BEAM_FONTS.get_or_init(|| {
        let mut fallback = embedded_engine();
        let fonts = fallback.fonts_mut().db_mut();
        fonts.load_system_fonts();
        fonts.set_sans_serif_family("Hanken Grotesk");
        fonts.set_serif_family("Hanken Grotesk");
        fonts.clone()
    });
    *engine.fonts_mut().db_mut() = database.clone();
    engine
}

fn embedded_engine() -> argui_text::TextEngine {
    argui_text::TextEngine::from_embedded_fonts(
        [
            &include_bytes!("../../../../public/font/HankenGrotesk-VariableFont_wght.ttf")[..],
            &include_bytes!("../../../../public/font/HankenGrotesk-Italic-VariableFont_wght.ttf")[..],
        ],
        "Hanken Grotesk",
        "Hanken Grotesk",
        "Hanken Grotesk",
    )
}
