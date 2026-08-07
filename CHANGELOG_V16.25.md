# BrineSearch V16.25 — Icon and Sign Scan Repair

## Fixed
- Added the missing `icons` and `icons/large` SVG files used throughout BrineSearch.
- Added cache-busting and network-first loading for SVG icon requests.
- Updated the service-worker cache to `brinesearch-v16-25` and removes older caches.
- Front Sign scanning now reads the complete photo and three overlapping vertical sign panels.
- OCR results from all four passes are combined and deduplicated.
- API-like text is corrected for common OCR substitutions such as O/0, I/1, S/5, and B/8.
- All unique 10-, 12-, and 14-digit API numbers are normalized and sent into the existing review screen.
- Preserved Take Photo, Choose Photo, Road Manager, Pad Page, and Edit Pad behavior.

## Validation
- V16.25 JavaScript syntax checked.
- V16.25 service-worker syntax checked.
- Verified all icon paths referenced by the main Field Mark interface now have repository files.
- Verified the scanner performs one full-sign pass plus left, middle, and right panel passes.