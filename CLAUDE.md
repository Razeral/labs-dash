# labs-dash — working rules

**Read `ABOUT.md` first** — it is what this project is, where it is deployed, and the gotchas that
cost time. This file is only how to act in it.

## Conventions

- TypeScript. Functional style, no classes. 2-space indent, **no semicolons**.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`). **No co-author lines.**
- **CSS only for animation.** No Motion, Framer, GSAP, or any animation runtime. Every effect here
  is enter, hover, or ambient — all expressible as `transform`/`opacity` transitions, which are
  compositor-driven and interruptible by construction.
- Every animated effect must be neutralised under `@media (prefers-reduced-motion: reduce)`,
  retaining opacity only. This is a requirement, not a nicety, and it has tests.
- Use the tokens in `src/styles/tokens.css`. Do not hardcode a value that duplicates one; use
  `color-mix(in srgb, var(--token) N%, transparent)` rather than restating a hex as `rgba()`.

## Editing the tier list

`src/data/projects.json` is the whole interface. It has two sections:

```json
{
  "omit": ["sandbox", "vendor"],
  "projects": [
    { "slug": "govbrain", "name": "GovBrain", "blurb": "…", "tier": "living", "host": "https://…" }
  ]
}
```

- **Move a project between ranks** — change its `"tier"` to one of
  `living` · `ascended` · `dormant` · `risen` · `fallen`. That is the whole edit.
- **Take a project off the board** — add its slug to `"omit"`. The entry stays in `projects`, so
  its blurb, tier and notes are not lost; it simply stops rendering, and the realm counts and the
  "bestiary of N works" subtitle both follow automatically.
- **Promote to Ascended** — set `"tier": "ascended"` *and* add
  `"absorbedInto": { "name": "Compliance API Dashboard", "slug": "compliance-api-dashboard" }`.
  The `slug` is optional and only needed when the successor is itself on the board. A test
  enforces ascended-iff-`absorbedInto`.
- **An ascended project may keep its own `host`.** Being absorbed and still being reachable are
  different things — `aiap-finops` and `harness-site` are both. The card shows the ascension as
  its primary line (that is what puts it in the rank) with its live host beneath, and links to
  **its own host in preference to the successor's**; the successor is the fallback for a
  graduate that no longer serves anything itself. Only `fallen` refuses a link outright.

`projects` is sorted by tier then name so the file reads top-to-bottom as the tier list itself.
Nothing depends on that order — the app groups by `tier` — so a re-sort is cosmetic.

### Seeing what your edit did

```bash
npm run roster            # what changed, the new board, problems — nothing is deployed
npm run roster:deploy     # the same, then tests + typecheck + deploy
npm run dev               # live preview, hot-reloads as you save the JSON
```

Runnable from anywhere with `npm --prefix projects/labs-dash run roster`, or from the fleet dash
(`s` menu): `labs-dash-roster`, `labs-dash-roster-deploy`, `labs-dash-deploy`.

`npm run roster` reports the **board**, not the diff: which projects changed rank, what went on
or off, and what the ranks add up to afterwards with the previous rendered count for comparison.
It also catches things nothing else does — an `omit` entry matching no project (which otherwise
fails silently), a `fallen` entry carrying a host, and **art files that are bundled but unused**
because their project was omitted or moved to a rank that shows none.

It exits non-zero on any problem, and `roster:deploy` runs the report first, so a broken roster
cannot reach the deploy step. Invalid JSON stops it immediately with the parse error.

## Adding or changing a project card

1. Edit `src/data/projects.json` (the `projects` array). Blurbs come from the project's own `ABOUT.md`, falling back to
   `README.md`, **≤100 characters** (a test enforces it).
2. **Never invent a description.** If a repo has nothing sourceable, use
   `No description recorded.` plus a factual `note`. Seven entries are in that state — inventing
   plausible copy for them would be worse than the placeholder.
3. `host` is a full origin, not derived from the slug — `depot` and `deskboard` live off the labs
   zone.
4. `absorbedInto` is required exactly when `tier` is `ascended`, and any `absorbedInto.slug` must
   resolve to another roster entry. Both are tested.
5. Run `npx vitest run` — the data tests catch length, duplicate slugs, bad tiers, unparseable
   hosts, omit entries matching no project, and fallen entries carrying live links.

To re-derive the roster: `node scripts/seed-roster.mjs`. It is **non-destructive** — it re-scans
disk for new/removed repos but preserves your `omit` list and any hand-written `name`, `blurb`,
`tier`, `absorbedInto` and `note`. Only genuinely new projects arrive with an empty blurb. It requires `.git` to be a **directory** —
do not relax that to `existsSync`, which picks up `continuum-plan2`'s worktree pointer.

## Adding or replacing art

- **Card art:** put a JPEG at `src/assets/cards/<slug>.jpg`. It renders if the project is
  `ascended`, or `living` **and** has a `host`. Nothing to register — it is globbed at build time.
- **Tier backdrop:** put a JPEG at `src/assets/tiers/<tier>.jpg`.
- Generate with the `imagine` CLI (`--style "Cel-shaded game"`), then downscale: cards to 720px
  wide, backdrops to 1280px, JPEG q55-60. They are dimmed backgrounds, not hero images.
- **Re-measure contrast after adding card art.** The AA floor is computed against the
  *brightest pixel* in the image, not the average, and the poster-tile gradient stops in
  `app.css` are tuned to it. A brighter image moves the threshold.

## Shipping

```bash
npx vitest run && npx tsc --noEmit    # both must be clean
bash scripts/deploy.sh                # build → s3 sync → invalidate
```

`scripts/deploy.sh` reads `.env` (gitignored; see `.env.sample`).

`index.html` is uploaded with `max-age=0,must-revalidate` while hashed assets get a year — that is
how a new build reaches an already-open tab. Keep that split.

## Infrastructure

`infra/provision.sh` is idempotent; re-running it is safe and it will skip what exists. It refuses
to proceed if the corp IP allowlist is empty, because an Allow rule over an empty set under a
default-BLOCK ACL would deny everyone including you.

**Never run `labs-auth/provision-federation.sh`.** It loops over *every* app client in
`outputs.json` and rewrites each one's callback and logout URLs from its recorded `callbackBase`.
Depot alone has six callbacks across two domains; that script would destroy four of them. To
onboard or change one client, use a targeted `aws cognito-idp update-user-pool-client` — and
register **all three** callback forms (bare origin, trailing slash, `/_callback`), because
`update-user-pool-client` replaces rather than merges.

The access cutover is `labs-auth/provision-edge.sh dash EFEV1TL1LF6Y3`. Both arguments are
required. Verify a login immediately afterwards — Lambda@Edge rollback propagates in 15–30 minutes,
so a broken gate is slow to undo.

It gates the default cache behavior **and every `CacheBehaviors` entry**, and halts without writing
if any behavior already names a different Lambda function. If it halts, do not force past it — two
gate implementations on one distribution is worse than the state you started in.

## Granting someone access

They must **sign in once first** — Cognito only creates a user record for a federated TechPass
user after their first login, so adding them beforehand fails with `UserNotFoundException`.

```bash
POOL=ap-southeast-1_zhuDvtEBS
aws cognito-idp list-users --user-pool-id $POOL --filter 'email="them@tech.gov.sg"' \
  --query 'Users[0].Username' --output text          # None => they have not logged in yet
aws cognito-idp admin-add-user-to-group --user-pool-id $POOL \
  --group-name labs-dash-users --username <that username>
```

Then they must **re-login cleanly** — `cognito:groups` is baked into the ID token at issue time,
so an existing session keeps its old group-less token and gets a 403 until it is replaced.

## Restricting access to a Cognito group

**Currently open to any TechPass user who can sign in** (`requiredGroup` cleared 2026-07-27). The
`labs-dash-users` group still exists with its members, so re-enabling admits them immediately:

```bash
bash infra/group-gate.sh status   # config vs what is actually deployed
bash infra/group-gate.sh on       # restrict to labs-dash-users
bash infra/group-gate.sh off      # open to any TechPass user
```

To restrict by hand instead, no code change is needed:

1. Set `appClients.dash.requiredGroup` in `labs-auth/outputs.json`.
2. `cd labs-auth/edge-auth && bash build.sh dash` (the group name is baked in as
   `__REQUIRED_GROUP__`).
3. `cd labs-auth && bash provision-edge.sh dash EFEV1TL1LF6Y3`.

Note that `cognito:groups` is baked into the ID token when issued, so a user added to the group
while already signed in keeps their old token and gets a 403 until a clean re-login.


## Don't


- Don't move the `data-revealed` reveal marker back to a `className` — React rewriting the class
  attribute erases it and leaves whole tiers permanently invisible. There is a guard test.
- Don't claim link previews work. `index.html` carries OG and Twitter Card tags per house
  convention, but the site is IP-fenced and auth-gated so no unfurler can ever fetch them.
- Don't reintroduce in-page re-tiering. Drag-and-drop, the localStorage override layer and the
  owner check were all removed on 2026-07-27; the JSON file is the interface, and it is compiled
  in so the tests gate every change.
