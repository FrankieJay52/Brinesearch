import { Link } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { legacyBrineSearchPaths } from "@/app/legacyLinks";

export function FieldUpdatesPage() {
  return <section className="content-page field-updates-page">
    <header className="subpage-topbar">
      <Link to="/more" className="icon-button" aria-label="Back to More"><Icon name="back"/></Link>
      <span>Field Updates</span>
      <span className="topbar-spacer"/>
    </header>

    <header className="page-heading">
      <span className="eyebrow">LIVE FIELD INFORMATION</span>
      <h1>Field Updates</h1>
      <p>Road and pad updates continue in the existing moderated BrineSearch Field Feed.</p>
    </header>

    <aside className="feature-hold-card">
      <span className="feature-hold-icon"><Icon name="feed"/></span>
      <div><strong>The current Field Feed is available</strong><p>Open it on this same BrineSearch website. Its existing moderation and sign-in protections remain in place.</p></div>
      <span className="more-row-badge">Live</span>
    </aside>

    <div className="two-action-row">
      <a href={legacyBrineSearchPaths.fieldUpdates} className="button-primary"><Icon name="feed"/> Open Field Feed</a>
      <Link to="/" className="button-secondary"><Icon name="map"/> Return to Map</Link>
    </div>
  </section>;
}
