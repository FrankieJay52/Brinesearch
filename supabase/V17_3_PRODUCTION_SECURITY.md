# BrineSearch V17.3 production security state

The following production migrations were applied to Supabase during the V17.3 audit:

- `20260807092537_v17_3_feed_security`
- `20260807170956_v17_3_field_profile_activation`
- `20260807173444_v17_3_moderation_integrity`

## Enforced in PostgreSQL

- Field Feed post, comment, report, vote, profile, and media ownership is checked against `auth.uid()`.
- Profile and post image URLs must point to the authenticated user's folder in the public `field-feed-images` bucket when newly inserted or changed.
- Users cannot assign themselves reputation, verification, contributor, strike, suspension, moderation, deletion, or review fields.
- Duplicate posts, duplicate replies, and repeated open reports are blocked.
- Posts, comments, reports, and votes have database rate limits.
- Field Feed posts have length, image-count, coordinate-pair, and Field Alert expiration validation.
- Trusted triggers create reply and access-change notifications.
- Report and moderation audit columns are protected from direct client edits.
- Owner/editor/moderator operations remain backed by Supabase Row Level Security and security-definer permission checks.

This file records the production migration state because the early Supabase project was created through connected migration tooling before every historical migration had a matching repository file. Do not weaken these controls in client-side code; interface role checks are presentation only.
