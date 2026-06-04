// This module is no longer declared/used (see browser/mod.rs).
// It was a re-export for the (now removed) cdp_impl scaffolding for future CDP support.
// Safe to delete once the feature is properly implemented.

#[cfg(feature = "browser-automation")]
pub mod cdp {
    // Intentionally empty / commented to avoid pulling in dead chromiumoxide usage.
}
