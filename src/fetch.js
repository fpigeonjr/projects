// GitHub GraphQL -> repo records (see AGENTS.md for the contract).

const ENDPOINT = "https://api.github.com/graphql";

const NODE_FIELDS = `
  nameWithOwner
  name
  owner { login }
  url
  description
  isFork
  isPrivate
  isArchived
  primaryLanguage { name }
  issues(states: OPEN) { totalCount }
  pullRequests(states: OPEN) { totalCount }
  defaultBranchRef { target { ... on Commit { committedDate } } }
`;

const OWNER_QUERY = `
query($owner: String!, $after: String) {
  user(login: $owner) {
    repositories(first: 100, after: $after, ownerAffiliations: OWNER, privacy: PUBLIC, isArchived: false) {
      pageInfo { hasNextPage endCursor }
      nodes { ${NODE_FIELDS} }
    }
  }
}`;

// `allowNotFound`: tolerate NOT_FOUND errors for these top-level aliases. GitHub
// returns HTTP 200 with `data.<alias> = null` plus a NOT_FOUND error when an aliased
// `repository(...)` can't be resolved (deleted, renamed, or not visible).
async function gql(fetchImpl, token, query, variables, { allowNotFound = [] } = {}) {
  let res;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `bearer ${token}`,
        "User-Agent": "fpigeonjr-projects-dashboard",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    throw new Error(`GitHub request failed: ${String(err.message).split(token).join("***")}`);
  }
  if (!res.ok) {
    throw new Error(`GitHub API returned HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`);
  }
  const json = await res.json();
  const errors = (json.errors ?? []).filter(
    (e) => !(e.type === "NOT_FOUND" && e.path?.length === 1 && allowNotFound.includes(e.path[0])),
  );
  if (errors.length) {
    const msg = errors.map((e) => e.message).join("; ").split(token).join("***");
    throw new Error(`GitHub GraphQL error: ${msg}`);
  }
  return json.data;
}

function toRecord(node) {
  return {
    nameWithOwner: node.nameWithOwner,
    name: node.name,
    owner: node.owner.login,
    url: node.url,
    description: node.description ?? null,
    language: node.primaryLanguage?.name ?? null,
    isFork: Boolean(node.isFork),
    lastCommitAt: node.defaultBranchRef?.target?.committedDate ?? null,
    openIssues: node.issues?.totalCount ?? 0,
    openPullRequests: node.pullRequests?.totalCount ?? 0,
  };
}

export async function fetchRepos({
  owner,
  include = [],
  exclude = [],
  token,
  fetchImpl = globalThis.fetch,
}) {
  if (!token) throw new Error("Missing GitHub token (set GITHUB_TOKEN)");
  if (!owner) throw new Error("Missing owner");

  const nodes = [];
  let after = null;
  for (;;) {
    const data = await gql(fetchImpl, token, OWNER_QUERY, { owner, after });
    if (!data?.user) throw new Error(`GitHub user not found: ${owner}`);
    const repos = data.user.repositories;
    nodes.push(...repos.nodes);
    if (!repos.pageInfo?.hasNextPage) break;
    after = repos.pageInfo.endCursor;
  }

  if (include.length) {
    const wanted = new Map();
    for (const entry of include) {
      const [o, n, ...rest] = String(entry).split("/");
      if (!o || !n || rest.length) throw new Error(`Invalid include entry "${entry}" (want owner/name)`);
      const key = `${o}/${n}`.toLowerCase();
      if (!wanted.has(key) && !exclude.some((e) => String(e).toLowerCase() === key)) {
        wanted.set(key, { entry, o, n });
      }
    }
    const parsed = [...wanted.values()];
    const fields = parsed
      .map((p, i) => `r${i}: repository(owner: ${JSON.stringify(p.o)}, name: ${JSON.stringify(p.n)}) { ${NODE_FIELDS} }`)
      .join("\n");
    const aliases = parsed.map((_, i) => `r${i}`);
    const data = parsed.length
      ? await gql(fetchImpl, token, `query { ${fields} }`, {}, { allowNotFound: aliases })
      : {};
    parsed.forEach((p, i) => {
      const node = data?.[`r${i}`];
      if (!node) console.warn(`include skipped (not found): ${p.entry}`);
      else if (node.isPrivate) console.warn(`include skipped (private): ${p.entry}`);
      else if (node.isArchived) console.warn(`include skipped (archived): ${p.entry}`);
      else nodes.push(node);
    });
  }

  const excluded = new Set(exclude.map((e) => String(e).toLowerCase()));
  const seen = new Set();
  const out = [];
  for (const node of nodes) {
    if (node.isPrivate || node.isArchived) continue;
    const key = node.nameWithOwner.toLowerCase();
    if (seen.has(key) || excluded.has(key)) continue;
    seen.add(key);
    out.push(toRecord(node));
  }
  return out;
}
