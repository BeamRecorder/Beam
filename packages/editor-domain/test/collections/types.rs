use super::*;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Header {
    pub id: Uuid,
    pub label: String,
}
impl ItemHeader for Header {
    fn id(&self) -> Uuid {
        self.id
    }
}
#[derive(Debug, Serialize, Deserialize, schemars::JsonSchema)]
pub struct Item {
    pub id: Uuid,
    pub label: String,
    pub payload: Vec<u8>,
    #[serde(skip)]
    #[schemars(skip)]
    pub clones: Arc<AtomicUsize>,
}
impl Item {
    pub fn new(index: usize) -> Self {
        Self {
            id: Uuid::from_u128(index as u128 + 1),
            label: format!("{index}"),
            payload: vec![7; 1024],
            clones: Arc::new(AtomicUsize::new(0)),
        }
    }
}
impl Clone for Item {
    fn clone(&self) -> Self {
        self.clones.fetch_add(1, Ordering::SeqCst);
        Self {
            id: self.id,
            label: self.label.clone(),
            payload: self.payload.clone(),
            clones: self.clones.clone(),
        }
    }
}
impl PartialEq for Item {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id && self.label == other.label && self.payload == other.payload
    }
}
impl PersistentItem for Item {
    type Header = Header;
    fn id(&self) -> Uuid {
        self.id
    }
    fn header(&self) -> Header {
        Header {
            id: self.id,
            label: self.label.clone(),
        }
    }
}
#[test]
fn conversion_pages_dense_items_without_cloning_payloads() {
    let item = Item::new(0);
    let clones = item.clones.clone();
    let values: PersistentCollection<_> = vec![item].into();
    assert_eq!(values.loaded_pages(), 1);
    assert_eq!(clones.load(Ordering::SeqCst), 0);
    assert_eq!(collection(256).page_count(), 2);
    assert_eq!(collection(257).page_count(), 3);
    values.validate_index().unwrap();
}
