# BrineSearch V17 modular rebuild

The live `main` branch remains on V16.25. This branch contains the behavior-preserving first stage of V17.

- 19 ordered JavaScript feature files
- 20 CSS source files grouped by responsibility
- 27 direction-data files instead of one enormous embedded object
- Separate runtime scripts
- Clean V17 service worker
- Vite development and production configuration
- Automated assembly and verification

Run `npm run verify:v17`, `npm run dev`, or `npm run build`.

The ordered source parts still assemble inside one shared application closure so existing behavior and shared state remain intact. Individual features can now be converted to true ES modules one at a time without another all-at-once rewrite.
