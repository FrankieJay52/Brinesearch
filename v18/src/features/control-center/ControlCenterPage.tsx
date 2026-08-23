import { Link } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
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
  const isOwner = access.state === "owner";
  return <section className="content-page control-center-page">
    <header className="subpage-topbar">
      <Link to="/more" className="icon-button" aria-label="Back to More"><Icon name="back"/></Link>
      <span>Control Center</span>
      <span className="topbar-spacer"/>
    </header>

    <section className="control-lock-card" aria-labelledby="control-lock-title">
      <span className="control-lock-icon"><Icon name="control"/></span>
      <span className="eyebrow">OWNER WORKFLOW</span>
      <h1 id="control-lock-title">{isOwner ? "Your road workspace is ready" : "Open the V18 road workspace"}</h1>
      <p>{isOwner ? "Inspect exact road identities and their authority evidence without leaving V18. The current release is deliberately read-only." : "Sign in here, then inspect approved roads on the native V18 map. The server still verifies Owner access before protected data loads."}</p>
      <div className="control-boundary-list">
        <span><Icon name="map"/><b>Exact road map</b><small>Visible road identities</small></span>
        <span><Icon name="graph"/><b>Graph evidence</b><small>Release-current only</small></span>
        <span><Icon name="route"/><b>Pad route context</b><small>No inferred gaps</small></span>
      </div>
      <div className="control-center-actions">
        <Link to="/settings/approved-routes" className="button-primary"><Icon name="map"/> {isOwner ? "Open Approved Routes Map" : "Continue to V18 Road Map"}</Link>
        <Link to="/sign-in?next=/settings/approved-routes" className="button-secondary"><Icon name="account"/> {isOwner ? "Owner account" : "Sign in to V18"}</Link>
      </div>
    </section>

    <section className="road-manager-redesign" aria-labelledby="road-manager-redesign-title">
      <header>
        <span className="eyebrow">ROAD MANAGER REDESIGN</span>
        <h2 id="road-manager-redesign-title">One pad. One guided path.</h2>
        <p>The exact read-only road map is the first safe step. Editing stays unavailable until a native guided workflow independently passes its authority and release gates.</p>
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

    <p className="safety-footer">The native map uses its own V18 session and every protected request is rechecked by the owner-only database boundary. V18 does not grant editing rights or turn a selected road into route authority.</p>
  </section>;
}
