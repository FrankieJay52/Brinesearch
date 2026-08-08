# BrineSearch urgent security hardening — 2026-08-08

## Recorded baseline

- GitHub production branch: `main`
- Baseline commit: `2a2feefe4b60421a33c5ff13a66b81b56494ebdc`
- Baseline Supabase migration: `20260808004921 apply_exact_spacing_aliases_without_fuzzy_matching`
- Production database project: `wvxzqtoiwhrgovzddtvz`
- No pad, road, turn, mileage, or Clear Directions value is modified by this security migration.

Before the migration runs, it stores function definitions and ACLs, relation and sequence ACLs, RLS policies, and trigger definitions in the private `private_verification` schema.

## Confirmed vulnerability and repair

Anonymous requests had `auth.uid() = NULL`. Several `SECURITY DEFINER` functions rejected only a non-null non-owner, which allowed the null caller through. The live anonymous proof returned Route Prep summary data.

The migration changes every owner check to reject both cases:

```sql
if caller is null or not public.is_brinesearch_owner(caller) then
  raise exception 'Owner access required';
end if;
```

The ODOT geometry loader receives the same mandatory owner check and is service-role-only. Internal maintenance functions are removed from the public RPC surface. Owner, editor, and moderator UI functions remain available only to authenticated users and retain role checks inside the function.

## Other changes

- Split public verification status from authenticated verification history. Anonymous responses contain no editor email or private audit history.
- Prevented a suspended Field Feed profile from restoring itself through either the RPC or a direct table update.
- Required confirmed email for privileged editor/moderator/owner checks and Field Feed posting.
- Added per-account Field Feed post, comment, report, and vote limits.
- Added image ownership, MIME, size, count, and storage quota checks plus a service-only orphan cleanup function.
- Replaced direct anonymous `submit_pad` execution with a Turnstile-validated Edge Function, HMAC IP/identity rate limits, strict body limits, a 25-well maximum, and the existing honeypot.
- Replaced anonymous `select=*` access to `pads` with a safe summary view and lazy selected-pad detail view. The public directory snapshot Edge Function adds cache headers and ETags.
- Removed anonymous access to Road Manager, Route Prep, ODOT work tables, editor audit tables, verification history tables, and the submission queue.
- Revoked direct execution of trigger helpers.
- Set immutable function `search_path` values flagged by the advisor and moved `pg_trgm` to the `extensions` schema.
- Added HSTS without `includeSubDomains`/preload, a report-only CSP, COOP, and cross-domain policy headers.

## Retired import endpoint

The live `import-brinesearch` Edge Function was found with authentication and database-import tokens embedded directly in source and `verify_jwt=false`. Its pre-change version was recorded as version 1 with source SHA-256:

`76129483a108f3d7e23644d58e5407b5f61b0c6fd4a9b2930242fdcb5741ec58`

The token values are intentionally omitted. The legacy database RPC is dropped and the Edge Function is replaced by a JWT-protected retired-endpoint response. Treat the embedded tokens as permanently burned.

## Turnstile production setup

The production public-submission path fails closed until these Supabase Edge Function secrets are configured:

- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `SUBMISSION_RATE_LIMIT_SECRET` (recommended; the server secret key is a fallback)

Netlify deploy previews and localhost use Cloudflare's official test credentials in dry-run mode. Preview tests exercise CAPTCHA verification and rate limiting but never create a production pad submission.

## Manual platform controls

These settings cannot be safely enabled by a database migration:

- Supabase Auth leaked-password protection
- Email confirmation before account use
- Supabase CAPTCHA for signup and recovery
- TOTP/MFA for the owner, followed by AAL2 enforcement for destructive owner operations
- Supabase backups/PITR and an encrypted offsite export
- GitHub private visibility, private vulnerability reporting, secret scanning/push protection, Dependabot security alerts, and protected `main`
- GitHub, Netlify, Supabase, email, and registrar passkeys or two-factor authentication
- Registrar and transfer locks, least-privilege teams, deployment permissions, uptime alerts, and written recovery procedures

## Required validation record

Before merge, record results for:

1. Anonymous owner/editor/moderator RPC rejection.
2. Anonymous Route Prep summary rejection.
3. ODOT geometry loader rejection for anonymous and ordinary authenticated callers.
4. Public directory, selected pad, and Field Feed reading.
5. Real owner Route Prep and Road Manager access.
6. Approved editor writes and ordinary-user denial.
7. Moderator actions and ordinary-user denial.
8. Suspended-profile self-reactivation denial.
9. Public verification output containing no email/history.
10. Turnstile and IP/identity rate-limit tests.
11. Storage ownership and MIME tests.
12. Supabase security-advisor results and documented intentional warnings.
13. Production build, service worker, installed iPhone mode, daylight/night, login, uploads, maps, Field Feed, and Road Manager checks.

## Repository visibility reality

Changing the repository to private blocks casual source browsing and history access. It does not prevent downloading HTML, CSS, or JavaScript delivered to a browser. Security-sensitive and proprietary logic should remain in database or Edge Functions; client minification is not a security boundary.
