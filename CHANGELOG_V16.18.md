# BrineSearch V16.18

## Nearby pads location behavior

- The first **Use my location** tap saves the approved coordinates locally on that device.
- Returning to Home now reuses the saved coordinates automatically and immediately shows nearby pads.
- After the first successful location request, the control changes to **Refresh nearby pads**.
- Refresh requests a current location, updates the saved coordinates, recalculates distances, and shows the five closest saved locations with GPS.
- The Nearby Pads quick action now moves the driver to the Nearby pads section without unnecessarily requesting location again.
- If a refresh fails, the existing saved nearby-pad results remain visible instead of disappearing.
- Added a small last-updated note so the driver knows when the saved location was refreshed.
- Location remains stored only in the browser on that device. Clearing browser/site data requires approving location again.

## Weather placement

- Removed the large Weather section from the Home dashboard.
- Kept the compact weather control in the top-left header.
- The top-left control still opens the existing 12-hour weather forecast and refresh controls.

## Preserved

- Quick actions, favorites, recent pads, Field Feed, database status, search, Add Pad, Edit Pad, directions, verification, themes, and PWA behavior were not redesigned or removed.

## Verification performed

- Parsed every inline JavaScript block successfully.
- Verified local static asset and service-worker references.
- Confirmed the Home template no longer contains the large Weather section.
- Confirmed the saved-location key remains compatible with the earlier V16.13 implementation.
- Updated the displayed version and service-worker cache to V16.18.
