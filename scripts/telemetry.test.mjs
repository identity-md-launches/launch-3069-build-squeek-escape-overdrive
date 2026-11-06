// Field projections from public HTTP-200 responses captured 2026-11-06.
// Unrelated deployment metadata is omitted; the account retains one token of 25.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  parseStatus,
  parseEconomy,
  parseSettlements,
  parseHolder,
} from "../src/lib/telemetry.ts";

const fixtures = JSON.parse(
  await readFile(
    new URL("./fixtures/squeekchain.json", import.meta.url),
    "utf8",
  ),
);
const clone = (name) => structuredClone(fixtures[name]);
const statusTest = (name, fn) =>
  test(name, (t) => {
    t.mock.method(Date, "now", () => Date.parse(fixtures.status.generatedAt));
    fn(t);
  });

statusTest(
  "Published idle telemetry preserves zeroes and the confirmed block height",
  () => {
    const value = parseStatus(fixtures.status);
    assert.equal(value.rpm, 0);
    assert.equal(value.distance, 0);
    assert.equal(value.running, false);
    assert.equal(value.blockHeight, 1140);
    assert.equal(
      value.expiresAt,
      Date.parse(fixtures.status.measurement.observedAt) + 120000,
    );
  },
);
statusTest(
  "Milli-RPM and millimeters normalize once; anchor precedes projected height",
  () => {
    const raw = clone("status");
    Object.assign(raw.measurement, {
      rpmMilli: 42750,
      distanceMm: 123456,
      coreStatus: "RUNNING",
    });
    raw.builder.projected.blockHeight = "1142";
    const value = parseStatus({ data: raw });
    assert.equal(value.rpm, 42.75);
    assert.equal(value.distance, 123.456);
    assert.equal(value.running, true);
    assert.equal(value.blockHeight, 1140);
    delete raw.builder.anchor;
    assert.equal(parseStatus(raw).blockHeight, 1142);
  },
);
statusTest(
  "Explicit idle state overrides nonzero RPM; absent distance stays absent",
  () => {
    const raw = clone("status");
    raw.measurement.rpmMilli = 1000;
    delete raw.measurement.distanceMm;
    const value = parseStatus(raw);
    assert.equal(value.running, false);
    assert.equal(value.distance, null);
  },
);
statusTest(
  "Stale, offline and expired source measurements cannot power live play",
  () => {
    for (const freshness of ["stale", "offline"]) {
      const raw = clone("status");
      raw.measurement.freshness = freshness;
      assert.throws(() => parseStatus(raw), /not fresh/);
    }
    const raw = clone("status");
    raw.measurement.observedAt = new Date(Date.now() - 120001).toISOString();
    assert.throws(() => parseStatus(raw), /expired/);
  },
);
statusTest("Missing or unsafe status values remain rejected", () => {
  for (const patch of [{ rpmMilli: null }, { rpmMilli: -1 }]) {
    const raw = clone("status");
    Object.assign(raw.measurement, patch);
    assert.throws(() => parseStatus(raw), /RPM or block height/);
  }
  const raw = clone("status");
  raw.builder.anchor.blockHeight = "9007199254740992";
  assert.throws(() => parseStatus(raw), /RPM or block height/);
});
statusTest(
  "Invalid advertised freshness metadata cannot bypass source expiry",
  () => {
    for (const patch of [
      { observedAt: "invalid" },
      { staleAfterSeconds: null },
      { staleAfterSeconds: -1 },
    ]) {
      const raw = clone("status");
      Object.assign(raw.measurement, patch);
      assert.throws(() => parseStatus(raw), /freshness information/);
    }
  },
);
test("Economy normalizes live token supply using explicit decimals, without inventing totals", () => {
  const value = parseEconomy(fixtures.economy);
  assert.equal(
    value.supply,
    Number(fixtures.economy.supply.liveSupplyBaseUnits) / 1e18,
  );
  assert.equal(value.totalWork, null);
  assert.equal(value.totalSettlements, null);
  for (const decimals of [undefined, -1, 1.5, 256]) {
    const raw = clone("economy");
    raw.asset.decimals = decimals;
    assert.throws(() => parseEconomy(raw), /unrecognized/);
  }
});
test("Published recent settlements normalize work, transaction hashes and ISO timestamps", () => {
  const history = parseSettlements(fixtures.settlements);
  assert.equal(history.length, 10);
  assert.deepEqual(history[0], {
    height: 1140,
    workUnits: 18,
    hash: fixtures.settlements.recentSettlements[0].transactionHash,
    timestamp: Date.parse("2026-11-06T07:30:36.000Z"),
  });
  assert.equal(history.at(-1).height, 846);
  assert.ok(
    history.every((item, i) => i === 0 || history[i - 1].height > item.height),
  );
  // summary.settlementCount includes archived entries; it is not the sample length.
  assert.equal(fixtures.settlements.summary.settlementCount, "141");
});
test("Settlement zero work, empty history and malformed rows retain their meanings", () => {
  assert.deepEqual(
    parseSettlements({ status: "available", recentSettlements: [] }),
    [],
  );
  const raw = clone("settlements");
  raw.recentSettlements = [raw.recentSettlements[0]];
  raw.recentSettlements[0].workAdded = "0";
  assert.equal(parseSettlements(raw)[0].workUnits, 0);
  raw.recentSettlements[0].transactionHash = "invalid";
  assert.throws(() => parseSettlements(raw), /valid hash/);
});
test("Published wallet holdings qualify, including counts beyond the first token page", () => {
  assert.equal(parseHolder(fixtures.account), true);
  assert.equal(
    parseHolder({ tokenCounts: { wallet: "211", staking: "0" }, tokens: [] }),
    true,
  );
  assert.equal(
    parseHolder({ tokenCounts: { wallet: "0", staking: "1" } }),
    true,
  );
  assert.equal(
    parseHolder({ tokenCounts: { wallet: "0", staking: "0" } }),
    false,
  );
});
test("Token fallback respects wallet/staking custody and incomplete pagination", () => {
  assert.equal(parseHolder({ tokens: [{ custody: "wallet" }] }), true);
  assert.equal(parseHolder({ tokens: [{ custody: "staking" }] }), true);
  assert.equal(parseHolder({ tokens: [], nextCursor: null }), false);
  assert.throws(
    () => parseHolder({ tokens: [], nextCursor: "more" }),
    /not available/,
  );
  assert.throws(
    () => parseHolder({ tokens: [{ custody: "burned" }] }),
    /not available/,
  );
  assert.throws(
    () => parseHolder({ balance: "1000000000000000000" }),
    /not available/,
  );
});
test("Unavailable payloads cannot grant a boost or revive history/economy", () => {
  for (const [parse, key] of [
    [parseHolder, "account"],
    [parseSettlements, "settlements"],
    [parseEconomy, "economy"],
  ]) {
    const raw = clone(key);
    raw.status = "unavailable";
    assert.throws(() => parse(raw), /unavailable/);
  }
});
test("Previously supported simple response formats continue to work", () => {
  assert.deepEqual(
    parseStatus({ rpm: 40, running: true, block_height: 10, distance_m: 2 }),
    { rpm: 40, running: true, blockHeight: 10, distance: 2 },
  );
  assert.deepEqual(
    parseEconomy({ total_work_units: 500, total_settlements: 5 }),
    { totalWork: 500, totalSettlements: 5, supply: null },
  );
  const hash = fixtures.settlements.recentSettlements[0].transactionHash;
  const row = { height: 10, work_units: 20, hash };
  assert.deepEqual(parseSettlements({ settlements: [row, row] }), [
    { height: 10, workUnits: 20, hash, timestamp: null },
  ]);
  assert.equal(parseHolder({ is_holder: true }), true);
  assert.equal(parseHolder({ nft_count: "0" }), false);
});
