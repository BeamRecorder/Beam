//! Filesystem stamps invalidate verified identities after writes or replacement.
use std::time::SystemTime;

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub(crate) struct SourceStamp {
    pub length: u64,
    pub modified: Option<SystemTime>,
    pub created: Option<SystemTime>,
    #[cfg(unix)]
    pub device: u64,
    #[cfg(unix)]
    pub inode: u64,
    #[cfg(unix)]
    pub changed: (i64, i64),
}
impl From<&std::fs::Metadata> for SourceStamp {
    fn from(metadata: &std::fs::Metadata) -> Self {
        #[cfg(unix)]
        use std::os::unix::fs::MetadataExt;
        Self {
            length: metadata.len(),
            modified: metadata.modified().ok(),
            created: metadata.created().ok(),
            #[cfg(unix)]
            device: metadata.dev(),
            #[cfg(unix)]
            inode: metadata.ino(),
            #[cfg(unix)]
            changed: (metadata.ctime(), metadata.ctime_nsec()),
        }
    }
}
