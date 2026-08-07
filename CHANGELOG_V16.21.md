# BrineSearch V16.21 — Road Manager and Road Picker

## Visible Road Manager
- Added a full-screen Road Manager available from Settings.
- Added road search across official names, display names, aliases, counties, townships, notes, warnings, restrictions, and linked pad IDs.
- Added quick filters for All, Verified, Needs Check, Warnings, Restrictions, Linked Pads, and Duplicates.
- Added filters for road type and state, plus sorting by name, last update, linked pads, or verification status.
- Added summary cards for total roads, verified roads, field checks, warnings/restrictions, and linked pads.

## Road details
- Added official name, display name, road type, route number, state, county, township, creation date, last update, and verification details.
- Added visible aliases, old road names, warnings, truck restrictions, general notes, and linked pads.
- Added one-tap actions to mark a road verified or flag it for a field check.
- Added quick entry and removal for aliases, warnings, and restrictions.
- Added safe road-record deletion with confirmation; deleting a road record does not delete pads.

## Add and edit roads
- Added an easy road form where only the official road name is required.
- Added detailed optional fields for display name, road type, location, aliases, warnings, restrictions, notes, verification, and field-check status.
- Preserved the shared central-road behavior so changes apply anywhere that road record is used.

## Road picker
- Added “Choose from Road Database” buttons to road-related Add Pad, Edit Pad, route, and direction fields.
- Selecting a road fills the correct road field and attaches the shared road ID.
- Added the ability to create a missing road from the picker and automatically place it into the direction after saving.

## Duplicate management and backups
- Added likely-duplicate detection using route numbers, normalized road names, and aliases.
- Added guided duplicate merging that preserves all aliases, linked pads, warnings, restrictions, notes, sources, and the strongest verification data.
- Added road database export and non-destructive import.
- Added a manual pad-direction re-scan to rebuild road links from existing local pad data.

## Mobile and accessibility
- Added a full-screen iPhone layout with safe-area support, sticky save controls, large tap targets, readable badges, and no horizontal scrolling.
- Added dark/light theme compatibility, keyboard Escape handling, focus management, labels, and status messages.

## Release validation
- JavaScript syntax checked for the Road Manager and service worker.
- Duplicate-detection, normalization, search, and verification-status tests passed.
- Verified one Road Manager script include after the central road database include.
- Verified V16.21 cache entries and offline app-shell files.
- Verified the existing V16.20 road database remains compatible.
