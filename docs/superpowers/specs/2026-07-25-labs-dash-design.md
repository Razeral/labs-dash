# labs-dash — design

**Date:** 2026-07-25
**Status:** approved, pre-implementation

The index page for `labs.ai.tech.gov.sg`. Shows one card per labs project, grouped into five
fantasy-themed tiers. Internal sharing surface — IP-fenced and TechPass-gated. Not for public
consumption and not for general users.

---

## 1. Architecture

Static single-route SPA. No backend, no API, no runtime data fetching.

```
Browser
  │
  ▼
CloudFront (labs.ai.tech.gov.sg)
  ├─ WAF web ACL          default BLOCK, allow rule → shared corp IP set
  ├─ Lambda@Edge          viewer-request, labs-auth cognito-at-edge gate
  └─ Origin (OAC) ──────▶ private S3 bucket (static build output)
```

This mirrors the depot and playtester deployments exactly. Nothing here is novel infrastructure;
the value is in reusing a pattern that already works.

**Stack:** Vite + React + TypeScript. Two-space indent, no semicolons, functional style.

**Why static:** the entire dataset is a curated list that changes when a human decides it changed.
A backend would add operational surface for zero benefit.

---

## 2. Access control

Two independent gates. Either one failing denies access.

### 2.1 Network — WAF

A web ACL on the distribution with `DefaultAction: BLOCK` and a single allow rule referencing the
shared IPv4 set:

```
arn:aws:wafv2:us-east-1:323001028968:global/ipset/
  CreatedByCloudFront-1e377e80_block-non-seedcomet-ip_IPV4/9d3f71d7-cf87-4db4-888e-ce177b3347ec
```

Same set depot uses (`allow-shared-corp-egress`). Scope is `CLOUDFRONT`, so the ACL lives in
`us-east-1` regardless of where anything else sits.

### 2.2 Identity — labs-auth

New app client `dash` on the shared pool `ap-southeast-1_zhuDvtEBS` (account `323001028968`).

```bash
bash provision-appclient.sh dash https://labs.ai.tech.gov.sg
cd edge-auth && bash build.sh dash
bash provision-edge.sh dash
```

`requiredGroup` is left **empty** — the group gate compiles to a no-op and any TechPass user who
can sign in is admitted. This is the deliberate current posture.

**To restrict later** (no code change): set `appClients.dash.requiredGroup` in `outputs.json`,
re-run `build.sh dash` and `provision-edge.sh dash`. The group name is baked into the bundle at
build time as `__REQUIRED_GROUP__`.

### 2.3 Callback URLs — both, deliberately

The app client registers **two** callbacks:

1. `https://labs.ai.tech.gov.sg/callback` — the real one
2. `https://<dist>.cloudfront.net/callback` — the verification one

Rationale: the ACM certificate and the domain alias both block on the zone owner adding CNAME
records to `labs.ai.tech.gov.sg`, which is outside our control. Registering the CloudFront name
lets us verify a real end-to-end TechPass login *before* DNS lands, rather than shipping blind and
discovering an auth bug after the domain goes live. Remove callback 2 once the domain resolves.

### 2.4 Known auth gotchas (from labs-auth, learned the hard way)

- **Stale token = false 403.** `cognito:groups` is baked into the ID token at issue time. If we
  ever add a group gate, existing sessions keep their old group-less token until a clean re-login.
- **Cookie source.** `cognito-at-edge`'s `handle(event)` returns the `cf.request`; read the cookie
  from the *returned value*, never the handler param. Getting this wrong is a 502 on every
  authenticated request.
- **Publishing a Lambda version does not repoint the distribution.** `provision-edge.sh` does both.
- **`outputs.json` merges with jq `+=`.** A replace silently wipes `requiredGroup` → gate
  fails open. Do not change this.

---

## 3. Data model

`src/data/projects.json`, validated at test time against:

```ts
type Tier = 'living' | 'ascended' | 'dormant' | 'risen' | 'fallen'

type Successor = {
  name: string        // display name of what absorbed it
  slug?: string       // roster slug when the successor is itself on the board
}

type Project = {
  slug: string        // stable id; also the labs subdomain when hosted
  name: string        // display name
  blurb: string       // one line, ≤ 100 chars, sourced from the project's own ABOUT.md
  tier: Tier
  host?: string       // full origin. absent ⇒ unsummoned (no hosted app)
  absorbedInto?: Successor  // required when tier === 'ascended', forbidden otherwise
  note?: string       // shown on risen/fallen cards to justify the tier
}
```

`host` is a full origin rather than a derived `<slug>.labs.ai.tech.gov.sg` because depot lives
off-zone at `stg.depot.ai.tech.gov.sg` and deskboard at `deskboard.ai.tech.gov.sg`. Deriving the
URL would encode an assumption that is already false.

### 3.1 Tier semantics

| Section | Tier | Means |
|---|---|---|
| ◆ The Living | `living` | Maintained, someone owns it, actively committed |
| ✦ The Ascended | `ascended` | Graduated — merged or absorbed into another project. The repo survives as a legacy reference; the work lives on elsewhere |
| ◇ The Dormant | `dormant` | Works and is up, but development has paused |
| ◈ The Risen | `risen` | Still running and still billing, no owner — may be half-broken |
| † The Fallen | `fallen` | Decommissioned. Tombstone, never a link |

Tier describes the **project's** vitality. It is a human judgment call, deliberately not derived
from a probe — no health check can distinguish "dormant" from "zombified", because the difference
is whether anyone intends to come back. Ascension is even less detectable: a graduated repo and an
abandoned one look identical from the outside.

Sections render in that fixed order, which is a descending vitality ladder with one honourable
exit. The Ascended sits **second**, immediately after The Living — a graduate is a success, and
filing it below the dead would say the opposite.

### 3.1.1 The Ascended, specifically

An ascended card replaces its host line with `⟶ ascended into <name>`.

- **`absorbedInto.slug` present** — the successor is on this board. The card links to that
  project's `host` and behaves like a hosted card. `editor` → `deskboard` is the case: clicking a
  graduate takes you to where its work actually runs now.
- **`absorbedInto.slug` absent** — the successor is outside the roster (`mcpscan` → the MCP
  gateway, which is not ours). The card renders the successor as plain text and is **not** a link.

A test asserts every `absorbedInto.slug` resolves to a real roster entry, so a typo cannot silently
produce a graduate that leads nowhere. A second test asserts `absorbedInto` is present exactly when
`tier === 'ascended'`.

### 3.2 Hosted-ness is orthogonal

`host` present or absent is a **separate axis** from tier, not a sixth section. A project can be
actively developed with no deployed app (`guidemaker`, `finops`), and a project can be deployed
with nobody home (`analytics`).

| | Hosted | Unsummoned |
|---|---|---|
| **Card is** | a link, full contrast | not a link, reduced contrast |
| **Hover** | lifts, border ignites | no lift, no ignite |
| **Host line** | the origin | `⌀ UNSUMMONED` |

Unhosted cards must not lift or glow on hover. There is nothing to click, so nothing should
invite a click — the affordance has to tell the truth.

`fallen` cards are never links regardless of whether a `host` value is recorded, because the
distribution is disabled and the domain no longer resolves.

### 3.3 Roster rule

Curated allowlist, seeded from *"has an ABOUT.md OR has a CloudFront distribution"*, then
hand-pruned. Adding or dropping a project is a one-file edit.

Excluded as orchestration plumbing rather than shareable projects: `terra`, `fleet`, `labs-auth`,
`tentacles`. Excluded as scratch: `sandbox`, `vendor`.

### 3.4 Seed roster (22 cards)

**◆ The Living** (12) — hosted: `govbrain`, `depot`, `compliance-api`, `continuum`, `ducks`.
Unsummoned: `imagine`, `mech-hangar`, `guidemaker`, `finops`, `tendrils`, `writer`, `offside`.

**✦ The Ascended** (2) — `editor` → `deskboard` (linked; deskboard is on the board);
`mcpscan` → the MCP gateway (**not our project**, so unlinked).

**◇ The Dormant** (4) — `playtester`, `minime`, `manydevs`, `deskboard`.

**◈ The Risen** (2) — `analytics` (live at `analytics.labs.ai.tech.gov.sg`, S3 origin
`gt-aipgm-aiap-analytics-dashboard-s3`, untouched since 2026-06-10, **no matching repo in
`projects/`**); `aperture` staging (`E1U5V6MYXQF9KH` enabled with an EC2 origin but **no alias
attached** — unroutable and still holding an origin).

**† The Fallen** (2) — `harness-site` (`EMO9X8CFANGBY`, disabled since 2026-05-04);
`aperture` (`E3O18C5JCTR8KU`, disabled 2026-07-24).

Considered and **rejected** for The Ascended, recorded so the question isn't reopened blind:
`continuum-plan2`, `terra-dashboard`, `ltm-src`. Each had circumstantial evidence of absorption;
none was confirmed. `govbrain-fauxdesk` carries a `TEARDOWN.md` but still commits daily — it is
neither ascended nor fallen yet, so it stays off the board.

Blurbs are lifted from each project's own `ABOUT.md` so the dashboard and the repo agree.

---

## 4. Interface

Dark arcane / bestiary. Near-black ground, warm parchment type, one ember accent. The lore lives
in the framing — section ranks, glyphs, tier names — while the card data stays plainly legible.
The test is that a screenshot of this can be pasted into a work channel without embarrassment.

```
T H E   L A B S
────────────────────────────────

◆ THE LIVING                    12 realms
┌──────────────────┐  ┌──────────────────┐
│ govbrain         │  │ guidemaker       │
│ Control plane    │  │ Records narrated │
│ over the ltm …   │  │ product guides   │
│ govbrain.labs…   │  │ ⌀ UNSUMMONED     │
└──────────────────┘  └──────────────────┘

✦ THE ASCENDED                   2 realms
┌──────────────────┐  ┌──────────────────┐
│ editor           │  │ mcpscan          │
│ Multi-tenant     │  │ Scans MCP servers│
│ GitLab editor    │  │ for risk         │
│ ⟶ into deskboard │  │ ⟶ into the MCP gw│
└──────────────────┘  └──────────────────┘

◇ THE DORMANT                    4 realms
◈ THE RISEN                      2 realms
† THE FALLEN                     2 realms
```

Sections render in fixed order — living, ascended, dormant, risen, fallen — with a rank glyph,
name, and realm count. Cards are a responsive grid, collapsing to one column on narrow viewports.

An empty tier renders its header with a muted "none" rather than vanishing, so the five ranks
always read as a complete taxonomy.

---

## 5. Motion

**CSS only. No animation library.** Every effect here is enter, hover, or ambient — all
expressible as `transform`/`opacity` transitions, which are compositor-driven and interruptible by
construction. An animation runtime would add bundle weight and buy nothing.

| Moment | Behaviour |
|---|---|
| **Entrance** | IntersectionObserver adds a class per section; cards stagger ~40ms apart via `--i`, 8px rise + fade, ~260ms `cubic-bezier(.2,.8,.2,1)`. Fires once. |
| **Hover (hosted)** | 2px lift, border ignites to ember, inner radial glow tracks the cursor through a `--mx`/`--my` custom property. **160ms in, 220ms out** — the slower exit reads as settling rather than snapping. |
| **Focus** | Same treatment as hover, driven by `:focus-visible`, so keyboard navigation gets identical feedback. |
| **Living ambient** | Slow accent breathe, ~4s, barely perceptible. |
| **Ascended ambient** | Pale gold rather than ember; a slow upward drift of light, ~6s, distinct from Living's breathe. Reads as rising, not pulsing. |
| **Risen ambient** | Faint irregular flicker — the tier's whole point, expressed in motion. |
| **Fallen** | Desaturated, static, recessed. No ambient at all. Stillness is the signal. |

**Reduced motion:** `@media (prefers-reduced-motion: reduce)` removes every transform and every
ambient loop, retaining opacity transitions only. This is a hard requirement, not a nicety, and it
gets a test.

Cursor-tracking glow updates a custom property on `pointermove`, throttled to
`requestAnimationFrame`, and is skipped entirely under reduced motion and on coarse pointers.

---

## 6. Testing

| Layer | Covers |
|---|---|
| **Vitest — data** | Every `tier` is valid; slugs unique and non-empty; blurbs ≤ 100 chars; every `host` parses as a URL; no `fallen` card carries a live link; `absorbedInto` present exactly when `tier === 'ascended'`; every `absorbedInto.slug` resolves to a real roster entry |
| **Vitest — render** | Cards land in the right section, in the fixed five-rank order; counts match; unhosted cards render `⌀ UNSUMMONED` and are not anchors; ascended cards render `⟶ ascended into …`, link when the successor is a hosted roster entry and are inert when it is not; empty tiers still render a header |
| **Playwright** | Screenshot per section state, hover state, keyboard focus state, reduced-motion render, narrow viewport |
| **`tsc --noEmit`** | Clean before commit |

Artefacts land in `tests/<task-id>/` per the Terra convention.

---

## 7. Deployment

`.env.sample` carries the deploy variables (bucket, distribution id, AWS profile). Real values are
gitignored.

```
build → aws s3 sync → cloudfront create-invalidation
```

**Resource tagging** — every resource created gets `Project=labs-dash`, `Owner=ng_shangru`,
`Environment=prd` at creation time.

**Sequencing.** The certificate and the alias both wait on the zone owner. So:

1. Create bucket, distribution (no alias), OAC, WAF ACL, app client, edge function.
2. Verify end-to-end over `<dist>.cloudfront.net` using callback URL 2 — IP fence blocks a
   non-corp address, TechPass login succeeds from a corp address, cards render.
3. Request the ACM cert in `us-east-1`; hand the validation CNAME to the zone owner.
4. Once validated: attach the cert and the `labs.ai.tech.gov.sg` alias, hand over the alias CNAME.
5. Once the domain resolves: drop callback URL 2.

Steps 1–3 are unblocked today. Steps 4–5 are gated on someone else and must be reported as
pending, never as done.

---

## 8. Deliberate non-goals

- **No health probing.** Status is curated (§3.1). Revisit only if the roster grows past the
  point where a human keeps it honest.
- **No router.** One page. Adding one now would be speculative.
- **No CMS or admin UI.** Editing `projects.json` and redeploying is the workflow.
- **Unfurl metadata is included but will not work.** House convention requires OG and Twitter Card
  tags on every frontend, so `index.html` carries them plus a default share image. Behind an IP
  fence and an auth gate, **no unfurler can ever fetch them** — Slack will render a bare link. The
  tags cost nothing and are correct if the posture ever changes, but this must not be reported as
  working link previews.
