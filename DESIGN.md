# Perkshire design system

## Overview

Perkshire is a small, framework-free PERK ledger and tender interface. Its audience is token holders inspecting the float or preparing a wallet transaction. The implemented identity is VIMD Family v3: IBM Plex Mono, slate paper, champagne accents, square corners and visible rules. The brand’s monospace prose, 11px uppercase labels and 0.06em label tracking deliberately take precedence over the review probe’s generic preferences.

The page has one economic data table, a tender form, the weekly report and the Chairman’s letter. All balances and valuation figures are runtime chain reads. A zero book value is an explicit state, not a missing value or a finite valuation multiple. Errors remain distinguishable from genuine zeros.

## Colors

Canonical values live in `src/brand-tokens.css`, copied from the supplied immutable VIMD v3 package. `scripts/build.mjs` prepends those tokens to `src/styles.css` for the export. The default is slate; `html[data-theme]` selects stone, white or black.

| Token | Slate | Stone | White | Black | Implemented role |
| --- | --- | --- | --- | --- | --- |
| `--paper` | `#1C2128` | `#ECE8E1` | `#FFFFFF` | `#000000` | Page, inputs, buttons, dialogs |
| `--ink` | `#E8E4DC` | `#222831` | `#000000` | `#FFFFFF` | Primary text and structural rules |
| `--dim` | `#A3A9B1` | `#5A6068` | `#555555` | `#9A9A9A` | Secondary text, units and footer |
| `--mute` | `#4A525C` | `#B9B4AB` | `#BBBBBB` | `#4A4A4A` | Disabled borders |
| `--soft` | `#2A313A` | `#DCD7CE` | `#E6E6E6` | `#262626` | Table and quote dividers, pressed fill |
| `--hover` | `#242A32` | `#E4DFD7` | `#F4F4F4` | `#141414` | Hover fill |
| `--accent` | `#D8C398` | `#7A5F30` | `#8A6D3B` | `#D8C398` | Links, main action, valuation, focus |
| `--alarm` | `#FF6B62` | `#B3261E` | `#B3261E` | `#FF6B62` | Error text and invalid input |

The upstream `--faint`, `--ok` and `--seg-light` tokens are preserved but unused. Secondary text uses `--dim`, including small footer copy. Success is stated in text rather than indicated only by a color. Wallet marks retain their vendors’ original colors. Measured contrast coverage and exceptions are in `artifacts/validation.md`; no unmeasured numeric ratios are asserted here.

## Typography

`--font` is `'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace`. The local Latin WOFF2 files in `public/assets/` provide real normal weights 400, 500 and 600; `OFL.txt` accompanies them. The normal body face is preloaded. Font loading was confirmed in Chromium.

| Token | Size | Use |
| --- | --- | --- |
| `--text-label` | 11px | Secondary labels, help, units, footer |
| `--text-body` | 13px | Body, controls, table, letter |
| `--text-input` | 16px | Amount input, including mobile to avoid iOS input zoom |
| `--text-heading` | 18px | Section headings and quote value |
| `--text-display` | 28px | Page heading and price-to-book |

Body line height is 1.5; headings use 1.3; `.small` uses 1.6. Headings and values use weight 500, brand and subheads 600, normal copy 400. Only `.label` uses uppercase and 0.06em tracking. Long prose is limited to 75ch. Dynamic numeric values use tabular numerals. Addresses and long values can wrap anywhere. The ledger rounds its compact display; the native full-precision disclosure contains unrounded monetary values, and transaction reviews show exact entered amounts and quotes.

## Layout

`.page` is at most 1168px including two gutters, yielding 1100px of content at its maximum. The gutter is `clamp(16px, 4vw, 34px)`. Common spacings are 8, 12, 16, 24, 32 and 48px. The 28px header logo is the supplied original mark. The desktop portrait is 104px.

Above 760px, `.dashboard` has a `1.55fr / 1fr` grid with a 32px gap. The table occupies the left column and the tender panel the right. A native `colgroup` gives labels 43% of its width and values 57%, including after responsive resizes. The report has two columns with a 48px gap. The letter uses a centered, constrained reading measure.

At 760px and below, the tender panel appears before the books in both DOM focus order and visual order. The valuation is shown in a compact strip above it, and its duplicate desktop table row is hidden. The portrait and desktop navigation disappear; navigation after the form links to the books, report and letter. The report stacks and its divider becomes horizontal. Under 359px, header spacing and logo shrink and report statistics stack. All money and addresses wrap without horizontal scrolling.

At 390×844 the product, price-to-book, connect control, amount field, quote and both tender controls are on the first screen. Layout checks covered 320, 390, 760 and 1440 CSS pixels. Native browser zoom and physical devices remain unverified.

## Elevation & Depth

This is a flat system. There are no shadows or gradients. Main rules and outlined surfaces use 1.5px ink borders; table rows use 1px soft borders. The tender panel is the single boxed content surface. The report and letter use horizontal rules. Native modal dialogs enter the browser’s top layer, with a paper-colored backdrop at 0.85 opacity. A fixed transaction-status panel uses an accent border and explicit text, and remains dismissible.

## Shapes

`--radius: 0` throughout. Buttons, fields, panels and dialogs remain square. The original investor image is not recolored or cropped. Do not introduce pills, rounded cards or decorative gradients into the ledger.

## Components

- **Header / theme / wallet:** `index.html`, `src/app.ts` and `src/wallet.ts`. One connect control opens the picker independently of chain reads. Connected, it opens account details and disconnect; a wrong chain offers a free switch/add. Theme selection persists locally when storage is available; transitions are suppressed during the change so the palette switches immediately.
- **Ledger:** `table` in `index.html`, `.books` and table styles. Row headers use native `th[scope=row]`; the caption explains units. Pending claims include their burn share and are separate from spendable float. Native `<details>` exposes full precision.
- **Tender:** `#tender-form`. Labelled decimal input, Max, debounced live contract quote, exact-amount approval and permanent tender. Invalid input has an associated message and `aria-invalid`. A zero payout, wrong chain, insufficient balance, stale read or missing allowance prevents the relevant write.
- **Buttons:** outlined 40px minimum, accent outline for the primary action; hover fill, pressed soft fill and visible 2px accent focus ring with 4px offset. Disabled controls use secondary text and muted borders. Wallet rows are at least 48px. The native disclosure summary and standalone oracle record link have comfortable 40px targets.
- **Wallet picker:** native `<dialog>`, with EIP-6963 wallet names and icons, mobile deep links and Coinbase SDK. The generic browser row is suppressed when a named provider exists. A missing browser wallet explains how to install or enable an extension, or choose the existing Coinbase Wallet option. It supports Escape, backdrop dismissal, a close button, focus wrapping and focus return. Below 760px it is a bottom sheet.
- **Transaction review:** native dialog with action, amount, recipient, cost and irreversible consequences before the wallet opens. `#transaction-description` in `src/styles.css` uses `overflow-wrap:anywhere` so full recipient addresses and long amounts wrap without truncation or smaller type. Approval and burn reviews were checked at 320px and 390px in Chromium. Tender quotes are re-read before signing; a changed quote requires another review. Wallet rejection remains inline. Pending, confirmation, revert and uncertain-confirmation messages are distinct; a transaction hash links to the chain explorer.
- **Weekly report:** `src/oracle.ts` and `#report`. Exact question, chain and answer-type matching; only an attested numeric answer is displayed. Latest pending requests and earlier attested answers are distinguished. Empty, unavailable and mismatched records are explicit states.

Motion is limited to named 150ms button background/color transitions and a 0.96 pressed scale under `prefers-reduced-motion: no-preference`. There is no autoplay or entrance animation. Reduced motion leaves instant, static state feedback.

## Do’s and Don’ts

Use the existing `--paper`, `--ink`, `--dim`, `--soft` and `--accent` roles rather than adding approximate colors. Keep the single type scale and square geometry. Use native elements and descriptive action labels. Maintain a visible cost review before any wallet write. Never seed unavailable chain figures with demo values.

For another section, reuse `.section-head`, the 24/32/48px section rhythm, a native heading and the existing one-column mobile behavior. Keep contract configuration in `src/chain.ts` and write actions behind the transaction-review path. Preserve the supplied addresses and economics; a visual change must not change contract behavior. Extend the documented checks when adding a new wallet action.
