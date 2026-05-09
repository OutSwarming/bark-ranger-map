# BARK Ranger Map Hardening Progress

Date: 2026-05-09

Scope: Stage 0 hardening only. Lemon Squeezy remains intentionally locked in test mode until Carter explicitly approves the final RC switch.

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
