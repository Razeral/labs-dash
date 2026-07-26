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

`src/data/projects.json` holds two sections: **`omit`** (slugs to keep off the board — the entry
stays in the file so nothing is lost, it just doesn't render) and **`projects`** (49 entries,
sorted by tier then name so the file reads as the tier list itself). Moving a project between
ranks is a one-word change to its `tier`. See `CLAUDE.md` for the editing rules.

The roster is every directory under `Terra/projects/` whose `.git` is a
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

## Art

Two layers of generated cel-shaded art, both produced with the `imagine` CLI from each
project's own description and committed as JPEGs.

**Card art** — `src/assets/cards/<slug>.jpg`, discovered by `import.meta.glob`, so dropping a
file in is the whole act of adding art; there is no registry to keep in sync. It renders for the **living** (which must also have a **host** — art is for something you can
go and see) and for the **ascended**. The ascended are a deliberate exception: they have no host
of their own *precisely because* they graduated, and their scene is the record of what they
became. Dormant, risen and fallen stay bare — lush art would fight the stillness those ranks
depend on. The rule lives in `App.tsx`, not in the file's presence.

Cards with art are **poster tiles**: the art runs full-bleed and near-undimmed across the top,
and the text cluster is pushed to the bottom onto a plateau of `--ground`. The gradient stops
are load-bearing. Text occupies the bottom ~48%, where the scrim is >= 0.96, which measures
**5.92:1** for `.card__blurb`/`.card__meta` against the brightest pixel in any current image.
An earlier revision dimmed the *whole* card instead and had to sit at 0.88 to stay legible —
which is why the art was barely visible. **The floor is the brightest pixel, not the average:
re-measure when adding brighter art.**

**Tier backdrops** — `src/assets/tiers/<tier>.jpg`, one per rank, crossfading behind everything
as that rank scrolls through the middle of the viewport (a second `IntersectionObserver` with
`rootMargin: -45% 0px -45%`, so exactly one rank is current at a time). All five layers mount at
once and only opacity animates, keeping it on the compositor; swapping one element's
`background-image` would flash while the new image decoded. Active opacity is 0.14 under a
vignette. A rank with no image contributes no layer and falls back to plain ground.

### The door

`src/assets/hero/door.jpg` fills a `100dvh` hero above the board — arriving at the site means
arriving at a threshold, not at a list. It is a **sibling of `.board`, not a child**: `.board` is
a centred `max-width` column and no negative margin can bleed a child to the viewport edges.
The title sits in the frame's dark negative space above the door's bright central seam, and the
scrim fades to `--ground` at the bottom so the first rank emerges from the scene.

The door is a still, given life in CSS. **The life comes from the scene moving, not from the
light changing brightness.**

- `.hero__scene` — the door on its own layer so it can be transformed (an element cannot scale
  its own `background-image`). A 24s, 4% drift: slow and small enough that you never catch it.
- `.hero__seam` — a bloom on the centre line breathing 0.88 → 1 over 9s, continuous. The layer
  is full-bleed but the painted gradient is only ~20% × 42% of the frame, so the area that
  actually changes stays small.
- `.hero__embers` — 8 motes, each with its own column, delay and duration from `--i`.

> **Rule, learned the hard way: nothing covering a large area may animate its brightness.**
> The first version had a full-viewport `screen` layer stepping between 0.48 and 1 about three
> times a second. It did not read as firelight — the whole screen strobed, and large-area
> luminance flashing at that rate is a photosensitivity trigger, not a style choice. It was
> deleted, not tuned down. The same stepped-luminance pattern was also removed from The Risen's
> card ambient. Measured after: the seam's largest frame-to-frame change is **0.007**, against
> ~0.5 instantaneous before.
>
> Anything added here must animate `transform`, or animate opacity over a **small** area, and
> every curve must be continuous — never `steps()`.

Under `prefers-reduced-motion` the embers are removed and the drift and breathe freeze; the seam
holds a fixed bloom so the gap still reads as lit rather than as a dark line.

### Card click targets

A card carries **two** controls, not one:

- **The card body** is a stretched invisible `button` that opens a detail modal — full art,
  rank, blurb, note, and an outbound link at the bottom.
- **The host line** is a real `<a>` layered above it, so a direct click goes straight to the
  project without a detour through the modal.

They are siblings layered by `z-index`, never nested: a link inside a button is invalid HTML
and browsers disagree about which one wins activation.

Because every card now opens something, the hover lift applies to **all** of them — including
unhosted and fallen cards, which previously had to stay flat because they led nowhere. The
affordance still tells the truth; the truth just changed.

The modal locks body scroll while open, closes on Escape or a backdrop click, focuses the close
button on open and returns focus to the card that opened it.

## Drag-and-drop re-tiering

Owner-only. **The trigger is `https://labs.ai.tech.gov.sg/#edit` — a fragment, not a query
parameter**, and that is forced by the auth round-trip rather than preference.

`cognito-at-edge` builds its post-login redirect as
`request.uri + encodeURIComponent('?' + request.querystring)` and, with CSRF disabled (how
`labs-auth` configures it), uses that string verbatim as the OAuth `state` and then as the
`location` on the way back. So arriving at `/?edit=1` while unauthenticated lands you on the
literal **path** `/%3Fedit%3D1` after login: `location.search` is empty, edit mode is correctly
off, and the path also 404s from S3 because there is no SPA fallback. A fragment is never sent to
the server and browsers carry it across redirects, so `#edit` survives untouched.

`?edit=1` still works for an already-authenticated session, where no redirect happens. There is a
regression test for the empty-search-and-hash case.

Dropping a card writes `{slug: tier}` to `labs-dash:overrides` in
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
