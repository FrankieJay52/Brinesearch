# BrineSearch V16.20 — Central Road Database Foundation

## Shared road records
- Added one central road record that can be linked to many pads.
- Added stable road IDs and canonical matching so common spelling differences do not create unnecessary duplicates.
- Normalizes road suffixes such as `Rd` and `Road` while preserving the original names as aliases.
- Recognizes Interstate, U.S., state, county, township, street, lease-road, and access-road records.

## Road information
Each central record can now store:
- Official road name and display name
- Route type, prefix, and route number
- State, county, and township
- Aliases and former names
- Verification status and history fields
- `Needs Field Check` status
- Warnings, restrictions, and notes
- Every linked pad ID
- Source and migration information

## Existing-data migration
- Automatically builds the shared road database from the existing fallback pad data.
- Imports the existing road-name review list and keeps entries needing source verification marked for a field check.
- Watches existing BrineSearch pad storage and pad-save events for new or changed roads.
- Keeps the original pad and direction records unchanged for backward compatibility.

## App integration
- Added a global `BrineSearchRoadDB` API for the upcoming Road Manager and road picker.
- Road-name updates can resolve through the central official record without deleting saved aliases.
- Added import, export, backup, statistics, pad-linking, warning, restriction, and verification functions.
- Added safe offline storage and included the road database files in the PWA cache.

## Release checks
- Road classification and normalization tests passed.
- Duplicate matching and shared-pad linking tests passed.
- CSV review import and fallback-pad migration tests passed.
- JavaScript syntax and service-worker syntax checked.
- No theme, layout, navigation, or existing feature was redesigned or removed.
- Version and PWA cache updated to V16.20.
