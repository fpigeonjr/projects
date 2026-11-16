import { test } from "node:test";
import assert from "node:assert/strict";
import { bandFor, groupByBand, slippedSince, timeAgo } from "../src/bands.js";

const NOW = new Date("2026-06-15T12:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

test("bandFor uses exclusive upper bounds", () => {
  assert.equal(bandFor(daysAgo(0), NOW).id, "active");
  assert.equal(bandFor(daysAgo(29), NOW).id, "active");
  assert.equal(bandFor(daysAgo(30), NOW).id, "cooling");
  assert.equal(bandFor(daysAgo(89), NOW).id, "cooling");
  assert.equal(bandFor(daysAgo(90), NOW).id, "dormant");
  assert.equal(bandFor(daysAgo(364), NOW).id, "dormant");
  assert.equal(bandFor(daysAgo(365), NOW).id, "fossil");
});

test("bandFor treats a missing or invalid date as fossil", () => {
  assert.equal(bandFor(null, NOW).id, "fossil");
  assert.equal(bandFor("not-a-date", NOW).id, "fossil");
});

test("groupByBand returns all bands, freshest first", () => {
  const repos = [
    { name: "old", lastCommitAt: daysAgo(10) },
    { name: "new", lastCommitAt: daysAgo(1) },
    { name: "empty", lastCommitAt: null },
    { name: "ancient", lastCommitAt: daysAgo(2000) },
  ];
  const groups = groupByBand(repos, NOW);
  assert.deepEqual(groups.map((g) => g.band.id), ["active", "cooling", "dormant", "fossil"]);
  assert.deepEqual(groups[0].repos.map((r) => r.name), ["new", "old"]);
  assert.equal(groups[1].repos.length, 0);
  assert.deepEqual(groups[3].repos.map((r) => r.name), ["ancient", "empty"]);
});

test("slippedSince reports only repos that crossed a threshold this week", () => {
  const repos = [
    { name: "crossed-30", lastCommitAt: daysAgo(32) },
    { name: "crossed-90", lastCommitAt: daysAgo(90) },
    { name: "steady", lastCommitAt: daysAgo(50) },
    { name: "fresh", lastCommitAt: daysAgo(2) },
    { name: "empty", lastCommitAt: null },
  ];
  const slipped = slippedSince(repos, NOW);
  assert.deepEqual(
    slipped.map((s) => [s.repo.name, s.from.id, s.to.id]),
    [
      ["crossed-30", "active", "cooling"],
      ["crossed-90", "cooling", "dormant"],
    ],
  );
});

test("timeAgo", () => {
  assert.equal(timeAgo(daysAgo(0), NOW), "today");
  assert.equal(timeAgo(daysAgo(1), NOW), "yesterday");
  assert.equal(timeAgo(daysAgo(5), NOW), "5 days ago");
  assert.equal(timeAgo(daysAgo(21), NOW), "3 weeks ago");
  assert.equal(timeAgo(daysAgo(120), NOW), "4 months ago");
  assert.equal(timeAgo(daysAgo(364), NOW), "11 months ago");
  assert.equal(timeAgo("not-a-date", NOW), "unknown");
  assert.equal(timeAgo(daysAgo(400), NOW), "1 year ago");
  assert.equal(timeAgo(daysAgo(1500), NOW), "4 years ago");
  assert.equal(timeAgo(null, NOW), "never");
});
