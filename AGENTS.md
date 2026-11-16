# projects

Static dashboard of fpigeonjr's public GitHub repos, grouped by staleness, deployed to GitHub Pages
by a scheduled Action. A visibility tool: it shows what exists and when it was last touched.

## Decisions (do not relitigate)

- **Scope:** all public, non-archived repos owned by `config.owner` (forks included) plus
  `config.include` (`owner/name`), minus `config.exclude`. Never private repos.
- **Activity signal:** committed date of the latest commit on the default branch
  (`defaultBranchRef.target.history(first:1)`), not `pushedAt`. Empty repo → `null` → Fossil.
- **Bands** (`src/bands.js`, the shared contract): Active <30d, Cooling 30–90d, Dormant 90–365d,
  Fossil ≥365d. Freshest first within a band.
- **Build:** Node ≥22, ESM, **zero runtime dependencies** (use global `fetch`, `node:test`).
  One GitHub GraphQL request (paginated) per owner, not one call per repo.
- **Output:** `dist/` containing `index.html` plus copied `assets/`. Fully static; no client-side
  API calls, no client JS required to read it.
- **Look:** trimmed copy of the blog's Bear-Blog-based CSS (`~/Code/blog/src/styles/global.css`):
  Atkinson font, cyan accent `#06b6d4` / `#22d3ee` dark, light/dark via `prefers-color-scheme`.
- **Token:** `GITHUB_TOKEN` env var (Actions' built-in token in CI; `gh auth token` locally).

## Repo record (contract between fetch and render)

```js
{
  nameWithOwner: "fpigeonjr/vim-quest", // string
  name: "vim-quest",                    // string
  owner: "fpigeonjr",                   // string
  url: "https://github.com/...",        // string
  description: "…" | null,
  language: "TypeScript" | null,        // primary language name
  isFork: boolean,
  lastCommitAt: "2025-11-02T…Z" | null, // ISO string, default-branch HEAD committedDate
  openIssues: number,
  openPullRequests: number,
}
```

## Layout

- `config.json` — owner / include / exclude
- `src/bands.js` — band logic (shared; change only with tests)
- `src/fetch.js` — GitHub GraphQL → repo records
- `src/render.js` — repo records → HTML string (pure, no I/O)
- `src/build.js` — CLI: load config, fetch, render, write `dist/`
- `assets/` — `style.css`, Atkinson fonts, `favicon.svg`
- `test/` — `node --test`; never hit the network in tests (inject `fetch`)

## Commands

`npm test` · `GITHUB_TOKEN=$(gh auth token) npm run build` then open `dist/index.html`.
