import { useEffect } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Brand } from "@/components/Brand";
import { Icon, type IconName } from "@/components/Icon";
import { DirectoryProvider, useDirectory } from "@/data/DirectoryContext";
import { CompanyRoadsProvider } from "@/data/CompanyRoadsContext";
import { MapPage } from "@/features/map/MapPage";
import { SearchPage } from "@/features/search/SearchPage";
import { SearchOverlay } from "@/features/search/SearchOverlay";
import { PadPage } from "@/features/pad/PadPage";
import { SavedPage } from "@/features/saved/SavedPage";
import { MorePage } from "@/features/more/MorePage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { ControlCenterPage } from "@/features/control-center/ControlCenterPage";
import { FieldUpdatesPage } from "@/features/more/FieldUpdatesPage";
import { useAppUpdate } from "./useAppUpdate";

const navigation: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Map", icon: "map" },
  { to: "/search", label: "Search", icon: "search" },
  { to: "/saved", label: "Saved", icon: "saved" },
  { to: "/more", label: "More", icon: "more" },
];

function AppHeader() {
  const { snapshot } = useDirectory();
  return (
    <header className="app-header">
      <Brand />
      <div className="header-actions">
        <span className={`source-pill source-${snapshot?.sourceState || "loading"}`}>
          <span />{snapshot?.sourceState === "live_current" ? "Live" : snapshot?.sourceState === "live_stale" || snapshot?.sourceState === "cached_stale" ? "Update needed" : snapshot ? "Saved data" : "Connecting"}
        </span>
        <NavLink to="/settings" className="icon-button" aria-label="Settings"><Icon name="settings"/></NavLink>
      </div>
    </header>
  );
}

function BottomNavigation() {
  const location = useLocation();
  const hidden = location.pathname.startsWith("/pad/");
  if (hidden) return null;
  return <nav className="bottom-navigation" aria-label="Main navigation">{navigation.map((item) => {
    const active = item.to === "/"
      ? location.pathname === "/"
      : location.pathname === item.to
        || (item.to === "/search" && location.pathname.startsWith("/search/"))
        || (item.to === "/more" && ["/settings", "/control-center", "/field-updates"].some((path) => location.pathname.startsWith(path)));
    return <NavLink key={item.to} to={item.to} end={item.to === "/"} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
      <Icon name={item.icon}/><span>{item.label}</span>
    </NavLink>;
  })}</nav>;
}

function RouteScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function UpdateNotice() {
  const update = useAppUpdate();
  if (!update.updateAvailable && !update.offlineReady) return null;
  return <aside className="update-notice" role="status">
    <Icon name={update.updateAvailable ? "update" : "offline"}/>
    <div><strong>{update.updateAvailable ? "A new BrineSearch build is ready" : "Offline shell is ready"}</strong><small>{update.updateAvailable ? "Reload when you are safely stopped." : "Saved field data remains separate from the app update."}</small></div>
    {update.updateAvailable ? <div className="update-actions"><button className="button-quiet" onClick={update.dismissUpdate}>Later</button><button onClick={update.applyUpdate}>Reload latest</button></div> : <button className="button-quiet" onClick={update.dismissOffline}>Got it</button>}
  </aside>;
}

function SearchOverlayRoute() {
  return <><MapPage/><SearchOverlay/></>;
}

function AppRoutes() {
  return <>
    <RouteScrollReset />
    <AppHeader />
    <main className="app-main">
      <Routes>
        <Route path="/" element={<MapPage/>}/>
        <Route path="/search" element={<SearchOverlayRoute/>}/>
        <Route path="/search/all" element={<SearchPage/>}/>
        <Route path="/saved" element={<SavedPage/>}/>
        <Route path="/more" element={<MorePage/>}/>
        <Route path="/settings" element={<SettingsPage/>}/>
        <Route path="/control-center" element={<ControlCenterPage/>}/>
        <Route path="/field-updates" element={<FieldUpdatesPage/>}/>
        <Route path="/pad/:padId" element={<PadPage/>}/>
        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
    </main>
    <UpdateNotice />
    <BottomNavigation />
  </>;
}

export function App() {
  return <DirectoryProvider><CompanyRoadsProvider><div className="app-shell"><AppRoutes/></div></CompanyRoadsProvider></DirectoryProvider>;
}
