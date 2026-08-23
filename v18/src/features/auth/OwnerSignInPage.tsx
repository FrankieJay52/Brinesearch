import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { useOwnerAccess } from "@/data/OwnerAccessContext";
import { ownerSignInDestination } from "./authNavigation";
import "./owner-auth.css";

export function OwnerSignInPage() {
  const { access, signIn, signOut } = useOwnerAccess();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const destination = ownerSignInDestination(new URLSearchParams(location.search).get("next"));
  const busy = access.state === "checking";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    const result = await signIn(email, password);
    setPassword("");
    if (result.state === "owner") navigate(destination, { replace: true });
  }

  async function leaveAccount() {
    setNotice("");
    try {
      await signOut();
    } catch {
      setNotice("Sign-out could not be confirmed. Try again before leaving this device.");
    }
  }

  return <section className="content-page owner-auth-page">
    <header className="subpage-topbar">
      <Link to="/control-center" className="icon-button" aria-label="Back to Control Center"><Icon name="back"/></Link>
      <span>Owner account</span>
      <span className="topbar-spacer"/>
    </header>

    <div className="owner-auth-layout">
      <section className="owner-auth-intro">
        <span className="owner-auth-icon"><Icon name="account"/></span>
        <span className="eyebrow">V18 OWNER ACCESS</span>
        <h1>{access.state === "owner" ? "You’re signed in" : "Sign in without leaving V18"}</h1>
        <p>Owner authentication, access checks, the road map, and Back navigation now stay in this V18 app.</p>
        <ul>
          <li><Icon name="control"/><span><strong>Server-checked access</strong><small>The database confirms the Owner role before any protected road data loads.</small></span></li>
          <li><Icon name="map"/><span><strong>Exact road inspection</strong><small>The selected identity is highlighted; viewing it never changes route authority.</small></span></li>
          <li><Icon name="route"/><span><strong>Fail-closed controls</strong><small>This release is read-only. It cannot approve, reconcile, publish, or fabricate a route.</small></span></li>
        </ul>
      </section>

      <section className="owner-auth-card" aria-live="polite">
        {access.state === "owner" ? <>
          <span className="owner-auth-state is-owner"><i/> Owner access confirmed</span>
          <h2>Approved Routes Map is ready</h2>
          <p>Your V18 session is active on this device. Every protected request is still checked by the server.</p>
          <Link to={destination} className="button-primary"><Icon name="map"/> Continue to road map</Link>
          <button type="button" className="button-secondary" onClick={() => { void leaveAccount(); }}><Icon name="account"/> Sign out on this device</button>
        </> : <form onSubmit={submit} noValidate>
          <span className={`owner-auth-state${access.state === "denied" || access.state === "error" ? " is-warning" : ""}`}><i/> {busy ? "Checking secure session" : access.state === "denied" ? "Different owner account required" : "Secure owner sign-in"}</span>
          <h2>BrineSearch owner account</h2>
          <p id="owner-auth-help">Use the same owner email and password, here in V18.</p>
          <label><span>Email</span><input type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value.slice(0, 254))} required disabled={busy} aria-describedby="owner-auth-help"/></label>
          <label><span>Password</span><span className="owner-password-field"><input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy}/><button type="button" onClick={() => setShowPassword((current) => !current)} disabled={busy}>{showPassword ? "Hide" : "Show"}</button></span></label>
          {access.state !== "signed_out" && access.state !== "checking" && <p className="owner-auth-message" role="alert">{access.message}</p>}
          {access.state === "signed_out" && access.message !== "Sign in to V18 to open owner tools." && <p className="owner-auth-message" role="alert">{access.message}</p>}
          {notice && <p className="owner-auth-message" role="alert">{notice}</p>}
          <button type="submit" className="button-primary" disabled={busy || !email.trim() || !password}><Icon name="account"/> {busy ? "Checking…" : "Sign in to V18"}</button>
          {access.state === "denied" && <button type="button" className="button-secondary" onClick={() => { void leaveAccount(); }}><Icon name="account"/> Sign out and switch account</button>}
          <small className="owner-auth-privacy">The password is sent directly to BrineSearch authentication and is never stored by this page.</small>
        </form>}
      </section>
    </div>
  </section>;
}
