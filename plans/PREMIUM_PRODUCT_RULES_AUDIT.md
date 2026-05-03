# Premium Product Rules Audit

Date: 2026-05-03
Scope: New premium/internal app only.
Status: Initial audit opened after premium beta gate downgrade.

## Audit Table

| ID | Rule | Expected Free Behavior | Expected Premium Behavior | UI Gated? | Runtime Gated? | Backend/Rules Gated? | Test Coverage | Status |
|---|---|---|---|---|---|---|---|---|
| R01 | Free users can mark up to 20 parks visited. | Can add visits until exactly 20 official parks are visited; adding the 21st is blocked with clear copy. | Can exceed 20 visited parks. | Yes: panel shows a clear limit message when a free add is blocked. | Yes: `checkinService` blocks manual and GPS additions at 20 for signed-in non-premium users. | No count-aware backend gate yet; future callable/backend write path recommended for hard quota enforcement. | `bug015-free-visited-limit-smoke.spec.js` covers free 19->20 allowed, free 20->21 blocked, fake localStorage premium bypass blocked, removal at limit allowed, and GPS blocked at 20. | BUG-015 QC PASSED |
| R02 | Premium users can mark more than 20 parks visited. | Not applicable. | Can add the 21st and beyond. | Not blocked. | Yes: `premiumService.isPremium()` bypasses the free limit only for the current entitled user. | No count-aware backend gate yet; entitlement remains read-only client state backed by Firestore/backend. | `bug015-free-visited-limit-smoke.spec.js` covers premium 20->21 allowed and a following free context re-applying the limit. | BUG-015 QC PASSED |
| R03 | Free users cannot use premium route generation / ORS route tools. | Route generation appears disabled/upgrade-gated and click/action should not call ORS. | Can route through premium flow. | Yes: `#start-route-btn` is disabled, `aria-disabled`, labeled `Premium Route`, and styled as locked. | Yes: forced clicks and direct runtime path check `premiumService.isPremium()` before `services.ors.directions()`. | Yes for direct callable attempts: backend callable rejects non-premium before ORS transport. | `bug016-route-generation-gating-smoke.spec.js`, function tests, callable emulator tests. | BUG-016 QC PASSED |
| R04 | Premium users can use premium route generation. | Not applicable. | Route generation works through premium callable/backend path. | Yes: button remains enabled as `Generate Route`. | Yes: premium route generation reaches the ORS directions service path. | Yes: existing ORS callable allows active/manual_active. | `bug016-route-generation-gating-smoke.spec.js`, function tests, callable emulator tests. | BUG-016 QC PASSED |
| R05 | Free users cannot use global town/city search if it spends ORS geocode quota. | Global search should be locked/upgrade-gated and no ORS geocode request should be made. | Can use global search. | Likely | Likely | Backend callable rejects free users. | Existing premium-gating smoke and functions tests; audit remaining paths. | AUDIT PENDING |
| R06 | Premium users can use global town/city search. | Not applicable. | Global town/city search works. | Likely | Likely | Backend callable allows active/manual_active. | Existing tests partially cover. | AUDIT PENDING |
| R07 | Free users cannot enable premium clustering. | Toggle disabled and runtime setting forced false. | Can enable clustering. | Yes | Yes | Cloud settings payload sanitized client-side; no backend count/gate. | Existing premium-gating smoke. | QC PASSED |
| R08 | Premium users can enable premium clustering. | Not applicable. | Toggle works and persists. | Yes | Yes | No backend-only enforcement for UI preference. | Existing premium-gating smoke. | QC PASSED |
| R09 | Free users cannot use premium map styles / premium visited filters. | Premium styles/filters should reset to free-safe defaults. | Can use premium styles/filters. | Yes | Yes | Cloud settings payload sanitized client-side. | Existing premium-gating smoke. | QC PASSED |
| R10 | Premium users can use premium map styles / visited filters. | Not applicable. | Premium styles/filters work and persist. | Yes | Yes | No backend-only enforcement for UI preference. | Existing premium-gating smoke. | QC PASSED |
| R11 | Free users cannot use virtual/completed trail premium controls if those are paid. | Controls locked and click/action should not toggle overlays. | Can toggle overlays. | Likely | Likely | Not applicable unless backed by callable. | Existing premium-gating smoke partially covers. | AUDIT PENDING |
| R12 | Premium users can use virtual/completed trail controls. | Not applicable. | Controls toggle overlays. | Likely | Likely | Not applicable unless backed by callable. | Existing tests partially cover. | AUDIT PENDING |
| R13 | Checkout success URL never unlocks premium. | Success URL shows safe verification/sign-in state and never grants premium. | Premium active appears only after verified entitlement. | Yes | Yes | Firestore entitlement is source of truth. | Existing premium-gating smoke. | QC PASSED |
| R14 | Firestore/client cannot self-write entitlement. | Client writes to entitlement/payment/admin fields denied. | Same; entitlement changes must come from backend/admin. | Not a UI rule | Not a runtime client grant | Firestore rules enforce. | Rules tests 17/17. | QC PASSED |
| R15 | ORS callable rejects free users server-side. | Direct callable attempts fail before ORS transport. | Active/manual_active reaches ORS transport. | Not sufficient alone | Yes | Callable enforces entitlement server-side. | Function unit tests and callable emulator tests. | QC PASSED |

## Notes

- This audit is opened because the previous beta gate covered auth/payment/security better than product-tier rules.
- BUG-015 is now client/runtime QC passed, with a documented backend hard-quota gap if visited writes move behind a callable later.
- BUG-016 is now UI/runtime/backend QC passed.
- Backend/rules enforcement may not be feasible for every UI preference, but any quota/cost/data product rule must have more than a visual-only gate.
