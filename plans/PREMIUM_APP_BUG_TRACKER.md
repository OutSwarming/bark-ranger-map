# Premium App Bug Tracker

Date: 2026-05-03
Branch: main
Current commit: fef6b13fbf4e21cdb79e8aed88d766240d532b67 (before BUG-001 runtime QC update)
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
| BUG-001 | Gamification achievement Firestore permission/runtime issue | Firestore/rules/data sync | P1 | 5 | 4 | Reproduced in signed-in free and premium runtime QC: owner write/read to `users/{uid}/achievements/bug001RuntimeSmoke` fails with `Missing or insufficient permissions.` Payload shape is exactly `achievementId`, `tier`, `dateEarned`. Local rules tests pass owner create/update/read and deny non-owner/unauth/dangerous fields, so the repo rules are correct but deployed Firestore rules appear stale. | Open Profile signed in, trigger achievement evaluation, then write/read owner achievement doc with allowed payload. Confirm no permission console error after rules deploy. | Production Firestore rules do not appear to include the repo's owner-only achievement subcollection allowance. | `firestore.rules`, `tests/rules/firestore-entitlement.rules.test.js`, `tests/playwright/bug001-achievement-permission-smoke.spec.js`, `gamificationLogic.js`, `profileEngine.js` | Repo rules fix exists in `576830f`; runtime smoke added in this update | Local rules PASS; runtime FAIL pending Firestore rules deploy | DEFERRED |
| BUG-002 | Paywall verifying state can mislead or get stuck after checkout success URL | Payment/paywall | P1 | 5 | 4 | Reproduced: signed-out fake success URL kept `premiumService.isPremium()` false and controls locked, but left paywall/profile in disabled `verifying` state forever. Fixed signed-out return handling and added a delayed signed-in/free fallback that never unlocks from URL alone. Signed-in storage-state QC now passes for fake success/canceled/free/premium states. | Visit `?checkout=success&provider=lemonsqueezy` signed out or signed-in/free; observe paywall state before/after fallback. | `checkout=success` branch ran before the signed-out branch and had no timeout/fallback while waiting for Firestore entitlement. | `modules/paywallController.js`, `tests/playwright/phase3a-premium-gating-smoke.spec.js`, `scripts/save-playwright-storage-state.js`, `.gitignore`, `package.json` | This fix commit | PASS | QC PASSED |
| BUG-003 | Account switch may leave stale premium UI state | Premium entitlement/runtime | P0 | 4 | 5 | Reproduced with local runtime probe: after forcing a previous account's `manual_active` entitlement into `premiumService` while Firebase `currentUser` was signed out, `premiumService.isPremium()` returned `true`. Fixed ownership check now passes signed-in free/premium storage-state QC, premium sign-out lock reset, and distinct-account full smoke. | Sign in premium account, switch to free account or sign out, then inspect `premiumService.isPremium()`, premium controls, map style/filter/clustering, trail/global search, paywall/profile premium text, and fake success URL behavior. | `premiumService.isPremium()` trusted the last normalized entitlement without checking that the entitlement UID matched the current Firebase user. | `services/premiumService.js`, `tests/playwright/phase3a-premium-gating-smoke.spec.js` | This fix commit | PASS | QC PASSED |
| BUG-004 | Signed-in free user might still access trails/global search/ORS-adjacent controls if auth-only gating remains | Premium entitlement/runtime | P0 | 4 | 5 | Reproduced and fixed a premium clustering leak: non-premium runtime could set `premiumClusteringEnabled=true` through `#premium-cluster-toggle`. Signed-in free storage-state QC now proves premium clustering, virtual/completed trails, global search, paywall/account state, and fake success URL remain locked; premium storage still unlocks. | Sign in with free account or boot signed out, try premium clustering, virtual trails, completed trails, global search, routing/geocode, paywall/account state, and fake success URL behavior. | Settings controller treated premium clustering as an ordinary setting and did not gate setting writes or local/cloud payloads by entitlement; no remaining auth-only target-surface gate was found in static audit. | `modules/settingsController.js`, `tests/playwright/phase3a-premium-gating-smoke.spec.js`, `modules/expeditionEngine.js`, `modules/searchEngine.js`, `modules/paywallController.js`, `functions/index.js` | 1e6219c; verification follow-up commit | PASS | QC PASSED |
| BUG-005 | Mobile paywall/account layout may be cramped or confusing | Layout/UI logic | P2 | 3 | 3 | Seeded suspicion. Signed-out mobile paywall at 390x844 stayed within viewport and was dismissible/readable. Account card, marker panel, and signed-in mobile states still pending. | Use narrow viewport; open paywall, account card, marker panel, search/filter controls. | Modal/account CSS may not handle small viewport and map overlay constraints. | `renderers`, `modules`, `index.html`, stylesheets |  | Partial PASS; signed-in/mobile panels pending | FOUND |
| BUG-006 | Runtime console errors from script load order or missing modules | Runtime console errors | P1 | 3 | 4 | Seeded suspicion. Signed-out boot, paywall open, fake success URL, canceled URL, and mobile paywall had no red console errors. Signed-in profile/trip/achievements/logout flows pending. | Boot app and exercise auth, map, marker, profile, trip planner, achievements, logout. | Script order/global dependencies may race or modules may be undefined. | `index.html`, `core`, `modules`, `services`, `renderers` |  | Partial PASS; signed-in flows pending | FOUND |
| BUG-007 | Fake checkout success URL must not unlock premium | Premium entitlement/runtime | P0 | 2 | 5 | Manual audit: `?checkout=success&provider=lemonsqueezy` did not unlock premium; `premiumService.isPremium()` stayed false, controls stayed locked, and no storage/URL premium grant path was found by grep. | Visit fake success URL while signed out/free; inspect premiumService/UI controls. | Legacy URL/local storage premium grant logic may remain. | `services`, `modules`, `renderers`, `state`, `index.html` |  | PASS | QC PASSED |
| BUG-008 | ORS premium route/geocode callable must reject non-premium before ORS transport | ORS/premium backend | P0 | 2 | 5 | Static audit found `requirePremiumCallable()` before ORS transport; `npm --prefix functions test` passed 65/65 and callable emulator passed 9/9, including inactive statuses rejected. | Run functions tests/callable emulator; attempt non-premium callable request. | Callable may trust client flags or check entitlement after transport setup. | `functions`, `tests` |  | PASS | QC PASSED |
| BUG-009 | Firestore rules must still block client writes to entitlement/provider/admin/payment fields | Firestore/rules/data sync | P0 | 2 | 5 | `npm run test:rules` passed 16/16, including denial for client writes to entitlement/provider/admin/payment-style user fields. | Run rules tests for entitlement/provider/admin/payment write denial. | Recent owner-only rules change may be too broad. | `firestore.rules`, `tests` |  | PASS | QC PASSED |
| BUG-010 | Old localStorage premium bypass must not exist | Premium entitlement/runtime | P0 | 2 | 5 | Grep found no app-side `premiumLoggedIn`, `checkout=success`, `provider=lemonsqueezy`, or storage-backed `setEntitlement()` premium grant path. Focused smoke kept `premiumLoggedIn=true` while `premiumService.isPremium()` stayed false. | Grep for storage, URL checkout, premium predicates, entitlement setters. | Legacy test/dev bypass code may still be reachable. | `services`, `modules`, `renderers`, `state`, `core`, `index.html` |  | PASS | QC PASSED |
| BUG-011 | Non-premium users can inherit premium map settings from localStorage/cloud settings | Premium entitlement/runtime | P1 | 5 | 4 | Reproduced: with `barkMapStyle=terrain`, `barkVisitedFilter=visited`, and `barkPremiumClustering=true`, signed-out/non-premium boot kept OpenTopoMap tiles, visited-only filter, and premium clustering active while controls were locked. Fixed by sanitizing non-premium runtime defaults and blocking premium cloud settings for non-premium users; signed-in free storage-state QC now passes. | Seed localStorage premium map/filter/clustering values, boot signed-out/free, and inspect active layer/filter/clustering while premium controls are locked. | Premium-off gating updated controls but did not sanitize premium-owned runtime settings; cloud hydration could reapply premium settings for free users. | `services/authPremiumUi.js`, `services/authService.js`, `tests/playwright/phase3a-premium-gating-smoke.spec.js` | This fix commit | PASS | QC PASSED |
| BUG-012 | Profile signed-in card order is confusing on mobile | Layout/UI logic | P2 | 5 | 3 | User-reported mobile order put Current Account before profile value content. Fixed DOM order so Premium, Achievement Vault, Virtual Expedition, Dossier, Leaderboard, and My Data & Routes appear before account/admin/footer controls. Signed-in storage-state profile smoke now passes. | Open Profile tab after sign-in on mobile and inspect card order. | Static profile DOM placed `#account-status-card` directly below the welcome/stats card and before the achievement/expedition/profile journey. | `index.html`, `tests/playwright/account-auth-smoke.spec.js` | This fix commit | PASS | QC PASSED |

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
- BUG-001 runtime achievement write path is `firebase.firestore().collection('users').doc(userId).collection('achievements').doc(item.id)`, called by `GamificationEngine.evaluateAndStoreAchievements()` from `profileEngine.evaluateAchievements()` and share/profile flows. The payload is `{ achievementId: item.id, tier: item.tier, dateEarned: firebase.firestore.FieldValue.serverTimestamp() }` with no `uid`, `premium`, `entitlement`, `admin`, `provider`, `score`, or payment fields.
- BUG-001 local rule contract: owner read/create/update is allowed only when keys are limited to `achievementId`, `tier`, and `dateEarned`, the doc ID matches `achievementId`, `tier` is `honor` or `verified`, and `dateEarned` is a timestamp. Non-owner access, unauthenticated access, dangerous extra fields, mismatched IDs, bad tiers, and deletes remain denied.
- Static concern: `authService.handleCloudSettingsHydration()` can reapply premium-owned settings after free-user entitlement locking, and signed-out boot can load premium-owned settings from localStorage before auth state settles. Tracked as BUG-011.
- BUG-003 root cause: UI and engines correctly ask `premiumService.isPremium()`, but `premiumService.isPremium()` previously did not verify the entitlement owner UID against `firebase.auth().currentUser`. The fix keeps that ownership check inside the read-only premium model so stale premium state fails closed during account switches, sign-out, and fake-success return windows.
- BUG-004 root cause: `premium-cluster-toggle` was rendered outside the main premium filter wrapper and `settingsController` treated `premiumClusteringEnabled` as a normal setting. The fix keeps premium clustering false for non-premium users at the settings owner layer, disables the toggle, blocks local runtime writes, and forces the cloud settings payload to false when entitlement is inactive.
- BUG-004 verification update: `phase3a-premium-gating-smoke.spec.js` now covers forced virtual/completed trail clicks, signed-out global search with a stubbed ORS geocode transport, premium clustering lock state, signed-in free paywall/account expectations, and fake success URL expectations when the free storage state is available. `phase4c-premium-entitlement-smoke.spec.js` and `phase4c-global-search-entitlement-smoke.spec.js` remain the deeper free/premium storage-state tests for entitlement and global search.
- BUG-002 root cause: `modules/paywallController.js` handled `checkout=success` before checking whether a Firebase user was signed in, so signed-out users saw a disabled verifying state instead of a sign-in path. Signed-in/free users also had no delayed-verification fallback if the webhook entitlement never arrived.
- BUG-002 storage-state update: Playwright auth session output now defaults to ignored `playwright/.auth/*.json` paths, and `scripts/save-playwright-storage-state.js` can manually capture free, second-free, and premium account states without storing passwords in code.
- BUG-012 root cause: the signed-in profile DOM prioritized account/payment-adjacent content directly after the welcome card. No entitlement, account, admin, or feedback handlers needed to change because all existing IDs/classes stayed intact.
- Signed-in QC storage states were created under ignored paths: `playwright/.auth/free-user.json`, `playwright/.auth/free-user-b.json`, and `playwright/.auth/premium-user.json`. `premium-user.json` was verified as Premium active before saving. `free-user.json` and `free-user-b.json` currently point to the same free UID, so two-free-account isolation remains a setup caveat; distinct free-vs-premium full smoke passed.
- Phase 4C entitlement smoke was updated to accept both supported premium entitlement sources: `active` from Lemon Squeezy and `manual_active` from admin override.

## Baseline Test Results

- `npm run test:rules`: PASS, 16/16.
- `npm --prefix functions test`: PASS, 65/65.
- `npm run test:functions:emulator`: PASS, 9/9.
- `npm run test:e2e:smoke`: exit 0, 15/15 skipped because `BARK_E2E_BASE_URL` and storage-state env vars were not exported for the packaged command.
- Focused premium-gating smoke with local server and `BARK_E2E_BASE_URL=http://localhost:4173/index.html`: PASS, 7 passed and 1 signed-in free test skipped because `BARK_E2E_STORAGE_STATE` was not provided. Runnable assertions include signed-out locks, premium setting sanitization, stale entitlement rejection, forced clustering lock, fake success signed-out sign-in prompt, fake success signed-in-like delayed fallback, and canceled URL no-charge copy.
- `BARK_E2E_BASE_URL=http://localhost:4173/index.html npm run test:e2e:smoke`: PASS, 7 passed and 8 skipped because free/free-b/premium storage-state files were not provided.
- BUG-012 focused profile order smoke with `BARK_E2E_BASE_URL=http://localhost:4173/index.html`: PASS, 2 passed and 1 signed-in storage-state test skipped.
- Signed-in storage-state full smoke with free/free duplicate states: 14 passed, 1 failed because `BARK_E2E_STORAGE_STATE` and `BARK_E2E_STORAGE_STATE_B` were the same UID; treated as setup gap, not app regression.
- Signed-in storage-state full smoke with free and premium distinct states: PASS, 16/16.
- BUG-001 focused achievement permission smoke with signed-in free and premium states: FAIL, 0/2. Both accounts evaluated achievements successfully and rendered Bronze Paw, but owner write/read to `users/{uid}/achievements/bug001RuntimeSmoke` failed with `Missing or insufficient permissions.`
- BUG-001 supporting rules/function checks: `npm run test:rules` PASS 16/16; `npm --prefix functions test` PASS 65/65.
- BUG-001 full signed-in e2e smoke with free and premium distinct states: PASS, 16/16.
- Focused premium-gating smoke with free and premium states: PASS, 9/9.
- Phase 4C premium entitlement smoke with free and premium states: initially failed because the premium account was `active/lemon_squeezy` rather than `manual_active/admin_override`; after test update, PASS, 2/2.
- Phase 4C global search entitlement smoke with free and premium states: PASS, 3/3.
- Account auth/profile smoke with signed-in free storage state: PASS, 3/3.
- `git diff --check`: PASS after removing generated Firebase emulator logs from the worktree.

## Runtime Smoke Notes

- Method: local static server at `http://localhost:4173/index.html` with Playwright runtime checks.
- Signed-out boot: app loaded, Leaflet map appeared, premium controls stayed locked, and no red console errors were observed.
- Signed-out paywall: upgrade flow asked for sign-in before checkout; modal opened and closed safely.
- BUG-002 before fix: `?checkout=success&provider=lemonsqueezy` while signed out showed disabled `verifying` state forever, did not unlock premium, and kept controls locked.
- BUG-002 after fix: signed-out fake success shows `Sign in to verify premium` with enabled sign-in action and no unlock; signed-in-like/free fake success starts in verifying and falls back to `Still verifying premium` without unlocking.
- Checkout canceled URL: `?checkout=canceled&provider=lemonsqueezy` showed canceled/no-charge messaging and did not unlock premium.
- Mobile paywall: 390x844 viewport kept the modal inside the viewport with readable/dismissible controls.
- BUG-011 before fix: seeded premium map/filter/clustering localStorage caused non-premium runtime state to use OpenTopoMap/visited-only/premium clustering despite locked controls.
- BUG-011 after fix: same seed sanitized to default map style, all visits filter, `barkPremiumClustering=false`, and `premiumService.isPremium() === false`.
- BUG-003 before fix: forcing a previous account `manual_active` entitlement into `premiumService` while signed out produced `premiumService.isPremium() === true`.
- BUG-003 after fix: the same stale previous-account entitlement remains visible through `getEntitlement()` for diagnostics, but `premiumService.isPremium() === false` because no current Firebase user owns it.
- BUG-004 before fix: with `premiumService.isPremium() === false`, dispatching a change on `#premium-cluster-toggle` could set `window.premiumClusteringEnabled === true` and `localStorage.barkPremiumClustering === "true"`.
- BUG-004 after fix: the same non-premium toggle change is coerced back to false, the toggle is disabled with `aria-disabled="true"`, and storage remains `barkPremiumClustering=false`.
- BUG-004 verification after test update: signed-out/non-premium forced clicks on both trail buttons reset them to inactive/disabled, global search shows locked copy and does not call the stubbed ORS geocode function, and the signed-in free storage-state test is ready to check trail buttons, global search, premium clustering, paywall/account state, and fake success URL once `BARK_E2E_STORAGE_STATE` exists.
- BUG-012 after fix: static DOM order is Welcome/Stats, Premium Map Tools, Achievement Vault, Virtual Expedition, Completed Expeditions when visible, Classified Dossier, Global Leaderboard, My Data & Routes, Current Account, admin-only Data Refinery container, Suggest Missing Location, Suggest Improvement, Log Out.
- Signed-in free and signed-in premium runtime QC now pass with storage states. Premium sign-out lock reset is covered. A true second free-account storage state is still needed if we specifically require free-account-A to free-account-B isolation instead of distinct free-to-premium isolation.

## Fix Log / QC

### BUG-001

Bug selected: Gamification achievement Firestore permission/runtime issue.

Root cause hypothesis: The client may be writing to an achievement path or payload shape that deployed Firestore rules do not allow, or the repo rules fix has not yet been deployed.

Files expected: `firestore.rules`, `tests/rules/firestore-entitlement.rules.test.js`, `tests/playwright/bug001-achievement-permission-smoke.spec.js`, `gamificationLogic.js`, `profileEngine.js`, `plans/PREMIUM_APP_BUG_TRACKER.md`.

Verification plan: Confirm the exact runtime path/payload, compare it to the rules contract, run local rules tests, add a focused signed-in Playwright runtime smoke with console-error capture, and classify production runtime denial as deploy-needed if local rules pass.

Root cause confirmed: The runtime path and payload match the repo rules contract, and local rules tests pass. The production runtime still denies owner achievement writes, which means the deployed Firestore rules appear stale relative to the repo.

Exact path: `users/{uid}/achievements/{achievementId}`.

Exact payload shape: `{ achievementId: string matching the document ID, tier: 'honor' | 'verified', dateEarned: server timestamp }`.

Runtime error reproduced: Yes. Signed-in free UID `LkevgscKPvPqRg9c5YKKXVqtwv02` and signed-in premium UID `6vrN6hQ8VQSzxvKRLuVdxWM2mpD2` both failed owner write/read to `users/{uid}/achievements/bug001RuntimeSmoke` with `Missing or insufficient permissions.`

Issue type: Repo rules/tests are correct; deployed Firestore rules need to be updated. Do not patch the client to hide the error.

Files changed: `tests/playwright/bug001-achievement-permission-smoke.spec.js`, `plans/PREMIUM_APP_BUG_TRACKER.md`.

Exact behavior before: Achievement evaluation could run and render achievements, but owner writes to the achievement subcollection failed at runtime with Firestore permission errors.

Exact behavior after: No product code changed. The focused runtime smoke now captures the failure explicitly and will pass after the repo Firestore rules are deployed.

Tests run: BUG-001 focused achievement smoke FAIL 0/2 against current production Firestore rules; `npm run test:rules` PASS 16/16; `npm --prefix functions test` PASS 65/65; signed-in `npm run test:e2e:smoke` PASS 16/16; `git diff --check` PASS after generated-log cleanup.

Deploy needed: Yes, but not run. Deploy decision command: `firebase deploy --only firestore:rules`.

Risk: Until rules are deployed, signed-in users may still see Firestore permission errors when the profile/share flow syncs achievement docs. The local rules remain narrow and continue to deny entitlement/payment/admin field writes.

Rollback plan: Remove the focused BUG-001 Playwright smoke if it blocks a non-production test environment; no runtime behavior changed.

QC Result: QC FAILED in production runtime, local rules PASS. Status is `DEFERRED` pending Firestore rules deploy.

Evidence: Static audit found no extra dangerous fields in achievement writes. Local rules tests prove owner-only achievement writes with the allowed payload are accepted and non-owner/unauth/dangerous writes are denied. Playwright runtime smoke proves the deployed app still denies the same owner write.

Manual steps: None beyond the signed-in storage-state runtime smoke. No Firebase deploy was run.

Remaining risk: After Firestore rules deploy, rerun `tests/playwright/bug001-achievement-permission-smoke.spec.js`; it should pass for free and premium accounts without console permission errors.

Status update in tracker: BUG-001 is `DEFERRED` because the fix exists in repo rules/tests but production runtime QC remains blocked until Firestore rules deploy.

### BUG-012

Bug selected: Profile signed-in card order is confusing on mobile.

Root cause hypothesis: The static Profile tab DOM places account/payment-adjacent cards before the main passport/profile value content.

Files expected: `index.html`, `tests/playwright/account-auth-smoke.spec.js`, `plans/PREMIUM_APP_BUG_TRACKER.md`.

Verification plan: Reorder only existing DOM blocks, preserve IDs/classes/event targets, add a Playwright DOM-order assertion that runs without storage state, and add signed-in coverage that activates when storage state exists.

Root cause confirmed: `#account-status-card` was immediately after Welcome/Stats and before Premium Map Tools, Achievement Vault, Virtual Expedition, Dossier, Leaderboard, and My Data & Routes.

Files changed: `index.html`, `tests/playwright/account-auth-smoke.spec.js`, `plans/PREMIUM_APP_BUG_TRACKER.md`.

Exact behavior before: Mobile signed-in Profile showed Welcome/Stats, then Current Account, then Premium Map Tools before the fun profile cards.

Exact behavior after: Profile order is Welcome/Stats, Premium Map Tools, Achievement Vault, Virtual Expedition, Classified Dossier, Global Leaderboard, My Data & Routes, Current Account, admin-only Data Refinery container, Suggest Missing Location, Suggest Improvement, Log Out. The hidden Completed Expeditions card remains tied to Virtual Expedition.

Tests run: focused account auth/profile smoke PASS 2/2 runnable and 1 signed-in skip before storage states; signed-in account auth/profile smoke PASS 3/3 after storage states; `npm run test:rules` PASS 16/16; `npm --prefix functions test` PASS 65/65; signed-in full smoke PASS 16/16 with distinct free/premium states; focused premium-gating smoke PASS 9/9; `git diff --check` PASS.

Risk: Browser screenshot/mobile visual inspection is still useful, but signed-in DOM-order and sign-out wiring are covered by storage-state smoke.

Rollback plan: Revert the BUG-012 fix commit; this restores the previous Profile tab card order.

QC Result: PASS

Evidence: Playwright `account-auth-smoke.spec.js` now verifies the DOM order from Welcome through Log Out with no console/page errors in the runnable signed-out profile load. Existing account, premium, admin, feedback, and logout IDs/classes were preserved.

Manual steps: Signed-in profile smoke opened the Profile tab with `playwright/.auth/free-user.json`, verified account card wiring, DOM order, and sign-out behavior. No screenshot was captured.

Remaining risk: Visual spacing on a narrow signed-in mobile viewport can still be eyeballed, but the card order and event wiring pass automation. No Firebase deploy was run.

Status update in tracker: BUG-012 is `QC PASSED`.

### BUG-002

Bug selected: Paywall verifying state can mislead or get stuck after checkout success URL.

Root cause hypothesis: `checkout=success` can drive a disabled verifying UI even when no signed-in account exists or when Firestore entitlement never arrives.

Files expected: `modules/paywallController.js`, `tests/playwright/phase3a-premium-gating-smoke.spec.js`, Playwright auth-state tooling, `.gitignore`.

Verification plan: Reproduce signed-out fake success locally, add non-storage Playwright coverage for signed-out/signed-in-like/canceled return states, keep URL success entitlement-neutral, and leave real signed-in storage-state QC pending unless storage states exist.

Root cause confirmed: `modules/paywallController.js` evaluated the `checkout=success && !premium` branch before the signed-out branch, and the verifying state had no timeout/fallback.

Files changed: `.gitignore`, `modules/paywallController.js`, `package.json`, `scripts/save-playwright-storage-state.js`, `tests/playwright/account-auth-smoke.spec.js`, `tests/playwright/phase1b-visited-smoke.spec.js`, `tests/playwright/phase3a-premium-gating-smoke.spec.js`, `tests/playwright/phase3a-settings-persistence-smoke.spec.js`, `tests/playwright/phase4c-global-search-entitlement-smoke.spec.js`, `tests/playwright/phase4c-premium-entitlement-smoke.spec.js`, `tests/playwright/save-storage-state.js`, `plans/PREMIUM_APP_BUG_TRACKER.md`.

Exact behavior before: Signed-out `?checkout=success&provider=lemonsqueezy` produced `paywallState: "verifying"`, `profileState: "verifying"`, disabled `Checking account...` action, and no useful sign-in recovery path.

Exact behavior after: Signed-out success returns `verify-signed-out` with `Sign in to verify premium`; signed-in/free success remains verifying briefly, then falls back to `verification-delayed` with refresh/support guidance; canceled return stays non-premium with no-charge copy; premium active still depends only on owned Firestore entitlement.

Tests run: `npm run test:rules` PASS 16/16; `npm --prefix functions test` PASS 65/65; `npm run test:functions:emulator` PASS 9/9; focused premium-gating smoke PASS 7/7 runnable and 1 signed-in skip; `npm run test:e2e:smoke` exit 0 with 15/15 skipped without env; URL-backed full smoke PASS 7 passed and 8 skipped; `git diff --check` PASS.

Risk: A true two-free-account setup remains useful for unrelated account-isolation smoke, but BUG-002 signed-out, signed-in free, canceled, and premium-active return-state behavior is now covered with storage states.

Rollback plan: Revert the BUG-002 fix commit; this restores the previous checkout return-state behavior and storage-state defaults.

QC Result: PASS

Evidence: Local probe reproduced signed-out verifying forever before the fix and `verify-signed-out` after the fix. Playwright verifies fake success signed-out does not unlock and asks sign-in, fake success signed-in/free falls back without unlock, canceled URL does not unlock, premium active still requires owned entitlement, stale/mismatched entitlement does not unlock, and existing ORS/rules protections still pass.

Manual steps: Boot local server, open `http://localhost:4173/index.html?checkout=success&provider=lemonsqueezy` signed out, confirm `premiumService.isPremium() === false`, premium controls locked, paywall title `Sign in to verify premium`, primary button enabled. For signed-in-like fallback, force a Firebase currentUser with no premium entitlement and confirm fallback reaches `Still verifying premium` without unlocking.

Remaining risk: None known for BUG-002. No Firebase deploy was run.

Status update in tracker: BUG-002 is `QC PASSED`.

### BUG-004

Bug selected: Signed-in free user might still access trails/global search/ORS-adjacent controls if auth-only gating remains.

Root cause hypothesis: A premium surface may still be controlled by generic signed-in/settings state rather than entitlement state.

Files expected: `services/authPremiumUi.js`, `services/authService.js`, `services/premiumService.js`, `modules/settingsController.js`, `tests/playwright/phase3a-premium-gating-smoke.spec.js`.

Verification plan: Use static grep to confirm trail/global search/ORS gates, reproduce any remaining free-user premium surface locally, fix the owner module narrowly, add Playwright regression coverage, then rerun rules/functions/callable emulator/e2e smoke/focused smoke/diff check.

Root cause confirmed: `modules/settingsController.js` allowed `premiumClusteringEnabled` writes without checking entitlement, and `#premium-cluster-toggle` lived outside the main premium-controls wrapper that `authPremiumUi` locks.

Files changed: `modules/settingsController.js`, `tests/playwright/phase3a-premium-gating-smoke.spec.js`, `plans/PREMIUM_APP_BUG_TRACKER.md`.

Exact behavior before: A non-premium/signed-out runtime could set the premium clustering toggle to true, which set `window.premiumClusteringEnabled === true` and `localStorage.barkPremiumClustering === "true"` while `premiumService.isPremium() === false`.

Exact behavior after: `settingsController` classifies `premiumClusteringEnabled` as premium-only, coerces it to false unless entitlement is active, disables the premium clustering toggle, writes false to local/cloud settings while locked, and resyncs when premium entitlement changes.

Tests run: `npm run test:rules` PASS 16/16; `npm --prefix functions test` PASS 65/65; `npm run test:functions:emulator` PASS 9/9; focused premium-gating smoke PASS 4/4 runnable and 1 signed-in free skip; `npm run test:e2e:smoke` exit 0 with 12/12 skipped for missing env.

Risk: The two-free-account isolation test still needs a second distinct free account, but signed-in free entitlement-gating surfaces now pass with storage state.

Rollback plan: Revert the BUG-004 fix commit; this restores prior settings write behavior.

QC Result: PASS

Evidence: Local runtime reproduction showed the premium clustering setting could be forced true before the fix. Playwright regressions now prove signed-out and signed-in free runtime keep map/filter/clustering locked, forced virtual/completed trail clicks fail closed, stale entitlements do not unlock, locked global search does not call the stubbed ORS geocode transport, and premium users unlock. Static audit shows trail/global search/paywall/account surfaces gate on `premiumService.isPremium()`, while `npm --prefix functions test` and callable emulator tests prove free users are rejected before ORS and premium users still reach the ORS transport path.

Manual steps: Boot signed-out app, wait for settings to initialize, inspect `premiumService.isPremium() === false`, dispatch a `change` event on `#premium-cluster-toggle` after setting it checked, and confirm `window.premiumClusteringEnabled === false`, `toggle.disabled === true`, `aria-disabled === "true"`, and `localStorage.barkPremiumClustering === "false"`.

Remaining risk: None known for BUG-004. No Firebase deploy was run.

Status update in tracker: BUG-004 is `QC PASSED`.

### BUG-003

Bug selected: Account switch may leave stale premium UI state.

Root cause hypothesis: Premium UI subscribers and domain surfaces can observe `premiumService.isPremium()` during an auth transition before `authService` has reset the previous account's entitlement.

Files expected: `services/premiumService.js`, `services/authService.js`, `services/authPremiumUi.js`, `tests/playwright/phase3a-premium-gating-smoke.spec.js`.

Verification plan: Reproduce stale premium service state, harden the premium model, add a focused Playwright regression that runs without storage states, then rerun rules/functions/callable emulator/e2e smoke/focused smoke/diff check.

Root cause confirmed: `premiumService.isPremium()` only checked the entitlement's normalized `premium` boolean and ignored `debugMeta.uid` versus `firebase.auth().currentUser.uid`.

Files changed: `services/premiumService.js`, `tests/playwright/phase3a-premium-gating-smoke.spec.js`, `plans/PREMIUM_APP_BUG_TRACKER.md`.

Exact behavior before: A stale `manual_active` entitlement tagged to `old-premium-user` returned `isPremium: true` even when `firebase.auth().currentUser` was `null`.

Exact behavior after: `isPremium()` returns true only when the normalized entitlement is premium and the entitlement UID still matches the current Firebase user; signed-out or mismatched-user stale entitlements fail closed.

Tests run: `npm run test:rules` PASS 16/16; `npm --prefix functions test` PASS 65/65; `npm run test:functions:emulator` PASS 9/9; `npm run test:e2e:smoke` exit 0 with 11/11 skipped for missing env; focused premium-gating smoke PASS 3/3 runnable and 1 signed-in skip; `git diff --check` PASS after generated log cleanup.

Risk: If a future non-Firebase test harness sets an entitlement with a UID but does not provide Firebase Auth, `isPremium()` treats auth ownership as unknown and preserves prior behavior. In the real app, Firebase Auth is present and stale signed-out/mismatched entitlements fail closed.

Rollback plan: Revert the BUG-003 fix commit; this restores previous `isPremium()` behavior.

QC Result: PASS

Evidence: Local runtime probe reproduced `isPremium: true` before the fix and `isPremium: false` after the fix for the same stale previous-account entitlement. Playwright regression `stale premium entitlement for a previous account does not unlock signed-out runtime` passed. Storage-state smoke now verifies premium unlock, premium sign-out reset to locked controls, free account locked controls, and distinct free/premium account isolation.

Manual steps: Boot signed-out app, force `premiumService.setEntitlement({ premium: true, status: 'manual_active' }, { uid: 'previous-premium-user' })`, confirm `premiumService.isPremium() === false`, controls remain locked, trail buttons remain disabled, and no storage or fake-success unlock path is involved.

Remaining risk: A true second-free-account isolation run remains pending because `free-user.json` and `free-user-b.json` currently share the same UID. Free-to-premium and premium-to-sign-out entitlement transitions pass with distinct free/premium accounts.

Status update in tracker: BUG-003 is `QC PASSED` for premium/free/sign-out entitlement leakage.

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

Risk: Non-premium users with legacy premium map/filter preferences will be reset to free-safe defaults. Signed-in premium settings are preserved because sanitization is skipped once entitlement is active; signed-in free storage-state QC now passes.

Rollback plan: Revert the BUG-011 fix commit; this restores prior map/filter/clustering hydration behavior.

QC Result: PASS

Evidence: Focused Playwright regression verifies seeded premium storage is sanitized while `premiumLoggedIn=true` still does not unlock premium.

Manual steps: Seed `barkMapStyle=terrain`, `barkVisitedFilter=visited`, `barkPremiumClustering=true`, and `premiumLoggedIn=true`; boot signed-out app; confirm default map style, all filter, clustering false, locked premium controls, and `premiumService.isPremium() === false`.

Remaining risk: None known for BUG-011. The two-free-account setup caveat is tracked under BUG-003/account isolation.

Status update in tracker: BUG-011 is `QC PASSED`.
