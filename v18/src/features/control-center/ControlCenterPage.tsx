import { Link } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { legacyBrineSearchPaths } from "@/app/legacyLinks";
import { useOwnerAccess } from "@/data/OwnerAccessContext";
import "./control-center.css";

const roadManagerSteps: { icon: IconName; title: string; detail: string }[] = [
  { icon: "search", title: "Choose one pad", detail: "Start from a short review queue or find the exact pad. No giant management table." },
  { icon: "location", title: "Confirm the entrance", detail: "Place or verify the driver entrance before working on its route." },
  { icon: "map", title: "Review roads on the map", detail: "Follow the physical road in order and show every approved designation together." },
  { icon: "graph", title: "Resolve highlighted issues", detail: "Shared pavement, name changes, and uncertain junctions get plain-language prompts." },
  { icon: "route", title: "Preview the driver view", detail: "See the exact map line and directions drivers will receive before validation." },
  { icon: "control", title: "Validate, then publish", detail: "Validation and publication stay separate, explicit owner actions with receipts." },
];

export function ControlCenterPage() {
  const { access } = useOwnerAccess();
  return <section className="content-page control-center-page">
    <header className="subpage-topbar">
      <Link to="/more" className="icon-button" aria-label="Back to More"><Icon name="back"/></Link>
      <span>Control Center</span>
      <span className="topbar-spacer"/>
    </header>

    <section className="control-lock-card" aria-labelledby="control-lock-title">
      <span className="control-lock-icon"><Icon name="control"/></span>
      <span className="eyebrow">OWNER WORKFLOW</span>
      <h1 id="control-lock-title">{access.state === "owner" ? "Choose the owner road workspace" : "Open the operational Control Center"}</h1>
      <p>{access.state === "owner" ? "Use the native V18 map to inspect and highlight exact road identities. Use the existing Road Manager only when you need its separate editing workflow." : "Owner work continues in the existing authenticated BrineSearch Road Manager. Opening it never grants access; the current server-backed role check still applies."}</p>
      <div className="control-boundary-list">
        <span><Icon name="route"/><b>Road Manager</b><small>Operational owner tool</small></span>
        <span><Icon name="graph"/><b>Graph health</b><small>Existing protected workflow</small></span>
        <span><Icon name="google"/><b>Held routes</b><small>Existing owner review</small></span>
      </div>
      <div className="control-center-actions">
        {access.state === "owner" && <Link to="/settings/approved-routes" className="button-primary"><Icon name="map"/> Open Approved Routes Map</Link>}
        <a href={legacyBrineSearchPaths.controlCenter} className={access.state === "owner" ? "button-secondary" : "button-primary"}><Icon name="control"/> {access.state === "owner" ? "Open editing Road Manager" : "Open Control Center"}</a>
      </div>
    </section>

    <section className="road-manager-redesign" aria-labelledby="road-manager-redesign-title">
      <header>
        <span className="eyebrow">ROAD MANAGER REDESIGN</span>
        <h2 id="road-manager-redesign-title">One pad. One guided path.</h2>
        <p>The old Road Manager is not being carried into V18. Its replacement keeps the map visible and asks for one understandable decision at a time.</p>
      </header>
      <ol className="road-manager-steps">
        {roadManagerSteps.map((step, index) => <li key={step.title}>
          <span className="road-manager-step-number">{index + 1}</span>
          <span className="road-manager-step-icon"><Icon name={step.icon}/></span>
          <div><strong>{step.title}</strong><p>{step.detail}</p></div>
        </li>)}
      </ol>
    </section>

    <section className="road-manager-principles" aria-labelledby="road-manager-principles-title">
      <div>
        <span className="eyebrow">EASIER TO OPERATE</span>
        <h2 id="road-manager-principles-title">The complicated evidence stays available—not in your way</h2>
      </div>
      <ul>
        <li><Icon name="map"/><span><strong>Map first</strong><small>The selected road and problem area remain visible during every step.</small></span></li>
        <li><Icon name="route"/><span><strong>Physical-road language</strong><small>“Shared pavement begins” and “name changes—no turn” replace ambiguous road records.</small></span></li>
        <li><Icon name="control"/><span><strong>Safe actions</strong><small>Save draft, validate, and publish are separate. Nothing silently activates.</small></span></li>
        <li><Icon name="feed"/><span><strong>Evidence on demand</strong><small>Digests, IDs, and receipts live in an expandable owner panel for audits.</small></span></li>
      </ul>
    </section>

    <p className="safety-footer">The native map reuses the current BrineSearch owner session and every data request is rechecked by the owner-only database boundary. V18 does not grant editing rights or turn a selected road into route authority.</p>
  </section>;
}
