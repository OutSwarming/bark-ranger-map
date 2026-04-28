# B.A.R.K. Ranger Map Logic Bug Triage

Date verified: 2026-04-28

This is the working tracker for the 17 reported logic bugs. Keep this file current as each bug is fixed so future work does not depend on chat history.

## How To Use This Tracker

1. Pick exactly one bug ID from the priority list.
2. Change `Status` to `In progress`.
3. Implement the smallest safe fix for that bug.
4. Add or run focused verification.
5. Update the bug entry with files changed, verification result, and `Status: Fixed`.

## Status Legend

- `Confirmed`: The reported failure pattern exists in the current code.
- `Partially confirmed`: The code has a related issue, but the report's exact scenario or severity needs correction.
- `Not confirmed`: The report describes behavior that does not currently follow from the code.
- `Design risk`: Not a current user-visible bug, but a fragile pattern worth tracking.
- `Fixed`: Patched and verified.

## Recommended Work Order

1. Bug 3 and Bug 8 together: map null/type guards around marker updates and search map movement.
2. Bug 4: guard `window.addStopToTrip` in geocode/GPS paths.
3. Bug 5: handle missing user documents in mileage logging.
4. Bug 6: guard missing marker layers in offline/no-cache handling.
5. Bug 9 and Bug 10: harden leaderboard sync/rank parsing.
6. Bug 12, Bug 14, Bug 15, Bug 17: lower-blast-radius cleanup.
7. Bug 11, Bug 13, Bug 16: maintenance notes unless they become user-visible.

## Summary

| ID | Reported Severity | Verification | Current Priority | Status |
| --- | --- | --- | --- | --- |
| 1 | Critical | Fixed by removing main-app God Mode and moving dev tools to admin page | Done | Fixed |
| 2 | Critical | Fixed with explicit date writes plus pending visited-place reconciliation | Done | Fixed |
| 3 | Critical | Fixed with reusable Leaflet map readiness guard | Done | Fixed |
| 4 | Critical | Fixed with guarded trip-node application and recoverable UI | Done | Fixed |
| 5 | Critical | Fixed with normalized mileage context and merged Firestore write | Done | Fixed |
| 6 | High | Fixed with safe marker-layer clearing in offline no-cache path | Done | Fixed |
| 7 | High | Fixed with shared pending visited-place reconciliation | Done | Fixed |
| 8 | High | Fixed by reusing the Leaflet map readiness helper in search | Done | Fixed |
| 9 | High | Fixed with defensive Firebase/auth/Firestore guards in leaderboard sync | Done | Fixed |
| 10 | High | Fixed with safe leaderboard rank parsing and rendering | Done | Fixed |
| 11 | Medium | Mostly not confirmed; settings store mirrors change behavior | P3 | Partially confirmed |
| 12 | Medium | Confirmed | P2 | Confirmed |
| 13 | Medium | Not a current bug; design risk | P3 | Design risk |
| 14 | Medium | Confirmed as low-risk stale UI closure | P3 | Confirmed |
| 15 | Medium | Confirmed, low practical impact | P3 | Confirmed |
| 16 | Low | Confirmed as naming/maintenance risk | P4 | Confirmed |
| 17 | Low | Confirmed for expedition history/completed expeditions; Manage Portal names are safe | P2 | Partially confirmed |

## Bug 1: God Mode Event Listeners Accumulate

Status: Fixed

Files:
- `services/authService.js:455`
- `services/authService.js:469`
- `services/authService.js:480`
- `services/authService.js:485`
- `services/authService.js`
- `modules/settingsController.js`
- `modules/expeditionEngine.js`
- `index.html`
- `pages/admin.html`
- `pages/admin.js`

Original evidence:
- The old God Mode long-press binding was inside `firebase.auth().onAuthStateChanged(...)`.
- Each auth-state callback created a new `godModeTimer` closure and bound listeners to `#user-profile-name`.
- The old code bound 6 listeners per callback: `touchstart`, `mousedown`, `touchend`, `mouseup`, `mouseleave`, `touchcancel`.
- Multiple bindings could make `triggerGodMode()` run more than once. Since it called `settingsGear.click()`, repeated firings could toggle the settings overlay open/closed/open.

Caveat:
- With Firebase Auth compat SDK 10.11.0, token refresh is normally handled by `onIdTokenChanged`, not `onAuthStateChanged`. Login/logout/page-load accumulation is still enough to confirm the bug.

Fix applied:
- Removed the God Mode long-press block from `services/authService.js`.
- Removed the hidden main-app `#dev-warp-container` from `index.html`.
- Removed main-app Trail Warp population from `modules/settingsController.js` and `modules/expeditionEngine.js`.
- Added admin-only Trail Warp and Set Walk Points tools to `pages/admin.html` / `pages/admin.js`, behind the existing Firebase admin bouncer.

Verification:
- `rg` finds no remaining `God Mode`, `godMode`, `dev-warp-container`, `dev-trail-warp-grid`, or `populateTrailWarpGrid` references in active main-app code.
- `#user-profile-name` is still looked up for display text only; no long-press listeners are attached there.
- Main-app settings gear no longer calls any dev warp population path.

Follow-up cleanup:
- `window.adminEditPoints` still exists in `services/firebaseService.js` even though the production UI entry point was removed. It is guarded by `window.isAdmin`, but moving or deleting it would further separate dev/admin utilities from the main bundle.
- `config/domRefs.js` still exposes `devWarpContainer` and `devTrailWarpGrid` refs for removed DOM ids. This is harmless but stale.

## Bug 2: Visit Date Update Can Be Overwritten By Snapshot Replacement

Status: Fixed

Files:
- `services/firebaseService.js:72`
- `services/firebaseService.js:80`
- `services/firebaseService.js:105`
- `services/firebaseService.js:109`
- `services/authService.js:212`
- `services/authService.js:215`
- `services/checkinService.js`
- `modules/profileEngine.js`

Original evidence:
- `updateVisitDate()` mutates the object stored in `window.BARK.userVisitedPlaces`.
- `handleVisitedPlacesSync()` replaces the entire Map on every snapshot.
- This creates a real stale-snapshot risk for local UI state.

Correction to report:
- The exact sequence "snapshot replaces the Map while `syncUserProgress()` is awaiting, then `syncUserProgress()` writes the old timestamp" is not supported by the current control flow.
- `syncUserProgress()` constructs `visitedArray` synchronously at `services/firebaseService.js:80` before the Firestore `await`, so the write payload is captured before another event can replace `window.BARK.userVisitedPlaces`.

Original remaining risk:
- A stale snapshot can still repaint the local Map/UI with old data before a newer server snapshot arrives.
- Other writes after a stale replacement could persist old state.

Chosen strategy:
- Make `updateVisitDate()` produce a fresh array from the intended post-update Map and write that explicit array.
- Track local pending visited-place mutations by id/timestamp and ignore or merge older cache snapshots.
- Consider replacing full Map snapshots with a merge that preserves newer local pending records.

Fix options and tradeoffs:

Option A: Narrow explicit-write fix in `updateVisitDate()`
- Approach: Clone the current Map, clone the target place with the new `ts`, write that explicit array through `updateCurrentUserVisitedPlaces()`, then update local state/render after the write succeeds.
- Pros: Smallest code change; directly addresses date-update rollback risk; easy to test in Manage Portal; low chance of breaking check-in or marker rendering.
- Cons: Does not solve the broader stale-snapshot replacement pattern; GPS optimistic check-in flicker from Bug 7 can still happen; future visited-place writes may repeat the same race if they call `syncUserProgress()` from mutable global state.

Option B: Pending-local-mutations guard for `visitedPlaces`
- Approach: Record pending local writes by place id and mutation timestamp/version. In `handleVisitedPlacesSync()`, merge or preserve pending local records when a cache/stale snapshot arrives, and clear the pending entry once a server snapshot confirms it.
- Pros: Fixes Bug 2 and materially helps Bug 7; creates a reusable sync pattern for update, remove, manual mark, and GPS check-in; better user experience on slow/offline-ish connections.
- Cons: More moving parts; requires careful handling for deletes as well as updates; needs tests/manual scenarios for cache snapshot, server snapshot, failed write, and logout/user switch.

Option C: Transaction/server-authoritative update for date edits
- Approach: Update only the matching `visitedPlaces` entry using a Firestore transaction or a read-modify-write against the server doc, then let the snapshot hydrate local state.
- Pros: Strongest server consistency for date edits; avoids writing from a potentially stale global Map; clean ownership model where Firestore snapshot remains authoritative.
- Cons: Firestore arrays are awkward for targeted element updates, so the transaction still rewrites the array; UI may feel less responsive unless paired with optimistic local state; does not by itself prevent cache snapshots from briefly repainting old data.

Recommended path:
- Start with Option A for a tight Bug 2 fix.
- Immediately follow with the shared pending-mutation layer from Option B when tackling Bug 7, because both bugs come from the same full-Map snapshot replacement pattern.
- Avoid Option C unless we decide visited-place writes need transaction-level conflict handling across tabs/devices.

Fix applied:
- Added a small pending visited-place mutation layer in `services/firebaseService.js`.
- `updateVisitDate()` now clones the Map, clones the target place with the new `ts`, updates local state through `replaceLocalVisitedPlaces()`, and writes an explicit visited-place array through `updateCurrentUserVisitedPlaces()`.
- `handleVisitedPlacesSync()` now reconciles Firestore snapshots through `reconcileVisitedPlacesSnapshot(placeList, doc.metadata)` instead of blindly replacing the Map.
- Pending local upserts/deletes are preserved through cache snapshots and snapshots with `metadata.hasPendingWrites`.
- Authoritative server snapshots clear matching pending mutations once they confirm the local write.
- Failed date/remove writes clear the pending mutation and restore the previous local Map.
- Manage Portal date update button now disables during the write and shows a failure alert instead of firing the success alert after a rejected update.

Verification:
- Updating a visit date remains stable through cache snapshots, server snapshots, and portal re-render.
- While a date update is pending, a stale snapshot does not permanently overwrite the chosen date.
- Failed writes leave the UI in a clear recoverable state instead of silently claiming success.

## Bug 3: `updateMarkers()` Crashes When `window.map` Is Missing

Status: Fixed

Files:
- `modules/renderEngine.js:242`
- `modules/renderEngine.js:248`
- `modules/renderEngine.js:268`
- `modules/renderEngine.js:283`
- `core/app.js:106`
- `core/app.js:107`

Original evidence:
- `syncState()` gates marker updates on `isMapViewActive()` and zoom state, not on a usable Leaflet map.
- `updateMarkers()` reads `const map = window.map` and immediately calls `map.getZoom()`.
- If map init fails before a Leaflet map is assigned, this throws.

Caveat:
- The report says this happens "every RAF"; the code schedules one RAF per `syncState()` call. Repeated callers can still make it noisy, but it is not an autonomous RAF loop.

Fix options and tradeoffs:

Option A: Minimal local guard in `updateMarkers()`
- Approach: Add `if (!window.map) return;` at the top of `updateMarkers()`.
- Pros: Tiny patch; directly prevents the reported `map.getZoom()` crash.
- Cons: Does not protect `syncState()` / `getMarkerVisibilityStateKey()` from non-null invalid map values; does not create a reusable pattern for Bug 8; easy for future code to repeat weak `typeof map` checks.

Option B: Reusable Leaflet map readiness helper
- Approach: Add `isUsableLeafletMap(map)` and `getUsableMap()`, require core Leaflet methods before using the map, and use the helper in `syncState()`, marker visibility keys, viewport readiness, and `updateMarkers()`.
- Pros: Fixes the current crash and makes map availability a named contract; protects against `null`, `undefined`, and accidental DOM globals; can be reused for Bug 8 search/geocoder map movement; keeps future code cleaner.
- Cons: Slightly broader change; callers still need to adopt the helper outside renderEngine before Bug 8 is fixed.

Option C: Disable map-dependent feature boot when `initMap()` fails
- Approach: Have boot avoid initializing/rendering map-dependent modules if `window.map` is unavailable.
- Pros: Strong separation between degraded no-map mode and normal map mode.
- Cons: Larger boot-order refactor; higher risk; does not by itself protect exported functions that can still be called manually or by delayed async work.

Chosen strategy:
- Add a Leaflet-map readiness guard before `updateMarkers()` is called and at the top of `updateMarkers()`.
- Treat `window.map` as valid only if it has required methods such as `getZoom`, `getBounds`, and `getContainer`.
- Prefer Option B because it fixes Bug 3 cleanly while preparing the shared helper needed for Bug 8.

Fix applied:
- Added `window.BARK.isUsableLeafletMap(map)` and `window.BARK.getUsableMap()` in `modules/renderEngine.js`.
- `isMapViewportReady()`, `shouldCullPlainMarkers()`, and `getMarkerVisibilityStateKey()` now use the usable-map contract instead of trusting `window.map`.
- `syncState()` marks marker sync pending and skips marker diffing when no usable map exists.
- `updateMarkers()` returns early and marks marker sync pending if a usable map is unavailable.

Verification:
- Simulate `window.map = null` and call `window.syncState()`; no exception is thrown.
- Map-unavailable overlay remains the only visible failure mode.
- `node --check modules/renderEngine.js` passes.

## Bug 4: `executeGeocode()` Calls `window.addStopToTrip` Without Guard

Status: Fixed

Files:
- `modules/searchEngine.js:606`
- `modules/searchEngine.js:610`
- `modules/searchEngine.js:633`
- `modules/searchEngine.js:639`
- `modules/searchEngine.js:684`

How a user can trigger it:
- The trip planner init fails during boot, so `window.addStopToTrip` is never defined.
- A signed-in user uses Premium global search from the main search bar for a custom town/city, for example "Denver".
- The geocoder returns a stop result and `executeGeocode()` tries to add it as a planner stop.
- Before the fix, `window.addStopToTrip(node)` threw `TypeError: window.addStopToTrip is not a function`.
- The same crash could happen through "My Location" / "Current Location" if the browser returned GPS coordinates and the target was a stop.

What used to happen:
- Standard geocode path: the outer catch showed a generic "Search service unavailable" alert, even though geocoding succeeded and the planner API was the missing part.
- GPS path: the success callback was outside the geocoder `try/catch`, so the error was uncaught.
- In some paths the input could remain stuck showing "Searching..." or "Locating GPS...".

Original evidence:
- GPS "my location" path calls `window.addStopToTrip(node)` with no guard.
- Single-result geocode path calls it with no guard.
- Multi-result disambiguation click path calls it with no guard.
- Standard geocode failures are caught by the outer `try/catch`, but the UI input is not reset in the catch.
- GPS geolocation success callback runs outside that `try/catch`, so its crash is uncaught.

Fix options and tradeoffs:

Option A: Add inline `typeof window.addStopToTrip` checks at each call site
- Approach: Patch the three direct geocode/GPS `addStopToTrip` calls individually.
- Pros: Smallest possible patch; quickly prevents the crash.
- Cons: Keeps repeated start/end/stop branching; easy for future paths to miss the guard; failure UI/reset behavior can drift between call sites.

Option B: Centralize trip-node application in search
- Approach: Create `applyTripNodeSelection(type, node, options)` to handle start, end, and stop targets in one place, returning `true` or `false` and optionally alerting on failure.
- Pros: One linear path for local search, geocode search, and GPS search; keeps planner-unavailable behavior consistent; makes the call sites read as "apply node, then update search UI/map".
- Cons: Still depends on the global planner API because that is the current app contract; does not refactor `tripPlannerCore.js` into an imported service.

Option C: Formal trip-planner service object
- Approach: Move start/end/stop application into a `window.BARK.services.tripPlanner` API and have all callers use it.
- Pros: Best long-term boundary; removes direct reliance on global `window.addStopToTrip`.
- Cons: Bigger refactor that touches planner core, panel renderer, and route rendering; higher regression risk than needed for this bug.

Chosen strategy:
- Use Option B now.
- Keep Option C as a future detangling target if more planner-global bugs appear.

Fix applied:
- Added `applyTripNodeSelection(type, node, { alertOnFailure })` in `modules/searchEngine.js`.
- Local planner search now routes through that helper instead of directly touching `window.addStopToTrip`.
- GPS "My Location", single-result geocode, and disambiguation geocode all call the helper before clearing inputs or moving the map.
- If stop insertion is unavailable or throws, the user sees "Trip planner is unavailable right now. Please refresh and try again."
- Search/inline status fields are cleared on planner-unavailable failure, including "Searching..." and "Locating GPS...".

What happens now:
- If the trip planner is healthy, behavior is unchanged: start/end bookends are assigned, stops are added through `addStopToTrip`, and map movement still happens when allowed.
- If `addStopToTrip` is missing, the geocode/GPS handler exits cleanly, clears the temporary status text, logs a targeted warning/error, and does not crash the app.

Verification:
- Delete or stub `window.addStopToTrip`, run geocode and GPS stop flows, and confirm no uncaught exception or stuck "Searching..." UI.
- `node --check modules/searchEngine.js` passes.

## Bug 5: `processMileageAddition()` Crashes If User Document Is Missing

Status: Fixed

Files:
- `modules/expeditionEngine.js:356`
- `modules/expeditionEngine.js:377`
- `modules/expeditionEngine.js:389`
- `modules/expeditionEngine.js:402`

How a user can trigger it:
- A brand-new user signs in before their `users/{uid}` Firestore document has been written.
- The user logs manual miles or starts/stops a GPS walk from the expedition UI.
- Before the fix, `processMileageAddition()` read `docSnap.data()` and immediately accessed `userData.lifetime_miles`.
- If the doc was missing or empty, `docSnap.data()` returned `undefined`, causing a `TypeError`.

Expected user result:
- The walk should save even if the profile document has not been bootstrapped yet.
- Lifetime miles and walk points should increment.
- If the user has an active virtual expedition, progress and history should update.
- If the user does not have an active expedition yet, the miles should still be preserved as a general walk instead of creating fake trail progress.

Original evidence:
- `docSnap.data()` can be `undefined`.
- The next line reads `userData.lifetime_miles`, which throws.
- Nearby `assignTrailToUser()` correctly uses `doc.data() || {}`.
- The catch logs "Failed to log miles" but does not preserve the walk or present useful recovery.

Fix options and tradeoffs:

Option A: Minimal null guard only
- Approach: Change `const userData = docSnap.data();` to `const userData = docSnap.data() || {};`.
- Pros: Tiny patch; fixes the immediate `lifetime_miles` crash.
- Cons: The later `userRef.update(...)` still fails when the user doc does not exist; still risks creating misleading `0 / 10` "Active Trail" state for users without an active expedition.

Option B: Normalize mileage context and write with merge
- Approach: Normalize the user document into one mileage context, save with `set(..., { merge: true })`, and branch rendering based on whether an active expedition exists.
- Pros: Handles missing docs and empty docs; keeps mileage behavior in one readable path; avoids fake expedition progress; preserves the walk as "General Walk" when no trail is active.
- Cons: Slightly larger patch; keeps history under `virtual_expedition.history` because that is the current app model for walk logs.

Option C: Require an active expedition before any mileage can be logged
- Approach: Block manual/GPS mileage logging unless `virtual_expedition.active_trail` exists.
- Pros: Stronger domain rule; no general-walk fallback.
- Cons: Worse user recovery; a real GPS walk could be discarded because of profile bootstrap timing; does not match the current points/lifetime-mile model.

Chosen strategy:
- Use Option B.
- Keep the function linear: read data, normalize context, build one log entry, save one merged payload, then render active-expedition or lifetime-only UI.

Fix applied:
- Added `getMileageContext(userData)` to safely normalize missing profile docs and missing expedition data.
- Added `updateLifetimeMilesDisplay(lifetimeMiles)` for the no-active-expedition path.
- `processMileageAddition()` now uses `docSnap.data() || {}` and writes with `userRef.set(..., { merge: true })`.
- Missing active expedition now records the walk as `General Walk`, increments `lifetime_miles` and `walkPoints`, and avoids fake trail progress/completion alerts.
- Manual-mile logging now waits for the save result and only clears the input after a successful write.

Verification:
- New/missing user document can log manual and GPS miles without `TypeError`.
- Existing users with active expeditions still update progress, history, lifetime miles, and walk points.
- Failed writes leave the manual-mile input intact and show a user-visible retry message.
- `node --check modules/expeditionEngine.js` passes.
- Stubbed missing-document smoke test saves a merged payload with a `General Walk` history entry and lifetime/walk-point increments.

## Bug 6: Offline + No Cache + Missing Marker Layer Crashes `loadData()`

Status: Fixed

Files:
- `modules/dataService.js:391`
- `modules/dataService.js:403`
- `modules/dataService.js:432`
- `modules/dataService.js:436`

How a user can trigger it:
- The browser cannot initialize the Leaflet map, for example because the Leaflet/CDN script is blocked or slow.
- `window.BARK.markerLayer` is never created by `mapEngine.js`.
- The user is offline.
- The device has no cached CSV in `localStorage`.
- The user is not logged in as Premium, so `localStorage.premiumLoggedIn !== 'true'`.
- Boot calls `window.BARK.loadData()`, which enters the offline/no-cache/non-premium branch.

What the user saw before:
- The app showed the alert: "Network disconnected. Log in via the Profile tab to enable Premium Offline Mode."
- Immediately after the alert, `window.BARK.markerLayer.clearLayers()` threw because `markerLayer` was missing.
- The console showed `TypeError: Cannot read properties of undefined`.
- The map-unavailable state already existed, but the crash added another failure on top of it.

What the user sees now:
- The same offline/Premium alert appears.
- The app safely skips marker-layer cleanup when the map layers were never created.
- No uncaught exception is thrown.
- If marker layers do exist, they are cleared normally.

Original evidence:
- Offline, non-premium, no-cache path calls `window.BARK.markerLayer.clearLayers()` without checking `markerLayer`.
- If `initMap()` failed before marker layers were assigned, this throws.

Correction to report:
- The alert is currently before `clearLayers()`, so the "Network disconnected..." alert should show before the crash.

Fix options and tradeoffs:

Option A: Inline guard in `loadData()`
- Approach: Replace the direct call with `if (window.BARK.markerLayer) window.BARK.markerLayer.clearLayers()`.
- Pros: Very small patch; fixes the reported `undefined.clearLayers()` crash.
- Cons: Repeats fragile layer knowledge in `loadData()`; only clears the plain marker layer; does not handle a malformed layer object or future cluster-layer cleanup.

Option B: Add a small safe-clear helper
- Approach: Add `clearLayerSafely(layer, label)` and `clearMarkerLayersSafely()`, then call the helper from the offline/no-cache path.
- Pros: Keeps `loadData()` linear; handles missing or malformed layers; clears both plain and cluster layers when present; gives future map-failure paths one safe API to reuse.
- Cons: Slightly more code than an inline guard; still lives in `dataService.js` until marker cleanup has a dedicated module.

Option C: Move marker cleanup into `MarkerLayerManager`
- Approach: Add a manager-level `clear()` API and have data loading call only the manager.
- Pros: Best long-term ownership boundary; marker internals stay with the marker manager.
- Cons: Broader refactor for a narrow bug; does not help when the manager was never created because map init failed.

Chosen strategy:
- Use Option B now.
- Keep `loadData()` readable: alert, safe cleanup, return.
- Leave Option C as a future cleanup if marker lifecycle work grows.

Fix applied:
- Added `clearLayerSafely(layer, label)` in `modules/dataService.js`.
- Added `clearMarkerLayersSafely()` to clear `markerLayer` and `markerClusterGroup` only when they exist and expose `clearLayers()`.
- `loadData()` now calls `clearMarkerLayersSafely()` instead of directly calling `window.BARK.markerLayer.clearLayers()`.
- Exported `window.BARK.clearMarkerLayersSafely` for future degraded-map paths.

Verification:
- With `navigator.onLine = false`, no cached CSV, and no marker layer, `loadData()` shows the offline message and does not throw.
- `node --check modules/dataService.js` passes.
- Stubbed offline/no-cache/no-marker smoke test passes.

## Bug 7: Optimistic Check-In Can Be Replaced By Cached Firestore Snapshot

Status: Fixed

Files:
- `services/checkinService.js:134`
- `services/checkinService.js:138`
- `services/checkinService.js:142`
- `services/authService.js:212`
- `services/authService.js:215`
- `services/authService.js:548`
- `services/firebaseService.js`

Original evidence:
- GPS check-in mutates the local Map optimistically before awaiting Firestore.
- Firestore snapshot handling replaces the entire Map from `data.visitedPlaces`.
- The snapshot handler does not distinguish cache snapshots, server snapshots, or local pending writes for visited places.

Caveat:
- Whether the user sees a flash depends on Firestore event ordering and cache state. The full-replacement pattern is real, but the exact flicker timing is environment-dependent.

Chosen strategy:
- Preserve local pending check-ins until a server snapshot confirms or rejects them.
- Ignore stale cache snapshots for `visitedPlaces` after a local mutation, or merge by id using newest timestamp.
- Use `doc.metadata.fromCache` and `doc.metadata.hasPendingWrites` deliberately.

Fix applied:
- `verifyGpsCheckin()` stages the optimistic visit as a pending upsert before writing to Firestore.
- Manual mark-as-visited stages pending upserts, and removals stage pending deletes.
- `handleVisitedPlacesSync()` preserves pending local records when stale cache or local-write snapshots arrive.
- Check-in and manual visit write failures clear the pending mutation and restore the previous local Map.
- Pending mutations are cleared on logout/runtime reset to prevent user-switch leakage.

Verification:
- Slow/offline/cached snapshots do not visually remove an optimistic GPS check-in that is still pending.
- A failed check-in write rolls the local Map back instead of leaving a false visited pin.

## Bug 8: `typeof map !== 'undefined'` Does Not Prove A Usable Map

Status: Fixed

Files:
- `modules/searchEngine.js:254`
- `modules/searchEngine.js:256`
- `modules/searchEngine.js:397`
- `modules/searchEngine.js:658`
- `modules/searchEngine.js:701`
- `modules/renderEngine.js:106`

Original evidence:
- `shouldMoveMapForSearchResult()` only checks `typeof map !== 'undefined'`.
- Calls later assume `map.setView(...)` exists.
- Local search suggestion click has a similar check at `modules/searchEngine.js:397`.
- If map init fails, `map` can be `null`, undefined, or even a non-Leaflet browser global from the `id="map"` element. None are safe.

Fix options and tradeoffs:

Option A: Replace `typeof map` checks with `window.map && window.map.setView`
- Approach: Patch each search call site with a direct method check before moving the map.
- Pros: Smallest code change; removes the immediate `null.setView` crash.
- Cons: Repeats map-readiness logic; only checks `setView`, not whether the object is a real usable Leaflet map; keeps search coupled to a bare global.

Option B: Reuse the render layer's usable-map helper
- Approach: Add a search-local `getSearchMovementMap(targetType)` that enforces target type, auto-move setting, active map view, and `window.BARK.getUsableMap()`.
- Pros: Linear call sites: get map, move if present; reuses the map contract from Bug 3; avoids bare `map`; keeps all search movement rules in one helper.
- Cons: Depends on `renderEngine.js` continuing to load before `searchEngine.js`; includes a small fallback for resilience.

Option C: Disable all map movement from search when map boot fails
- Approach: Gate search movement globally based on boot errors or map-unavailable state.
- Pros: Very explicit degraded-mode behavior.
- Cons: More coupling to boot state; still needs method guards for direct calls; does not simplify call sites as much.

Chosen strategy:
- Use Option B.
- Do not fix `window.addStopToTrip` here; that is Bug 4 and should remain a separate, focused trip-planner API guard.

Fix applied:
- Replaced `shouldMoveMapForSearchResult()` with `getSearchMovementMap(targetType)` in `modules/searchEngine.js`.
- Local search suggestion selection now uses `getSearchMovementMap('stop')` before calling `setView`.
- Single-result and disambiguation geocoder paths now call `movementMap.setView(...)` only when a usable map is returned.
- Removed remaining bare `map.setView` and `typeof map !== 'undefined'` checks from active search code.

Verification:
- Search result selection and geocoder selection do not throw when the Leaflet map is unavailable.
- `node --check modules/searchEngine.js` passes.
- `rg` finds no remaining `typeof map` or bare `map.setView` in `modules/searchEngine.js`.

## Bug 9: `syncScoreToLeaderboard()` Lacks A Firebase Guard

Status: Fixed

Files:
- `modules/profileEngine.js:88`
- `modules/profileEngine.js:99`
- `modules/profileEngine.js:110`
- `modules/profileEngine.js:121`
- `modules/profileEngine.js:138`
- `modules/profileEngine.js:159`

How a user can trigger it:
- Firebase Auth or Firestore fails to load, or is temporarily unavailable during boot.
- A code path calls the exported `window.BARK.syncScoreToLeaderboard()` function directly.
- Realistic callers include expedition mileage updates, walk-log edits/deletes, and reward claiming after those flows have changed points.
- Before the fix, `syncScoreToLeaderboard()` immediately called `firebase.auth().currentUser` before any guard or `try/finally`.

What the user saw before:
- If Firebase was unavailable, the call threw `ReferenceError: firebase is not defined` or an auth/firestore access error.
- In achievement evaluation, the originally reported path was mostly guarded, so that exact Firebase-CDN scenario was less likely than the report claimed.
- In direct exported-function callers, the failed leaderboard sync could bubble into the caller's catch and show a generic action failure, even though the local action had otherwise completed.

Expected user result:
- Missing Firebase should not crash profile, achievement, mileage, or reward UI.
- The local score/points flow should continue.
- Leaderboard sync should simply skip until Firebase/Auth/Firestore are available again.

What the user sees now:
- No crash when `syncScoreToLeaderboard()` is called without Firebase.
- No leaderboard write is attempted unless there is a current Firebase user and a usable Firestore instance.
- Existing healthy Firebase behavior is unchanged.

Original evidence:
- `syncScoreToLeaderboard()` directly calls `firebase.auth().currentUser` before its `try/finally`.
- If called while Firebase is unavailable, it throws.

Correction to report:
- The specific path `evaluateAchievements() -> syncScoreToLeaderboard()` is guarded by `userId`, which is only set when `typeof firebase !== 'undefined'`.
- Therefore, Firebase CDN failure should not call `syncScoreToLeaderboard()` through that achievement path.

Remaining risk:
- Other callers, especially expedition flows, call `window.BARK.syncScoreToLeaderboard()` after code that already assumes Firebase exists.
- The function should still be self-defensive because it is exported on `window.BARK`.

Fix options and tradeoffs:

Option A: Inline `typeof firebase` guard in `syncScoreToLeaderboard()`
- Approach: Add one early return before `firebase.auth().currentUser`.
- Pros: Smallest patch; fixes the reported ReferenceError.
- Cons: Still leaves Firestore access as a second unguarded assumption; does not make the exported function's dependency contract obvious.

Option B: Small Firebase access helpers
- Approach: Add `getCurrentFirebaseUser()` and `getFirestoreForLeaderboardSync()`, each returning `null` when Firebase/Auth/Firestore is unavailable.
- Pros: Keeps `syncScoreToLeaderboard()` linear; guards both Auth and Firestore; makes skip behavior explicit; avoids scattering checks across expedition/profile callers.
- Cons: Slightly more code than a one-line guard; still uses the global Firebase SDK because that is the app's current architecture.

Option C: Move leaderboard sync behind an injected service
- Approach: Create a leaderboard service that receives Firebase/Auth dependencies at boot and exposes a no-op implementation when unavailable.
- Pros: Cleanest long-term boundary; removes direct Firebase globals from profile code.
- Cons: Larger boot-order/service refactor; too much blast radius for this narrow bug.

Chosen strategy:
- Use Option B now.
- Keep every caller using `window.BARK.syncScoreToLeaderboard()`, but make that exported function safe and self-contained.

Fix applied:
- Added `getCurrentFirebaseUser()` in `modules/profileEngine.js`.
- Added `getFirestoreForLeaderboardSync()` in `modules/profileEngine.js`.
- Added `getLeaderboardServerTimestamp()` so a partially available Firestore SDK does not crash while building the leaderboard payload.
- `syncScoreToLeaderboard()` now returns early when Firebase/Auth/Firestore is unavailable.
- `window.BARK.incrementRequestCount()` is now called only if it exists.

Verification:
- Calling `window.BARK.syncScoreToLeaderboard()` with Firebase unavailable returns without throwing.
- `node --check modules/profileEngine.js` passes.
- Stubbed no-Firebase and no-Firestore smoke tests pass.

## Bug 10: Leaderboard Rank Can Become NaN

Status: Fixed

Files:
- `modules/profileEngine.js:493`
- `modules/profileEngine.js:499`
- `modules/profileEngine.js:505`
- `modules/profileEngine.js:529`
- `modules/profileEngine.js:669`
- `modules/profileEngine.js:717`

How a user can trigger it:
- The user is signed in and opens the leaderboard.
- The user is not in the first five leaderboard rows, so the app asks Firestore REST aggregation for their exact rank.
- The REST request succeeds, but the response shape is malformed, empty, or missing `aggregateFields.rankCount.integerValue`.
- Before the fix, `parseInt(undefined)` produced `NaN`, then `exactRank` could become `NaN`.
- The same parsing path existed in initial leaderboard load and in "Show More".

What the user saw before:
- The personal rank label usually avoided literal `Rank: NaN` because `NaN` is falsy in the earlier label calculation.
- The pinned personal row could still render `#NaN` because it passed `personalUserObj.exactRank` directly into `createRow(...)`.
- In the "Show More" path, malformed rank parsing could prevent the fallback personal row from being added at all.

Expected user result:
- A malformed or unavailable exact-rank response should never leak `NaN` into the UI.
- If exact rank is known, show the real rank.
- If exact rank is unknown, show a safe placeholder such as `Rank: --` and `#--` in the pinned row.
- Top-five rows should keep using their visible list rank.

What the user sees now:
- Exact rank displays normally when Firestore REST returns a valid count.
- Malformed aggregation responses render `Rank: --` and `#--`.
- The personal fallback row is still shown after initial load or "Show More", even if exact rank parsing fails.

Original evidence:
- `parseInt(undefined)` can produce `NaN` if the aggregation response has `rankCount` but no `integerValue`.
- That can set `exactRank` to `NaN`.

Correction to report:
- The personal rank label probably will not display `Rank: NaN` because `if (user.isPersonalFallback && user.exactRank)` treats `NaN` as falsy and falls back to the array index.
- The pinned personal row can still be rendered with `createRow(personalUserObj, personalUserObj.exactRank, true)`, which can show `#NaN`.

Fix options and tradeoffs:

Option A: Guard only the REST parse
- Approach: Parse with `Number.parseInt(value, 10)` and assign `exactRank` only if the result is finite.
- Pros: Small patch; prevents `exactRank = NaN` at the source.
- Cons: Rendering still accepts unsafe rank values from cached data or future callers; pinned rows can still display `#null` or odd values if data was already polluted.

Option B: Safe parse plus safe render contract
- Approach: Add helpers to normalize ranks, format ranks, parse REST counts, and build personal fallback rows.
- Pros: Prevents NaN at input and output; fixes initial load and "Show More"; gives leaderboard rendering one clear rank contract; keeps the UI fallback consistent.
- Cons: Slightly more code; still leaves the Firestore REST aggregation approach in place.

Option C: Remove exact-rank REST lookup
- Approach: Only show visible-list rank and stop trying to calculate exact rank for users outside the loaded page.
- Pros: Simplest UI/data flow; no REST aggregation fragility.
- Cons: Loses a useful user-facing feature; users outside the top page would no longer know their real rank.

Chosen strategy:
- Use Option B.
- Keep exact rank when it is available, but treat malformed rank data as unknown instead of numeric.

Fix applied:
- Added `getSafeLeaderboardRank(rank)` in `modules/profileEngine.js`.
- Added `formatLeaderboardRank(rank)` so unknown ranks display as `--`.
- Added `parseLeaderboardRankCount(countData)` to validate REST aggregation responses.
- Added `buildPersonalLeaderboardFallback(...)` so initial load and "Show More" build the same safe fallback row.
- `renderLeaderboard()` now uses the same safe rank for the personal rank label, pinned row badge, top-three styling, and rivalry calculation.
- Initial load and "Show More" now push the personal fallback row even when exact rank parsing fails.

Verification:
- Malformed aggregation responses produce `Rank: --` or fallback rank, never `NaN`/`#NaN`.
- `node --check modules/profileEngine.js` passes.
- Stubbed malformed aggregation smoke test confirms no `NaN` leaks into the leaderboard label or pinned row.

## Bug 11: Ultra Low Toggle Bypasses Settings Store

Status: Partially confirmed

Files:
- `state/settingsStore.js:227`
- `state/settingsStore.js:235`
- `state/settingsStore.js:256`
- `modules/settingsController.js:318`
- `modules/settingsController.js:319`
- `modules/settingsController.js:340`
- `modules/settingsController.js:353`

Evidence:
- The current settings store installs legacy `window.*` property setters.
- Assignments such as `window.ultraLowEnabled = isEnabled`, `window.rememberMapPosition = ...`, and `window.startNationalView = ...` route through `settingsStore.set()`.

Correction to report:
- `rememberMapPosition` and `startNationalView` are not bypassing the store in the current code.
- `ultraLowEnabled` itself is not bypassing the store.

Remaining risk:
- The Ultra Low handler also writes related keys directly to localStorage. On disable, `lowGfxEnabled`, `instantNav`, and `simplifyTrails` localStorage values are changed without corresponding store updates/listener notifications before reload.
- The 150ms reload window makes this low priority, but the handler is still redundant and easy to simplify.

Likely fix:
- Use `settingsStore.set('ultraLowEnabled', isEnabled)` explicitly.
- Let the store own preset side effects.
- Remove redundant direct localStorage writes or replace them with store calls if disabling should actively change related settings.

Verification:
- Store `onChange()` listeners fire for every setting whose effective value changes.

## Bug 12: Manage Portal Visit Dates Display In UTC

Status: Confirmed

Files:
- `modules/profileEngine.js:48`
- `modules/profileEngine.js:50`
- `modules/profileEngine.js:58`

Evidence:
- Date input is populated with `new Date(place.ts).toISOString().split('T')[0]`.
- `toISOString()` converts to UTC, which can shift local evening visits into the next day.
- Update path creates local-noon timestamps, so display and edit semantics are inconsistent.

Likely fix:
- Format date input from local date parts: `getFullYear()`, `getMonth() + 1`, `getDate()`.
- Keep the local-noon write strategy.

Verification:
- A timestamp for 9:30 PM Pacific displays the same Pacific calendar date.

## Bug 13: Daily Streak Uses Non-Transactional Read/Write

Status: Design risk

Files:
- `services/firebaseService.js:28`
- `services/firebaseService.js:35`
- `services/firebaseService.js:45`
- `services/firebaseService.js:54`

Evidence:
- The function reads the user doc, computes the streak, then writes it back without a Firestore transaction.

Correction to report:
- The described two-tab scenario still writes the same absolute `oldStreak + 1` value, so the streak does not double-increment today.
- This is a fragility note, not a current data corruption bug.

Likely fix:
- Leave as-is unless streak logic becomes more complex, or wrap it in a transaction while touching nearby Firestore sync code.

Verification:
- Two same-day concurrent calls keep one increment.

## Bug 14: Manage Portal Remove Button Captures A Stale Place Object

Status: Confirmed

Files:
- `modules/profileEngine.js:23`
- `modules/profileEngine.js:37`
- `services/firebaseService.js:119`
- `services/firebaseService.js:122`

Evidence:
- Remove button captures the `place` object from the render-time array.
- `removeVisitedPlace(place)` deletes by `place.id`, so normal same-id snapshots still work.

Risk:
- Confirmation text can be stale if the place changed between render and click.
- If the place was already removed/replaced before click, the delete can be a no-op and still write the current Map.

Likely fix:
- Pass `place.id` and look up the latest place at click time.
- If not found, re-render and show a stale-state message.

Verification:
- A snapshot between render and click does not remove or confirm stale data incorrectly.

## Bug 15: `seenHashes` Grows Without Bound

Status: Confirmed

Files:
- `modules/dataService.js:264`
- `modules/dataService.js:300`
- `modules/dataService.js:304`
- `modules/dataService.js:398`

Evidence:
- `seenHashes` is module-scoped and never pruned.
- Polling every 5 minutes means normal growth is tiny, but the structure is unbounded.

Likely fix:
- Cap to a small number such as 32 or 64 recent hashes.
- Prune oldest entries after insert.

Verification:
- After many simulated unique hashes, `seenHashes.size` stays under the cap.

## Bug 16: `isMapViewActive()` Name Is Easy To Misread

Status: Confirmed

Files:
- `modules/renderEngine.js:102`
- `modules/renderEngine.js:103`
- `modules/uiController.js:119`
- `modules/uiController.js:120`

Evidence:
- The map view is represented by no `.ui-view.active`; other sections add `.ui-view.active`.
- `isMapViewActive()` returns `!document.querySelector('.ui-view.active')`.

Risk:
- Current callers are consistent, but the representation is surprising.

Likely fix:
- Either add a clarifying comment or rename to `isMapVisibleByDefaultViewState()`.
- Avoid broad rename unless touching this area for map-availability guards.

Verification:
- Existing map/nav behavior unchanged.

## Bug 17: Expedition Rendering Uses `innerHTML` With User-Influenceable Data

Status: Partially confirmed

Files:
- `modules/expeditionEngine.js:456`
- `modules/expeditionEngine.js:459`
- `modules/expeditionEngine.js:481`
- `modules/expeditionEngine.js:485`
- `modules/expeditionEngine.js:630`
- `modules/expeditionEngine.js:636`
- `modules/profileEngine.js:30`
- `modules/profileEngine.js:31`

Evidence:
- Completed expeditions render `exp.name || exp.trail_name` through `innerHTML`.
- Expedition history renders `log.type` and grouped `trail` names through `innerHTML`.
- `editWalkMiles()` lets a user prompt-edit `trailName`, which later renders into `innerHTML`.

Correction to report:
- Manage Portal park names are rendered with `textContent`, so that specific path is safe.
- The stronger current issue is expedition walk history, because `trailName` can be user-edited.

Likely fix:
- Use DOM construction with `textContent`, or centralize an HTML escape helper.
- Remove inline HTML for user-controlled trail/log values first.

Verification:
- A walk trail name like `<img src=x onerror=alert(1)>` displays as text and does not execute.
