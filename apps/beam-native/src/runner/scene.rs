//! Scoped disposal of a mounted native QuickJS scene, including early failures.

use crate::QuickJsGallery;

pub(super) struct NativeScene {
    pub gallery: QuickJsGallery,
    pub window: &'static str,
}

impl Drop for NativeScene {
    fn drop(&mut self) {
        if let Err(error) = self.gallery.dispose() {
            eprintln!("beam-{}: {error}", self.window);
        }
    }
}
