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
  The `slug` is optional and only needed when the successor is itself on the board; with it, the
  card links through to the successor's host. A test enforces ascended-iff-`absorbedInto`.

`projects` is sorted by tier then name so the file reads top-to-bottom as the tier list itself.
Nothing depends on that order — the app groups by `tier` — so a re-sort is cosmetic.

Then: `npx vitest run` (the data tests catch a bad tier, a duplicate slug, an over-long blurb, an
unparseable host, an omit entry that matches no project, and a fallen entry with a live link),
then `bash scripts/deploy.sh`.

## Adding or changing a project card

1. Edit `src/data/projects.json` (the `projects` array). Blurbs come from the project's own `ABOUT.md`, falling back to
   `README.md`, **≤100 characters** (a test enforces it).
2. **Never invent a description.** If a repo has nothing sourceable, use
   `No description recorded.` plus a factual `note`. Seven entries are in that state — inventing
   plausible copy for them would be worse than the placeholder.
3. `host` is a full origin, not derived from the slug — `depot` and `deskboard` live off the labs
   zone.
4. `absorbedInto` is required exactly when `tier` is `ascended`, and any `absorbedInto.slug` must
   resolve to another roster entry. Both are tested. Because a drag cannot supply a successor,
   **The Ascended is the one rank that is not a drop target** (`acceptsDrop` in `src/types.ts`) —
   promoting something to it is a hand edit. Dragging a card *out* of it strips `absorbedInto`.
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

`scripts/deploy.sh` reads `.env` (gitignored; see `.env.sample`). It **fails loudly if
`VITE_OWNER_EMAIL` is unset** — without it the owner check can never match and drag-and-drop
silently never appears.

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

Currently open to any TechPass user who can sign in. To restrict, no code change is needed:

1. Set `appClients.dash.requiredGroup` in `labs-auth/outputs.json`.
2. `cd labs-auth/edge-auth && bash build.sh dash` (the group name is baked in as
   `__REQUIRED_GROUP__`).
3. `cd labs-auth && bash provision-edge.sh dash EFEV1TL1LF6Y3`.

Note that `cognito:groups` is baked into the ID token when issued, so a user added to the group
while already signed in keeps their old token and gets a 403 until a clean re-login.

## Edit mode

Open `https://labs.ai.tech.gov.sg/#edit`. **Use the fragment, not `?edit=1`.** A query string does
not survive the login redirect — `cognito-at-edge` percent-encodes it into the redirect *path*, so
a fresh login from `/?edit=1` lands on `/%3Fedit%3D1` with an empty `location.search` and no edit
mode (and a 404). See ABOUT.md for the mechanism. `?edit=1` works only when you are already
authenticated.

## Don't

- Don't treat the client-side owner check as authorization. It gates a localStorage-only affordance.
- Don't move the `data-revealed` reveal marker back to a `className` — React rewriting the class
  attribute erases it and leaves whole tiers permanently invisible. There is a guard test.
- Don't claim link previews work. `index.html` carries OG and Twitter Card tags per house
  convention, but the site is IP-fenced and auth-gated so no unfurler can ever fetch them.
- Don't move the edit trigger back to a query-parameter-only check. The auth redirect destroys
  query strings; there is a regression test pinning the empty-search-and-hash case.
- Don't add a backend to make overrides shared. That was considered and rejected; it needs a real
  authorization story, not a widened client-side check.
