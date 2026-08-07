# BrineSearch V17.2

## Front Sign structured-data scanner
- Reworked front-sign reading around the database fields drivers actually need instead of dumping full OCR text.
- Scanner now isolates the bright sign area before splitting multi-placard signs.
- Each placard gets dedicated OCR passes for well name, API number, and location block.
- API reading uses a numeric-only pass and keeps Ohio-style 14-digit API formatting such as `34-067-2-1651-00-00`.
- Results are merged into only: well names, API numbers, street/address, city/state/ZIP, county, and township.
- Raw OCR text is hidden from the normal workflow; only structured fields are shown for review.
- Pad-page Apply still uses the existing Edit Pad save/database path, so approved values update the normal BrineSearch pad record.
- Scanner UI now displays V17.2 and emphasizes reviewing the actual database fields before saving.
