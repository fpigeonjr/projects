// Staleness bands. Bands depend only on the age of a repo's last activity,
// so band changes can be derived from dates alone (no stored state).

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ordered freshest to stalest. `maxDays` is exclusive; the last band is open-ended. */
export const BANDS = [
  { id: "active", label: "Active", emoji: "🟢", maxDays: 30 },
  { id: "cooling", label: "Cooling", emoji: "🟡", maxDays: 90 },
  { id: "dormant", label: "Dormant", emoji: "🟠", maxDays: 365 },
  { id: "fossil", label: "Fossil", emoji: "⚫", maxDays: Infinity },
];

/** Whole days between `date` and `now` (never negative). */
export function ageInDays(date, now = new Date()) {
  const ms = new Date(now).getTime() - new Date(date).getTime();
  return Math.max(0, Math.floor(ms / DAY_MS));
}

/** Band for a last-activity date. A missing or unparseable date (e.g. empty repo) is a fossil. */
export function bandFor(date, now = new Date()) {
  const fossil = BANDS[BANDS.length - 1];
  if (!date) return fossil;
  const days = ageInDays(date, now);
  return BANDS.find((band) => days < band.maxDays) ?? fossil;
}

/**
 * Group repos into bands, freshest first within each band.
 * Returns [{ band, repos }] for every band, including empty ones.
 */
export function groupByBand(repos, now = new Date()) {
  const groups = BANDS.map((band) => ({ band, repos: [] }));
  for (const repo of repos) {
    const band = bandFor(repo.lastCommitAt, now);
    groups.find((g) => g.band.id === band.id).repos.push(repo);
  }
  const time = (r) => {
    const t = r.lastCommitAt ? new Date(r.lastCommitAt).getTime() : -Infinity;
    return Number.isNaN(t) ? -Infinity : t;
  };
  for (const g of groups) g.repos.sort((a, b) => time(b) - time(a));
  return groups;
}

/**
 * Repos whose band got worse within the `windowDays` before `now`.
 * Returns [{ repo, from, to }]. Only worsening is detectable without history.
 * Used by the weekly digest (milestone 2), not by the page.
 */
export function slippedSince(repos, now = new Date(), windowDays = 7) {
  const before = new Date(new Date(now).getTime() - windowDays * DAY_MS);
  const slipped = [];
  for (const repo of repos) {
    if (!repo.lastCommitAt) continue;
    const from = bandFor(repo.lastCommitAt, before);
    const to = bandFor(repo.lastCommitAt, now);
    if (from.id !== to.id) slipped.push({ repo, from, to });
  }
  return slipped;
}

/** Human relative time, e.g. "today", "3 days ago", "2 months ago", "4 years ago". */
export function timeAgo(date, now = new Date()) {
  if (!date) return "never";
  const days = ageInDays(date, now);
  if (Number.isNaN(days)) return "unknown";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.min(11, Math.floor(days / 30))} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}
