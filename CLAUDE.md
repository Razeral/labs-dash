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

## Adding or changing a project card

1. Edit `src/data/projects.json`. Blurbs come from the project's own `ABOUT.md`, falling back to
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
   hosts, and fallen entries carrying live links.

To re-derive the roster from scratch: `node scripts/seed-roster.mjs`, then refill names and blurbs
by hand (the generator deliberately leaves them empty). It requires `.git` to be a **directory** —
do not relax that to `existsSync`, which picks up `continuum-plan2`'s worktree pointer.

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

## Restricting access to a Cognito group

Currently open to any TechPass user who can sign in. To restrict, no code change is needed:

1. Set `appClients.dash.requiredGroup` in `labs-auth/outputs.json`.
2. `cd labs-auth/edge-auth && bash build.sh dash` (the group name is baked in as
   `__REQUIRED_GROUP__`).
3. `cd labs-auth && bash provision-edge.sh dash EFEV1TL1LF6Y3`.

Note that `cognito:groups` is baked into the ID token when issued, so a user added to the group
while already signed in keeps their old token and gets a 403 until a clean re-login.

## Don't

- Don't treat the client-side owner check as authorization. It gates a localStorage-only affordance.
- Don't move the `data-revealed` reveal marker back to a `className` — React rewriting the class
  attribute erases it and leaves whole tiers permanently invisible. There is a guard test.
- Don't claim link previews work. `index.html` carries OG and Twitter Card tags per house
  convention, but the site is IP-fenced and auth-gated so no unfurler can ever fetch them.
- Don't add a backend to make overrides shared. That was considered and rejected; it needs a real
  authorization story, not a widened client-side check.
