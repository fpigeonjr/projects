import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { build } from "../src/build.js";

test("build writes index.html, .nojekyll and copies assets", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "projects-build-"));
  const outDir = path.join(tmp, "dist");
  const assetsDir = path.join(tmp, "assets");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "stale.txt"), "old");
  await mkdir(path.join(assetsDir, "fonts"), { recursive: true });
  await writeFile(path.join(assetsDir, "style.css"), "body{}");
  await writeFile(path.join(assetsDir, "fonts", "f.woff2"), "x");

  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: { user: { repositories: { pageInfo: { hasNextPage: false }, nodes: [] } } },
    }),
  });
  let received;
  const renderImpl = (args) => {
    received = args;
    return "<html>fake</html>";
  };
  const now = new Date("2026-01-01T00:00:00Z");
  const log = console.log;
  console.log = () => {};
  try {
    await build({ config: { owner: "me" }, token: "t", fetchImpl, renderImpl, outDir, assetsDir, now });
  } finally {
    console.log = log;
  }

  assert.equal(await readFile(path.join(outDir, "index.html"), "utf8"), "<html>fake</html>");
  await stat(path.join(outDir, ".nojekyll"));
  assert.equal(await readFile(path.join(outDir, "assets", "style.css"), "utf8"), "body{}");
  await stat(path.join(outDir, "assets", "fonts", "f.woff2"));
  await assert.rejects(stat(path.join(outDir, "stale.txt")));
  assert.equal(received.owner, "me");
  assert.equal(received.generatedAt, now);
  assert.deepEqual(received.repos, []);
  await rm(tmp, { recursive: true, force: true });
});

test("build uses the real renderer by default", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "projects-build-"));
  const outDir = path.join(tmp, "dist");
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        user: {
          repositories: {
            pageInfo: { hasNextPage: false },
            nodes: [
              {
                nameWithOwner: "me/alpha",
                name: "alpha",
                owner: { login: "me" },
                url: "https://github.com/me/alpha",
                description: "Alpha <b>repo</b>",
                isFork: false,
                isPrivate: false,
                isArchived: false,
                primaryLanguage: { name: "Go" },
                issues: { totalCount: 0 },
                pullRequests: { totalCount: 0 },
                defaultBranchRef: { target: { committedDate: "2025-12-25T00:00:00Z" } },
              },
            ],
          },
        },
      },
    }),
  });
  const log = console.log;
  console.log = () => {};
  try {
    await build({ config: { owner: "me" }, token: "t", fetchImpl, outDir, now: new Date("2026-01-01T00:00:00Z") });
  } finally {
    console.log = log;
  }
  const html = await readFile(path.join(outDir, "index.html"), "utf8");
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /href="https:\/\/github\.com\/me\/alpha"/);
  assert.match(html, /Alpha &lt;b&gt;repo&lt;\/b&gt;/);
  await stat(path.join(outDir, "assets", "style.css"));
  await rm(tmp, { recursive: true, force: true });
});
