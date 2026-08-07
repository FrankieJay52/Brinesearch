# BrineSearch V17.3 — Full Product Polish

## Why this release exists
V17.3 is the first whole-product pass after the modular V17 rebuild. It corrects screens that were technically working but still looked and behaved like separate features rather than one finished field application.

## Dashboard and navigation
- Rebuilt Home as a compact driver dashboard with one prominent search, directory totals, six consistent driver tools, nearby pads, favorites, recent pads, and a concise Field Feed preview.
- Reduced oversized cards and excess vertical scrolling on iPhone.
- Reworked the mobile navigation into a safe-area-aware floating dock that stays clear of page content.
- Added a functioning Favorites page instead of routing to Page not found.
- Reduced the legal footer to a useful mobile size while preserving the legal and support links.
- Added a keyboard/screen-reader skip link and stronger visible focus treatment.

## Field Feed
- Removed the blocking sign-in prompt that followed users across Home, Pad, Settings, Search, and Offline screens.
- Kept public reading uninterrupted and moved the sign-in request into a compact inline Feed banner.
- Refined the Feed header, search/filter controls, composer, post cards, metadata, photos, and actions for one-handed use.
- Moved new profile photos from database-embedded base64 data to the existing Supabase Storage bucket.
- Added database-enforced ownership checks, image limits, duplicate protection, coordinate validation, alert expiration, report protection, stronger rate limits, and trusted notification triggers.
- Added reply notifications and editor-access-change notifications.

## Settings and permissions
- Standardized Settings icons on the Field Mark icon system instead of mixed emoji and symbols.
- Tightened section spacing and information hierarchy.
- Kept one owner-only Road Manager entry and preserved the direct-route/backend permission guard.
- Updated visible build labels to V17.3.

## Pad, Search, Favorites, and Offline
- Compacted Pad hero/actions and secondary record details so directions and navigation remain the visual priority.
- Refined the global search sheet and its mobile spacing.
- Added a complete Favorites view with offline-cache explanation and per-pad removal.
- Simplified Offline status cards, saved-pad rows, and storage actions.

## Visual system
- Added one final V17.3 product-polish layer for consistent spacing, typography, radii, borders, shadows, buttons, icon sizing, night mode, daylight mode, small iPhones, desktop, and reduced-motion users.
- Corrected icon asset URLs so Netlify, GitHub Pages, and offline builds resolve the same artwork.
- Added automated iPhone and desktop route screenshots to release checks.

## Deployment and verification
- Bumped the app, service-worker cache, build report, package, Pages preparation, and release artifacts to V17.3.
- Added automated checks for the Favorites route, non-blocking public Feed, inline guest banner, owner-only Road Manager placement, Storage-backed profile photos, and V17.3 visual layer.
