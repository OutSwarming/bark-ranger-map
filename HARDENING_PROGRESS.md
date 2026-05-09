# BARK Ranger Map Hardening Progress

Date: 2026-05-09

Scope: Stage 0 hardening only. Lemon Squeezy remains intentionally locked in test mode until Carter explicitly approves the final RC switch.

## Merge Review

- Branch reviewed: `codex/stage-0-hardening-kill-switches`.
- Stage 0 commit merged into `main`: `1ba1afc stage 0 hardening kill switches`.
- Merge method: fast-forward from `origin/main`; no merge conflicts.
- Review result: no merge blockers found. The branch keeps Lemon Squeezy test mode locked, leaves normal leaderboard pagination unchanged, and adds app/server kill switches for the intended Stage 0 surfaces.
- Local unrelated edits were stashed before the merge so they were not included in the Stage 0 merge.

## Files Changed

- `modules/launchFlags.js`
  - Added app-side launch safety switches.
- `index.html`
  - Loads launch flags before `barkState.js`.
- `modules/barkState.js`
  - Added launch flag defaults, messages, session override helpers, and flag lookup helpers.
- `modules/paywallController.js`
  - Blocks checkout UI when `checkoutEnabled` is false.
- `services/orsService.js`
  - Blocks client route/geocode callable attempts when route/geocode/premium-risk flags are false.
- `engines/tripPlannerCore.js`
  - Shows a friendly paused state for route generation when route flags are false.
- `modules/searchEngine.js`
  - Shows friendly global-search paused copy and blocks premium geocode when flagged off.
- `modules/profileEngine.js`
  - Leaves the main leaderboard unchanged, but hides See More behind `leaderboardDeepBrowsingEnabled`.
- `services/authPremiumUi.js`
  - Locks premium map tools when `premiumRiskyToolsEnabled` is false.
- `modules/uiController.js`
  - Disables in-app feedback by default because Firestore rules likely deny `feedback` writes.
- `functions/index.js`
  - Adds server-side kill switches for `getPremiumRoute`, `getPremiumGeocode`, and `createCheckoutSession`.
- `functions/tests/ors-entitlement.test.js`
  - Adds disabled route/geocode assertions.
- `functions/tests/checkout-session.test.js`
  - Adds disabled checkout assertion.
- `BUDGET_ALERTS_CHECKLIST.md`
  - Adds the pre-expansion budget alert checklist.

## Tests Run

- `PATH="${BARK_NODE20_BIN:-$HOME/.nvm/versions/node/v20.20.2/bin}:$PATH" npm --prefix functions test`
  - Result: PASS, 71/71 against the staged Stage 0 scope.
  - Covered: server kill switches for `createCheckoutSession`, `getPremiumRoute`, and `getPremiumGeocode`; existing Lemon Squeezy test-mode checkout payload tests; webhook tests; ORS entitlement tests.
- `BARK_E2E_BASE_URL=http://localhost:4173/index.html npx playwright test tests/playwright/bark-app-identity-smoke.spec.js tests/playwright/account-auth-smoke.spec.js tests/playwright/bug016-route-generation-gating-smoke.spec.js tests/playwright/bug021-route-upgrade-prompt-smoke.spec.js --workers=1 --reporter=list`
  - Result: PASS for runnable tests, 4 passed / 4 skipped.
  - Passed: app identity smoke; signed-out account UI; account chooser smoke; profile card order smoke.
  - Skipped: signed-in route gating tests requiring `BARK_E2E_STORAGE_STATE` and `BARK_E2E_PREMIUM_STORAGE_STATE`.
- Browser flag smoke with Playwright against `http://localhost:4173/index.html`
  - Result: PASS.
  - Covered: default feedback paused state, checkout disabled UI via session flag, route generation disabled UI via session flag, no page errors.

## Remaining Stage 0 Risks

- App-side flags are static/browser-side guardrails. Server-side flags protect the expensive callables.
- Budget alerts still need to be configured in Google Cloud before expanding beta beyond the current 10 testers.
- Feedback is paused instead of fixed with a new Firestore rule/callable; this avoids denied writes during Stage 0 without expanding scope.
- Lemon Squeezy live mode was not changed.

## P1 Follow-Up Progress

- Fixed `tests/playwright/bug017-product-rules-audit-smoke.spec.js` by aligning the free-account forced-control assertion with the app's valid `Virtual trail tracking` paywall source.
- This was a test expectation drift, not a product-gating bug: the test clicked trail controls last, and the app correctly showed the trail-specific premium paywall.
- Targeted QC: `BARK_E2E_BASE_URL=http://localhost:4173/index.html npx playwright test tests/playwright/bug017-product-rules-audit-smoke.spec.js --workers=1 --reporter=list` passed 2/2 with a local static server.

## Signed-In E2E Storage State QC

- Validated ignored local storage states:
  - Free user: `playwright/.auth/free-user.json`
  - Premium/test entitlement user: `playwright/.auth/premium-user.json`
  - Second account for account switching: `playwright/.auth/free-user-b.json`
- Full signed-in smoke command:
  - `BARK_E2E_BASE_URL=http://localhost:4173/index.html BARK_E2E_STORAGE_STATE="$PWD/playwright/.auth/free-user.json" BARK_E2E_STORAGE_STATE_B="$PWD/playwright/.auth/free-user-b.json" BARK_E2E_PREMIUM_STORAGE_STATE="$PWD/playwright/.auth/premium-user.json" npm run test:e2e:smoke`
- First full run result: 39 passed, 1 failed. The failing premium route-generation smoke hit the app's long-route warning and timed out before reaching the stubbed ORS path.
- Test harness fix: `tests/playwright/bug016-route-generation-gating-smoke.spec.js` now stubs `window.BARK.confirmLongRouteWarning` to return `continue`, keeping product behavior unchanged while making the route gating smoke deterministic.
- Focused route-gating rerun: `bug016-route-generation-gating-smoke.spec.js` passed 2/2.
- Final full signed-in smoke rerun: `npm run test:e2e:smoke` passed 40/40 with `BARK_E2E_BASE_URL`, `BARK_E2E_STORAGE_STATE`, `BARK_E2E_STORAGE_STATE_B`, and `BARK_E2E_PREMIUM_STORAGE_STATE` set to the local ignored `.auth` files.

## Server Rate Limit Progress

- Added server-side per-user rate limits for premium ORS callables in `functions/index.js`.
- Defaults:
  - `getPremiumRoute`: 30 requests per hour.
  - `getPremiumGeocode`: 120 requests per hour.
- Optional env overrides:
  - `BARK_RATE_LIMIT_PREMIUM_ROUTE_MAX`
  - `BARK_RATE_LIMIT_PREMIUM_ROUTE_WINDOW_MS`
  - `BARK_RATE_LIMIT_PREMIUM_GEOCODE_MAX`
  - `BARK_RATE_LIMIT_PREMIUM_GEOCODE_WINDOW_MS`
- Rate limit order: kill switch, auth, rate limit, entitlement, payload validation, ORS. Over-limit calls stop before entitlement reads and ORS network calls.
- QC: `npm --prefix functions test` passed 75/75.

## Free Visit Limit Progress

- Lowered the free tracked-visit cap from 20 to 5 in `services/checkinService.js`.
- Updated user-facing fallback copy in `renderers/panelRenderer.js` and the BUG-015 Playwright smoke limit/test names.
- Added Firestore rules enforcement so non-premium direct writes to `users/{uid}.visitedPlaces` are denied above 5.
- Premium users with active/manual-active entitlement on the same user document can still write more than 5 visits.
- Rules preserve cleanup behavior: legacy over-limit free users can update unrelated settings and can trim visits back to 5 or fewer.
- QC: `npm run test:rules` passed 21/21.
- QC: `BARK_E2E_BASE_URL=http://localhost:4173/index.html npx playwright test tests/playwright/bug015-free-visited-limit-smoke.spec.js --workers=1 --reporter=list` passed 5/5.

## Payment Webhook Hardening Progress

- Lemon Squeezy remains hard-locked in test mode. The checkout payload still sends `attributes.test_mode: true`, and live-mode webhooks are still ignored until Carter explicitly approves the final RC switch.
- Added durable webhook receipt storage at `_lemonSqueezyWebhookEvents/{sha256(providerEventId)}`.
- Webhook processing now runs in a Firestore transaction:
  - reads the processed-event receipt first,
  - ignores exact duplicate deliveries without rereading or rewriting the user doc,
  - reads the user entitlement,
  - writes either the entitlement update plus processed receipt, or an ignored receipt for manual overrides/stale events.
- Added ordering protection with provider event timestamps and status ranks:
  - older events cannot downgrade or reactivate a newer entitlement,
  - same-time lower-priority events cannot override higher-priority states such as `refunded`,
  - newer refunds still remove Premium,
  - newer recovered-payment events can restore `active`.
- Improved Lemon Squeezy entitlement states:
  - `past_due` and `unpaid` keep Premium active during billing retry/grace.
  - cancelled subscriptions with a future `ends_at` become `cancelled_active` and keep Premium until the paid period ends.
  - refund events become `refunded` and remove Premium immediately.
  - `expired` and ended `canceled` remain non-premium.
- Updated app entitlement/UI handling so `past_due` and `cancelled_active` are premium-active states with clear account/paywall copy.
- Fixed a callable-emulator crash found during QC by using `Timestamp`/`FieldValue` from `firebase-admin/firestore` for rate-limit documents.

### Payment QC Run

- `$HOME/.nvm/versions/node/v20.20.2/bin/node --test functions/tests/lemonsqueezy-webhook.test.js`
  - Result: PASS, 47/47.
  - Covered: signature/raw-body verification, test-mode lock, durable duplicate receipts, derived event IDs, stale/out-of-order events, same-time rank ordering, past-due grace, cancelled-but-active, refunds, manual overrides, and recovered payments.
- `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm --prefix functions test`
  - Result: PASS, 81/81.
  - Covered: checkout remains test-mode-only, webhook hardening, ORS entitlement/rate-limit policy, and kill switches.
- `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:functions:emulator`
  - Result: PASS, 9/9.
  - Covered: emulator-backed route/geocode entitlement enforcement after the `past_due` policy change and rate-limit timestamp fix.
  - Note: firebase-tools emitted the existing Java 21 future-requirement warning; current run passed on Java 18.
- `$HOME/.nvm/versions/node/v20.20.2/bin/node --test tests/auth-account-ui.test.js`
  - Result: PASS, 4/4.
  - Covered: billing portal/account UI basics still render after entitlement state copy changes.

### Remaining Payment Risks

- Live Lemon Squeezy mode is intentionally still blocked and remains the absolute final RC switch.
- The processed-event collection is server-only by default because there is no client rule match for `_lemonSqueezyWebhookEvents`; no client path was added.
- Chargeback/dispute-specific provider event handling still needs a confirmed Lemon Squeezy event design before paid/public launch.
- A real Lemon Squeezy test-mode delivery re-skim is still useful after deploy to confirm provider timestamp paths match the fixtures.
