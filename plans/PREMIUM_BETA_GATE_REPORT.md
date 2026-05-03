# Premium Beta Gate Report

Date: 2026-05-03 04:30 EDT
Scope: New premium/internal app only.
Current app commit before BUG-022 completion: `8b57c49`

## Verdict

GO for controlled premium beta after the manual checks below.

The app is closer and auth/payment/rules are much safer. The paid/free product-tier audit for R05-R12 is now complete, and the one additional product-rule gap found during audit was fixed as BUG-020.

Resolved during this downgrade follow-up:

- BUG-015: Free visited limit of 20 parks is now enforced in the client/runtime visit-add owner for signed-in free users.
- BUG-016: Route generation is now visually and runtime gated for free users, while premium users can still reach the ORS directions path.
- BUG-017: Premium product surface audit for R05-R12 is complete and QC passed.
- BUG-020: Free users can no longer force premium map style/visited filter state through DOM events or fake storage.
- BUG-021: Free route generation now opens a clear Premium upgrade explanation without calling ORS.
- BUG-022: Local settings autosave remains available to everyone, while cloud settings sync/save and cloud hydration are Premium-only.

## Deployed Firestore Rules

Status: DEPLOYED and verified.

Deploy command reported successful:

```bash
npx firebase-tools deploy --only firestore:rules --project barkrangermap-auth
```

Reported deploy result:

- `firestore.rules` compiled successfully
- `firestore.rules` uploaded
- rules released to `cloud.firestore`
- deploy complete

Post-deploy verification:

- `npm run test:rules`: PASS 17/17
- BUG-001 achievement runtime smoke: PASS 2/2
- signed-in full smoke: PASS 16/16

## Payment Smoke

Status: TEST MODE payment smoke previously passed.

Covered flow:

- `createCheckoutSession`
- Lemon Squeezy test checkout
- `lemonSqueezyWebhook`
- Firestore entitlement
- `premiumService`
- UI Premium active

Current gate did not run another checkout or touch live Lemon Squeezy. Payment/backend protections are covered by the final function test suite:

- checkout session helpers and callable behavior
- webhook signature verification and raw-body handling
- entitlement mapping for active, canceled, expired, past_due, refunded, manual_active
- test-mode live-mode rejection
- no entitlement write during checkout creation

## Final Verification

| Check | Result |
|---|---|
| `git status --short` | PASS with known unrelated dirty files outside report scope |
| `git log --oneline -12` | PASS, recent premium fixes visible through `4d50c1e` |
| `npm run test:rules` | PASS 17/17 |
| `npm --prefix functions test` | PASS 65/65 |
| `npm run test:functions:emulator` | PASS 9/9 |
| focused BUG-017 product-rule audit smoke | PASS 2/2 |
| focused BUG-021 route upgrade prompt smoke | PASS 1/1 |
| focused BUG-022 settings cloud-sync policy smoke | PASS 3/3 |
| signed-in `npm run test:e2e:smoke` | PASS 29/29 after adding BUG-015, BUG-016, BUG-017, BUG-021, and BUG-022 product-rule/UX smoke |
| `git diff --check` | PASS |

Signed-in smoke used:

```bash
BARK_E2E_BASE_URL=http://localhost:4173/index.html
BARK_E2E_STORAGE_STATE="$PWD/playwright/.auth/free-user.json"
BARK_E2E_STORAGE_STATE_B="$PWD/playwright/.auth/free-user-b.json"
BARK_E2E_PREMIUM_STORAGE_STATE="$PWD/playwright/.auth/premium-user.json"
```

## Fixed Bug List

- BUG-001: Achievement Firestore permission issue. QC PASSED after explicit Firestore rules deploy.
- BUG-002: Checkout success verifying state could mislead/get stuck. QC PASSED.
- BUG-003: Account switch could leave stale premium UI/entitlement state. QC PASSED.
- BUG-004: Signed-in free users could access premium surfaces. QC PASSED.
- BUG-007: Fake checkout success URL unlock risk. QC PASSED.
- BUG-008: ORS premium callables reject non-premium before ORS transport. QC PASSED.
- BUG-009: Firestore rules block client writes to entitlement/payment/admin fields. QC PASSED.
- BUG-010: Old localStorage premium bypass absent. QC PASSED.
- BUG-011: Non-premium premium map/filter/clustering state leak. QC PASSED.
- BUG-012: Signed-in profile card order on mobile improved. QC PASSED.
- BUG-013: Google switch-account chooser provider prompt implemented. Fixed, manual chooser visual QC still pending.
- BUG-014: Settings autosave could call Firebase Auth before app initialization. QC PASSED.
- BUG-015: Free visited limit of 20 parks. QC PASSED for manual mark, GPS check-in, fake localStorage bypass, removal at limit, premium 21st visit, and premium-to-free limit reapplication.
- BUG-016: Route generation premium gate. QC PASSED for free disabled UI, forced-click runtime guard, no free ORS call, premium enabled UI, and premium ORS directions path.
- BUG-017: Premium product rules audit. QC PASSED for global search, premium clustering, premium map styles/visited filters, virtual/completed trail controls, fake storage bypass, and free/premium account behavior.
- BUG-020: Free forced premium map/filter runtime state. QC PASSED.
- BUG-021: Route generation upgrade prompt. QC PASSED for free mobile tap/click, route-specific paywall copy, no free ORS call, and existing premium route generation path.
- BUG-022: Settings autosave/cloud sync policy. QC PASSED for signed-out local settings persistence, signed-in free local-only settings/no cloud write/upgrade prompt, premium cloud sync payload, and premium-only setting sanitization.

## Remaining Risks

- The free visited limit is currently client/runtime enforced in `checkinService`; a malicious client could still attempt direct `visitedPlaces` writes until a future callable/backend quota gate owns visit additions.
- BUG-013 still needs human visual confirmation that Google shows the account chooser after Switch Account.
- One real Lemon Squeezy test-mode checkout is still useful as a final end-to-end sanity check after all auth/UI fixes.
- Mobile profile/paywall visual skim is still recommended on a real narrow viewport.
- Android search BUG-019 should be checked separately if still reproducible.
- Trip planner stop persistence across reload remains explicitly unsupported in the current runtime; styling/visit persistence is covered.
- Worktree had unrelated dirty files during this gate: `functions/index.js`, `functions/tests/checkout-session.test.js`, `plans/BETA_TESTER_7PM_MEETING_CHECKLIST.md`, `plans/PHASE_4E_LEMONSQUEEZY_CHECKOUT_PLAN.md`. They were not part of this report commit.

## Manual Checks Still Needed

1. BUG-013 Google chooser:
   - Sign in with Google Account A.
   - Click Switch Account.
   - Click Sign in with Google.
   - Confirm Google account chooser appears.
   - Choose Google Account B.
   - Confirm app shows Account B and premium state does not leak.

2. Lemon Squeezy test-mode checkout:
   - Confirm dashboard/app is in TEST MODE.
   - Use only public test card data.
   - Confirm checkout return, webhook entitlement, and Premium active state.

3. Mobile visual skim:
   - Profile card order and spacing.
   - Paywall modal readability/dismissibility.
   - Account card and map control overlap.

## Gate Notes

- This gate is not approval to deploy functions, enable live payments, or collect live money.
- Do not deploy functions as part of this gate.
- Do not enable live Lemon Squeezy or collect live money.
- Do not commit Playwright storage states.
- Firestore entitlement/payment/admin protections remain covered by rules tests.
- ORS key remains backend-only and ORS callables remain entitlement-gated.
