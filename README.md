# Squeek Escape: Overdrive

A static browser arcade and stream companion for Squeekchain. Ride Squeektoshi’s wheel, bail out before an observed RPM drop, predict the next settlement, or play a rhythm generated from a settlement hash. Playing does not require a wallet.

The ready-to-serve site is in **`dist/`**. Source, local fonts, artwork, wallet marks, package manifest, and lockfile are included. All runtime assets use relative paths; the export was tested under `/preview/` without server-side route rewrites.

## Install, develop, rebuild, preview

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
```

For the production export:

```sh
npm run typecheck
npm run build
npm run preview
```

`build` also runs the TypeScript check, empties the previous export, and writes the complete static site to `dist/`. `preview` prints the local preview address. Serve the entire `dist/` directory, including the wallet SDK’s lazy JavaScript chunk. No backend, private key, environment file, WalletConnect relay, or project ID is required.

## Play

- **Wheel run:** Join while the live wheel runs. The multiplier starts at 1×, adds 0.08× per second and 0.025× per RPM gained. Bail out to save `floor(100 × multiplier × holder boost)` points. Any observed RPM drop or idle state loses the run. A failed or stale status feed voids the run. Polling cannot detect movement between observations.
- **Round predictor:** Review the median of the recent settlements returned for the 24-hour window, then lock a whole-number work-unit prediction. The first newly observed settled block above the saved history baseline resolves it, even while the hamster sleeps. Exact predictions earn 1,000 points; relative error reduces the score to a minimum of zero. If polling misses intermediate blocks, this is the earliest newer block present in the next history response. The API's recent sample is not the entire settlement archive.
- **Hash rhythm:** The first 16 bytes of the latest historical settlement hash generate 16 beat intervals of 600–900 ms. Tap the pulse button or press Space. Within 90 ms earns 100 points and 3% battery charge; within 200 ms earns 50 points and 1%. Sound is opt-in and can be enabled during a session. A history refresh failure blocks new sessions but leaves the captured rhythm tappable until it finishes or is stopped. Reduced motion replaces traveling beat markers with a static timing cue.
- **Practice:** Explicitly simulated wheel telemetry and settlement history, available during outages. A practice wheel stops after 14–25 seconds; predictions settle after six seconds. Practice scores and battery charge stay separate and cannot be stamped on-chain.
- **Stream view:** Open `#stream` using the header control. Copy that URL into an OBS browser source. It displays the habitat, telemetry, network, and live/practice state; Exit stream view returns to the controls. A wheel run continues when changing game tabs or entering stream view, so return to the wheel to bail out.

Leaving a predictor or rhythm tab ends that side-game session. The leaderboard shows your top five scores from the last 50 saved entries on this device, with live/practice filters. Scores, proof references, and separate battery contributions are stored in browser local storage. There is **no global leaderboard or synchronized community battery total**. The interface labels those limits; it contains no seeded players.

## Live data and availability

The frontend directly requests `https://api.squeekchain.com`:

| Endpoint                          | Polling                    | Use                                                         |
| --------------------------------- | -------------------------- | ----------------------------------------------------------- |
| `/v1/status`                      | 4 seconds                  | RPM, running/idle state, distance, Squeekchain block height |
| `/v1/economy/state`               | 20 seconds                 | Available economy fields; absent aggregate statistics stay blank |
| `/v1/settlements?range=24h`       | 15 seconds                 | Predictor, history chart, rhythm seed                       |
| `/v1/accounts/{connectedAddress}` | 60 seconds while connected | Squeek NFT holder status                                    |

Requests time out after eight seconds. Live runs require successful status data newer than 12 seconds **and** fresh source measurements: `measurement.freshness` must be online when supplied, and `observedAt + staleAfterSeconds` must not have expired. Starting side games requires successful history newer than 45 seconds. Normalizers in `src/lib/telemetry.ts` support the published `measurement`/`builder`, `recentSettlements`, supply/asset decimals, and wallet/staking NFT custody fields, alongside the previously supported response formats. Unknown schemas and explicitly unavailable sources produce recoverable unavailable states. Holder errors use the standard multiplier and offer Retry. Holder boosts are locked at game start.

**Revision verification on 2026-11-06:** direct public requests to all four endpoint types returned HTTP 200 JSON. The original adapters rejected all four bodies; the revised adapters accept them. Replaying the unchanged bodies at their original URLs in Chromium enables idle telemetry and both side games. Supplied account NFT counts qualify for the 15% boost. Small field projections of these responses are retained in `scripts/fixtures/squeekchain.json` for regression tests; snapshots are never runtime fallback data. The economy response has live supply but no total-work or total-settlement statistics, so those two readings remain unavailable. The recent settlement sample is not mislabeled as the complete 24-hour history.

**Remaining transport limitation:** unmocked Chromium requests to the public API failed with `net::ERR_EMPTY_RESPONSE` during this revision, while direct requests succeeded. Browser CORS and continued service availability are therefore unverified. The site exposes its unavailable state, Retry, and labeled practice mode when transport fails.

## Wallets and score proofs

Wallet configuration is in `src/lib/wallet.ts`:

- Ethereum Sepolia, chain ID **11155111** (`0xaa36a7`). No mainnet transactions.
- EIP-6963 discovery lists installed extensions by their names and marks; the generic fallback is called Browser wallet.
- On phones without an injected wallet, the sheet offers MetaMask, Coinbase Wallet, Rabby, and Phantom app links, plus Coinbase Smart Wallet through the installed Coinbase SDK.
- A wrong network offers Switch to Sepolia, including the add-chain fallback. The header shows the connected address and a Disconnect action.
- Explicit API holder status, a wallet/staking NFT count above zero, or a token with wallet/staking custody applies a **15%** score boost. An ordinary fungible balance does not establish NFT ownership. A partial empty token page cannot establish non-ownership.

A saved live score enables **Commit high score on-chain** after connection and network selection. Review the score, Squeekchain block, recipient, and data in the confirmation dialog. The wallet sends **0 ETH to its own address** on Sepolia with UTF-8 hex calldata:

```text
SQUEEK_SCORE:<score>:<block_height>
```

Sepolia test ETH is needed for the network fee. The app records the returned transaction hash, waits for a receipt, distinguishes confirmed/pending/reverted states, and links to Sepolia Etherscan. After a confirmation timeout or reload, a saved pending proof can be checked using that link. Practice entries are rejected by the payload builder as well as disabled in the UI. The read-only public RPC is `https://ethereum-sepolia-rpc.publicnode.com`.

A stamp proves the account submitted the score data. It does not independently verify client-side gameplay, holder status, or a global ranking. No contract or recipient supplied by an owner is needed because the recipient is always the connected wallet itself.

## Validation

```sh
npx playwright install chromium
npm run validate
node --experimental-strip-types --test scripts/telemetry.test.mjs
```

Linux may also need Playwright’s documented browser system dependencies. An existing Chromium executable can be selected with `npm run validate -- --chromium=/path/to/chromium`, or an installed Playwright module with `IMD_PLAYWRIGHT=/path/to/playwright/index.mjs`. The validation script owns a temporary preview server and browser, tests the real production export at a static subpath, uses isolated API/wallet/RPC fixtures, and closes both on completion. Output goes to disposable `test/scratch/validation/`.

Actual worker results:

- Production build and independent typecheck passed.
- 24 browser checks passed, retaining the original 19 flows and adding published API-schema replay, source freshness, mid-session sound, stream view from both side games, and active rhythm recovery after a history failure. Checks include the 15% holder boost, complete keyboard play, predictor resolution, all 16 rhythm beats, score persistence, wallet discovery, switching, transaction rejection/retry, exact proof calldata and mocked receipts.
- Axe found zero violations in the tested wheel, predictor, rhythm, and wallet-dialog states. This is not a full accessibility certification.
- The pinned taste@1 probe passed all 16 checks at 320, 390, and 1440 pixels. At 390 × 844, the primary action occupies approximately y=754–800, fully on the first screen.
- Additional layouts were checked at 680, 820, and 1080 pixels; RTL mirroring and 200% CSS text enlargement reflowed at 390 without horizontal overflow. CSS text enlargement is distinct from browser-native zoom.
- 13 parser regression tests passed for published/legacy shapes, unit conversion, source expiry, missing fields, settlement timestamps, NFT custody and pagination, unavailable responses, and absence of invented totals.

The managed browser connection returned `Transport closed`; direct Playwright Chromium inspection succeeded. WebKit could not launch because its requested executable was unavailable; nothing was installed for it. Safari/WebKit behavior, physical phone handoff, screen readers, native zoom, actual passkey creation, and a real signed Sepolia transaction remain unverified. Mock transaction success does not establish real network acceptance.

See [artifacts/validation.md](artifacts/validation.md) for the six-domain review, findings, fixes, coverage, and retained evidence. [DESIGN.md](DESIGN.md) documents the final implementation.

## Assets and maintenance

The habitat and hamster are original, procedurally drawn pixel art in `src/components/Habitat.tsx`. DM Sans and Space Mono WOFF2 fonts are bundled locally under their OFL licenses. Wallet marks are bundled from RainbowKit with its license. Attribution for the pinned design and documentation guidance is in `artifacts/NOTICE.md` and `artifacts/REFERENCE-LICENSES.txt`.

The existing 1200 × 630 share image is in `public/social-card.png` and the export. To regenerate it with Playwright after an artwork change:

```sh
npm run build
npm run social-card
npm run build
```

The production export contains only runtime assets and relevant licenses: no source maps, dependency directories, caches, registry mirrors, or dependency archives. `.gitignore` explicitly budgets generated directories and disposable test scaffolding at zero submission bytes; `dist/` is deliberately included. Named records in `artifacts/` have an explicit 1 MiB path budget; the final audit also enforces the overall 8 MiB limit.
