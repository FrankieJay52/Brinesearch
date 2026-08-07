# BrineSearch V17.1

## Changed
- Generated a dedicated Field Mark stylesheet with absolute `/icons/...` asset URLs so icons resolve correctly after the V17 CSS split.
- Replaced the missing footer brand-kit PNG dependency with the built-in Field Mark pad icon and BrineSearch text in the production build.
- Removed the broken duplicate Home Screen icon reference from the production build while keeping the embedded PNG icon.
- Bumped the service-worker cache to `brinesearch-v17-1-0` and added core Field Mark icons to the offline app shell.
- Strengthened the browser audit so it validates the browser's real resolved mask URLs, six dashboard quick-action icons, same-origin images, and broken images on iPhone and desktop viewports.

## Root cause
The Field Mark CSS moved from the site root into `/styles/app.css`, but icon custom properties still used `./icons/...`. Browsers therefore requested `/styles/icons/...` instead of `/icons/...`. The previous audit incorrectly resolved those custom-property URLs against the document URL, which hid the problem.
