use super::{PersistentCollection, PersistentItem};
use serde::{
    Deserialize, Deserializer, Serialize, Serializer,
    ser::{Error, SerializeSeq},
};
use std::sync::Arc;

impl<T: PersistentItem> Serialize for PersistentCollection<T> {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        let mut sequence = serializer.serialize_seq(Some(self.len()))?;
        for value in self.try_iter() {
            sequence.serialize_element(&value.map_err(S::Error::custom)?)?;
        }
        sequence.end()
    }
}
impl<'de, T: PersistentItem> Deserialize<'de> for PersistentCollection<T> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> std::result::Result<Self, D::Error> {
        Vec::<T>::deserialize(deserializer).map(Into::into)
    }
}
impl<T: PersistentItem + schemars::JsonSchema> schemars::JsonSchema for PersistentCollection<T> {
    fn schema_name() -> String {
        <Vec<T>>::schema_name()
    }
    fn json_schema(generator: &mut schemars::r#gen::SchemaGenerator) -> schemars::schema::Schema {
        <Vec<T>>::json_schema(generator)
    }
    fn is_referenceable() -> bool {
        <Vec<T>>::is_referenceable()
    }
}
impl<T: PersistentItem> PartialEq for PersistentCollection<T> {
    fn eq(&self, other: &Self) -> bool {
        if Arc::ptr_eq(&self.pages, &other.pages) {
            return true;
        }
        if self.len() != other.len() || self.pages.len() != other.pages.len() {
            return false;
        }
        self.pages
            .iter()
            .zip(other.pages.iter())
            .all(|(left, right)| {
                if Arc::ptr_eq(left, right) {
                    return true;
                }
                if left.hash.get().is_some() && left.hash.get() == right.hash.get() {
                    return true;
                }
                if left.headers != right.headers {
                    return false;
                }
                match (left.values.get(), right.values.get()) {
                    (Some(left), Some(right)) => left == right,
                    _ => false,
                }
            })
    }
}
