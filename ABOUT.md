# labs-dash — About

The index page at **https://labs.ai.tech.gov.sg** — one card per project under
`Terra/projects/`, grouped into five fantasy-themed ranks. An **internal sharing surface**:
IP-fenced to the corporate allowlist and gated behind TechPass. Not public, not for general users.

Live in AWS account **323001028968** (`ap-southeast-1`). Design spec:
`docs/superpowers/specs/2026-07-25-labs-dash-design.md`. Build plan:
`docs/superpowers/plans/2026-07-25-labs-dash.md`.

## Architecture

Static Vite + React + TS single page. No backend, no API, no runtime data fetching.

```
Browser
  │
  ▼
CloudFront  EFEV1TL1LF6Y3  (labs.ai.tech.gov.sg)
  ├─ WAF web ACL   labs-dash-cf-waf / 62dd88a9-f202-4c20-95be-316c273df129
  │                default BLOCK + allow the shared corp IP set (23 addresses)
  ├─ Lambda@Edge   labs-dash-cognito-edge  (viewer-request, us-east-1)
  │                labs-auth cognito-at-edge gate, TechPass
  └─ Origin (OAC E1T0B05MNI9XDW) ──▶ s3://labs-dash-site  (private, PAB on)
```

Render pipeline: `src/data/projects.json` (committed seed) → localStorage overrides layered on
top → grouped by tier → rendered. One direction.

| Resource | Value |
|---|---|
| Distribution | `EFEV1TL1LF6Y3` (`d2jfwh22nyys5e.cloudfront.net`) |
| Bucket | `labs-dash-site` (`ap-southeast-1`, private, public-access-block on) |
| WAF ACL | `labs-dash-cf-waf` `62dd88a9-f202-4c20-95be-316c273df129` (`us-east-1`, scope CLOUDFRONT) |
| Certificate | `f053a5a8-7d8b-409c-b733-c4801a2485cf` — `*.labs.ai.tech.gov.sg` **with the apex as a SAN**. **Expires 2026-12-12.** |
| Cognito pool | `ap-southeast-1_zhuDvtEBS` (shared, `labs-auth`) |
| App client | `labs-dash` = `1clu7qnljgrmvbusf4hqbuj0vt`, COGNITO + TechPass, **no required group** |
| Edge function | `labs-dash-cognito-edge` (us-east-1), role `labs-dash-cognito-edge-role` |

## The five ranks

Tier describes the **project's** vitality and is a human judgement call — no probe can tell
"dormant" from "zombified", because the difference is whether anyone intends to come back.

| Rank | Tier | Means |
|---|---|---|
| ◆ The Living | `living` | Maintained, someone owns it |
| ✦ The Ascended | `ascended` | Graduated — absorbed into another project; repo survives as reference |
| ◇ The Dormant | `dormant` | Up and working, development paused |
| ◈ The Risen | `risen` | Still running, still billing, unowned |
| † The Fallen | `fallen` | Decommissioned. Tombstone, never a link |

Order is fixed and deliberate: descending vitality with one honourable exit. Ascended sits
**second** because filing a graduate below the dead would say the opposite of what it means.

**Hosted-ness is a separate axis, not a sixth rank.** A project can be actively developed with
nothing deployed (`⌀ UNSUMMONED`, card is not a link), and a project can be deployed with nobody
home. Unhosted and fallen cards deliberately have no hover lift and no pointer cursor — there is
nowhere to go, so the affordance must not suggest otherwise.

## Data

`src/data/projects.json`, 49 entries — every directory under `Terra/projects/` whose `.git` is a
**directory**, excluding `labs-dash` itself, plus one hosted-but-repoless entry (`analytics`).

Seeded by `scripts/seed-roster.mjs` from commit recency + hosting, then corrected by hand. The
`.git`-must-be-a-directory rule matters: `continuum-plan2` holds a git **worktree pointer file**
(a second working copy of `continuum`) and `govbrain-fauxdesk` has no `.git` at all — neither is a
separate project. Blurbs come from each project's own `ABOUT.md`, falling back to `README.md`.

**Seven blurbs are still `No description recorded.`** — `limn`, `build-solver`,
`build-for-build`, `how-can`, `terra-dashboard`, `wowdocs`, `VOX`. Two are odd rather than merely
undocumented: `wowdocs`'s README is byte-identical to `doc-generator`'s (title still reads
`# doc-generator`), and `VOX` is a vendored clone of the external OpenBMB/VoxCPM2 project, so
describing it as first-party would misrepresent it.

## Drag-and-drop re-tiering

Owner-only, `?edit=1`. Dropping a card writes `{slug: tier}` to `labs-dash:overrides` in
localStorage, layered over the committed file at render time. `copy projects.json` emits the full
roster with overrides applied for pasting back into `src/data/projects.json`; committing that makes
the change canonical and the override can be reset.

**Four of the five ranks are drop targets. The Ascended is not.** Ascending means being absorbed
into a *named* successor, and a dragged card carries no successor to name — so the rank refuses
drops and never shows drop-target styling (`acceptsDrop` in `src/types.ts`). Its cards still render
normally and are still draggable *out*; dragging one out strips `absorbedInto`, which is what keeps
the exported roster passing the ascended-iff-`absorbedInto` test it gets pasted back into. To
promote something to Ascended, edit `projects.json` by hand and supply the successor.

**Per-browser by design.** An override affects only the browser that made it, which is what makes
"for me alone" true with no server-side authorization — there is no shared write path. The owner
check reads the `email` claim from the Cognito ID token cookie (`cognito-at-edge` sets it without
`httpOnly`, which `labs-auth/edge-auth/group-gate.js` also relies on).

> That check is a **UX affordance, not a security control** — anyone can bypass it in devtools.
> That is acceptable precisely because overrides are local-only and cannot affect another viewer
> or the deployed artifact. It must never be represented as authorization.

## Gotchas

- **The apex DNS record already existed, pointing at nothing.** `labs.ai.tech.gov.sg` resolved to
  CloudFront IPs while no distribution claimed the alias, so TLS failed outright. Claiming the
  alias was enough to make it live — the `ai.tech.gov.sg` zone is not in this account and no
  zone-owner request was needed.
- **The certificate covers the apex only because of an explicit SAN.** A bare
  `*.labs.ai.tech.gov.sg` wildcard would not.
- **Callback URLs: all three forms, and the bare origin is the one that matters.**
  `cognito-at-edge` builds `redirect_uri` as exactly `https://labs.ai.tech.gov.sg` — no trailing
  slash, no path. `update-user-pool-client` **replaces** the callback list rather than merging, so
  omitting the bare origin causes `redirect_mismatch` on every login.
- **The edge bundle is ~1.4 MB** (`build.sh` zips `node_modules`) and is accepted on
  viewer-request; `labs-playtester-cognito-edge` runs at the same size. Depot's 103 KB esbuild
  bundle is leaner if this ever needs shrinking.
- **`.tier` starts at `opacity: 0`** and is revealed by an IntersectionObserver via a
  `data-revealed` attribute. It is an **attribute, not a class**, because React rewriting
  `className` erased an imperatively-added class and left sections permanently invisible after one
  drag. There is a guard test; do not move it back to a class.
- **`provision-edge.sh` did not exist** before this project, despite `labs-auth`'s README
  referencing it in four places. It now lives in `labs-auth/` and does both halves — publish a
  version *and* repoint the distribution.
- **`provision-edge.sh` gates every cache behavior, not just the default, and halts on a foreign
  gate.** Its first version rewrote only `DefaultCacheBehavior` and then printed `ACCESS CUTOVER
  COMPLETE`. labs-dash `EFEV1TL1LF6Y3` has no extra behaviors so it was unaffected, but govbrain
  `E92IHXS1ZAMU1` (`/api/*`, `/health`, `/.well-known/oauth-*`) would have been left fail-open,
  and depot `E39RD9OU6NJIZW` (four behaviors on `depot-edge-auth:8`) would have ended up with two
  gate implementations. It now applies the association everywhere, prints every behavior
  afterwards, and refuses to write if any behavior names a different function.

## Cost

Negligible: S3 storage for ~1.2 MB, CloudFront requests for an internal audience, and Lambda@Edge
invocations per request. No compute, no database, no NAT.
