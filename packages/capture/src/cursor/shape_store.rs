use super::Hotspot;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CursorBitmap<'a> {
    pub width: u32,
    pub height: u32,
    pub rgba: &'a [u8],
    pub hotspot: Hotspot,
}
pub struct ShapeStore {
    directory: PathBuf,
    known: HashMap<String, PathBuf>,
}
impl ShapeStore {
    pub fn new(directory: impl Into<PathBuf>) -> Result<Self, crate::CaptureError> {
        let directory = directory.into();
        std::fs::create_dir_all(&directory)
            .map_err(|e| crate::CaptureError::storage(&directory, e))?;
        Ok(Self {
            directory,
            known: HashMap::new(),
        })
    }
    pub fn store(&mut self, bitmap: CursorBitmap<'_>) -> Result<String, crate::CaptureError> {
        let expected = usize::try_from(bitmap.width)
            .unwrap_or(usize::MAX)
            .saturating_mul(usize::try_from(bitmap.height).unwrap_or(usize::MAX))
            .saturating_mul(4);
        if bitmap.rgba.len() != expected {
            return Err(crate::CaptureError::InvalidConfiguration(
                "cursor bitmap length does not match dimensions".into(),
            ));
        }
        let mut hasher = Sha256::new();
        hasher.update(bitmap.width.to_le_bytes());
        hasher.update(bitmap.height.to_le_bytes());
        hasher.update(bitmap.hotspot.x.to_le_bytes());
        hasher.update(bitmap.hotspot.y.to_le_bytes());
        hasher.update(bitmap.rgba);
        let id = format!("{:x}", hasher.finalize());
        if !self.known.contains_key(&id) {
            let path = self.directory.join(format!("{id}.png"));
            write_png(&path, &bitmap)?;
            self.known.insert(id.clone(), path);
        }
        Ok(id)
    }
    #[must_use]
    pub fn len(&self) -> usize {
        self.known.len()
    }
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.known.is_empty()
    }
}
fn write_png(path: &Path, bitmap: &CursorBitmap<'_>) -> Result<(), crate::CaptureError> {
    let file = std::fs::File::create(path).map_err(|e| crate::CaptureError::storage(path, e))?;
    let mut encoder = png::Encoder::new(file, bitmap.width, bitmap.height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder
        .write_header()
        .map_err(|e| crate::CaptureError::Backend(e.to_string()))?;
    writer
        .write_image_data(bitmap.rgba)
        .map_err(|e| crate::CaptureError::Backend(e.to_string()))
}
