# perkshire

A framework-free, static PERK website for **Perkshire IMDway** on **Robinhood Chain, chain ID 4663**. The ready-to-serve export is in `dist/`. Source, package manifest and lockfile are included; the publisher can serve the export without rebuilding.

The site reads the float, pending fees, burns, tender totals, book value, weekly timing and costs from the existing hook. It reads the bound pool’s spot price directly from Uniswap v4 state. It includes the tender/approval flow, permissionless redemption and burn, the weekly report, the full Chairman’s letter and the requested disclosures.

## Install, build and preview

Use Node.js 22 or newer with npm:

```sh
npm ci
npm run typecheck
npm run build
npm run preview
```

Open `http://127.0.0.1:4173/preview/`. Preview supports a subpath deliberately, so relative assets are exercised. Stop the preview with Ctrl+C. `npm run build` regenerates the entire `dist/` tree from `index.html`, `src/` and `public/`. No framework, backend, API key, relay or project ID is needed.

For browser interaction validation:

```sh
npx playwright install chromium webkit
npm test
```

The tests manage their own bounded preview and browser sessions, intercept all wallet transactions, and never broadcast them. Generated evidence goes to `test/scratch/`, which is not submitted. `scripts/build.mjs`, `scripts/typecheck.mjs` and `scripts/test.mjs` also accept `--deps /absolute/path/to/a/dependency-installation` for tooling installed outside the repository. This run used that option with a task-specific temporary installation. Dependency versions are exact and locked.

## Static hosting

Serve the contents of `dist/` at any static HTTPS origin or gateway subpath. All runtime script, stylesheet, image and font URLs are relative. There is one page with hash navigation, no server rewrites, no build-time credentials and no backend. The original investor image is the logo, favicon and relative Open Graph image. The final publication origin is assigned after submission; this source does not guess one.

The requested site label is `perkshire`. Hosting/name publication is handled after this export is submitted. No publishing command was run. The old `perk` site’s redirect is a later creator action and is outside this export.

## Contracts and data

| Contract | Address |
| --- | --- |
| PERK | `0x2b2ED02698a82230F11D6285f3b147e3Fd6df83A` |
| PerkVaultHook | `0x708baBc63fd376D359EFF785d58Ae462B5Bea0cc` |
| IMD | `0x5f7bb59365ce557c26dbcaa4ee9d39a4b95b7127` |

`src/chain.ts` contains the chain configuration and minimal ABIs. The official public RPC is `https://rpc.mainnet.chain.robinhood.com`; ETH pays gas. All ledger reads are pinned to one returned block. PoolManager and boundPool are read from the hook. The pool’s slot0 is obtained through `extsload`, following Uniswap v4’s StateLibrary storage layout (mapping slot 6); its low 160 bits give sqrtPriceX96. Integer arithmetic derives IMD per PERK with the correct currency orientation. Token decimals are read from both contracts. Book value is the hook’s own `bookValuePerPerk()` result, with its specified 18-decimal scale. A zero book value gives “Undefined” price-to-book; other multiples round down to two decimals. Full-precision money values are expandable.

There are no seeded financial figures or offline balance fallbacks. Reads refresh every minute while the page is visible, and manually with Refresh figures. A failed refresh marks retained data stale and pauses writes. Quotes are separate `quoteTender(amount)` calls and are rechecked before signing. The contract has no minimum-payout parameter; a review warns that inclusion-time payout can change. Approval covers only the entered PERK amount.

The oracle feed is `https://api.imd.fun/oracle/requests`, searched with the exact question read from the hook’s `BODY()`. The client additionally matches chain 4663, the full question and `uint256`. It fetches an attested record’s detail and decodes its numeric answer in IMD base units. It does not execute oracle text, recipes or definitions. A missing, pending, unavailable or mismatched answer is not shown as zero. This is a display of the oracle service’s records, not an independent signature audit. Search is capped at the latest 500 matching results; the UI states that bound if no matching report is found.

Sources checked during implementation:

- [Launch 1660](https://explorer.imd.fun/token/0x2b2ed02698a82230f11d6285f3b147e3fd6df83a) and [its deployed source commit](https://github.com/identity-md-launches/launch-1660-perkshire-imdway/tree/4329d97b05699e0d796c86ba4310d4df83e4381e).
- [Robinhood’s official connection parameters](https://docs.robinhood.com/chain/connecting/).
- [Uniswap pool-state documentation](https://developers.uniswap.org/docs/protocols/v4/guides/read-pool-state) and [StateLibrary](https://github.com/Uniswap/v4-core/blob/main/src/libraries/StateLibrary.sol).
- [Wagmi Core configuration](https://wagmi.sh/core/api/createConfig), adapted without a UI framework, and the assignment’s pinned wallet connector configuration.

No contract was deployed, modified or migrated. The delegate wallet context changes the website’s publishing intent, not the public hook’s permissions.

## Wallet behavior

The header’s single connect control offers named EIP-6963 extensions and Coinbase Wallet. In an ordinary phone browser it offers Open in MetaMask, Coinbase Wallet, Rabby and Phantom, plus Coinbase Smart Wallet. A wallet app’s browser then supplies its provider. Coinbase’s SDK is explicitly included in the dependency lockfile and production bundle.

Connected accounts can switch/add Robinhood Chain, or disconnect. Transactions remain disabled on other chains. Every write has a local review describing its action, asset amounts, recipient or caller reward and ETH gas before the wallet opens. The wallet provides the final gas estimate. Simulation precedes signing; rejection, pending, revert and confirmation are separate states.

## Actual validation results

The revision run completed `npm run build -- --deps /tmp/perkshire-revision-deps` and `npm run typecheck -- --deps /tmp/perkshire-revision-deps` with exit 0. With temporary Playwright browsers selected, `npm test -- --deps /tmp/perkshire-revision-deps` passed **20 checks, with zero failed checks**. It covered integer math, quote/amount validation, named wallets, modal keyboard focus, rejection, switch/add network, exact approval, changed quote review, tender, redemption, burn, ask timing, revert status, Max/balance guards, zero balances, RPC/oracle failures and recovery, mobile wallet links, four-theme accessibility scans and 320/390/760/1440 reflow. Added regression coverage checks complete approval/burn addresses inside 320/390px dialogs, missing-wallet recovery copy before and after reload, and the Launch 1660 link target. No live transaction was signed or sent.

The pinned taste probe ran against the export with external requests blocked and passed **12 of 16 checks**. Manual Chromium review inspected the healthy fixture and revised dialogs: the 390×844 first screen includes both tender controls, and full approval/burn recipient addresses fit at 320px. Both dialogs changed from 318px client / 360px scroll width to 318px / 318px. The corrected explorer token URL returned HTTP 200 and identified PERK as Launch 1660; the old URL returned 404 on 2026-10-20. There were no measured overflow, clipping, overlap, required contrast, local resource or script errors. Existing brand flags and the offline probe’s recovery-copy false positive are explained in `artifacts/validation.md`.

**Limitations:** WebKit could not launch because required system libraries were missing, so Safari rendering/interaction was not verified. No physical phone wallet, passkey creation, actual extension approval, screen-reader session or browser-native 200% zoom was exercised. Public RPC rate limits, the oracle service and wallet providers remain external dependencies. This revision used simulated RPC/oracle responses for interaction checks and blocked external requests in the taste probe; it did not re-read live contract figures. The original implementation run reported an empty float and no weekly report requested.

See [DESIGN.md](DESIGN.md) for the final implementation’s design tokens and behavior, [artifacts/validation.md](artifacts/validation.md) for six-domain evidence and findings, [ASSETS.md](ASSETS.md) for provenance, and [PACKAGING.md](PACKAGING.md) for path budgets.
