# BrineSearch V16.24 — Loading and Visibility Repair

## Fixed
- Replaced the V16.23 multi-step startup chain with one small repair loader.
- The service worker no longer strips and rebuilds multiple feature scripts or rewrites the full application page.
- Road Database, Road Manager, and Front Sign Scanner now start in a fixed order.
- Added a guaranteed Road Manager entry to the visible Settings screen.
- Road Manager opens directly instead of depending on a delayed Settings route.
- Added separate **Take Photo** and **Choose Photo** controls.
- Take Photo requests the rear camera.
- Choose Photo removes the camera-only capture setting and opens the iPhone photo/file picker.
- Old BrineSearch caches are removed when V16.24 activates.
- JavaScript files use network-first loading so repaired feature files are not trapped behind an old cache.

## Validation
- V16.24 repair loader syntax checked.
- V16.24 service-worker syntax checked.
- Confirmed the Settings launcher, Road Manager startup, Take Photo, and Choose Photo controls are included.
