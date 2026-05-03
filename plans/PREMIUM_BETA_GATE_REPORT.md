# Premium Beta Gate Report

Date: 2026-05-03 03:47 EDT
Scope: New premium/internal app only.
Current app commit before this report: `4d50c1e`

## Verdict

GO for controlled premium beta with known manual checks still pending.

This is not a broad public launch approval. The security/payment/auth/runtime gates passed, Firestore rules are deployed for BUG-001, and signed-in free/premium/account-switch smoke is green. Keep Lemon Squeezy in test-mode workflows until the remaining manual checks are completed.

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
| signed-in `npm run test:e2e:smoke` | PASS 16/16 |
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

## Remaining Risks

- BUG-013 still needs human visual confirmation that Google shows the account chooser after Switch Account.
- One real Lemon Squeezy test-mode checkout is still useful as a final end-to-end sanity check after all auth/UI fixes.
- Mobile profile/paywall visual skim is still recommended on a real narrow viewport.
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

- Do not deploy functions as part of this gate.
- Do not enable live Lemon Squeezy or collect live money.
- Do not commit Playwright storage states.
- Firestore entitlement/payment/admin protections remain covered by rules tests.
- ORS key remains backend-only and ORS callables remain entitlement-gated.
