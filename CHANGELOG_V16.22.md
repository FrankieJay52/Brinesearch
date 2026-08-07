# BrineSearch V16.22 — Scan Front Sign

## Added

- Added **Scan Front Sign** to every regular Pad Page.
- Added the same **Scan Front Sign** control inside **Edit Pad**.
- Opens the iPhone/phone rear camera through a photo input optimized for entrance signs.
- Reads sign text with on-device OCR and extracts recognized pad information:
  - Pad name
  - Operator/company
  - Address
  - Gate/access code
  - API number
  - Phone/emergency contact
  - Well names/numbers
  - Safety, H2S, PPE, speed-limit, gate, and emergency notes
- Added a review screen before applying anything.
- Displays current saved values beside different scanned values so existing good information is not overwritten blindly.
- Allows each recognized item to be unchecked or corrected before applying.
- Saves a **Front Sign Scan** information card on the Pad Page.
- From a regular Pad Page, can open Edit Pad and fill matching fields after the scan is approved.
- From Edit Pad, fills matching fields immediately after approval.
- Information that does not have a matching editor field is appended to Pad Notes when possible.
- Includes Retake, Rescan, full OCR text, and Remove Scan controls.

## Privacy and storage

- The photo is processed in the browser and is not uploaded to BrineSearch.
- The full sign photo is not stored after recognition.
- Only the approved extracted text, scan date, and selected pad information are saved locally.

## Safety

- No scan silently overwrites pad information.
- The driver must review the recognized text and tap **Apply to Pad**.
- Matching Edit Pad fields are highlighted after they are filled.
- The existing **Save Pad** step remains available for final review and validation.

## Compatibility

- Built for iPhone/PWA camera capture.
- Responsive at 390 px, 430 px, and desktop widths.
- Supports BrineSearch day and night themes.
- Uses the existing BrineSearch camera icon and design variables.
