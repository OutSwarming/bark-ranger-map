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
5. Bug 7 and Bug 2 together: make visited-place local/server sync resilient to stale Firestore snapshots and local writes.
6. Bug 9 and Bug 10: harden leaderboard sync/rank parsing.
7. Bug 12, Bug 14, Bug 15, Bug 17: lower-blast-radius cleanup.
8. Bug 11, Bug 13, Bug 16: maintenance notes unless they become user-visible.

## Summary

| ID | Reported Severity | Verification | Current Priority | Status |
| --- | --- | --- | --- | --- |
| 1 | Critical | Fixed by removing main-app God Mode and moving dev tools to admin page | Done | Fixed |
| 2 | Critical | Partially confirmed; exact data-loss sequence is not proven | P1 | Partially confirmed |
| 3 | Critical | Confirmed | P0 | Confirmed |
| 4 | Critical | Confirmed | P0 | Confirmed |
| 5 | Critical | Confirmed | P0 | Confirmed |
| 6 | High | Confirmed, but alert order in report is wrong | P0 | Confirmed |
| 7 | High | Confirmed as timing-dependent stale snapshot risk | P1 | Partially confirmed |
| 8 | High | Confirmed | P0 | Confirmed |
| 9 | High | Partially confirmed; direct function lacks guard, reported achievement path is guarded | P2 | Partially confirmed |
| 10 | High | Partially confirmed; pinned row can show `#NaN`, personal label likely cannot | P2 | Partially confirmed |
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

Status: Partially confirmed

Files:
- `services/firebaseService.js:72`
- `services/firebaseService.js:80`
- `services/firebaseService.js:105`
- `services/firebaseService.js:109`
- `services/authService.js:212`
- `services/authService.js:215`

Evidence:
- `updateVisitDate()` mutates the object stored in `window.BARK.userVisitedPlaces`.
- `handleVisitedPlacesSync()` replaces the entire Map on every snapshot.
- This creates a real stale-snapshot risk for local UI state.

Correction to report:
- The exact sequence "snapshot replaces the Map while `syncUserProgress()` is awaiting, then `syncUserProgress()` writes the old timestamp" is not supported by the current control flow.
- `syncUserProgress()` constructs `visitedArray` synchronously at `services/firebaseService.js:80` before the Firestore `await`, so the write payload is captured before another event can replace `window.BARK.userVisitedPlaces`.

Remaining risk:
- A stale snapshot can still repaint the local Map/UI with old data before a newer server snapshot arrives.
- Other writes after a stale replacement could persist old state.

Likely fix:
- Make `updateVisitDate()` produce a fresh array from the intended post-update Map and write that explicit array.
- Track local pending visited-place mutations by id/timestamp and ignore or merge older cache snapshots.
- Consider replacing full Map snapshots with a merge that preserves newer local pending records.

Verification:
- Updating a visit date remains stable through cache snapshots, server snapshots, and portal re-render.

## Bug 3: `updateMarkers()` Crashes When `window.map` Is Missing

Status: Confirmed

Files:
- `modules/renderEngine.js:242`
- `modules/renderEngine.js:248`
- `modules/renderEngine.js:268`
- `modules/renderEngine.js:283`
- `core/app.js:106`
- `core/app.js:107`

Evidence:
- `syncState()` gates marker updates on `isMapViewActive()` and zoom state, not on a usable Leaflet map.
- `updateMarkers()` reads `const map = window.map` and immediately calls `map.getZoom()`.
- If map init fails before a Leaflet map is assigned, this throws.

Caveat:
- The report says this happens "every RAF"; the code schedules one RAF per `syncState()` call. Repeated callers can still make it noisy, but it is not an autonomous RAF loop.

Likely fix:
- Add a Leaflet-map readiness guard before `updateMarkers()` is called and at the top of `updateMarkers()`.
- Treat `window.map` as valid only if it has required methods such as `getZoom`, `getBounds`, and `getContainer`.

Verification:
- Simulate `window.map = null` and call `window.syncState()`; no exception is thrown.
- Map-unavailable overlay remains the only visible failure mode.

## Bug 4: `executeGeocode()` Calls `window.addStopToTrip` Without Guard

Status: Confirmed

Files:
- `modules/searchEngine.js:606`
- `modules/searchEngine.js:610`
- `modules/searchEngine.js:633`
- `modules/searchEngine.js:639`
- `modules/searchEngine.js:684`

Evidence:
- GPS "my location" path calls `window.addStopToTrip(node)` with no guard.
- Single-result geocode path calls it with no guard.
- Multi-result disambiguation click path calls it with no guard.
- Standard geocode failures are caught by the outer `try/catch`, but the UI input is not reset in the catch.
- GPS geolocation success callback runs outside that `try/catch`, so its crash is uncaught.

Likely fix:
- Add a helper such as `applyTripNode(targetType, node)` that handles start/end/stop and returns a user-visible failure if the trip planner API is unavailable.
- Reset search input/status in failure paths.

Verification:
- Delete or stub `window.addStopToTrip`, run geocode and GPS stop flows, and confirm no uncaught exception or stuck "Searching..." UI.

## Bug 5: `processMileageAddition()` Crashes If User Document Is Missing

Status: Confirmed

Files:
- `modules/expeditionEngine.js:356`
- `modules/expeditionEngine.js:363`
- `modules/expeditionEngine.js:364`
- `modules/expeditionEngine.js:365`

Evidence:
- `docSnap.data()` can be `undefined`.
- The next line reads `userData.lifetime_miles`, which throws.
- Nearby `assignTrailToUser()` correctly uses `doc.data() || {}`.
- The catch logs "Failed to log miles" but does not preserve the walk or present useful recovery.

Likely fix:
- Use `const userData = docSnap.data() || {};`.
- Decide whether a missing active expedition should allow lifetime miles only or require an active trail.
- Consider `set(..., { merge: true })` or document bootstrap before `update()` if new users can have no user doc.

Verification:
- New/missing user document can log manual and GPS miles without TypeError.

## Bug 6: Offline + No Cache + Missing Marker Layer Crashes `loadData()`

Status: Confirmed

Files:
- `modules/dataService.js:391`
- `modules/dataService.js:407`
- `modules/dataService.js:410`
- `modules/dataService.js:411`

Evidence:
- Offline, non-premium, no-cache path calls `window.BARK.markerLayer.clearLayers()` without checking `markerLayer`.
- If `initMap()` failed before marker layers were assigned, this throws.

Correction to report:
- The alert is currently before `clearLayers()`, so the "Network disconnected..." alert should show before the crash.

Likely fix:
- Guard `window.BARK.markerLayer && typeof window.BARK.markerLayer.clearLayers === 'function'`.
- Prefer a shared `clearMarkerLayersSafely()` helper if other map-failure paths need it.

Verification:
- With `navigator.onLine = false`, no cached CSV, and no marker layer, `loadData()` shows the offline message and does not throw.

## Bug 7: Optimistic Check-In Can Be Replaced By Cached Firestore Snapshot

Status: Partially confirmed

Files:
- `services/checkinService.js:134`
- `services/checkinService.js:138`
- `services/checkinService.js:142`
- `services/authService.js:212`
- `services/authService.js:215`
- `services/authService.js:548`

Evidence:
- GPS check-in mutates the local Map optimistically before awaiting Firestore.
- Firestore snapshot handling replaces the entire Map from `data.visitedPlaces`.
- The snapshot handler does not distinguish cache snapshots, server snapshots, or local pending writes for visited places.

Caveat:
- Whether the user sees a flash depends on Firestore event ordering and cache state. The full-replacement pattern is real, but the exact flicker timing is environment-dependent.

Likely fix:
- Preserve local pending check-ins until a server snapshot confirms or rejects them.
- Ignore stale cache snapshots for `visitedPlaces` after a local mutation, or merge by id using newest timestamp.
- Use `doc.metadata.fromCache` and `doc.metadata.hasPendingWrites` deliberately.

Verification:
- Slow/offline/cached snapshots do not visually remove an optimistic GPS check-in that is still pending.

## Bug 8: `typeof map !== 'undefined'` Does Not Prove A Usable Map

Status: Confirmed

Files:
- `modules/searchEngine.js:254`
- `modules/searchEngine.js:256`
- `modules/searchEngine.js:397`
- `modules/searchEngine.js:658`
- `modules/searchEngine.js:701`

Evidence:
- `shouldMoveMapForSearchResult()` only checks `typeof map !== 'undefined'`.
- Calls later assume `map.setView(...)` exists.
- Local search suggestion click has a similar check at `modules/searchEngine.js:397`.
- If map init fails, `map` can be `null`, undefined, or even a non-Leaflet browser global from the `id="map"` element. None are safe.

Likely fix:
- Add a shared `getUsableMap()` or `isUsableLeafletMap()` helper.
- Use `window.map`, not bare `map`, and verify methods before calling.

Verification:
- Search result selection and geocoder selection do not throw when the Leaflet map is unavailable.

## Bug 9: `syncScoreToLeaderboard()` Lacks A Firebase Guard

Status: Partially confirmed

Files:
- `modules/profileEngine.js:81`
- `modules/profileEngine.js:87`
- `modules/profileEngine.js:145`
- `modules/profileEngine.js:160`
- `modules/profileEngine.js:188`

Evidence:
- `syncScoreToLeaderboard()` directly calls `firebase.auth().currentUser` before its `try/finally`.
- If called while Firebase is unavailable, it throws.

Correction to report:
- The specific path `evaluateAchievements() -> syncScoreToLeaderboard()` is guarded by `userId`, which is only set when `typeof firebase !== 'undefined'`.
- Therefore, Firebase CDN failure should not call `syncScoreToLeaderboard()` through that achievement path.

Remaining risk:
- Other callers, especially expedition flows, call `window.BARK.syncScoreToLeaderboard()` after code that already assumes Firebase exists.
- The function should still be self-defensive because it is exported on `window.BARK`.

Likely fix:
- Return early if `typeof firebase === 'undefined'` or `!firebase.auth`.
- Move the `firebase.auth()` read inside the guarded `try` block.

Verification:
- Calling `window.BARK.syncScoreToLeaderboard()` with Firebase unavailable returns without throwing.

## Bug 10: Leaderboard Rank Can Become NaN

Status: Partially confirmed

Files:
- `modules/profileEngine.js:460`
- `modules/profileEngine.js:462`
- `modules/profileEngine.js:466`
- `modules/profileEngine.js:536`
- `modules/profileEngine.js:584`
- `modules/profileEngine.js:631`

Evidence:
- `parseInt(undefined)` can produce `NaN` if the aggregation response has `rankCount` but no `integerValue`.
- That can set `exactRank` to `NaN`.

Correction to report:
- The personal rank label probably will not display `Rank: NaN` because `if (user.isPersonalFallback && user.exactRank)` treats `NaN` as falsy and falls back to the array index.
- The pinned personal row can still be rendered with `createRow(personalUserObj, personalUserObj.exactRank, true)`, which can show `#NaN`.

Likely fix:
- Parse with `Number.parseInt(value, 10)` and require `Number.isFinite(countMatched)`.
- Only assign/push `exactRank` when finite.
- In render, derive a safe display rank once and use it consistently for both label and row.

Verification:
- Malformed aggregation responses produce `Rank: --` or fallback rank, never `NaN`/`#NaN`.

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
