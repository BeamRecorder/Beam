//! Paged decision ownership and fallible access. Headers contain no parameter payloads.
use crate::Result;
use serde::{Serialize, de::DeserializeOwned};
use std::{
    collections::{HashMap, HashSet},
    fmt::Debug,
    sync::atomic::{AtomicBool, Ordering},
    sync::{Arc, Mutex, OnceLock, Weak},
};
use uuid::Uuid;

pub const PAGE_SIZE: usize = 128;
pub trait ItemHeader:
    Clone + Debug + PartialEq + Serialize + DeserializeOwned + Send + Sync + 'static
{
    fn id(&self) -> Uuid;
    fn identities(&self) -> Vec<Uuid> {
        vec![self.id()]
    }
}
pub trait PersistentItem:
    Clone + Debug + PartialEq + Serialize + DeserializeOwned + Send + Sync + 'static
{
    type Header: ItemHeader;
    fn id(&self) -> Uuid;
    fn header(&self) -> Self::Header;
}
pub type PageValues<T> = Arc<Vec<Arc<T>>>;
pub type PageLoader<T> = Arc<dyn Fn(&str) -> Result<PageValues<T>> + Send + Sync>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Location {
    pub page: usize,
    pub item: usize,
}
#[derive(Clone, Debug, Default)]
pub(crate) struct IdIndex {
    pub locations: HashMap<Uuid, Location>,
    pub duplicates: HashSet<Uuid>,
}
pub(crate) struct DecisionPage<T: PersistentItem> {
    pub headers: Arc<Vec<Arc<T::Header>>>,
    pub values: OnceLock<PageValues<T>>,
    pub load_lock: Mutex<()>,
    pub hash: OnceLock<String>,
    pub header_hash: OnceLock<String>,
    pub dirty: Vec<AtomicBool>,
}
impl<T: PersistentItem> Clone for DecisionPage<T> {
    fn clone(&self) -> Self {
        Self {
            headers: self.headers.clone(),
            values: self.values.clone(),
            load_lock: Mutex::new(()),
            hash: self.hash.clone(),
            header_hash: self.header_hash.clone(),
            dirty: self
                .dirty
                .iter()
                .map(|dirty| AtomicBool::new(dirty.load(Ordering::Relaxed)))
                .collect(),
        }
    }
}
/// Cloning shares every page, payload and index. A mutable item guard detaches one item.
pub struct PersistentCollection<T: PersistentItem> {
    pub(crate) pages: Arc<Vec<Arc<DecisionPage<T>>>>,
    pub(crate) index: Arc<IdIndex>,
    pub(crate) loader: Option<PageLoader<T>>,
    pub(crate) len: usize,
    pub(crate) identities: Arc<IdentityIndex>,
    pub(crate) header_validation: Arc<Mutex<HashSet<String>>>,
}
/// The header and immutable-block digest are updated when an edited item is released.
pub struct ItemMut<'a, T: PersistentItem> {
    pub(crate) value: &'a mut T,
    pub(crate) header: &'a mut Arc<T::Header>,
    pub(crate) index: &'a mut Arc<IdIndex>,
    pub(crate) location: Location,
    pub(crate) previous_id: Uuid,
    pub(crate) header_hash: &'a mut OnceLock<String>,
    pub(crate) identities: &'a mut Arc<IdentityIndex>,
    pub(crate) header_validation: &'a mut Arc<Mutex<HashSet<String>>>,
}
#[derive(Clone, Debug)]
pub struct LazyPage<H: ItemHeader> {
    pub hash: String,
    pub headers: Vec<H>,
}
#[derive(Clone, Debug, PartialEq, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PageReference {
    pub values: String,
    pub headers: String,
}
/// Reuses the same page and ID index while reconstructing current states and histories.
pub(crate) type CachedPages<T> = Mutex<HashMap<(String, String), Weak<DecisionPage<T>>>>;
pub(crate) type CachedHeaders<H> = Mutex<HashMap<String, Weak<Vec<Arc<H>>>>>;
pub struct PageCache<T: PersistentItem> {
    pub(crate) pages: CachedPages<T>,
    pub(crate) indexes: Mutex<HashMap<Vec<String>, CachedIndexes>>,
    pub(crate) headers: CachedHeaders<T::Header>,
}
pub(crate) struct CachedIndexes {
    pub index: Weak<IdIndex>,
    pub identities: Weak<IdentityIndex>,
    pub validation: Weak<Mutex<HashSet<String>>>,
}
#[derive(Clone, Debug)]
pub(crate) struct IdentityIndex {
    pub shards: Vec<Arc<HashMap<Uuid, usize>>>,
    pub duplicates: usize,
    pub nil: usize,
}
impl Default for IdentityIndex {
    fn default() -> Self {
        Self {
            shards: (0..256).map(|_| Arc::new(HashMap::new())).collect(),
            duplicates: 0,
            nil: 0,
        }
    }
}
impl<T: PersistentItem> Default for PageCache<T> {
    fn default() -> Self {
        Self {
            pages: Mutex::new(HashMap::new()),
            indexes: Mutex::new(HashMap::new()),
            headers: Mutex::new(HashMap::new()),
        }
    }
}

impl<T: PersistentItem> Clone for PersistentCollection<T> {
    fn clone(&self) -> Self {
        Self {
            pages: Arc::clone(&self.pages),
            index: Arc::clone(&self.index),
            loader: self.loader.clone(),
            len: self.len,
            identities: Arc::clone(&self.identities),
            header_validation: Arc::clone(&self.header_validation),
        }
    }
}
impl<T: PersistentItem> Default for PersistentCollection<T> {
    fn default() -> Self {
        Self {
            pages: Arc::new(vec![]),
            index: Arc::new(IdIndex::default()),
            loader: None,
            len: 0,
            identities: Arc::new(IdentityIndex::default()),
            header_validation: Arc::new(Mutex::new(HashSet::new())),
        }
    }
}
impl<T: PersistentItem> Debug for PersistentCollection<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PersistentCollection")
            .field("len", &self.len)
            .field("pages", &self.pages.len())
            .field("loaded_pages", &self.loaded_pages())
            .finish()
    }
}
