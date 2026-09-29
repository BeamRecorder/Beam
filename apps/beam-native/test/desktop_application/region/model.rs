//! Pure selector geometry and capture policies compiled from production.
pub(super) const CONTROLS_SIZE: (f64, f64) = super::region::CONTROLS_SIZE;
pub(super) const ACTIONS_SIZE: (f64, f64) = super::region::ACTIONS_SIZE;
#[allow(dead_code)]
#[path = "../../../src/desktop_application/region/capture.rs"]
mod capture;
#[path = "capture.rs"]
mod capture_checks;
#[allow(dead_code)]
#[path = "../../../src/desktop_application/region/capture_geometry.rs"]
mod capture_geometry;
#[path = "capture_geometry.rs"]
mod capture_geometry_checks;
#[allow(dead_code)]
#[path = "../../../src/desktop_application/region/geometry.rs"]
mod geometry;
#[path = "geometry.rs"]
mod geometry_checks;
#[path = "geometry_edges.rs"]
mod geometry_edges;
#[allow(dead_code)]
#[path = "../../../src/desktop_application/region/magnifier.rs"]
mod magnifier;
#[path = "magnifier.rs"]
mod magnifier_checks;
#[allow(dead_code)]
#[path = "../../../src/desktop_application/region/placement.rs"]
mod placement;
#[path = "placement.rs"]
mod placement_checks;
#[allow(dead_code)]
#[path = "../../../src/desktop_application/region/precision_view.rs"]
mod precision_view;
#[path = "precision_view.rs"]
mod precision_view_checks;
#[allow(dead_code)]
#[path = "../../../src/desktop_application/region/source_monitor.rs"]
mod source_monitor;
#[path = "source_monitor.rs"]
mod source_monitor_checks;
#[allow(dead_code)]
#[path = "../../../src/desktop_application/region/types.rs"]
mod types;
#[path = "types.rs"]
mod types_checks;
#[allow(dead_code)]
#[path = "../../../src/desktop_application/region/view.rs"]
mod view;
#[path = "view.rs"]
mod view_checks;
