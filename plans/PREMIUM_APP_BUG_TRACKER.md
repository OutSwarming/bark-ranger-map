# Premium App Bug Tracker

Date: 2026-05-03
Branch: main
Current commit: 576830f0d1573af422fdee94d45671c93970171e
Scope: New premium/internal app only.

## Status Legend
- FOUND
- REPRODUCED
- FIXED
- QC PASSED
- QC FAILED
- DEFERRED

## Severity Legend
- P0: security/payment/data-loss/showstopper
- P1: blocks premium beta or causes major broken flow
- P2: visible bug/confusing UX but workaround exists
- P3: polish/minor

## Known Bugs / Suspicions To Seed

Seeded as BUG-001 through BUG-010 in the table below. BUG-011 was added from static/runtime audit evidence.

## Bug Table

| ID | Title | Area | Severity | Probability | Concern | Evidence | Repro Steps | Suspected Cause | Files Likely Involved | Fix Commit | QC Result | Status |
|---|---|---|---|---:|---:|---|---|---|---|---|---|---|
| BUG-001 | Gamification achievement Firestore permission/runtime issue | Firestore/rules/data sync | P1 | 4 | 4 | Seeded suspicion. Path: `users/{uid}/achievements/{achievementId}`. `npm run test:rules` passed 16/16, including owner-only achievement writes and protected user field denials. Runtime console after deploy/emulator app flow still pending. | Run rules tests and app achievement flow; confirm no permission console error for owner write. | Rules may not match actual achievement write path or client payload shape. | `firestore.rules`, `services`, `modules`, `tests` |  | Rules PASS; runtime QC pending | FOUND |
| BUG-002 | Paywall verifying state can mislead or get stuck after checkout success URL | Payment/paywall | P1 | 3 | 4 | Seeded suspicion. Signed-out fake success URL kept `premiumService.isPremium()` false, controls locked, and paywall in verifying state with no console errors. Signed-in delayed-webhook state still pending. | Visit `?checkout=success&provider=lemonsqueezy` as non-premium and observe paywall state. | URL return state may drive UI messaging without entitlement refresh completion/failure handling. | `services`, `renderers`, `modules`, `index.html` |  | Partial PASS; signed-in delay pending | FOUND |
| BUG-003 | Account switch may leave stale premium UI state | Premium entitlement/runtime | P0 | 3 | 5 | Seeded suspicion. Static audit shows `authService` resets entitlement on user change/sign-out, but full premium-to-free/free-to-premium runtime switch needs two storage states. | Sign in premium account, switch to free account, sign out, refresh; observe premium controls. | Cached entitlement/UI state may not be cleared before next user entitlement load. | `services`, `modules`, `renderers`, `state` |  | Pending; storage states required | FOUND |
| BUG-004 | Signed-in free user might still access trails/global search/ORS-adjacent controls if auth-only gating remains | Premium entitlement/runtime | P0 | 3 | 5 | Seeded suspicion. Static audit found trail/global-search execution uses `premiumService.isPremium()` and backend ORS tests pass. Signed-in free UI smoke still needs storage state. | Sign in with free account and try virtual trails, completed trails, global search, routing/geocode. | Legacy auth-only checks or UI unlock predicates may remain. | `services`, `modules`, `engines`, `renderers`, `functions` |  | Backend PASS; signed-in UI pending | FOUND |
| BUG-005 | Mobile paywall/account layout may be cramped or confusing | Layout/UI logic | P2 | 3 | 3 | Seeded suspicion. Signed-out mobile paywall at 390x844 stayed within viewport and was dismissible/readable. Account card, marker panel, and signed-in mobile states still pending. | Use narrow viewport; open paywall, account card, marker panel, search/filter controls. | Modal/account CSS may not handle small viewport and map overlay constraints. | `renderers`, `modules`, `index.html`, stylesheets |  | Partial PASS; signed-in/mobile panels pending | FOUND |
| BUG-006 | Runtime console errors from script load order or missing modules | Runtime console errors | P1 | 3 | 4 | Seeded suspicion. Signed-out boot, paywall open, fake success URL, canceled URL, and mobile paywall had no red console errors. Signed-in profile/trip/achievements/logout flows pending. | Boot app and exercise auth, map, marker, profile, trip planner, achievements, logout. | Script order/global dependencies may race or modules may be undefined. | `index.html`, `core`, `modules`, `services`, `renderers` |  | Partial PASS; signed-in flows pending | FOUND |
| BUG-007 | Fake checkout success URL must not unlock premium | Premium entitlement/runtime | P0 | 2 | 5 | Manual audit: `?checkout=success&provider=lemonsqueezy` did not unlock premium; `premiumService.isPremium()` stayed false, controls stayed locked, and no storage/URL premium grant path was found by grep. | Visit fake success URL while signed out/free; inspect premiumService/UI controls. | Legacy URL/local storage premium grant logic may remain. | `services`, `modules`, `renderers`, `state`, `index.html` |  | PASS | QC PASSED |
| BUG-008 | ORS premium route/geocode callable must reject non-premium before ORS transport | ORS/premium backend | P0 | 2 | 5 | Static audit found `requirePremiumCallable()` before ORS transport; `npm --prefix functions test` passed 65/65 and callable emulator passed 9/9, including inactive statuses rejected. | Run functions tests/callable emulator; attempt non-premium callable request. | Callable may trust client flags or check entitlement after transport setup. | `functions`, `tests` |  | PASS | QC PASSED |
| BUG-009 | Firestore rules must still block client writes to entitlement/provider/admin/payment fields | Firestore/rules/data sync | P0 | 2 | 5 | `npm run test:rules` passed 16/16, including denial for client writes to entitlement/provider/admin/payment-style user fields. | Run rules tests for entitlement/provider/admin/payment write denial. | Recent owner-only rules change may be too broad. | `firestore.rules`, `tests` |  | PASS | QC PASSED |
| BUG-010 | Old localStorage premium bypass must not exist | Premium entitlement/runtime | P0 | 2 | 5 | Grep found no app-side `premiumLoggedIn`, `checkout=success`, `provider=lemonsqueezy`, or storage-backed `setEntitlement()` premium grant path. Focused smoke kept `premiumLoggedIn=true` while `premiumService.isPremium()` stayed false. | Grep for storage, URL checkout, premium predicates, entitlement setters. | Legacy test/dev bypass code may still be reachable. | `services`, `modules`, `renderers`, `state`, `core`, `index.html` |  | PASS | QC PASSED |
| BUG-011 | Non-premium users can inherit premium map settings from localStorage/cloud settings | Premium entitlement/runtime | P1 | 5 | 4 | Reproduced: with `barkMapStyle=terrain`, `barkVisitedFilter=visited`, and `barkPremiumClustering=true`, signed-out/non-premium boot kept OpenTopoMap tiles, visited-only filter, and premium clustering active while controls were locked. Fixed by sanitizing non-premium runtime defaults and blocking premium cloud settings for non-premium users. | Seed localStorage premium map/filter/clustering values, boot signed-out/free, and inspect active layer/filter/clustering while premium controls are locked. | Premium-off gating updated controls but did not sanitize premium-owned runtime settings; cloud hydration could reapply premium settings for free users. | `services/authPremiumUi.js`, `services/authService.js`, `tests/playwright/phase3a-premium-gating-smoke.spec.js` | This fix commit | PASS | QC PASSED |

Probability scale:
1 = unlikely
3 = plausible
5 = very likely/reproduced

Concern scale:
1 = minor annoyance
3 = visible beta problem
5 = security/payment/data-loss/launch blocker

## Static Audit Notes

- `services/premiumService.js` normalizes active premium strictly from Firestore-style maps where `premium === true` and `status` is `active` or `manual_active`; malformed, expired, canceled, and past_due normalize to non-premium.
- `services/authService.js` resets premium entitlement on auth user change and sign-out, then refreshes premium UI. Static path looks intentionally fail-closed for account-switch entitlement state, but runtime QC is still needed.
- `modules/expeditionEngine.js` and `modules/searchEngine.js` gate trail toggles/global search execution through `window.BARK.services.premium.isPremium()`, not auth-only checks.
- `functions/index.js` calls `requirePremiumCallable()` before ORS payload validation/transport in both `handlePremiumRoute` and `handlePremiumGeocode`; unit/emulator tests must confirm free users never reach ORS.
- `functions/index.js` `handleCreateCheckoutSession()` requires callable auth and builds Lemon Squeezy test-mode checkout server-side; tests cover rejecting unauthenticated requests and ignoring client-provided uid/price/URLs.
- Grep found no app-side `premiumLoggedIn`, `checkout=success`, `provider=lemonsqueezy`, or storage-backed `setEntitlement()` premium grant path. `localStorage` is still used for map/filter/settings, which is tracked separately as BUG-011.
- `firestore.rules` protects user entitlement/provider/admin/payment fields on user docs and allows owner-only achievement writes with only `achievementId`, `tier`, and `dateEarned`; rules tests cover these paths.
- Static concern: `authService.handleCloudSettingsHydration()` can reapply premium-owned settings after free-user entitlement locking, and signed-out boot can load premium-owned settings from localStorage before auth state settles. Tracked as BUG-011.

## Baseline Test Results

- `npm run test:rules`: PASS, 16/16.
- `npm --prefix functions test`: PASS, 65/65.
- `npm run test:functions:emulator`: PASS, 9/9.
- `npm run test:e2e:smoke`: exit 0, 10/10 skipped because `BARK_E2E_BASE_URL` and storage-state env vars were not exported for the packaged command.
- Focused premium-gating smoke with local server and `BARK_E2E_BASE_URL=http://localhost:4173/index.html`: PASS, 2 passed and 1 signed-in test skipped because `BARK_E2E_STORAGE_STATE` was not provided.
- `git diff --check`: PASS after removing generated Firebase emulator logs from the worktree.

## Runtime Smoke Notes

- Method: local static server at `http://localhost:4173/index.html` with Playwright runtime checks.
- Signed-out boot: app loaded, Leaflet map appeared, premium controls stayed locked, and no red console errors were observed.
- Signed-out paywall: upgrade flow asked for sign-in before checkout; modal opened and closed safely.
- Fake checkout success URL: `?checkout=success&provider=lemonsqueezy` showed verifying state, did not unlock premium, and kept controls locked.
- Checkout canceled URL: `?checkout=canceled&provider=lemonsqueezy` showed canceled/no-charge messaging and did not unlock premium.
- Mobile paywall: 390x844 viewport kept the modal inside the viewport with readable/dismissible controls.
- BUG-011 before fix: seeded premium map/filter/clustering localStorage caused non-premium runtime state to use OpenTopoMap/visited-only/premium clustering despite locked controls.
- BUG-011 after fix: same seed sanitized to default map style, all visits filter, `barkPremiumClustering=false`, and `premiumService.isPremium() === false`.
- Signed-in free, signed-in premium, and account-switch manual runtime flows remain pending because test storage states for the new premium/internal app were not available in this shell.

## Fix Log / QC

### BUG-011

Bug selected: Non-premium users can inherit premium map settings from localStorage/cloud settings.

Root cause hypothesis: Premium-off UI gating reset disabled controls but not the active runtime layer/filter/clustering state; cloud settings hydration could also reapply premium-owned settings for non-premium accounts.

Files expected: `services/authPremiumUi.js`, `services/authService.js`, `tests/playwright/phase3a-premium-gating-smoke.spec.js`.

Verification plan: Reproduce with seeded localStorage, fix runtime sanitization, add focused Playwright regression coverage, run rules/functions/callable emulator/focused smoke/diff check.

Root cause confirmed: Runtime state was independent of the disabled control values and stayed on premium map/filter/clustering values until explicitly reset.

Files changed: `services/authPremiumUi.js`, `services/authService.js`, `tests/playwright/phase3a-premium-gating-smoke.spec.js`.

Exact behavior before: Signed-out/non-premium boot with premium localStorage values displayed OpenTopoMap terrain tiles, visited-only filter, and premium clustering while premium controls were disabled.

Exact behavior after: Non-premium entitlement/auth transitions sanitize to default map style, all visits filter, and premium clustering off; cloud hydration ignores premium map/filter/clustering settings unless `premiumService.isPremium()` is true.

Tests run: focused Playwright premium-gating smoke PASS 2/2 runnable; `npm run test:rules` PASS 16/16; `npm --prefix functions test` PASS 65/65; `npm run test:functions:emulator` PASS 9/9; `git diff --check` PASS.

Risk: Non-premium users with legacy premium map/filter preferences will be reset to free-safe defaults. Signed-in premium settings are preserved because sanitization is skipped once entitlement is active.

Rollback plan: Revert the BUG-011 fix commit; this restores prior map/filter/clustering hydration behavior.

QC Result: PASS

Evidence: Focused Playwright regression verifies seeded premium storage is sanitized while `premiumLoggedIn=true` still does not unlock premium.

Manual steps: Seed `barkMapStyle=terrain`, `barkVisitedFilter=visited`, `barkPremiumClustering=true`, and `premiumLoggedIn=true`; boot signed-out app; confirm default map style, all filter, clustering false, locked premium controls, and `premiumService.isPremium() === false`.

Remaining risk: Full signed-in free/premium account-switch runtime QC still needs the dedicated storage states.

Status update in tracker: BUG-011 is `QC PASSED`.
