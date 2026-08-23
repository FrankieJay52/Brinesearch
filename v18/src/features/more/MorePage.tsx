import { Link } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { useDirectory } from "@/data/DirectoryContext";
import { legacyBrineSearchPaths } from "@/app/legacyLinks";

function MoreLink({ to, icon, title, detail, badge, sameOriginTool = false }: { to: string; icon: IconName; title: string; detail: string; badge?: string; sameOriginTool?: boolean }) {
  const content = <>
    <span className="more-row-icon"><Icon name={icon}/></span>
    <span className="more-row-copy"><strong>{title}</strong><small>{detail}</small></span>
    {badge && <span className="more-row-badge">{badge}</span>}
    <span className="result-arrow" aria-hidden="true">›</span>
  </>;
  return sameOriginTool ? <a className="more-row" href={to}>{content}</a> : <Link className="more-row" to={to}>{content}</Link>;
}

export function MorePage() {
  const { snapshot } = useDirectory();

  return <section className="content-page more-page">
    <header className="page-heading">
      <span className="eyebrow">BRINESEARCH</span>
      <h1>More</h1>
      <p>Personal preferences, field information, and tools that stay outside the main driver path.</p>
    </header>

    <section className="more-section" aria-labelledby="more-field-heading">
      <h2 id="more-field-heading">Field information</h2>
      <div className="more-list">
        <MoreLink to="/field-updates" icon="feed" title="Field Updates" detail="Open the current Field Feed for road and pad updates." badge="Live"/>
        <MoreLink to="/saved" icon="offline" title="Saved locations" detail={`Favorites, recent locations, and ${snapshot?.counts.locations.toLocaleString() || "no"} directory records loaded now.`}/>
        <MoreLink to={legacyBrineSearchPaths.dashboard} icon="more" title="Full driver dashboard" detail="Weather, nearby pads, favorites, offline tools, submissions, and community features." badge="Live" sameOriginTool/>
      </div>
    </section>

    <section className="more-section" aria-labelledby="more-preferences-heading">
      <h2 id="more-preferences-heading">Preferences</h2>
      <div className="more-list">
        <MoreLink to="/settings" icon="settings" title="Settings" detail="Display, accessibility, location permission, offline data, and app updates."/>
      </div>
    </section>

    <section className="more-section" aria-labelledby="more-owner-heading">
      <h2 id="more-owner-heading">Owner tools</h2>
      <div className="more-list">
        <MoreLink to="/control-center" icon="control" title="Control Center" detail="Open the existing authenticated Road Manager and owner review tools." badge="Live"/>
      </div>
    </section>

    <aside className="safety-note-card">
      <Icon name="route"/>
      <div><strong>BrineSearch is the road authority</strong><p>Map tiles and Google may render approved information, but neither service is allowed to invent or replace reviewed route truth.</p></div>
    </aside>
  </section>;
}
