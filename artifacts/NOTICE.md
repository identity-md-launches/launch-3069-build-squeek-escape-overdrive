# Third-party attribution

The implementation is original application code and procedurally drawn pixel art. The following works informed the design or supply bundled assets/dependencies:

- Better Interface design guidance by Jakub Krehel, MIT, pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`. [Upstream](https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-interface). Applied to the six-domain implementation and review.
- Impeccable documentation guidance by Paul Bakaus, Apache-2.0, pinned commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. [Upstream document](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md). The method was adapted into the implementation-specific root DESIGN.md; no claim of an Impeccable runtime integration is made.
- The full MIT and Apache-2.0 notices provided with that guidance are retained in `REFERENCE-LICENSES.txt` in this directory.
- DM Sans by the DM Sans Project Authors, and Space Mono by the Space Mono Project Authors, SIL Open Font License 1.1. WOFF2 files are in `src/assets/fonts/`. Full licenses are in `public/fonts/` and `dist/fonts/`. Fontsource packages identify the acquisition source.
- MetaMask, Coinbase, Rabby and Phantom marks from [RainbowKit’s wallet connector assets](https://github.com/rainbow-me/rainbowkit/tree/main/packages/rainbowkit/src/wallets/walletConnectors). Its MIT license is in `public/wallets/LICENSE.txt`, copied into `dist/wallets/`. The marks identify those wallet options and are not application branding.
- Lucide icons, React, Vite, TypeScript, wagmi, viem, TanStack Query, and the Coinbase Wallet SDK are ordinary package dependencies recorded in the manifest and lockfile. Their upstream licenses remain with the installed packages.

Rabby’s mobile link is based on its [production universal-link configuration](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/constant/universalLink.ts) and [open-dapp handler](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/hooks/universalLink.ts), checked on 2026-11-06. The link passes the current page URL using `/mobile/?_cmd=open-dapp&dapp=…`. Physical-app handoff was not tested.
