//! Windowless validation of generated TSX bundles.

use std::{cell::RefCell, path::PathBuf, rc::Rc};

use crate::QuickJsGallery;
use argui_host::Host;
use argui_runtime::WireOperation;
use serde_json::Value;

/// Loads and mounts an external TSX bundle without creating a native window.
/// The bundle path comes from `ARGUI_APP_BUNDLE`; this is used by CLI smoke
/// checks that must exercise `run dev` without opening a window.
///
/// # Errors
/// Returns an error if the bundle, ABI contract, or initial host commit fails.
#[cfg(any(target_os = "linux", target_os = "windows", target_os = "macos"))]
pub(crate) fn validate_app_bundle() -> Result<(), Box<dyn std::error::Error>> {
    let path = std::env::var_os("ARGUI_APP_BUNDLE")
        .ok_or("ARGUI_APP_BUNDLE is required for windowless validation")?;
    let source = std::fs::read_to_string(PathBuf::from(path))?;
    let contract_json =
        include_str!("../../../vendor/argui/packages/host/src/contract.generated.json");
    let host = Rc::new(RefCell::new(Host::with_builtins()?));
    if serde_json::from_str::<Value>(contract_json)?["abiHash"].as_str()
        != Some(&host.borrow().abi_hash().to_string())
    {
        return Err("generated JavaScript contract is stale; run bun run generate:jsx".into());
    }
    let commits = Rc::clone(&host);
    let _session = QuickJsGallery::new(&source, contract_json, "mountGallery", move |json| {
        let result = (|| -> Result<(), String> {
            let operations: Vec<WireOperation> = crate::decode_wire_operations(&json)?;
            let operations = operations
                .into_iter()
                .map(WireOperation::into_native)
                .collect::<Result<Vec<_>, _>>()?;
            commits
                .borrow_mut()
                .commit(&operations)
                .map_err(|error| error.to_string())?;
            Ok(())
        })();
        result.err().unwrap_or_default()
    })?;
    println!("Argui bundle mounted and validated without a window");
    Ok(())
}
