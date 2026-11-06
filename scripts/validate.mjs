// Deterministic validation of the built static export. All fixtures stay in browser contexts.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { getAddress, keccak256, stringToHex, hexToString } from "viem";
import { preview, executablePath } from "./preview-utils.mjs";
const { chromium } = await import(process.env.IMD_PLAYWRIGHT ?? "playwright");
const publishedApi = JSON.parse(
  await readFile(
    new URL("./fixtures/squeekchain.json", import.meta.url),
    "utf8",
  ),
);
const output = "test/scratch/validation";
await mkdir(output, { recursive: true });
const server = await preview();
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});
const results = [],
  failures = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (e) {
    failures.push(name);
    results.push({ name, passed: false, error: e.message });
    console.error(`FAIL ${name}: ${e.message}`);
  }
};
const hash = keccak256(stringToHex("Browser test settlement"));
const address = getAddress(`0x${randomBytes(20).toString("hex")}`);
const fixtureHistory = [
  { height: 101, work_units: 200, hash },
  {
    height: 100,
    work_units: 160,
    hash: keccak256(stringToHex("Earlier test settlement")),
  },
];
const errors = [],
  resourceErrors = [];
async function makePage({
  offline = false,
  width = 390,
  wallet = false,
  reducedMotion = "no-preference",
  storageBlocked = false,
  phone = false,
  published = false,
  audio = false,
} = {}) {
  const context = await browser.newContext({
    viewport: { width, height: width < 600 ? 844 : 900 },
    reducedMotion,
    ...(phone
      ? {
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
        }
      : {}),
  });
  const page = await context.newPage();
  const state = {
    offline,
    rpm: 40,
    running: true,
    height: 102,
    settlements: [...fixtureHistory],
    holder: true,
    badSchema: false,
    accountError: false,
    historyError: false,
    publishedStatus: structuredClone(publishedApi.status),
    publishedSettlements: structuredClone(publishedApi.settlements),
  };
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().startsWith(server.url) && response.status() >= 400)
      resourceErrors.push(response.url());
  });
  await page.clock.install({
    time: new Date(
      published ? publishedApi.status.generatedAt : "2026-11-06T12:00:00Z",
    ),
  });
  if (audio)
    await page.addInitScript(() => {
      window.__audio = { contexts: 0, tones: 0 };
      const Original = window.AudioContext;
      window.AudioContext = class extends Original {
        constructor(...args) {
          super(...args);
          window.__audio.contexts++;
          const create = this.createOscillator.bind(this);
          this.createOscillator = (...args) => {
            const oscillator = create(...args),
              start = oscillator.start.bind(oscillator);
            oscillator.start = (...args) => {
              window.__audio.tones++;
              return start(...args);
            };
            return oscillator;
          };
        }
      };
    });
  if (wallet)
    await page.addInitScript(
      ({ address, hash }) => {
        const events = new Map();
        let chain = "0x1",
          needsAdd = true,
          authorized = false;
        window.__walletCalls = [];
        const provider = {
          on(name, fn) {
            const listeners = events.get(name) ?? [];
            listeners.push(fn);
            events.set(name, listeners);
          },
          removeListener(name, fn) {
            events.set(
              name,
              (events.get(name) ?? []).filter((x) => x !== fn),
            );
          },
          async request({ method, params }) {
            window.__walletCalls.push({ method, params });
            if (method === "eth_accounts") return authorized ? [address] : [];
            if (method === "eth_requestAccounts") {
              authorized = true;
              return [address];
            }
            if (method === "eth_chainId") return chain;
            if (method === "wallet_switchEthereumChain") {
              if (needsAdd)
                throw Object.assign(new Error("Unknown chain"), { code: 4902 });
              chain = params[0].chainId;
              (events.get("chainChanged") ?? []).forEach((fn) => fn(chain));
              return null;
            }
            if (method === "wallet_addEthereumChain") {
              needsAdd = false;
              chain = params[0].chainId;
              (events.get("chainChanged") ?? []).forEach((fn) => fn(chain));
              return null;
            }
            if (method === "eth_sendTransaction") {
              if (window.__rejectTransaction)
                throw Object.assign(new Error("User rejected request"), {
                  code: 4001,
                });
              return hash;
            }
            if (method === "eth_getTransactionCount") return "0x1";
            if (method === "wallet_getCapabilities") return {};
            if (method === "eth_getBalance") return "0x100000000000000";
            throw new Error(`Unexpected wallet method ${method}`);
          },
        };
        const announce = () =>
          window.dispatchEvent(
            new CustomEvent("eip6963:announceProvider", {
              detail: {
                info: {
                  uuid: "71fdb7c1-f6b1-4b06-887c-b92de76c9f01",
                  name: "Test Hamster Wallet",
                  icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="28" height="28"%3E%3Ccircle cx="14" cy="14" r="14" fill="%23c3f85c"/%3E%3C/svg%3E',
                  rdns: "test.hamster.wallet",
                },
                provider,
              },
            }),
          );
        window.addEventListener("eip6963:requestProvider", announce);
        announce();
      },
      { address, hash },
    );
  if (storageBlocked)
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new Error("Storage disabled by browser settings");
      };
    });
  await page.route("https://api.squeekchain.com/v1/**", async (route) => {
    if (state.offline)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: "{}",
      });
    const path = new URL(route.request().url()).pathname;
    if (state.historyError && path.endsWith("/settlements"))
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: "{}",
      });
    if (published) {
      const payload = path.endsWith("/status")
        ? state.publishedStatus
        : path.endsWith("/economy/state")
          ? publishedApi.economy
          : path.includes("/accounts/")
            ? publishedApi.account
            : state.publishedSettlements;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    }
    const payload = path.endsWith("/status")
      ? state.badSchema
        ? { unexpected: true }
        : {
            rpm: state.rpm,
            state: state.running ? "running" : "idle",
            block_height: state.height,
            distance_m: 321.4,
          }
      : path.endsWith("/economy/state")
        ? { total_work_units: 50000, total_settlements: 101 }
        : path.includes("/accounts/")
          ? state.accountError
            ? {}
            : { is_holder: state.holder }
          : { settlements: state.settlements };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
  await page.route(
    "https://ethereum-sepolia-rpc.publicnode.com/**",
    async (route) => {
      const payload = route.request().postDataJSON();
      const resultFor = (request) => {
        const result =
          request.method === "eth_blockNumber"
            ? "0x100"
            : request.method === "eth_getTransactionReceipt"
              ? {
                  transactionHash: hash,
                  transactionIndex: "0x0",
                  blockHash: hash,
                  blockNumber: "0x100",
                  from: address,
                  to: address,
                  cumulativeGasUsed: "0x5208",
                  gasUsed: "0x5208",
                  contractAddress: null,
                  logs: [],
                  logsBloom: `0x${"0".repeat(512)}`,
                  status: "0x1",
                  effectiveGasPrice: "0x3b9aca00",
                  type: "0x2",
                }
              : request.method === "eth_chainId"
                ? "0xaa36a7"
                : null;
        return { jsonrpc: "2.0", id: request.id, result };
      };
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          Array.isArray(payload) ? payload.map(resultFor) : resultFor(payload),
        ),
      });
    },
  );
  await page.goto(server.url, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator("h1").waitFor();
  if (offline)
    await page
      .getByText("Live feed unavailable · Try a practice run.")
      .waitFor();
  else
    await page
      .getByText("Connected to Squeekchain · Updates every 4 seconds")
      .waitFor();
  await page.clock.pauseAt(
    new Date((await page.evaluate(() => Date.now())) + 100),
  );
  page.setDefaultTimeout(6000);
  return { page, context, state };
}
async function click(page, role, name) {
  if (name === "Practice")
    await page
      .locator(".mobile-source")
      .getByRole("button", { name, exact: true })
      .click();
  else await page.getByRole(role, { name, exact: true }).click();
  if (name !== "Tap the pulse") await page.clock.runFor(80);
}
async function noOverflow(page) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `Horizontal overflow at ${page.viewportSize().width}px`,
  );
}
try {
  await check(
    "Published API schemas: idle readings, playable side games, NFT holder boost and predictor settlement",
    async () => {
      for (const width of [390, 1440]) {
        const { page, context, state } = await makePage({
          published: true,
          wallet: true,
          width,
        });
        assert.match(
          await page.locator(".telemetry-strip").innerText(),
          /#1,140/,
        );
        assert.equal(
          await page.getByRole("img", { name: /sleeping/ }).count(),
          1,
        );
        const waiting = page.getByRole("button", {
          name: "Waiting for the wheel…",
          exact: true,
        });
        const box = await waiting.boundingBox();
        assert.ok(box && box.y + box.height <= page.viewportSize().height);
        assert.equal(await waiting.isDisabled(), true);
        assert.match(await page.locator(".economy-stats").innerText(), /–/);
        await click(page, "button", "Connect wallet");
        await click(page, "button", "Test Hamster Wallet");
        await click(page, "button", "Switch to Sepolia");
        await page.getByText("Holder boost active · +15%").waitFor();
        await click(page, "tab", "Round predictor");
        const lockBox = await page
          .getByRole("button", { name: "Lock prediction" })
          .boundingBox();
        assert.ok(
          lockBox && lockBox.y + lockBox.height <= page.viewportSize().height,
        );
        await page.getByLabel("Your prediction").fill("18");
        await click(page, "button", "Lock prediction");
        state.publishedSettlements.recentSettlements.unshift({
          ...publishedApi.settlements.recentSettlements[0],
          blockHeight: "1141",
        });
        await click(page, "button", "Retry live telemetry");
        await page.getByText("1,150 points locked in").waitFor();
        await click(page, "tab", "Hash rhythm");
        const start = page.getByRole("button", { name: "Start rhythm" });
        const startBox = await start.boundingBox();
        assert.ok(
          startBox &&
            startBox.y + startBox.height <= page.viewportSize().height,
        );
        assert.equal(await start.isDisabled(), false);
        await noOverflow(page);
        await context.close();
      }
    },
  );
  await check(
    "Published source freshness: stale HTTP-200 telemetry voids an active live run",
    async () => {
      const { page, context, state } = await makePage({ published: true });
      Object.assign(state.publishedStatus.measurement, {
        coreStatus: "RUNNING",
        rpmMilli: 42750,
        distanceMm: 123456,
      });
      await click(page, "button", "Retry live telemetry");
      await page.getByRole("img", { name: /running at 42.8 RPM/ }).waitFor();
      await click(page, "button", "Join live run");
      state.publishedStatus.measurement.freshness = "stale";
      await click(page, "button", "Retry live telemetry");
      await page.getByText("Feed lost. Run voided.", { exact: true }).waitFor();
      assert.equal(await page.locator(".score-row").count(), 0);
      await context.close();
    },
  );
  await check(
    "Mid-rhythm sound toggle initializes once, plays tones, mutes and reuses its context",
    async () => {
      const { page, context } = await makePage({
        published: true,
        audio: true,
      });
      await click(page, "tab", "Hash rhythm");
      await click(page, "button", "Start rhythm");
      await page.clock.runFor(500);
      await click(page, "button", "Enable game sound");
      await page.waitForTimeout(50);
      await page.clock.runFor(2400);
      const first = await page.evaluate(() => window.__audio);
      assert.equal(first.contexts, 1);
      assert.ok(first.tones > 0);
      await click(page, "button", "Mute game sound");
      const muted = await page.evaluate(() => window.__audio.tones);
      await page.clock.runFor(1000);
      assert.equal(await page.evaluate(() => window.__audio.tones), muted);
      await click(page, "button", "Enable game sound");
      await page.clock.runFor(2000);
      const resumed = await page.evaluate(() => window.__audio);
      assert.equal(resumed.contexts, 1);
      assert.ok(resumed.tones > muted);
      await context.close();
    },
  );
  await check(
    "Stream view preserves the canvas from either side-game tab at 320, 390, 680 and 1440",
    async () => {
      const { page, context } = await makePage({ published: true });
      for (const width of [320, 390, 680, 1440]) {
        await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
        for (const tab of ["Round predictor", "Hash rhythm"]) {
          await click(page, "tab", tab);
          if (width <= 680)
            assert.equal(await page.locator("canvas").isVisible(), false);
          await click(page, "button", "Stream view");
          assert.equal(await page.locator("canvas").isVisible(), true);
          assert.equal(await page.locator(".game-controls").isVisible(), false);
          await noOverflow(page);
          await click(page, "button", "Exit stream view");
        }
      }
      await context.close();
    },
  );
  await check(
    "Captured rhythm remains tappable after HTTP-503 history refresh; a new session requires recovery",
    async () => {
      const { page, context, state } = await makePage({ published: true });
      await click(page, "tab", "Hash rhythm");
      await click(page, "button", "Start rhythm");
      state.historyError = true;
      await click(page, "button", "Retry live telemetry");
      await page.waitForTimeout(50);
      await page.clock.runFor(100);
      assert.equal(
        await page.getByRole("button", { name: "Tap the pulse" }).isDisabled(),
        false,
      );
      await click(page, "button", "Tap the pulse");
      await page.getByText("Off beat. Catch the next pulse.").waitFor();
      await click(page, "button", "Stop rhythm");
      assert.equal(
        await page.getByRole("button", { name: "Start rhythm" }).isDisabled(),
        true,
      );
      state.historyError = false;
      await click(page, "button", "Retry live telemetry");
      assert.equal(
        await page.getByRole("button", { name: "Start rhythm" }).isDisabled(),
        false,
      );
      await context.close();
    },
  );
  await check(
    "First screen at 390: product, scene, and complete primary action",
    async () => {
      const { page, context } = await makePage({ offline: true });
      const box = await page
        .getByRole("button", { name: "Start practice run", exact: true })
        .boundingBox();
      assert.ok(
        box && box.y + box.height <= 844,
        `Action bottom is ${box && box.y + box.height}px`,
      );
      await noOverflow(page);
      await page.screenshot({ path: `${output}/mobile-offline.png` });
      await context.close();
    },
  );
  await check(
    "Practice join, multiplier growth, bail, persistence, on-chain exclusion",
    async () => {
      const { page, context } = await makePage({ offline: true });
      await click(page, "button", "Start practice run");
      await page.clock.runFor(2200);
      assert.ok(
        Number(
          await page
            .locator(".multiplier>.mono")
            .innerText()
            .then((t) => t.replace("×", "")),
        ) > 1,
      );
      await click(page, "button", "Bail out");
      await page.getByText("Escape successful", { exact: true }).waitFor();
      assert.equal(await page.locator(".score-row").count(), 1);
      assert.equal(
        await page
          .getByRole("button", { name: "Commit high score on-chain" })
          .isDisabled(),
        true,
      );
      await page.reload();
      await page.locator("h1").waitFor();
      await click(page, "button", "Practice");
      assert.equal(await page.locator(".score-row").count(), 1);
      await context.close();
    },
  );
  await check("Practice run loses on idle and can restart", async () => {
    const { page, context } = await makePage({ offline: true });
    await click(page, "button", "Start practice run");
    await page.clock.runFor(26000);
    await page
      .getByText("The hamster stopped. Run lost.", { exact: true })
      .waitFor();
    assert.equal(await page.locator(".score-row").count(), 0);
    await click(page, "button", "Join practice run");
    await page.getByRole("button", { name: "Bail out" }).waitFor();
    await context.close();
  });
  await check(
    "Live data updates the RPM-driven canvas; RPM drop loses the run",
    async () => {
      const { page, context, state } = await makePage();
      const before = await page
        .locator("canvas")
        .evaluate((c) => c.toDataURL());
      await page.clock.runFor(400);
      assert.notEqual(
        before,
        await page.locator("canvas").evaluate((c) => c.toDataURL()),
      );
      await click(page, "button", "Join live run");
      state.rpm = 52;
      await page.clock.runFor(4300);
      await page.getByRole("img", { name: /running at 52.0 RPM/ }).waitFor();
      state.rpm = 30;
      await page.clock.runFor(4300);
      await page
        .getByText("The hamster stopped. Run lost.", { exact: true })
        .waitFor();
      assert.equal(await page.locator(".score-row").count(), 0);
      await context.close();
    },
  );
  await check(
    "Stale live feed voids a run, retry restores live play, schema errors do not invent data",
    async () => {
      const { page, context, state } = await makePage();
      await click(page, "button", "Join live run");
      state.offline = true;
      await page.clock.runFor(4300);
      await page.getByText("Feed lost. Run voided.", { exact: true }).waitFor();
      assert.equal(await page.locator(".score-row").count(), 0);
      state.offline = false;
      await click(page, "button", "Retry live telemetry");
      await page.getByRole("button", { name: "Join live run" }).waitFor();
      state.badSchema = true;
      await click(page, "button", "Retry live telemetry");
      await page
        .getByText("Live feed unavailable · Try a practice run.")
        .waitFor();
      await context.close();
    },
  );
  await check(
    "Predictor validates input, locks, and settles while the hamster sleeps",
    async () => {
      const { page, context, state } = await makePage();
      state.running = false;
      state.rpm = 0;
      await click(page, "button", "Retry live telemetry");
      await click(page, "tab", "Round predictor");
      await click(page, "button", "Lock prediction");
      await page
        .getByText("Enter a whole number from 0 to 1,000,000,000.")
        .waitFor();
      assert.equal(
        await page.locator("#prediction").getAttribute("aria-invalid"),
        "true",
      );
      await page.getByLabel("Your prediction").fill("200");
      await click(page, "button", "Lock prediction");
      assert.equal(
        await page
          .getByRole("button", { name: "Waiting for settlement…" })
          .isDisabled(),
        true,
      );
      state.settlements = [
        {
          height: 102,
          work_units: 200,
          hash: keccak256(stringToHex("Next settlement")),
        },
        ...state.settlements,
      ];
      await page.clock.runFor(15500);
      await page.getByText("1,000 points locked in").waitFor();
      assert.equal(await page.locator(".score-row").count(), 1);
      await context.close();
    },
  );
  await check(
    "Practice predictor settles in six simulated seconds",
    async () => {
      const { page, context } = await makePage({ offline: true });
      await click(page, "button", "Practice");
      await click(page, "tab", "Round predictor");
      await page.getByLabel("Your prediction").fill("180");
      await click(page, "button", "Lock prediction");
      await page.clock.runFor(6100);
      await page.getByText(/points locked in/).waitFor();
      await context.close();
    },
  );
  await check(
    "16 hash-derived rhythm beats score, charge battery, and persist",
    async () => {
      const { page, context } = await makePage();
      await click(page, "tab", "Hash rhythm");
      await click(page, "button", "Start rhythm");
      let t = 1000,
        current = 0;
      for (let i = 0; i < 16; i++) {
        t += 600 + (parseInt(hash.slice(2 + i * 2, 4 + i * 2), 16) % 4) * 100;
        await page.clock.runFor(t - current);
        current = t;
        await click(page, "button", "Tap the pulse");
      }
      await page.clock.runFor(600);
      await page.getByText("Rhythm complete. Nice energy.").waitFor();
      assert.equal(
        await page.getByRole("progressbar").getAttribute("aria-valuenow"),
        "48",
      );
      assert.match(await page.locator(".score-row").innerText(), /1,600/);
      await page.reload();
      await page.locator("h1").waitFor();
      assert.equal(
        await page.getByRole("progressbar").getAttribute("aria-valuenow"),
        "48",
      );
      await context.close();
    },
  );
  await check(
    "Wallet discovery, add/switch Sepolia, holder boost, rejection/retry, exact self-transaction and receipt",
    async () => {
      const { page, context } = await makePage({ wallet: true, width: 1440 });
      await click(page, "button", "Connect wallet");
      await page.getByRole("dialog", { name: "Connect a wallet" }).waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Browser wallet", exact: true })
          .count(),
        0,
      );
      await click(page, "button", "Test Hamster Wallet");
      await page.getByRole("button", { name: "Switch to Sepolia" }).waitFor();
      await click(page, "button", "Switch to Sepolia");
      await page.getByText("Holder boost active · +15%").waitFor();
      await click(page, "button", "Join live run");
      await page.clock.runFor(1200);
      await click(page, "button", "Bail out");
      const initialScore = Number(
        (await page.locator(".score-row>strong").innerText()).replaceAll(
          ",",
          "",
        ),
      );
      assert.ok(initialScore >= 125);
      await click(page, "button", "Commit high score on-chain");
      await page.evaluate(() => {
        window.__rejectTransaction = true;
      });
      await click(page, "button", "Confirm 0 ETH transaction");
      await page
        .getByText("Request declined. You can try again when ready.")
        .waitFor();
      await page.evaluate(() => {
        window.__rejectTransaction = false;
      });
      await click(page, "button", "Confirm 0 ETH transaction");
      await page.clock.runFor(1500);
      await page
        .getByText("Score stamped on Sepolia", { exact: true })
        .waitFor();
      const calls = await page.evaluate(() => window.__walletCalls);
      assert.ok(
        calls.some(
          (c) =>
            c.method === "wallet_addEthereumChain" &&
            c.params[0].chainId === "0xaa36a7",
        ),
      );
      const tx = calls.filter((c) => c.method === "eth_sendTransaction").at(-1)
        .params[0];
      assert.equal(tx.to.toLowerCase(), address.toLowerCase());
      assert.equal(tx.from.toLowerCase(), address.toLowerCase());
      assert.equal(BigInt(tx.value), 0n);
      assert.equal(hexToString(tx.data), `SQUEEK_SCORE:${initialScore}:102`);
      await click(page, "button", "Close stamp your high score");
      await page
        .getByRole("link", {
          name: `View confirmed proof for score ${initialScore}`,
        })
        .waitFor();
      await context.close();
    },
  );
  await check(
    "Phone wallet sheet has all four app links, official marks, and Coinbase Smart Wallet",
    async () => {
      const { page, context } = await makePage({ phone: true });
      await click(page, "button", "Connect wallet");
      for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"]) {
        const row = page.getByRole("link", { name: `Open in ${name}` });
        assert.equal(await row.isVisible(), true);
        const image = row.locator("img");
        assert.equal(
          await image.evaluate((i) => i.complete && i.naturalWidth > 0),
          true,
        );
      }
      const rabby = new URL(
        await page
          .getByRole("link", { name: "Open in Rabby", exact: true })
          .getAttribute("href"),
      );
      assert.equal(rabby.pathname, "/mobile/");
      assert.equal(rabby.searchParams.get("_cmd"), "open-dapp");
      assert.equal(rabby.searchParams.get("dapp"), page.url());
      assert.equal(
        await page
          .getByRole("button", { name: "Coinbase Smart Wallet" })
          .isVisible(),
        true,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Browser wallet", exact: true })
          .count(),
        0,
      );
      await context.close();
    },
  );
  await check(
    "Holder API failure keeps standard scoring; retry can activate boost",
    async () => {
      const { page, context, state } = await makePage({ wallet: true });
      state.accountError = true;
      await click(page, "button", "Connect wallet");
      await click(page, "button", "Test Hamster Wallet");
      await page
        .getByText("Holder status unavailable", { exact: true })
        .waitFor();
      state.accountError = false;
      await click(page, "button", "Retry holder check");
      await page.getByText("Holder boost active · +15%").waitFor();
      await context.close();
    },
  );
  await check(
    "Reduced motion and pause freeze the canvas without hiding telemetry",
    async () => {
      const { page, context } = await makePage({ reducedMotion: "reduce" });
      const before = await page
        .locator("canvas")
        .evaluate((c) => c.toDataURL());
      await page.clock.runFor(1000);
      assert.equal(
        before,
        await page.locator("canvas").evaluate((c) => c.toDataURL()),
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await click(page, "button", "Pause animation");
      const paused = await page
        .locator("canvas")
        .evaluate((c) => c.toDataURL());
      await page.clock.runFor(1000);
      assert.equal(
        paused,
        await page.locator("canvas").evaluate((c) => c.toDataURL()),
      );
      await context.close();
    },
  );
  await check(
    "Keyboard modal focus, Escape return, and tab arrow navigation",
    async () => {
      const { page, context } = await makePage({ width: 1440 });
      await page.getByRole("button", { name: "How to play" }).focus();
      await page.keyboard.press("Enter");
      assert.equal(
        await page.evaluate(() =>
          document
            .querySelector("dialog[open]")
            ?.contains(document.activeElement),
        ),
        true,
      );
      await page.keyboard.press("Escape");
      assert.equal(
        await page
          .getByRole("button", { name: "How to play" })
          .evaluate((e) => e === document.activeElement),
        true,
      );
      await page.getByRole("tab", { name: "Wheel run" }).focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(
        await page
          .getByRole("tab", { name: "Round predictor" })
          .getAttribute("aria-selected"),
        "true",
      );
      await page.keyboard.press("End");
      assert.equal(
        await page
          .getByRole("tab", { name: "Hash rhythm" })
          .getAttribute("aria-selected"),
        "true",
      );
      await context.close();
    },
  );
  await check(
    "Primary practice flow works with Tab, Enter and Space, with visible focus",
    async () => {
      const { page, context } = await makePage({ offline: true });
      const action = page.getByRole("button", {
        name: "Start practice run",
        exact: true,
      });
      let reached = false;
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press("Tab");
        if (
          await action.evaluate((element) => element === document.activeElement)
        ) {
          reached = true;
          break;
        }
      }
      assert.equal(reached, true);
      await page.keyboard.press("Enter");
      await page.clock.runFor(500);
      await page
        .getByRole("button", { name: "Bail out", exact: true })
        .waitFor();
      await page.keyboard.press("Space");
      await page.getByText("Escape successful", { exact: true }).waitFor();
      assert.equal(await page.locator(".score-row").count(), 1);
      assert.equal(
        await page
          .getByRole("button", { name: "Join practice run", exact: true })
          .evaluate((element) => element.matches(":focus-visible")),
        true,
      );
      await page.screenshot({ path: `${output}/keyboard-focus.png` });
      await context.close();
    },
  );
  await check(
    "Storage blocked: playable with honest session-only score warning",
    async () => {
      const { page, context } = await makePage({
        offline: true,
        storageBlocked: true,
      });
      await click(page, "button", "Start practice run");
      await page.clock.runFor(1000);
      await click(page, "button", "Bail out");
      await page
        .getByText(
          "Browser storage is unavailable. Scores last for this visit only.",
        )
        .waitFor();
      assert.equal(await page.locator(".score-row").count(), 1);
      await context.close();
    },
  );
  await check("Stream URL works at static subpath and can exit", async () => {
    const { page, context } = await makePage();
    await click(page, "button", "Stream view");
    assert.ok(page.url().endsWith("#stream"));
    assert.equal(await page.locator(".game-controls").isVisible(), false);
    await page.reload();
    await page.locator(".stream-note").waitFor();
    await click(page, "button", "Exit stream view");
    assert.equal(await page.locator(".game-controls").isVisible(), true);
    await context.close();
  });
  await check(
    "Responsive layouts, RTL, 200% text, local fonts and sharing assets at /preview/",
    async () => {
      const { page, context } = await makePage({ width: 1440 });
      for (const width of [320, 390, 680, 820, 1080, 1440]) {
        await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
        await noOverflow(page);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => {
        document.documentElement.dir = "rtl";
      });
      await noOverflow(page);
      await page.evaluate(() => {
        document.documentElement.dir = "ltr";
      });
      const enlarged = await page.addStyleTag({
        content: "html{font-size:200% !important}",
      });
      await noOverflow(page);
      await page.screenshot({ path: `${output}/text-200.png`, fullPage: true });
      await enlarged.evaluate((element) => element.remove());
      assert.equal(
        await page.evaluate(
          () =>
            document.fonts.check('400 16px "DM Sans"') &&
            document.fonts.check('400 16px "Space Mono"'),
        ),
        true,
      );
      for (const attr of ['link[rel="icon"]', 'meta[property="og:image"]']) {
        const relative = await page
          .locator(attr)
          .getAttribute(attr.startsWith("link") ? "href" : "content");
        const response = await page.request.get(
          new URL(relative, page.url()).href,
        );
        assert.equal(response.status(), 200);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({ path: `${output}/desktop-live-fixture.png` });
      await context.close();
    },
  );
  await check(
    "Automated accessibility audit on wheel, predictor, rhythm, and wallet dialog",
    async () => {
      const { page, context } = await makePage();
      await page.clock.resume();
      const all = [];
      for (const name of ["Wheel run", "Round predictor", "Hash rhythm"]) {
        await click(page, "tab", name);
        const result = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        all.push(...result.violations);
      }
      await click(page, "button", "Connect wallet");
      const modal = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      all.push(...modal.violations);
      await writeFile(`${output}/axe.json`, JSON.stringify(all, null, 2));
      assert.deepEqual(
        all.map((v) => `${v.id}: ${v.description}`),
        [],
      );
      await context.close();
    },
  );
  await check(
    "No script errors or missing local export resources during all scenarios",
    async () => {
      assert.deepEqual(errors, []);
      assert.deepEqual(resourceErrors, []);
    },
  );
} finally {
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      { results, scriptErrors: errors, localResourceErrors: resourceErrors },
      null,
      2,
    ),
  );
  await browser.close();
  await server.close();
}
console.log(
  `${results.filter((r) => r.passed).length}/${results.length} validation checks passed`,
);
if (failures.length) process.exitCode = 1;
