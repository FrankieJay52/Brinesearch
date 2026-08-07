# BrineSearch V16.19 — Direction Parsing and Compass Travel Options

## Direction Wizard
- Added all eight travel-direction choices: North, Northeast, East, Southeast, South, Southwest, West, and Northwest.
- Travel direction is stored separately from the road name so it appears before the road sign instead of inside it.
- Added the same structured Directions Wizard to Add Pad while preserving the original road-sequence field for compatibility.

## Existing direction cleanup
- Existing entries such as “Southeast on Unionvale-Kenwood Rd” are automatically split into a Southeast travel direction and a Unionvale-Kenwood Rd sign.
- Existing suffixes such as US-250 S are recognized as a South travel direction.
- Fixed merged legacy wording such as “Rdcontinue to follow Unionvale Rd.”
- Corrected the legacy typo “uip” to “up” when directions are displayed or edited.
- Non-road instructions such as “Continue up the hill” display as instructions instead of fake street signs.

## Direction display consistency
- Updated route cards, direction summaries, copied/assistant route text, Add Pad, and Edit Pad to use the same parsing rules.
- Maneuver appears first, travel direction next, road sign after it, and mileage last.
- Preserved old saved direction formats and live database compatibility.

## Release checks
- JavaScript syntax checked.
- Manifest and service-worker asset references checked.
- Mobile layout checked for compact direction controls and no horizontal overflow.
- Version and cache updated to V16.19.
