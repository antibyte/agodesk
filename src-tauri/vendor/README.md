# Vendored crate patches

## `glib-0.18.5-patched`

Backport of [gtk-rs/gtk-rs-core#1343](https://github.com/gtk-rs/gtk-rs-core/pull/1343) (RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g) onto the upstream `glib` 0.18.5 sources.

Tauri 2.11 still pulls `gtk` 0.18 / `webkit2gtk` 2.0, which require `glib` 0.18.x. Upstream gtk3-rs is unmaintained; the official fix lives in `glib` >= 0.20.0.

Change: `VariantStrIter::impl_get` passes `&mut p` instead of `&p` to `g_variant_get_child`.

Remove this vendor tree when agodesk upgrades to a Tauri release built on gtk-rs >= 0.20 (GTK4 migration).
