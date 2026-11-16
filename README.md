# projects

Every public repo of [@fpigeonjr](https://github.com/fpigeonjr), grouped by how long since its
default branch last saw a commit, so nothing quietly becomes a lost project.

| Band | Last commit |
|---|---|
| 🟢 Active | under 30 days |
| 🟡 Cooling | 30–90 days |
| 🟠 Dormant | 90 days – 1 year |
| ⚫ Fossil | over 1 year |

A GitHub Action rebuilds the static page daily (12:00 UTC), on push to `main`, and on demand, then
deploys it to GitHub Pages. No client-side API calls; zero dependencies.

## Configure

`config.json`:

- `owner` — all of this user's public, non-archived repos are shown (forks included).
- `include` — extra public repos as `owner/name` (e.g. org repos you contribute to). Missing or
  private entries are skipped with a warning.
- `exclude` — `owner/name` entries to hide.

## Run locally

Requires Node ≥ 22.

```sh
npm test
GITHUB_TOKEN=$(gh auth token) npm run build   # writes dist/
open dist/index.html
```

## One-time setup (new repo)

GitHub Pages must use **GitHub Actions** as its source before the first deploy can succeed:

```sh
gh api repos/fpigeonjr/projects/pages -X POST -f build_type=workflow
```

The workflow's `keepalive` job re-enables itself on each scheduled run, because GitHub disables
scheduled workflows in public repos after 60 days without activity.

## Credits

Styles adapted from [fpigeonjr/astro-blog](https://github.com/fpigeonjr/astro-blog), itself based
on [Bear Blog](https://github.com/HermanMartinus/bearblog) (MIT).
