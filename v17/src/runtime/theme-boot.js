/* Applied before first paint so a driver who picked Daylight never sees a
   dark flash on load. */
(function () {
  var t = "night";
  try { var s = localStorage.getItem("brinesearch.theme.v1"); if (s === "day" || s === "night") t = s; } catch (e) {}
  document.documentElement.setAttribute("data-theme", t);
})();

/* V17.3.1 field-first Clear Directions cleanup.
   Kept as a tiny early runtime override so the existing assembled CSS integrity
   remains unchanged while the live card layout can be tightened safely. */
(function () {
  if (document.getElementById("brinesearch-direction-cleanup-v1731")) return;
  var style = document.createElement("style");
  style.id = "brinesearch-direction-cleanup-v1731";
  style.textContent = `
.direction-clear-route-groups{gap:14px}
.direction-clear-primary{gap:9px}
.direction-clear-primary .direction-route-heading{margin:0 2px 2px;font-size:.68rem;letter-spacing:.11em;opacity:.9}
.direction-clear-steps{gap:7px}
.direction-clear-step{grid-template-columns:32px minmax(0,1fr);gap:10px;align-items:start;min-height:0;padding:10px 11px;border-radius:13px;border-color:color-mix(in srgb,var(--line) 82%,transparent);background:var(--panel-2);box-shadow:none}
.direction-clear-step .direction-pro-number{width:30px;height:30px;border-radius:9px;background:color-mix(in srgb,var(--accent) 18%,var(--panel));color:var(--accent);font-size:.82rem;font-weight:950;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 34%,var(--line))}
.direction-clear-card{display:grid;gap:5px;min-width:0;padding-top:1px}
.direction-clear-meta{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:baseline;gap:8px;min-width:0;min-height:22px}
.direction-clear-maneuver{min-width:0;color:var(--text);font-size:.78rem;font-weight:950;line-height:1.15;letter-spacing:.035em;text-transform:uppercase;overflow-wrap:normal;word-break:normal}
.direction-clear-distance{flex:0 0 auto;width:auto!important;max-width:max-content;margin-left:auto!important;padding:0;border:0;border-radius:0;background:transparent;color:var(--accent);font-size:.8rem;font-weight:950;line-height:1;white-space:nowrap}
.direction-clear-road-row{display:flex;align-items:center;flex-wrap:wrap;gap:7px;min-width:0}
.direction-clear-sign{display:inline-flex;align-items:center;justify-content:flex-start;max-width:100%;min-width:0}
.direction-clear-sign .direction-road-sign{max-width:100%;min-width:0}
.direction-clear-sign .street-sign-board{box-sizing:border-box;max-width:100%;padding:6px 9px;font-size:.7rem;line-height:1.08;text-align:left;white-space:normal;overflow-wrap:anywhere}
.direction-clear-sign .street-sign-post{display:none}
.direction-clear-sign .direction-highway-badge{min-width:46px;padding:4px 7px;font-size:.7rem}
.direction-clear-cardinal{display:inline-flex;align-items:center;min-height:0;padding:0;border:0;border-radius:0;color:var(--muted);background:transparent;font-size:.72rem;font-weight:900}
.direction-clear-note{margin-top:1px;color:var(--muted);font-size:.76rem;font-weight:800;line-height:1.3;border-left:0;padding-left:0}
.direction-clear-note::before{content:"• ";color:var(--accent)}
.direction-clear-fallback{color:var(--text);font-size:.82rem;font-weight:800;line-height:1.35;overflow-wrap:anywhere}
.direction-alternate-route-groups{margin-top:16px}
html[data-theme="day"] .direction-clear-distance{color:#066c66!important;background:transparent!important;border:0!important}
html[data-theme="day"] .direction-clear-cardinal{background:transparent!important;border:0!important;color:#526a7d!important}
html[data-theme="day"] .direction-clear-step{background:#f7faff!important;border-color:#d8e1eb!important}
html[data-theme="day"] .direction-clear-step .direction-pro-number{background:#e7f6f3!important;color:#075f5a!important;box-shadow:inset 0 0 0 1px #aad8d3!important}
@media(max-width:620px){
  .direction-clear-route-groups{gap:12px}
  .direction-clear-steps{gap:6px}
  .direction-clear-step{grid-template-columns:29px minmax(0,1fr);gap:9px;padding:9px 10px;border-radius:12px}
  .direction-clear-step .direction-pro-number{width:28px;height:28px;border-radius:8px;font-size:.78rem}
  .direction-clear-card{gap:4px}
  .direction-clear-meta{min-height:20px}
  .direction-clear-maneuver{font-size:.75rem}
  .direction-clear-distance{width:auto!important;font-size:.76rem}
  .direction-clear-sign .street-sign-board{font-size:.67rem;padding:5px 8px}
  .direction-clear-sign .direction-highway-badge{min-width:44px;font-size:.68rem;padding:4px 6px}
  .direction-clear-cardinal{font-size:.69rem}
  .direction-clear-note,.direction-clear-fallback{font-size:.74rem}
}
`;
  (document.head || document.documentElement).appendChild(style);
})();
