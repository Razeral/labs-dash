# labs-dash

The index page at **https://labs.ai.tech.gov.sg** — every project under `Terra/projects/` as a card,
ranked into five tiers. Internal only: IP-fenced to the corporate allowlist and TechPass-gated.

- **What it is, where it runs, and the gotchas:** [`ABOUT.md`](ABOUT.md)
- **How to work in it:** [`CLAUDE.md`](CLAUDE.md)

```bash
npm install
npm run dev                 # local
npx vitest run              # 76 tests
bash scripts/deploy.sh      # build -> s3 -> invalidate (reads .env)
```
