import { BANDS, groupByBand, timeAgo } from "./bands.js";

const HINTS = {
  active: "under 30 days",
  cooling: "30–90 days",
  dormant: "90 days – 1 year",
  fossil: "1 year or more",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function escape(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function utcDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

// Invalid or non-web destinations remain readable text, never clickable URLs.
function link(url, label) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return `<a href="${escape(parsed.href)}">${escape(label)}</a>`;
    }
  } catch {
    // A malformed URL is treated just like an unsupported protocol.
  }
  return `<span>${escape(label)}</span>`;
}

function renderRepo(repo, owner, now) {
  const name =
    String(repo.owner).toLowerCase() === String(owner).toLowerCase() ? repo.name : repo.nameWithOwner;
  const meta = [];
  if (repo.language) meta.push(`<span>${escape(repo.language)}</span>`);
  const date = repo.lastCommitAt ? new Date(repo.lastCommitAt) : null;
  if (date && !Number.isNaN(date.getTime())) {
    meta.push(`<time datetime="${escape(date.toISOString())}" title="${escape(utcDate(date))}">${escape(timeAgo(repo.lastCommitAt, now))}</time>`);
  } else {
    meta.push(`<span>${repo.lastCommitAt ? "unknown" : "no commits"}</span>`);
  }
  if (repo.openIssues > 0) {
    meta.push(link(`${repo.url}/issues`, `${repo.openIssues} open ${repo.openIssues === 1 ? "issue" : "issues"}`));
  }
  if (repo.openPullRequests > 0) {
    meta.push(link(`${repo.url}/pulls`, `${repo.openPullRequests} open ${repo.openPullRequests === 1 ? "PR" : "PRs"}`));
  }
  return `        <li class="repo-card">
          <h3>${link(repo.url, name)}${repo.isFork ? ' <span class="fork-badge">fork</span>' : ""}</h3>
${repo.description == null ? "" : `          <p class="description">${escape(repo.description)}</p>\n`}          <p class="repo-meta">${meta.join(' <span aria-hidden="true">·</span> ')}</p>
        </li>`;
}

/** Render the dashboard without I/O or dependence on the current clock. */
export function render({ repos, generatedAt, owner }) {
  const groups = groupByBand(repos, generatedAt);
  const summary = BANDS.map((band) => {
    const count = groups.find((group) => group.band.id === band.id).repos.length;
    return `        <li><a href="#${escape(band.id)}"><span aria-hidden="true">${escape(band.emoji)}</span> ${escape(count)} ${escape(band.label)}</a></li>`;
  }).join("\n");
  const sections = groups.map(({ band, repos: entries }) => `    <section id="${escape(band.id)}" aria-labelledby="${escape(band.id)}-heading">
      <div class="band-heading">
        <h2 id="${escape(band.id)}-heading"><span aria-hidden="true">${escape(band.emoji)}</span> ${escape(band.label)} <span class="band-count">(${escape(entries.length)})</span></h2>
        <p class="band-hint">${escape(HINTS[band.id])}</p>
      </div>
${entries.length ? `      <ul class="repo-list" role="list">\n${entries.map((repo) => renderRepo(repo, owner, generatedAt)).join("\n")}\n      </ul>` : '      <p class="empty">Nothing here.</p>'}
    </section>`).join("\n\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Projects · Frank Pigeon</title>
  <meta name="description" content="Every public repo, by how long since it was last touched. A project dashboard by Frank Pigeon.">
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="assets/style.css">
  <meta name="color-scheme" content="light dark">
</head>
<body>
  <a class="skip-link" href="#main">Skip to projects</a>
  <header class="site-header">
    <a class="site-name" href="https://frankpigeon.com">Frank Pigeon</a>
    <h1>Projects</h1>
    <p class="lede">Every public repo, by how long since it was last touched.</p>
    <nav class="summary" aria-label="Repositories by activity">
      <ul role="list">
${summary}
      </ul>
    </nav>
  </header>
  <main id="main">
${sections}
  </main>
  <footer>
    <p>Updated <time datetime="${escape(generatedAt.toISOString())}">${escape(utcDate(generatedAt))}</time></p>
    <p><a href="https://github.com/fpigeonjr/projects">Source on GitHub</a></p>
  </footer>
</body>
</html>
`;
}
