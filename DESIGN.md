# Squeek Escape: Overdrive

## Overview

A compact arcade for players and streamers watching a real hamster-powered chain. One pixel-art habitat carries the visual idea: Squeektoshi is the power plant, while live readings and game controls sit around the wheel. The surrounding interface is quiet, dark, and flat, with citrus green reserved for primary actions, active game feedback, and charged energy.

Source of truth: `src/styles.css` for interface tokens and responsive rules; `src/components/Habitat.tsx` for the original canvas artwork. This is a dark-only English interface. RTL mirroring is a layout stress test, not a translated product variant.

## Colors

Hex tokens are defined in `:root` in `src/styles.css`.

| Token                  | Value     | Implemented role                                            |
| ---------------------- | --------- | ----------------------------------------------------------- |
| `--color-bg`           | `#101311` | Page and inset fields                                       |
| `--color-surface`      | `#171c18` | Main game, history, battery, leaderboard, dialogs           |
| `--color-raised`       | `#202720` | Neutral controls and selected game tab                      |
| `--color-hover`        | `#2a3329` | Neutral hover/pressed source states; empty battery segments |
| `--color-border`       | `#323c31` | Panel structure, separators, neutral control borders        |
| `--color-text`         | `#edf0e8` | Main text                                                   |
| `--color-muted`        | `#a3ae9e` | Secondary labels and explanations                           |
| `--color-accent`       | `#c3f85c` | Primary actions, multiplier, active indicators, charge      |
| `--color-accent-hover` | `#d4ff84` | Primary hover                                               |
| `--color-on-accent`    | `#18210e` | Text/icons on the accent fill                               |
| `--color-warning`      | `#edbc7f` | Incoming rhythm beats                                       |
| `--color-error`        | `#f4a99a` | Recoverable errors and lost multiplier                      |
| `--color-focus`        | `#edf0e8` | Two-pixel keyboard focus outline                            |

Connection banners use explicit, solid status palettes in `.connection-banner`, `.practice-banner`, and `.connected-banner`: unavailable uses `#23251d` / `#d4c69f`, practice `#23271b` / `#c8d6aa`, connected `#1c281f` / `#b7d6b7`. All include text and an icon; state never depends on hue alone.

Canvas colors are artwork-local: green-black room, olive wheel, orange/tan hamster, pink nose, and cream highlights. They are not additional interface themes. The design probe verified resolved solid text/background pairs. Five text boxes overlapping canvas or other media were outside that probe’s contrast measurement; see the validation limitations.

## Typography

Two locally loaded families, with no third-party font requests:

- **DM Sans**, variable WOFF2 in `src/assets/fonts/dm-sans-latin.woff2`; normal style, interface weights 400, 600, 700; `sans-serif` fallback. It supplies headings, prose, buttons, and labels.
- **Space Mono**, normal 400 WOFF2 in `src/assets/fonts/space-mono-latin.woff2`; `monospace` fallback. `.mono` supplies scores, multipliers, readings, hashes, and addresses. Monospace is not used for paragraphs.

| Token          | At a 16px root | Use                                               |
| -------------- | -------------- | ------------------------------------------------- |
| `--text-xs`    | 12px           | Dense telemetry labels, captions, secondary hints |
| `--text-sm`    | 14px           | Main interface copy and buttons                   |
| `--text-base`  | 16px           | Section titles and numeric inputs                 |
| `--text-lg`    | 20px           | Brand, side-game titles, desktop readings         |
| `--text-title` | 32px           | Page heading and compact mobile multiplier        |
| `--text-score` | 52px           | Desktop multiplier                                |

Body line-height is 1.5; main heading 1.15 and −0.04em tracking; section titles 1.4. The large multiplier uses 1.15 and −0.05em, relaxed to −0.04em on phones. Its value is a block to avoid the former baseline/caption collision. Headings balance, prose uses pretty wrapping, and changing values use tabular numerals. Inputs remain at 16px on phones. Full addresses and hashes wrap rather than being clipped; the header address is shortened with the full value available in the wallet dialog.

## Layout

The shared page/header/footer container has a 1248px maximum width, 48px side margins on wide screens, 24px below 1080px, and 16px below 680px. Repeated spacing uses 4, 8, 12, 16, 20, 24, 32, and 48px values. Component internals are grouped more tightly than separate panels.

The main `.game-shell` has a flexible habitat column and 350px controls. Controls become 320px at 1080px, 290px at 820px, and the layout stacks at 680px. At 1500px and above controls use 376px. The canvas is 480 × 270, displayed responsively with pixelated rendering.

On phones, `.run-control` uses a compact two-column grid: multiplier beside statistics, then the full-width action, then holder status. The live/practice switch moves into the habitat heading. The complete primary action fits on the first 390 × 844 screen. Side games collapse the decorative canvas while retaining the habitat controls and telemetry, bringing their inputs into view. This collapse applies only outside `.stream-mode`: stream view preserves the scene from every game tab, above telemetry. The stream transition was rechecked at 320, 390, 680 and 1440px.

The lower content is a two-column grid, collapsing at 820px. The quick guide changes from three columns to a vertical list at 680px. The footer wraps. At 370px and below, optional tab glyphs and the rank number yield space to readable labels and values. Between 430px and 680px, the game tabs use tighter inline padding.

Flexible header/tab rows and `minmax(0, …)` grids support enlarged text without shrinking it. Critical values use `overflow-wrap` where necessary. Logical inline spacing preserves reading order under RTL; the canvas scene and rhythm timeline retain their physical geometry.

The source was rendered at 320, 390, 680, 820, 1080, and 1440px. RTL and 200% CSS text enlargement were checked at 390px. Browser-native zoom remains unverified.

## Elevation & Depth

The interface is flat. Panels use one border and a small tonal step; they have no box shadows. Avoid cards nested within cards. A dialog is the only overlay: a native `<dialog>` top layer, solid surface, 12px radius, and dark `#070b07cc` backdrop with 6px blur. The backdrop is decorative; the dialog content does not depend on its blur.

## Shapes

`--radius: 12px` is used for panels. Controls, fields, tabs, and canvas framing use 6px; segmented-control inner selections 3px; status dots are circular. The phone wallet sheet has 16px top corners, fills the viewport width, and accounts for the bottom safe area. Pixel-art edges remain square; only the scene’s outer frame rounds.

## Components

| Component / pattern                    | Location                        | Behavior and reuse                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Habitat`                              | `src/components/Habitat.tsx`    | Canvas receives `rpm`, `running`, `paused`, `reducedMotion`. Rotation is `RPM / 60 × 2π` radians per second. Idle draws a curled sleeping hamster and drifting z’s. Pause, reduced motion, and hidden documents stop visible animation; telemetry labels remain available. Canvas has a textual accessible name. |
| `.button`, `.primary`, `.secondary`    | `src/styles.css`                | Filled accent for the current game action; neutral bordered secondary actions. Minimum 48px generally, 46px for the compact phone wheel action. Hover is pointer-gated. Press scales to 0.96. Named 120ms transitions; no motion under reduced motion.                                                           |
| Game tabs and source switch            | `src/App.tsx`                   | Three native buttons with tab roles, arrow/Home/End navigation, visible selected state. Source buttons use `aria-pressed` and disable source changes during a wheel run.                                                                                                                                         |
| `Predictor`                            | `src/components/SideGames.tsx`  | Labeled numeric field with step buttons; inline error and focus on invalid submit; locked waiting state; settled result; cancel action. Requires usable settlement history. “Recent median” describes the returned sample without claiming the entire archive. |
| `Rhythm`                               | `src/components/SideGames.tsx`  | Hash-derived timing, native pulse button, Space support, static feedback and optional sound. Enabling sound during play initializes/resumes the same audio context. A captured session remains tappable after a history failure; a new session needs fresh history. Reduced motion/pause removes traveling markers while the timing game continues. |
| `Modal`                                | `src/components/Modal.tsx`      | Native modal dialog provides inert background, focus containment, Escape dismissal and focus restoration. Close icon and outside-backdrop click also dismiss.                                                                                                                                                    |
| `WalletControl`                        | `src/components/Wallet.tsx`     | One header control; discovered extension names and marks; phone app links; Coinbase SDK connector. Wallet rows are at least 52px. Pending, rejected, wrong-chain, connected, and disconnect states have visible copy.                                                                                            |
| `Scoreboard` / `ScoreProof`            | `src/components/Scoreboard.tsx` | Empty/local leaderboard, source filter, score rows, proof status and explorer links. Review dialog displays the exact zero-value self-transaction before requesting the wallet. Practice proof generation is rejected.                                                                                           |
| `.connection-banner`, `.holder-status` | `src/App.tsx`                   | Clearly distinguish unavailable, live, and practice data. A stable status region announces connection changes. Holder failure offers a retry and never grants an assumed boost.                                                                                                                                  |
| Settlement chart / `.battery-meter`    | `src/App.tsx`                   | Bars use received work units, with a textual recent-settlements disclosure. Battery uses a named progressbar and a disclosed per-device contribution. Empty states contain recovery guidance.                                                                                                                    |

The general focus pattern is a 2px solid foreground outline with 4px offset; forced-colors mode uses `Highlight`. Native keyboard interactions supplement the custom tab pattern. Icon-only controls have accessible names. The Lucide outline set uses consistent strokes and `currentColor`; wallet marks keep their original brand colors.

## Do’s and Don’ts

- Start new surfaces inside `.page-content`; reuse the container edges, token scale, panel border, and section-heading pattern.
- Keep the game, instructions beside its control, and a single primary action together. Preserve the compact phone control grid.
- Use the existing source modes and unavailable states for data errors. Never silently substitute simulated readings or populate a fictional global leaderboard.
- Keep score/proof explanations beside their action, preserve full critical values, and distinguish a submitted claim from independent gameplay verification.
- Reuse native buttons, inputs, details and dialogs. Give any new icon-only action an explicit name, and check it at phone widths where text may be hidden.
- Keep raw pixel-art colors inside the artwork renderer; reuse role tokens for interface surfaces. Do not add glow, decorative dashboard cards, new fonts, arbitrary type steps, or entrance animations to an already dense game screen.

For another game, reuse the side-game structure, telemetry adapter, action and result patterns, and explicit live/practice score model. Check its primary action at 390px, error/loading states, keyboard path, reduced motion, and the existing subpath export before documenting the addition.
