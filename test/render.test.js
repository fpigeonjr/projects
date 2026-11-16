import test from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/render.js";

const generatedAt = new Date("2026-06-15T12:00:00.000Z");
const owner = "fpigeonjr";
function repo(overrides = {}) {
  return {
    nameWithOwner: "fpigeonjr/projects", name: "projects", owner,
    url: "https://github.com/fpigeonjr/projects",
    description: "A small project dashboard.", language: "JavaScript", isFork: false,
    lastCommitAt: "2026-06-14T12:00:00.000Z", openIssues: 0, openPullRequests: 0,
    ...overrides,
  };
}
const fixtures = [
  repo({ name: "older-active", lastCommitAt: "2026-06-10T12:00:00.000Z", openIssues: 1, openPullRequests: 2 }),
  repo({ name: "fresh", isFork: true, openIssues: 3, openPullRequests: 1 }),
  repo({ name: "library", owner: "someone", nameWithOwner: "someone/library", lastCommitAt: "2026-05-01T12:00:00.000Z" }),
  repo({ name: "archive", lastCommitAt: "2024-01-01T12:00:00.000Z" }),
  repo({ name: "empty", lastCommitAt: null, description: null, language: null }),
];
const page = (repos = fixtures) => render({ repos, generatedAt, owner });
function section(html, id) {
  return html.match(new RegExp(`<section id="${id}"[\\s\\S]*?</section>`))?.[0];
}

test("renders an HTML5 document with metadata, relative assets and no scripts", () => {
  const html = page();
  assert.match(html, /^<!DOCTYPE html>\n<html lang="en">/);
  assert.match(html, /<title>Projects · Frank Pigeon<\/title>/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /name="description"/);
  assert.match(html, /name="color-scheme" content="light dark"/);
  assert.match(html, /href="assets\/favicon.svg"/);
  assert.match(html, /href="assets\/style.css"/);
  assert.doesNotMatch(html, /<script\b|href="\/assets\//);
  assert.match(html, /<header\b/);
  assert.match(html, /<main\b/);
  assert.match(html, /<footer>/);
});

test("band sections and summary have the correct counts and fixed order", () => {
  const html = page();
  assert.deepEqual([...html.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]), ["active", "cooling", "dormant", "fossil"]);
  for (const [id, label, count] of [["active", "Active", 2], ["cooling", "Cooling", 1], ["dormant", "Dormant", 0], ["fossil", "Fossil", 2]]) {
    assert.match(section(html, id), new RegExp(`${label} <span class="band-count">\\(${count}\\)</span>`));
    assert.match(html, new RegExp(`href="#${id}">[^<]*<span[^>]*>[^<]+</span> ${count} ${label}</a>`));
  }
  assert.match(html, /<nav class="summary" aria-label="Repositories by activity">/);
  assert.match(section(html, "active"), /under 30 days/);
  assert.match(section(html, "cooling"), /30–90 days/);
  assert.match(section(html, "dormant"), /90 days – 1 year/);
  assert.match(section(html, "fossil"), /1 year or more/);
});

test("groups and sorts using generatedAt, newest first, without mutating input", () => {
  const before = structuredClone(fixtures);
  const active = section(page(), "active");
  assert.ok(active.indexOf(">fresh</a>") < active.indexOf(">older-active</a>"));
  assert.match(active, />yesterday<\/time>/);
  assert.match(active, />5 days ago<\/time>/);
  assert.deepEqual(fixtures, before);
});

test("escapes malicious descriptions including all five HTML-sensitive characters", () => {
  const html = page([repo({ description: `<script>alert("x" & 'y')</script>` })]);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot; &amp; &#39;y&#39;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>|alert\("x"/);
});

test("escapes names, foreign owners, language, and href attributes", () => {
  const html = page([repo({ owner: "other", nameWithOwner: `other/<img>"'&`, language: `<svg>"'&`, url: `https://example.com/repo?a=1&b='x'` })]);
  assert.match(html, /other\/&lt;img&gt;&quot;&#39;&amp;/);
  assert.match(html, /&lt;svg&gt;&quot;&#39;&amp;/);
  assert.match(html, /href="https:\/\/example.com\/repo\?a=1&amp;b=%27x%27"/);
  assert.doesNotMatch(html, /<img>|<svg>/);
});

test("unsafe and malformed repo URLs never become links, including issue and PR links", () => {
  for (const url of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "java\nscript:alert(1)", "data:text/html,test", "file:///tmp/test", "//evil.example", "not a URL"]) {
    const html = page([repo({ url, openIssues: 1, openPullRequests: 1 })]);
    assert.doesNotMatch(section(html, "active"), /href=/);
    assert.match(html, /<span>projects<\/span>/);
    assert.match(html, /1 open issue/);
  }
});

test("allows both HTTP and HTTPS repository links", () => {
  for (const protocol of ["http", "https"]) {
    assert.match(page([repo({ url: `${protocol}://example.com/repo` })]), new RegExp(`href="${protocol}://example.com/repo"`));
  }
});

test("shows fork badges only for forks and prefixes foreign repo owners", () => {
  const html = page();
  assert.equal((html.match(/class="fork-badge"/g) || []).length, 1);
  assert.match(html, />someone\/library<\/a>/);
  assert.match(html, />fresh<\/a>/);
  assert.doesNotMatch(html, />fpigeonjr\/fresh<\/a>/);
});

test("renders issue/PR links with singular and plural labels, omitting zero counts", () => {
  const html = page();
  assert.match(html, /href="https:\/\/github.com\/fpigeonjr\/projects\/issues">1 open issue<\/a>/);
  assert.match(html, /\/issues">3 open issues<\/a>/);
  assert.match(html, /\/pulls">1 open PR<\/a>/);
  assert.match(html, /\/pulls">2 open PRs<\/a>/);
  const zero = section(page([repo()]), "active");
  assert.doesNotMatch(zero, /open issue|open PR|\/issues|\/pulls/);
});

test("renders commit times with ISO datetime and full UTC title", () => {
  assert.match(page(), /<time datetime="2026-06-14T12:00:00.000Z" title="14 Jun 2026, 12:00 UTC">yesterday<\/time>/);
});

test("null commit goes into Fossil as no commits; absent description and language are omitted", () => {
  const fossil = section(page([repo({ lastCommitAt: null, description: null, language: null })]), "fossil");
  assert.match(fossil, /<span>no commits<\/span>/);
  assert.doesNotMatch(fossil, /<time|class="description"|JavaScript|>null</);
});

test("empty bands remain anchored with a muted Nothing here message", () => {
  assert.match(section(page(), "dormant"), /<p class="empty">Nothing here\.<\/p>/);
  const empty = page([]);
  assert.equal((empty.match(/Nothing here\./g) || []).length, 4);
  assert.equal((empty.match(/<section /g) || []).length, 4);
});

test("footer timestamp is deterministic UTC with source link", () => {
  const html = page();
  assert.match(html, /Updated <time datetime="2026-06-15T12:00:00.000Z">15 Jun 2026, 12:00 UTC<\/time>/);
  assert.match(html, /href="https:\/\/github.com\/fpigeonjr\/projects">Source on GitHub<\/a>/);
  assert.equal(page(), html);
  const offset = render({ repos: [], owner, generatedAt: new Date("2026-01-01T01:05:00+09:00") });
  assert.match(offset, />31 Dec 2025, 16:05 UTC<\/time>/);
});

test("owner comparison is case-insensitive", () => {
  const html = render({
    repos: [repo({ name: "mixed", owner: "FPigeonJr", nameWithOwner: "FPigeonJr/mixed" })],
    generatedAt,
    owner: "fpigeonjr",
  });
  assert.match(html, />mixed<\/a>/);
  assert.doesNotMatch(html, /FPigeonJr\/mixed<\/a>/);
});

test("an unparseable commit date renders as unknown instead of throwing", () => {
  const html = render({ repos: [repo({ name: "weird", lastCommitAt: "not-a-date" })], generatedAt, owner });
  assert.match(section(html, "fossil"), /<span>unknown<\/span>/);
});
