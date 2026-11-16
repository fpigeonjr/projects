import { readFile, writeFile, rm, mkdir, cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchRepos } from "./fetch.js";
import { groupByBand } from "./bands.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function build({
  config,
  token,
  fetchImpl = globalThis.fetch,
  renderImpl,
  outDir = path.join(ROOT, "dist"),
  now = new Date(),
  assetsDir = path.join(ROOT, "assets"),
}) {
  if (!renderImpl) ({ render: renderImpl } = await import("./render.js"));
  const repos = await fetchRepos({
    owner: config.owner,
    include: config.include ?? [],
    exclude: config.exclude ?? [],
    token,
    fetchImpl,
  });
  const html = renderImpl({ repos, generatedAt: now, owner: config.owner });

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "index.html"), html);
  await writeFile(path.join(outDir, ".nojekyll"), "");
  await cp(assetsDir, path.join(outDir, "assets"), { recursive: true });

  const counts = groupByBand(repos, now)
    .map((g) => `${g.band.label} ${g.repos.length}`)
    .join(", ");
  console.log(`Built ${repos.length} repos for ${config.owner} (${counts}) -> ${outDir}`);
  return { repos, outDir };
}

async function main() {
  const config = JSON.parse(await readFile(path.join(ROOT, "config.json"), "utf8"));
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  await build({ config, token });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`build failed: ${err.message}`);
    process.exit(1);
  });
}
