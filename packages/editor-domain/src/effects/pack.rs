//! Content hashes cover definitions and presets, before registration can publish either.
use super::{
    CatalogVersion, Definition, ExtensionPack, PackDraft, PackProvenance, preset_types::Preset,
};
use crate::{EditorError, Project, Result};
use sha2::{Digest, Sha256};
use std::collections::HashSet;

impl PackDraft {
    pub fn seal(self) -> Result<ExtensionPack> {
        ExtensionPack::new(
            self.id,
            self.namespace,
            self.version,
            self.definitions,
            self.presets,
        )
    }
}

impl ExtensionPack {
    pub fn new(
        id: String,
        namespace: String,
        version: u32,
        definitions: Vec<Definition>,
        presets: Vec<Preset>,
    ) -> Result<Self> {
        Self {
            id,
            namespace,
            version,
            sha256: String::new(),
            definitions,
            presets,
        }
        .seal()
    }

    /// JSON object keys are lexical; definition/preset versions are sorted. Parameter,
    /// choice and keyframe arrays retain their semantic order. The digest field is excluded.
    pub fn canonical_bytes(&self) -> Result<Vec<u8>> {
        let mut canonical = self.clone();
        canonical
            .definitions
            .sort_by(|a, b| (&a.id, a.version).cmp(&(&b.id, b.version)));
        canonical
            .presets
            .sort_by(|a, b| (&a.id, a.version).cmp(&(&b.id, b.version)));
        let mut value = serde_json::to_value(canonical)?;
        value
            .as_object_mut()
            .ok_or_else(|| invalid("pack must be an object"))?
            .remove("sha256");
        canonicalize(&mut value);
        let bytes = serde_json::to_vec(&value)?;
        if bytes.len() > crate::protocol::MESSAGE_BUDGET {
            return Err(invalid("pack exceeds the message budget"));
        }
        Ok(bytes)
    }

    pub fn canonical_hash(&self) -> Result<String> {
        Ok(format!("{:x}", Sha256::digest(self.canonical_bytes()?)))
    }

    /// A constructor helper, never an implicit correction of an incoming supplied digest.
    pub fn seal(mut self) -> Result<Self> {
        self.sha256 = self.canonical_hash()?;
        self.validate()?;
        Ok(self)
    }

    pub fn validate(&self) -> Result<()> {
        if !identity(&self.id)
            || !identity(&self.namespace)
            || self.namespace == "beam"
            || self.namespace.starts_with("beam.")
            || self.version == 0
            || self.definitions.is_empty() && self.presets.is_empty()
            || self.definitions.len() + self.presets.len() > 256
        {
            return Err(invalid("invalid extension pack identity or namespace"));
        }
        let prefix = format!("{}.", self.namespace);
        let mut versions = HashSet::new();
        for definition in &self.definitions {
            definition.validate()?;
            if !definition.id.starts_with(&prefix)
                || !versions.insert((&definition.id, definition.version))
            {
                return Err(invalid(
                    "pack definitions must be unique versions inside its namespace",
                ));
            }
        }
        versions.clear();
        for preset in &self.presets {
            if !identity(&preset.id)
                || preset.version == 0
                || !preset.id.starts_with(&prefix)
                || !versions.insert((&preset.id, preset.version))
            {
                return Err(invalid(
                    "pack presets must be unique versions inside its namespace",
                ));
            }
            if !identity(&preset.definition_id)
                || preset.definition_version == 0
                || preset.label.trim().is_empty()
                || preset.label.len() > 256
                || preset.label.contains('\0')
            {
                return Err(invalid("invalid pack preset metadata"));
            }
            for binding in preset.parameters.values() {
                binding.validate()?;
            }
        }
        if self.sha256.len() != 64
            || !self
                .sha256
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
            || self.sha256 != self.canonical_hash()?
        {
            return Err(invalid(
                "extension pack SHA256 does not match its canonical contents",
            ));
        }
        Ok(())
    }
}

/// All conflicts and referenced preset payloads are checked before modifying the catalogue.
pub fn register(project: &mut Project, pack: &ExtensionPack) -> Result<()> {
    pack.validate()?;
    if project.extension_packs.iter().any(|old| {
        old.id == pack.id && (old.version == pack.version || old.namespace != pack.namespace)
            || old.namespace == pack.namespace && old.id != pack.id
    }) {
        return Err(invalid(
            "pack versions are immutable and namespaces have one owner",
        ));
    }
    if pack.definitions.iter().any(|new| {
        project
            .definitions
            .iter()
            .any(|old| old.id == new.id && old.version == new.version)
    }) || pack.presets.iter().any(|new| {
        project
            .presets
            .iter()
            .any(|old| old.id == new.id && old.version == new.version)
    }) {
        return Err(invalid(
            "definition and preset versions are immutable and already registered",
        ));
    }
    let mut catalog = project.definitions.clone();
    catalog.extend(pack.definitions.iter().cloned());
    super::presets::validate_catalog(&pack.presets, &catalog)?;
    project.definitions = catalog;
    project.presets.extend(pack.presets.iter().cloned());
    project.extension_packs.push(PackProvenance::from(pack));
    Ok(())
}

pub fn validate_provenance(project: &Project) -> Result<()> {
    let mut owners = std::collections::HashMap::new();
    let mut namespaces = std::collections::HashMap::new();
    let mut versions = HashSet::new();
    let mut definitions = HashSet::new();
    let mut presets = HashSet::new();
    for provenance in &project.extension_packs {
        if !versions.insert((&provenance.id, provenance.version))
            || namespaces
                .insert(&provenance.id, &provenance.namespace)
                .is_some_and(|namespace| namespace != &provenance.namespace)
            || owners
                .insert(&provenance.namespace, &provenance.id)
                .is_some_and(|id| id != &provenance.id)
        {
            return Err(invalid("duplicate pack version or namespace owner"));
        }
        let pack = ExtensionPack {
            id: provenance.id.clone(),
            namespace: provenance.namespace.clone(),
            version: provenance.version,
            sha256: provenance.sha256.clone(),
            definitions: provenance
                .definitions
                .iter()
                .map(|key| {
                    if !definitions.insert((&key.id, key.version)) {
                        return Err(invalid("definition provenance is duplicated"));
                    }
                    super::definition(&project.definitions, &key.id, key.version).cloned()
                })
                .collect::<Result<_>>()?,
            presets: provenance
                .presets
                .iter()
                .map(|key| {
                    if !presets.insert((&key.id, key.version)) {
                        return Err(invalid("preset provenance is duplicated"));
                    }
                    project
                        .presets
                        .iter()
                        .find(|p| p.id == key.id && p.version == key.version)
                        .cloned()
                        .ok_or_else(|| invalid("pack preset is missing"))
                })
                .collect::<Result<_>>()?,
        };
        pack.validate()?;
        super::presets::validate_catalog(&pack.presets, &project.definitions)?;
    }
    Ok(())
}

impl From<&ExtensionPack> for PackProvenance {
    fn from(pack: &ExtensionPack) -> Self {
        Self {
            id: pack.id.clone(),
            namespace: pack.namespace.clone(),
            version: pack.version,
            sha256: pack.sha256.clone(),
            definitions: pack
                .definitions
                .iter()
                .map(|d| CatalogVersion {
                    id: d.id.clone(),
                    version: d.version,
                })
                .collect(),
            presets: pack
                .presets
                .iter()
                .map(|p| CatalogVersion {
                    id: p.id.clone(),
                    version: p.version,
                })
                .collect(),
        }
    }
}

fn identity(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
}
fn invalid(message: &str) -> EditorError {
    EditorError::Invalid(message.into())
}

fn canonicalize(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(object) => {
            object.sort_keys();
            for child in object.values_mut() {
                canonicalize(child);
            }
        }
        serde_json::Value::Array(array) => {
            for child in array {
                canonicalize(child);
            }
        }
        _ => {}
    }
}
