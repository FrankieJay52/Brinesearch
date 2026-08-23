import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { loadFieldUpdates, type FieldUpdate } from "@/data/fieldUpdates";
import "./field-updates.css";

const categories = [
  ["", "All updates"], ["field_alert", "Field alerts"], ["road_closure", "Road closures"],
  ["hazard", "Hazards"], ["pad_update", "Pad updates"], ["disposal", "Disposals"],
  ["weather", "Weather"], ["frac_activity", "Frac activity"], ["question", "Questions"], ["meme", "Memes"],
] as const;

const categoryLabels = new Map(categories);

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function UpdateCard({ update }: { update: FieldUpdate }) {
  const context = [update.jobRole, update.profileCompany].filter(Boolean).join(" · ") || "BrineSearch member";
  return <article className={`field-update-card${update.category === "field_alert" ? " is-alert" : ""}`}>
    <header>
      <span className="field-update-symbol"><Icon name={update.category === "weather" ? "sun" : update.category === "pad_update" || update.category === "frac_activity" ? "location" : "feed"}/></span>
      <span className="field-update-author"><strong>{update.displayName}{update.username ? <small> @{update.username}</small> : null}</strong><small>{context}</small></span>
      <time dateTime={update.createdAt}>{formatTime(update.createdAt)}</time>
    </header>
    <div className="field-update-labels">
      <span>{categoryLabels.get(update.category as typeof categories[number][0]) || update.category.replaceAll("_", " ")}</span>
      {update.verifiedCompanyRep && <span className="is-verified">Verified company rep</span>}
      {update.badge && <span>{update.badge}</span>}
    </div>
    <p>{update.body}</p>
    {(update.roadName || update.companyTag || update.padId) && <div className="field-update-context">
      {update.roadName && <span><Icon name="route"/> {update.roadName}</span>}
      {update.companyTag && <span><Icon name="company"/> {update.companyTag}</span>}
      {update.padId && <Link to={`/pad/${encodeURIComponent(update.padId)}`}><Icon name="location"/> Open linked pad</Link>}
    </div>}
    <footer><span>Helpful {update.helpfulCount.toLocaleString()}</span><span>Confirmed {update.confirmCount.toLocaleString()}</span><span>Comments {update.commentCount.toLocaleString()}</span></footer>
  </article>;
}

export function FieldUpdatesPage() {
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [category, setCategory] = useState("");
  const [reload, setReload] = useState(0);
  const [updates, setUpdates] = useState<FieldUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    loadFieldUpdates(appliedQuery, category, controller.signal).then((rows) => {
      setUpdates(rows);
      setLoading(false);
    }).catch((reason) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setUpdates([]);
      setError("Live field updates could not be verified. No unverified posts were shown.");
      setLoading(false);
    });
    return () => controller.abort();
  }, [appliedQuery, category, reload]);

  function search(event: FormEvent) {
    event.preventDefault();
    setAppliedQuery(query.trim().slice(0, 100));
  }

  return <section className="content-page field-updates-page">
    <header className="subpage-topbar">
      <Link to="/more" className="icon-button" aria-label="Back to More"><Icon name="back"/></Link>
      <span>Field Updates</span>
      <span className="topbar-spacer"/>
    </header>

    <header className="page-heading field-updates-heading">
      <span className="eyebrow">LIVE FIELD INFORMATION</span>
      <h1>What crews are seeing</h1>
      <p>Moderated public road and pad updates now load directly inside V18. Posts are field reports—not route approval.</p>
    </header>

    <form className="field-updates-toolbar" onSubmit={search}>
      <label className="field-updates-search"><span><Icon name="search"/> Search updates</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value.slice(0, 100))} placeholder="Road, pad, company, or update…"/></label>
      <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map(([value, label]) => <option value={value} key={value || "all"}>{label}</option>)}</select></label>
      <button type="submit" className="button-primary"><Icon name="search"/> Search</button>
      <button type="button" className="button-secondary" onClick={() => setReload((value) => value + 1)}><Icon name="update"/> Refresh</button>
    </form>

    <aside className="field-updates-boundary"><Icon name="control"/><span><strong>Public reading is live in V18</strong><small>Creating, voting, commenting, reporting, profiles, and moderation stay unavailable until their native V18 write contracts are separately reviewed.</small></span></aside>

    {loading ? <div className="field-updates-loading" role="status"><span/><strong>Checking live field updates…</strong></div>
      : error ? <aside className="feature-hold-card" role="alert"><span className="feature-hold-icon"><Icon name="feed"/></span><div><strong>Field Updates unavailable</strong><p>{error}</p></div><button type="button" className="button-secondary" onClick={() => setReload((value) => value + 1)}>Try again</button></aside>
        : updates.length ? <div className="field-update-list" aria-live="polite">{updates.map((update) => <UpdateCard update={update} key={update.id}/>)}</div>
          : <EmptyState icon="feed" title="No matching field updates" body={appliedQuery || category ? "Try another search or category. V18 will not substitute unverified content." : "The live moderated feed has no current public posts."}/>}

    <footer className="field-updates-safety"><Icon name="route"/><span><strong>Do not treat a post as a route.</strong> Follow dispatch, road signs, permits, and the independently approved BrineSearch route contract.</span></footer>
  </section>;
}
