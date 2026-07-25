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

**Why static:** the entire dataset is a list that changes when a human decides it changed. A
backend would add operational surface for zero benefit. Drag-and-drop re-tiering (§3.5) does not
change this — overrides live in the viewer's own localStorage and are exported for commit, so
there is no write path and no server-side state.

**Render pipeline:** `projects.json` (committed seed) → localStorage overrides layered on top →
grouped by tier → rendered. One direction, no fetch.

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
# targeted TechPass enable — see 2.3, do NOT run provision-federation.sh
cd edge-auth && bash build.sh dash
bash provision-edge.sh dash        # ⚠ does not exist yet — see 2.5
```

`requiredGroup` is left **empty** — the group gate compiles to a no-op and any TechPass user who
can sign in is admitted. This is the deliberate current posture. `build.sh` prints a `WARNING: no
requiredGroup` line in this case; that warning is expected, not a fault.

**To restrict later** (no code change): set `appClients.dash.requiredGroup` in `outputs.json`,
re-run `build.sh dash` and `provision-edge.sh dash`. The group name is baked into the bundle at
build time as `__REQUIRED_GROUP__`.

### 2.3 Callback path is `/_callback`, and federation must be enabled surgically

**The labs-auth README is wrong about the callback path.** It documents
`https://<app>.labs.ai.tech.gov.sg/callback`, but both `provision-appclient.sh` and
`provision-federation.sh` register **`${BASE}/_callback`** (underscore) plus `${BASE}/`. The
scripts are the source of truth. Using `/callback` yields `redirect_mismatch` at login.

`provision-appclient.sh` creates the client with `--supported-identity-providers COGNITO` only —
**TechPass is not enabled by it.** The repo's way to add TechPass is `provision-federation.sh`, but
that script **loops over every app client in `outputs.json`** and rewrites each one's callback and
logout URLs from its recorded `callbackBase`. Running it to onboard `dash` would also rewrite
`depot`, `playtester` and `finops` — and silently break any of them whose `callbackBase` has since
drifted from reality.

So do **not** run `provision-federation.sh`. Enable TechPass on the `dash` client alone:

```bash
aws cognito-idp update-user-pool-client \
  --user-pool-id ap-southeast-1_zhuDvtEBS \
  --client-id "$DASH_CLIENT_ID" \
  --supported-identity-providers COGNITO TechPass \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client \
  --callback-urls https://labs.ai.tech.gov.sg/_callback https://labs.ai.tech.gov.sg/ \
  --logout-urls https://labs.ai.tech.gov.sg/
```

The TechPass IdP already exists on the pool, so no IdP create/update is needed — only attaching it
to this client.

### 2.4 Certificate and DNS — already in place

Both of these were assumed to be blockers and are **not**:

- **Certificate:** `arn:aws:acm:us-east-1:323001028968:certificate/f053a5a8-7d8b-409c-b733-c4801a2485cf`
  is `*.labs.ai.tech.gov.sg` **with `labs.ai.tech.gov.sg` as an explicit SAN**. A wildcard alone
  would not cover the apex; this cert does. ISSUED, in use by 4 distributions, expires
  **2026-12-12** — renewal is someone's future problem, worth noting.
- **DNS:** `labs.ai.tech.gov.sg` **already resolves** to CloudFront edge IPs (`13.33.88.x`, 32s TTL
  — the signature of a Route 53 alias). But `curl https://labs.ai.tech.gov.sg/` fails the TLS
  handshake outright, which means **no distribution currently claims that alias**. It is a dangling
  alias record left over from a deleted distribution.

Consequence: CloudFront routes by SNI/Host across its entire edge fleet, so once our distribution
claims the alias, the existing A records resolve to it with **no zone-owner involvement**. The
`ai.tech.gov.sg` zone is not in this account (Route 53 lists only `323001028968.com` and some
private zones), so avoiding a DNS request is a material simplification.

**Fallback:** if claiming the alias returns `CNAMEAlreadyExists`, some distribution — possibly in
another account — still holds it. That is the one case where this becomes a zone-owner
conversation, and the deploy stops there rather than guessing.

### 2.5 `provision-edge.sh` does not exist — it must be written

The labs-auth README references `provision-edge.sh <app>` in four places. **There is no such file
anywhere in the repo** (`find . -name 'provision-edge*'` returns nothing); the root holds only
`provision-{pool,appclient,federation,hostedui}.sh`. The `playtester-edge.zip` and `finops-edge.zip`
artefacts exist, so those were associated by some means that was never committed.

Writing it is therefore part of this work, not a precondition. It is modelled on depot's
`auth/associate-edge.sh` and must, per the labs-auth gotchas, do **both** halves: publish a numbered
Lambda version **and** repoint the distribution's
`DefaultCacheBehavior.LambdaFunctionAssociations[0].LambdaFunctionARN` at it, surgically via `jq` so
the WAF, OAC, certificate and `IsIPV6Enabled` settings survive.

### 2.6 Known auth gotchas (from labs-auth, learned the hard way)

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

### 3.3 Roster rule — everything in `projects/`

**Every git repo under `Terra/projects/` gets a card.** The dashboard's core purpose is that no
project is invisible; a curated allowlist defeats that by making omission the default. 48 repos
plus one hosted-but-repoless entry (`analytics`) = **49 cards**.

`labs-dash` itself is excluded — a dashboard listing itself is noise.

Seed tiers are assigned by a mechanical rule, then corrected by hand through drag-and-drop (§3.5).
The rule does not need to be right, only close, because fixing it is now cheap:

| Condition | Seed tier |
|---|---|
| Named in the ascended list | `ascended` |
| Hosted, last commit ≤ 30 days | `living` |
| Hosted, last commit > 30 days | `dormant` |
| Unhosted, last commit ≤ 90 days | `living` (unsummoned) |
| Unhosted, last commit > 90 days | `fallen` |
| Hosted with no repo in `projects/` | `risen` |

This deliberately overfills The Living (29 of 49 at seed time) — an unhosted repo committed last
week is indistinguishable from a maintained one by commit date alone. Re-tiering is expected, and
is exactly why §3.5 exists.

Superseded: an earlier draft excluded orchestration plumbing (`terra`, `fleet`, `labs-auth`,
`tentacles`) and scratch repos (`sandbox`, `vendor`). Under the "everything" rule they are all
included; if any of them reads as noise on the board, drag it to a lower rank rather than
reintroducing an exclusion list.

### 3.4 Seed roster (49 cards)

Generated by the §3.3 rule as of 2026-07-25. Ages are days since last commit.

**◆ The Living** (29) — hosted: `depot` (0d), `govbrain` (0d), `compliance-api-dashboard` (1d),
`continuum` (2d), `ducks` (10d), `playtester` (23d), `editor-frontpage` (29d). Unsummoned:
`imagine` (0d), `sandbox` (0d), `terra` (0d), `vendor` (0d), `aiap-finops` (1d), `writer` (12d),
`fleet` (15d), `fleet3d` (15d), `bootstrap-mcp` (21d), `offside` (21d), `guidemaker` (22d),
`tentacles` (22d), `tendrils` (23d), `labs-auth` (25d), `limn` (43d), `ltm-src` (50d),
`candidate-code-review` (58d), `fueler` (79d), `tripper` (79d), `slack-prototypes` (86d),
`google-workspace` (87d), `google-workspace-prd` (87d).

**✦ The Ascended** (2) — `editor` → `deskboard` (linked, successor is `editor-frontpage`);
`mcpscan` → the MCP gateway (**not our project**, so unlinked).

**◇ The Dormant** (5) — `mech-hangar` (33d), `minime` (35d), `giantrobotslabs` (58d),
`manydevs` (78d), `harness-site` (82d).

**◈ The Risen** (1) — `analytics`: live at `analytics.labs.ai.tech.gov.sg`, S3 origin
`gt-aipgm-aiap-analytics-dashboard-s3`, untouched since 2026-06-10, **no matching repo in
`projects/`**.

**† The Fallen** (12) — `promarket` (91d), `build-solver` (93d), `doc-generator` (101d),
`wowdocs` (101d), `aiap-api-server` (102d), `cortex` (102d), `devenv-gateway` (103d), `VOX` (105d),
`build-for-build` (106d), `assistantai-landing` (107d), `terra-dashboard` (108d), `how-can` (113d).

Corrections made during design, recorded so they are not re-derived wrongly later:

- **`aperture` is not a project.** It is `compliance-api-dashboard`'s TechPass auth codename. Per
  that project's `ABOUT.md` (2026-07-24): *"the `aperture.ai.tech.gov.sg` domain was handed to a
  different GovTech team's product."* Its two distributions (`E3O18C5JCTR8KU` disabled,
  `E1U5V6MYXQF9KH` enabled with an EC2 origin and **no alias**) are orphaned infrastructure of a
  living project. `E1U5V6MYXQF9KH` is still billing and is worth cleaning up — separately from
  this work.
- **`harness-site` is alive**, served by `E1WY9WOYTKO4KT` at `harness.ai.tech.gov.sg`. The
  disabled `EMO9X8CFANGBY` is merely its old ALB-origin deployment.
- **Rejected for The Ascended**: `continuum-plan2`, `terra-dashboard`, `ltm-src` — circumstantial
  evidence of absorption, none confirmed. `govbrain-fauxdesk` has a `TEARDOWN.md` but commits
  daily; it is seeded `living` like any other active repo.

Blurbs are lifted from each project's own `ABOUT.md` (or `README.md` where there is no ABOUT) so
the dashboard and the repo agree. Repos too thin to describe get their one-line README title and
are flagged in the build task for you to reword.

### 3.5 Tier overrides — drag-and-drop re-tiering

The seed rule is mechanical and will misfile projects. Rather than hand-editing JSON, the board is
directly editable.

**Mechanics.** In edit mode, cards become draggable and tier sections become drop targets.
Dropping a card writes `{slug: tier}` into a `labs-dash:overrides` localStorage entry, which is
layered over `projects.json` at render time. The committed file is never mutated at runtime.

**Persistence is per-browser, by design.** An override affects only the browser that made it. This
is what makes "for me alone" true without any server-side authorization: there is no shared write
path to abuse. The cost is that a re-tiering is not visible to anyone else until it is committed.

**Export closes the loop.** A `copy projects.json` action emits the full roster with overrides
applied, formatted exactly as the committed file, for pasting back into `src/data/projects.json`.
Committing it makes the change canonical and lets the override be cleared. A `reset overrides`
action drops all local changes.

**Edit mode is off by default** and enabled by `?edit=1`. When enabled, the page attempts to read
the Cognito ID token from `document.cookie`
(`CognitoIdentityServiceProvider.<clientId>.<user>.idToken` — `cognito-at-edge` sets it without
`httpOnly`, which `group-gate.js` relies on) and decodes the `email` claim. Editing is offered only
when that email matches the owner address baked in at build time.

> **This is a UX affordance, not a security control.** A determined viewer can edit their own
> localStorage or bypass the check in devtools. That is acceptable precisely because overrides are
> local-only and cannot affect another viewer or the deployed artifact. It must never be
> represented as authorization. If shared, authoritative re-tiering is ever wanted, that is the
> DynamoDB design that was explicitly rejected here, and it would need a real authorization story.

If the cookie is unreadable for any reason, edit mode degrades to "off" rather than falling open.

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
always read as a complete taxonomy — and so a tier remains a visible drop target when it has been
emptied by dragging.

At 49 cards the page is long. Section headers stick to the top of the viewport while their section
is in view, so the rank a card belongs to is always legible while scrolling, and the realm counts
stay live as overrides move cards between ranks.

**Edit mode** (§3.5) adds a persistent bar: a drag affordance on each card, `copy projects.json`,
`reset overrides`, and a count of pending local changes. Its presence must be unmistakable — an
edited board that looks identical to the canonical one is a trap. Cards carrying an override are
marked, so what has been moved locally is never ambiguous.

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
| **Drag (edit mode)** | Grabbed card lifts to 1.03 scale with a raised shadow and follows the pointer; remaining cards reflow with a ~180ms transition so the gap opens before the drop, not after. The hovered tier section brightens its border to show the target. Drop settles over ~220ms. |
| **Drag cancel** | Escape or a drop outside any section returns the card to its origin along the same easing — never a jump cut, so a mis-drag is legible as "nothing happened". |

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
| **Vitest — overrides** | An override moves a card between tiers and updates both realm counts; an override for an unknown slug is ignored rather than crashing the render; corrupt localStorage JSON falls back to the committed seed; `reset` restores seed tiers; export emits every project with overrides applied and is byte-parseable as the committed file's shape |
| **Vitest — edit gate** | Edit mode stays off without `?edit=1`; stays off when the ID token cookie is absent, malformed, or carries a non-owner email; enables only on an owner-email match |
| **Playwright** | Screenshot per section state, hover state, keyboard focus state, reduced-motion render, narrow viewport, edit-mode bar, and a drag that re-tiers a card and persists across reload |
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

**Sequencing.** Per §2.4 the certificate exists and the DNS record already resolves, so there is no
zone-owner gate and the distribution is created with its alias and certificate attached from the
outset:

1. Create the private bucket + OAC; build and sync the site.
2. Create the WAF ACL (`us-east-1`, scope `CLOUDFRONT`) with the shared IP-set allow rule.
3. Create the distribution with alias `labs.ai.tech.gov.sg`, cert `f053a5a8…`, the WAF ACL, and
   the OAC origin. **If this returns `CNAMEAlreadyExists`, stop** — that is the §2.4 fallback and
   needs a zone-owner conversation, not a workaround.
4. Create the `dash` app client; enable TechPass on it surgically (§2.3).
5. Write `provision-edge.sh` (§2.5); build and associate the edge function.
6. Verify: TLS now terminates, a corp address gets the TechPass login, a non-corp address is
   blocked by WAF before auth, and the board renders after sign-in.

Step 3 is the single point where an external dependency can still surface. Everything else is
within this account.

---

## 8. Deliberate non-goals

- **No health probing.** Tiers are seeded mechanically from commit recency and hosting (§3.3),
  then corrected by hand (§3.5). No probe can tell dormant from zombified, so a human stays in the
  loop by design. Revisit only if 49 cards proves more than a human will keep honest.
- **No router.** One page. Adding one now would be speculative.
- **No CMS or server-side admin.** Drag-and-drop re-tiering (§3.5) is deliberately the *smallest*
  thing that solves misfiled projects: local overrides plus an export to commit. It is not an
  editor — blurbs, hosts, names and roster membership are still changed by editing
  `projects.json` and redeploying.
- **No shared/authoritative overrides.** Explicitly rejected in favour of localStorage. Revisit
  only if more than one person needs to re-tier, at which point it needs a real authorization
  story, not a widened client-side check.
- **Unfurl metadata is included but will not work.** House convention requires OG and Twitter Card
  tags on every frontend, so `index.html` carries them plus a default share image. Behind an IP
  fence and an auth gate, **no unfurler can ever fetch them** — Slack will render a bare link. The
  tags cost nothing and are correct if the posture ever changes, but this must not be reported as
  working link previews.
