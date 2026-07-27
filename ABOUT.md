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
| App client | `labs-dash` = `1clu7qnljgrmvbusf4hqbuj0vt`, COGNITO + TechPass, **no required group — any TechPass user** |
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
file in is the whole act of adding art; there is no registry to keep in sync. It renders for every rank **except The Fallen**. A *living* project must also have a `host` —
art is for something you can go and see. The ascended, dormant and risen get art without one:
the ascended because they graduated, the dormant because they are still standing, the risen
because something is still running in there.

**The Fallen is the one rank withheld from, and that is the point of it** — a tombstone carrying
a scene stops reading as a tombstone. Absence is the signal there.

The ranks stay distinguishable through the art's **mood**, not its presence. The living and
ascended are warm and lit; the dormant are cold pale moonlight, dust motes and empty chairs; the
risen is fog, settled dust and instruments still running with nobody at the console. Measured:
the dormant/risen set averages **0.025** mean luminance against **0.034** for living/ascended —
quieter by construction, not by chance. The rule lives in `App.tsx`, not in the file's presence.

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

- `.hero__frame` — the door inside a box that reproduces `background-size: cover` **as a real
  rectangle**. This is the trick that makes the rest possible: with the art as a
  `background-image`, a child at `28.5%` is a percentage of the *element* and drifts off its
  target as soon as the crop changes; with a frame that is exactly the covering rectangle, a
  child at `28.5%` is a percentage of the *image* and stays welded to it at every viewport.
  Cover maths for the 1600×1066 (3:2) art: `width: max(100%, calc(100dvh * 1600 / 1066))`
  plus `aspect-ratio`. It drifts 4% over 24s.

  **It is centred by `left: 50%` + `translate(-50%, -40%)`, never by grid or flex alignment.**
  The frame is deliberately wider than the viewport — that is what `cover` means — and
  centring an *overflowing* item is precisely the case engines disagree on: several treat
  `place-items: center` as `safe center` and snap the item to the start edge. On a wide screen
  the overflow is tens of pixels and nobody notices; on a near-square viewport the frame is
  ~860px wider than the screen and the door visibly slides off centre while the title stays
  put. Verified symmetric at aspect 1.73, 1.00 and 0.67. The centring translate is repeated
  inside the drift keyframes, or the frame jumps to the corner the moment the animation runs.
- `.hero__seam` — the gap between the doors, at the seam's measured position (x 51%, spanning
  y 38–92%), breathing 0.88 → 1 over 9s.
- `.hero__flame` ×2 — **the pulsating points**, at the braziers' measured coordinates
  (28.5%/72.2% and 74.0%/74.4%, found by scanning the image for warm bright blobs rather than
  by eye). Each is ~12% of the frame's width — about **3% of the screen** — so a 0.58 → 1 swing
  with a scale lights one bowl of fire rather than the room. Separate durations and a negative
  delay keep the two from beating together.
- `.hero__embers` — 8 motes, each with its own column, delay and duration from `--i`.

> **Rule, learned the hard way: nothing covering a large area may animate its brightness.**
> The first version had a full-viewport `screen` layer stepping between 0.48 and 1 about three
> times a second. It did not read as firelight — the whole screen strobed, and large-area
> luminance flashing at that rate is a photosensitivity trigger, not a style choice. It was
> deleted, not tuned down. The same stepped-luminance pattern was also removed from The Risen's
> card ambient. Measured after: the seam's largest frame-to-frame change is **0.007**, against
> ~0.5 instantaneous before.
>
> The rule is about **area, not about pulsing**. A brazier glow pulses harder than the layer
> that was removed — 0.58 → 1 — and is completely safe, because it covers 3% of the screen
> instead of all of it. Anything added here must animate `transform`, or animate opacity over a
> **small** area, and every curve must be continuous — never `steps()`.

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

## Editing the roster

`src/data/projects.json` is the only way to change what the board shows — there is no in-page
editing, and no `projects.json` is served (the roster is compiled into the bundle, which is what
lets the test suite gate every change). Edit, `npx vitest run`, `bash scripts/deploy.sh`.

Drag-and-drop re-tiering, the localStorage override layer, the owner check and the edit bar were
all **removed** (2026-07-27). They existed only to serve dragging; with the file as the interface
they were dead weight, and an edit bar with nothing behind it is worse than none.

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
