import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { useTheme, type ThemePreference } from "@/app/ThemeProvider";
import { usePreferences } from "@/app/PreferencesProvider";
import { useDirectory } from "@/data/DirectoryContext";
import "./settings.css";

function Toggle({ checked, label, detail, onChange }: { checked: boolean; label: string; detail: string; onChange: (checked: boolean) => void }) {
  return <label className="settings-toggle-row">
    <span><strong>{label}</strong><small>{detail}</small></span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)}/>
    <span className="toggle-control" aria-hidden="true"><i/></span>
  </label>;
}

function SettingsHeading({ id, icon, title, detail }: { id: string; icon: IconName; title: string; detail: string }) {
  return <header className="settings-group-heading">
    <span><Icon name={icon}/></span>
    <div><h2 id={id}>{title}</h2><p>{detail}</p></div>
  </header>;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : parsed.toLocaleString();
}

function sourceLabel(value: string | undefined) {
  if (value === "live_current") return "Live and current";
  if (value === "live_stale") return "Live update available";
  if (value === "cached_live") return "Saved live copy";
  if (value === "cached_stale") return "Saved older copy · update needed";
  if (value === "packaged_fallback") return "Built-in offline directory";
  return "Unavailable";
}

export function v18ServiceWorkerScope(origin: string, baseUrl: string) {
  return new URL(baseUrl, origin).href;
}

type LocationPermission = "allowed" | "ask" | "blocked" | "browser";

function useLocationPermission() {
  const [permission, setPermission] = useState<LocationPermission>("browser");

  useEffect(() => {
    if (!navigator.permissions?.query) return;
    let active = true;
    let status: PermissionStatus | null = null;
    const update = () => {
      if (!active || !status) return;
      setPermission(status.state === "granted" ? "allowed" : status.state === "denied" ? "blocked" : "ask");
    };
    navigator.permissions.query({ name: "geolocation" }).then((nextStatus) => {
      if (!active) return;
      status = nextStatus;
      update();
      status.addEventListener?.("change", update);
    }).catch(() => setPermission("browser"));
    return () => {
      active = false;
      status?.removeEventListener?.("change", update);
    };
  }, []);

  return permission;
}

const permissionCopy: Record<LocationPermission, { label: string; detail: string }> = {
  allowed: { label: "Location allowed", detail: "The Map location button can center on this device when you press it." },
  ask: { label: "Ask when needed", detail: "Your browser will ask when you press the Map location button." },
  blocked: { label: "Location blocked", detail: "Change this site's permission in your browser to use the Map location button." },
  browser: { label: "Managed by browser", detail: "Your browser controls whether BrineSearch can use this device location." },
};

export function SettingsPage() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { largeText, reducedMotion, highContrast, setLargeText, setReducedMotion, setHighContrast, resetPreferences } = usePreferences();
  const { snapshot } = useDirectory();
  const locationPermission = useLocationPermission();
  const [updateCheck, setUpdateCheck] = useState("Ready to check");
  const [online, setOnline] = useState(() => navigator.onLine);

  async function checkForUpdate() {
    setUpdateCheck("Checking…");
    try {
      const expectedScope = v18ServiceWorkerScope(window.location.origin, import.meta.env.BASE_URL);
      const registrations = await navigator.serviceWorker?.getRegistrations();
      const registration = registrations?.find((candidate) => candidate.scope === expectedScope);
      if (!registration) {
        setUpdateCheck("App install not active in this preview");
        return;
      }
      await registration.update();
      setUpdateCheck("Update check complete");
    } catch {
      setUpdateCheck("Could not check—current app is still safe to use");
    }
  }

  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);

  const permission = permissionCopy[locationPermission];
  const latestDirectoryTime = snapshot?.lastVerifiedAt || snapshot?.fetchedAt || snapshot?.generatedAt;

  return <section className="content-page settings-page">
    <header className="subpage-topbar">
      <Link to="/more" className="icon-button" aria-label="Back to More"><Icon name="back"/></Link>
      <span>Settings</span>
      <span className="topbar-spacer"/>
    </header>

    <header className="page-heading settings-intro">
      <span className="eyebrow">YOUR APP</span>
      <h1>Make it comfortable</h1>
      <p>Simple choices for this device. Road approval, graph status, and publishing are kept safely outside Settings.</p>
    </header>

    <div className="settings-at-a-glance" aria-label="App status at a glance" aria-live="polite">
      <span><i className={`data-dot data-${snapshot?.sourceState || "unavailable"}`}/><small>Directory</small><strong>{sourceLabel(snapshot?.sourceState)}</strong></span>
      <span><Icon name="update"/><small>App</small><strong>{online ? "Online" : "Offline"}</strong></span>
    </div>

    <section className="settings-group" aria-labelledby="display-heading">
      <SettingsHeading id="display-heading" icon="sun" title="Display" detail="Choose what is easiest to read in the truck or office."/>
      <div className="settings-panel">
        <fieldset className="theme-fieldset">
          <legend>Appearance</legend>
          <div className="theme-choice theme-choice-three">
            {([
              ["system", "settings", "Auto", `Follows device · ${resolvedTheme === "day" ? "day" : "night"}`],
              ["day", "sun", "Day", "Bright daylight view"],
              ["night", "moon", "Night", "Low-glare field view"],
            ] as [ThemePreference, IconName, string, string][]).map(([value, icon, label, detail]) => <button type="button" key={value} className={theme === value ? "active" : ""} aria-pressed={theme === value} onClick={() => setTheme(value)}>
              <Icon name={icon}/><span><strong>{label}</strong><small>{detail}</small></span>
            </button>)}
          </div>
        </fieldset>
        <div className="settings-list settings-list-flush">
          <Toggle checked={largeText} onChange={setLargeText} label="Larger text" detail="Makes labels and directions easier to read."/>
          <Toggle checked={highContrast} onChange={setHighContrast} label="Stronger contrast" detail="Adds clearer borders and brighter controls."/>
          <Toggle checked={reducedMotion} onChange={setReducedMotion} label="Reduce motion" detail="Limits animation and sliding effects."/>
        </div>
        <button type="button" className="settings-reset-button" onClick={() => { setTheme("system"); resetPreferences(); }}><Icon name="settings"/> Use device defaults</button>
      </div>
    </section>

    <section className="settings-group" aria-labelledby="map-driving-heading">
      <SettingsHeading id="map-driving-heading" icon="map" title="Map and driving" detail="Location access and the safety rules used on every route."/>
      <div className="settings-panel settings-panel-rows">
        <div className="settings-info-row">
          <span className={`settings-state-icon permission-${locationPermission}`}><Icon name="location"/></span>
          <span><strong>{permission.label}</strong><small>{permission.detail}</small></span>
          <Link to="/" className="settings-row-action">Open Map</Link>
        </div>
        <div className="settings-info-row settings-locked-row">
          <span className="settings-state-icon"><Icon name="route"/></span>
          <span><strong>Approved route roads only</strong><small>Company overlays show only the exact released subset; held, stale, legacy-only, unpublished, or guessed roads stay hidden.</small></span>
          <b>Always on</b>
        </div>
        <div className="settings-info-row settings-locked-row">
          <span className="settings-state-icon"><Icon name="google"/></span>
          <span><strong>Google is display only</strong><small>Google cannot decide road identity or replace a BrineSearch route.</small></span>
          <b>Locked</b>
        </div>
      </div>
    </section>

    <section className="settings-group" aria-labelledby="offline-heading">
      <SettingsHeading id="offline-heading" icon="offline" title="Saved and device data" detail="See favorites and the complete directory currently loaded in BrineSearch."/>
      <div className="settings-panel">
        <div className="settings-simple-status">
          <span><small>Locations loaded now</small><strong>{snapshot?.counts.locations.toLocaleString() || "0"}</strong></span>
          <span><small>Last directory check</small><strong>{formatDate(latestDirectoryTime)}</strong></span>
        </div>
        <Link className="settings-primary-link" to="/saved"><Icon name="saved"/><span><strong>Manage saved locations</strong><small>Favorites, recent locations, and directory status</small></span><b aria-hidden="true">›</b></Link>
        <details className="settings-details">
          <summary>View directory details <span>⌄</span></summary>
          <div className="settings-data-card">
            <div><small>Source</small><strong>{sourceLabel(snapshot?.sourceState)}</strong></div>
            <div><small>Locations</small><strong>{snapshot?.counts.locations.toLocaleString() || "0"}</strong></div>
            <div><small>Published</small><strong>{formatDate(snapshot?.generatedAt)}</strong></div>
            <div><small>Received here</small><strong>{formatDate(snapshot?.fetchedAt)}</strong></div>
            <div className="settings-data-wide"><small>Last verified with server</small><strong>{formatDate(snapshot?.lastVerifiedAt)}</strong></div>
          </div>
        </details>
      </div>
    </section>

    <section className="settings-group" aria-labelledby="updates-heading">
      <SettingsHeading id="updates-heading" icon="update" title="Updates" detail="Check for a newer BrineSearch app when you are safely stopped."/>
      <div className="settings-panel settings-update-panel">
        <div className="settings-update-copy"><span><small>Installed build</small><strong>{__BRINESEARCH_VERSION__}</strong></span><span><small>Status</small><strong role="status" aria-live="polite" aria-busy={updateCheck === "Checking…"}>{updateCheck}</strong></span></div>
        <button className="button-secondary" type="button" onClick={checkForUpdate} disabled={updateCheck === "Checking…"}><Icon name="update"/> Check for update</button>
        <p>BrineSearch never reloads itself during active use. A ready update waits for you.</p>
      </div>
    </section>

    <aside className="settings-owner-note">
      <Icon name="control"/>
      <div><strong>Looking for Road Manager?</strong><p>Owner tools now live in a separate Control Center so drivers cannot accidentally enter an editing workflow.</p></div>
      <Link to="/control-center">Open Control Center</Link>
    </aside>
  </section>;
}
