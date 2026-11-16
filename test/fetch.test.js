import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchRepos } from "../src/fetch.js";

const TOKEN = "ghp_secret123";

const node = (nameWithOwner, extra = {}) => {
  const [owner, name] = nameWithOwner.split("/");
  return {
    nameWithOwner,
    name,
    owner: { login: owner },
    url: `https://github.com/${nameWithOwner}`,
    description: null,
    isFork: false,
    isPrivate: false,
    isArchived: false,
    primaryLanguage: { name: "JavaScript" },
    issues: { totalCount: 2 },
    pullRequests: { totalCount: 1 },
    defaultBranchRef: { target: { committedDate: "2025-01-01T00:00:00Z" } },
    ...extra,
  };
};

const ok = (data, errors) => ({ ok: true, status: 200, json: async () => (errors ? { data, errors } : { data }) });
const notFound = (alias) => ({
  type: "NOT_FOUND",
  path: [alias],
  message: `Could not resolve to a Repository (${alias})`,
});

function fake(handler) {
  const calls = [];
  const impl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    return handler(body, calls.length);
  };
  impl.calls = calls;
  return impl;
}

const page = (nodes, next) => ({
  user: {
    repositories: {
      pageInfo: { hasNextPage: Boolean(next), endCursor: next ?? null },
      nodes,
    },
  },
});

test("paginates across pages and maps records", async () => {
  const f = fake((body) =>
    body.variables.after === null
      ? ok(page([node("me/a", { description: "d", isFork: true })], "c1"))
      : ok(page([node("me/b")]))
  );
  const repos = await fetchRepos({ owner: "me", token: TOKEN, fetchImpl: f });
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].body.variables.after, "c1");
  assert.equal(f.calls[0].init.headers.Authorization, `bearer ${TOKEN}`);
  assert.ok(f.calls[0].init.headers["User-Agent"]);
  assert.deepEqual(repos[0], {
    nameWithOwner: "me/a",
    name: "a",
    owner: "me",
    url: "https://github.com/me/a",
    description: "d",
    language: "JavaScript",
    isFork: true,
    lastCommitAt: "2025-01-01T00:00:00Z",
    openIssues: 2,
    openPullRequests: 1,
  });
  assert.deepEqual(repos.map((r) => r.name), ["a", "b"]);
});

test("include merges, dedupes case-insensitively, skips missing", async () => {
  const f = fake((body) =>
    body.query.includes("repository(")
      ? ok(
          {
            r0: node("org/x"),
            r1: node("ME/a"),
            r2: null,
            r3: node("org/priv", { isPrivate: true }),
            r4: node("org/arch", { isArchived: true }),
          },
          // Real GitHub shape: a missing aliased repo is data null + a NOT_FOUND error.
          [notFound("r2")],
        )
      : ok(page([node("me/a")]))
  );
  const warn = console.warn;
  const warnings = [];
  console.warn = (m) => warnings.push(m);
  let repos;
  try {
    repos = await fetchRepos({
      owner: "me",
      include: ["org/x", "ME/a", "org/gone", "org/priv", "org/arch"],
      token: TOKEN,
      fetchImpl: f,
    });
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(repos.map((r) => r.nameWithOwner), ["me/a", "org/x"]);
  assert.equal(warnings.length, 3);
  assert.equal(f.calls.length, 2);
});

test("exclude applies last, case-insensitively", async () => {
  const f = fake((body) =>
    body.query.includes("repository(") ? ok({ r0: node("org/x") }) : ok(page([node("me/a"), node("me/b")]))
  );
  const repos = await fetchRepos({
    owner: "me",
    include: ["org/x"],
    exclude: ["ME/A", "org/X"],
    token: TOKEN,
    fetchImpl: f,
  });
  assert.deepEqual(repos.map((r) => r.nameWithOwner), ["me/b"]);
});

test("filters private/archived client-side", async () => {
  const f = fake(() =>
    ok(page([node("me/a"), node("me/p", { isPrivate: true }), node("me/z", { isArchived: true })]))
  );
  const repos = await fetchRepos({ owner: "me", token: TOKEN, fetchImpl: f });
  assert.deepEqual(repos.map((r) => r.name), ["a"]);
});

test("empty repo → lastCommitAt null", async () => {
  const f = fake(() =>
    ok(page([node("me/e", { defaultBranchRef: null, primaryLanguage: null })]))
  );
  const [r] = await fetchRepos({ owner: "me", token: TOKEN, fetchImpl: f });
  assert.equal(r.lastCommitAt, null);
  assert.equal(r.language, null);
});

test("GraphQL errors throw without leaking token", async () => {
  const f = fake(() => ({
    ok: true,
    status: 200,
    json: async () => ({ errors: [{ message: `bad ${TOKEN} thing` }] }),
  }));
  await assert.rejects(
    fetchRepos({ owner: "me", token: TOKEN, fetchImpl: f }),
    (err) => /bad/.test(err.message) && !err.message.includes(TOKEN)
  );
});

test("HTTP 401 throws", async () => {
  const f = fake(() => ({ ok: false, status: 401, statusText: "Unauthorized", json: async () => ({}) }));
  await assert.rejects(
    fetchRepos({ owner: "me", token: TOKEN, fetchImpl: f }),
    (err) => /401/.test(err.message) && !err.message.includes(TOKEN)
  );
});

test("missing token throws", async () => {
  await assert.rejects(fetchRepos({ owner: "me", fetchImpl: async () => {} }), /token/i);
});

test("include is deduped and excluded entries are never queried", async () => {
  const f = fake((body) =>
    body.query.includes("repository(") ? ok({ r0: node("org/x") }) : ok(page([]))
  );
  const repos = await fetchRepos({
    owner: "me",
    include: ["org/x", "ORG/X", "org/skip"],
    exclude: ["Org/Skip"],
    token: TOKEN,
    fetchImpl: f,
  });
  assert.deepEqual(repos.map((r) => r.nameWithOwner), ["org/x"]);
  const q = f.calls[1].body.query;
  assert.equal((q.match(/repository\(/g) ?? []).length, 1);
  assert.ok(!q.includes("skip"));
});

test("include query still throws on errors other than per-alias NOT_FOUND", async () => {
  const f = fake((body) =>
    body.query.includes("repository(")
      ? ok({ r0: null }, [{ type: "RATE_LIMITED", path: ["r0"], message: "slow down" }])
      : ok(page([]))
  );
  await assert.rejects(
    fetchRepos({ owner: "me", include: ["org/x"], token: TOKEN, fetchImpl: f }),
    /slow down/,
  );
});

test("owner query does not tolerate NOT_FOUND", async () => {
  const f = fake(() => ok({ user: null }, [{ type: "NOT_FOUND", path: ["user"], message: "no user" }]));
  await assert.rejects(fetchRepos({ owner: "ghost", token: TOKEN, fetchImpl: f }), /no user/);
});
