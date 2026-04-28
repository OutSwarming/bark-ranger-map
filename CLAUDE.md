# B.A.R.K. Ranger Map — Engineering Workbook

## What This App Is
PWA for the US B.A.R.K. Rangers program. Dog owners visit national/state parks and collect physical swag (tags, bandanas, certificates). App shows ~1,000+ park locations on a Leaflet map, tracks visits, awards gamification badges, supports trip planning, and virtual hiking expeditions. A built-in store is planned — stability and trust are the priority.

## Stack
- **Frontend:** Vanilla JS, no bundler, `<script>` tag load order is the dependency graph
- **Map:** Leaflet 1.9.4 + leaflet.markercluster
- **Data:** Google Sheets published as CSV (polled on interval), parsed by PapaParse
- **Auth/DB:** Firebase Auth + Firestore (v8 compat SDK, loaded from CDN)
- **Backend:** Firebase Cloud Functions (Node 20, v1 syntax in `functions/index.js`)
- **Hosting:** Firebase Hosting (hosting config currently missing from `firebase.json`)
- **Analytics:** GoatCounter (async, no impact)

## Key Architectural Facts (do not re-derive these from files)
- Boot order is enforced by `<script>` tag order in `index.html`. `core/app.js` fires on `DOMContentLoaded`.
- All modules attach to `window.BARK` namespace. No ES imports.
- Settings live in THREE layers: `barkState.js` (raw window globals, boot-time), `state/settingsStore.js` (canonical structured store with property descriptors), `state/appState.js` (mirrors BARK data state to window). The settingsStore descriptors overwrite barkState globals after boot.
- The heartbeat is `window.syncState()` in `renderEngine.js` — RAF-batched, uses a 20-part fingerprint string to skip no-op renders.
- `MarkerLayerManager` in `modules/MarkerLayerManager.js` owns all Leaflet marker lifecycle keyed by park UUID.
- Firebase `onSnapshot` on `users/{uid}` is the primary data hydration path for logged-in users.
- `window.BARK.DOM` in `config/domRefs.js` is the centralized DOM lookup registry (functions, not values).
- CSV rollback guard in `dataService.js:processParsedResults` refuses updates that drop existing canonical park IDs — keep this.
- `window.BARK.incrementRequestCount()` has a 600-request session kill switch — currently fires too fast (see fix #5).
- `gamificationLogic.js` exposes `class GamificationEngine` — pure logic, no DOM.
- `services/checkinService.js` owns GPS check-in validation — clean, well-structured.
- `modules/markerLayerPolicy.js` is the single source of truth for which marker layer mode is active.

## Goal
Make the app production-grade for a store launch: near-100% reliability, no logic errors, clean scalable code, all existing features preserved.

## Fix Queue (work through in order, one at a time)

- [x] **#1 — Boot error recovery** (`core/app.js`) ✅

- [x] **#2 — Loader never dismisses on Firebase failure** (`modules/mapEngine.js`) ✅

- [ ] **#3 — Cloud settings bypass the settings store** (`services/authService.js`, `handleCloudSettingsHydration`): `applySetting()` writes directly to `localStorage` + raw `window.*`, bypassing `settingsStore.js`. `onChange()` listeners never fire for cloud-loaded settings. Fix: route all cloud setting writes through `window.BARK.settings.set()`.

- [ ] **#4 — `expeditionEngine.js` calls `L.featureGroup()` at module scope** (`modules/expeditionEngine.js:22-23`): These lines run at parse time, before `initMap()`. If Leaflet CDN is slow, crashes with `L is not defined`. Move layer group creation inside `initTrainingUI()`.

- [ ] **#5 — Request kill switch fires after ~75 minutes** (`modules/barkState.js`, `modules/dataService.js`): 600 req cap + 10s CSV poll (6/min) + 30s version poll (2/min) = kill switch at 75 min. Fix: raise cap to 2000 AND slow CSV poll to 5 minutes (fetch immediately on load + on tab re-focus, then every 5 min).

- [ ] **#6 — `evaluateAchievements()` mutates live visit records** (`modules/profileEngine.js:152-155`): `visit.state = mapPoint.state` mutates objects inside `userVisitedPlaces` Map in place. Creates unpredictable side-effects across the app. Fix: work on a shallow copy — `const visit = { ...rawVisit }`.

- [ ] **#7 — Streak date uses UTC instead of local date** (`services/firebaseService.js:23`): `new Date().toISOString().split('T')[0]` returns UTC date. US evening users get tomorrow's date. Fix: use `new Date().toLocaleDateString('en-CA')` which gives YYYY-MM-DD in local time.

- [ ] **#8 — `evaluateAchievements()` fires on every `syncState()` heartbeat** (`modules/renderEngine.js:175`): Achievement eval (Firestore batch read + conditional write) is triggered inside the RAF loop on every state change. The boolean lock prevents concurrency but not constant re-queuing. Fix: debounce with a 3-second trailing debounce, not a boolean lock.

- [ ] **#9 — CSV polling at 10s will get throttled at scale** (`modules/dataService.js:getPollInterval`): Change base interval from 10s to 300s (5 min). Add a `document.addEventListener('visibilitychange')` trigger that fires an immediate poll when tab becomes visible again. Remove the redundant `safeDataPoll()` call in `app.js` (loadData already triggers the first poll).

- [ ] **#10 — `getMarkerVisibilityStateKey()` sorts visited IDs on every RAF** (`modules/renderEngine.js:117`): `Array.from(userVisitedPlaces.keys()).sort().join(',')` runs on every heartbeat. Cache this string as `window.BARK._visitedIdsCacheKey`, invalidate it only inside `handleVisitedPlacesSync()` in `authService.js` and inside the `markAsVisited` flow in `checkinService.js`.

- [ ] **#11 — Levenshtein search is unbounded on main thread** (`modules/searchEngine.js`): Runs synchronously across all parks. Add a `performance.now()` budget check — if search loop exceeds 16ms, return partial results and schedule remainder. Prepares for 5,000+ parks.

- [ ] **#12 — `barkState.js` redundant settings initialization** (`modules/barkState.js`): The 20 `window.x = localStorage.getItem(...)` assignments at the top are immediately overwritten by `settingsStore.js` property descriptors. Remove the settings block from `barkState.js`. It should only initialize data state: `allPoints`, `userVisitedPlaces`, `tripDays`, `activeDayIdx`, `activeSwagFilters`, `activeSearchQuery`, `activeTypeFilter`, `visitedFilterState`, `_searchResultCache`, `activePinMarker`.

- [ ] **#13 — `authService.js` cloud hydration has 90+ hardcoded element IDs** (`services/authService.js`, `handleCloudSettingsHydration`): The final `ids` object hardcodes 20 element IDs that already exist in `SETTINGS_REGISTRY[key].elementId`. Replace with a loop over the registry.

- [ ] **#14 — `settingsController.js` queries Firestore directly** (`modules/settingsController.js:79`): `refreshTrailRendering()` calls `firebase.firestore()` directly. All Firestore access belongs in `firebaseService.js`. Extract to a `firebaseService.getCompletedExpeditions(uid)` helper.

- [ ] **#15 — Dead code in `tests/` is misleading** (`tests/`): `app.test.js` (286KB old monolith), `tmp_test.js` (another copy), `test.js` (broken syntax). Delete all three with `git rm`. Do not add a test framework yet — that is a separate workstream.

- [ ] **#16 — `firebase.json` missing hosting config**: Add the `"hosting"` block so `firebase deploy --only hosting` works. Public directory is the repo root. Ignore `node_modules`, `functions`, `raw_trails`, `data`, `scripts`, `legacy`, `tests`, `plans`, `docs`.

- [ ] **#17 — iOS settings overlay scroll leak** (`modules/settingsController.js`): `document.body.style.overflow = 'hidden'` does not work on iOS Safari. Use `document.body.style.position = 'fixed'` with scroll offset preservation on open, restore on close.

## Current Work
Fix #2 complete. Start with Fix #3 next session.

---

## Completed Fixes

### Fix #1 — Boot Error Recovery
**File:** `core/app.js`
**Date:** 2026-04-28

**What was wrong:**
`callInit()` called `window.BARK[name]()` with zero error handling. The three most critical inits — `initMap`, `initSettings`, `initUI` — were called with raw `if (window.BARK.initX) window.BARK.initX()` — also no error handling. If any single init threw (bad CDN load, a null DOM ref, a timing issue), JavaScript's uncaught exception would halt execution and every subsequent init would silently never run. The app would appear to load but be in a partially-dead state with no diagnostic information.

**The fix:**
- `callInit()` now wraps every module init in try/catch. On failure it: logs `[B.A.R.K. Boot] "initX" failed — this feature will be unavailable.` with the actual error, pushes the name to `_bootErrors[]`, and continues to the next init.
- All inits now go through `callInit()` — the old inconsistent mix of raw `if` checks and `callInit()` calls is unified into a single pattern.
- Firebase init has its own try/catch with a clearer message (`auth and cloud sync unavailable`) because its failure has broader impact than one feature.
- Data loading (`loadData` + `safeDataPoll`) is grouped in its own try/catch with the message `map may be empty`.
- The deferred `safePoll` and `updateTripUI` setTimeout calls are also wrapped.
- Boot ends with a clear console summary: `✅ Complete` or `⚠️ Complete with N error(s): [initX, initY]`.

**Pros of this approach:**
- Any broken module is immediately identifiable by name in the console — no more hunting through silent failures.
- One broken feature does not cascade into breaking all subsequent features.
- The boot summary tells you the exact list of what failed — critical for debugging on a user's device remotely.
- Zero new dependencies, zero behavior change when nothing is broken.
- The unified `callInit()` pattern for all inits makes the boot sequence easier to read and extend.

**Cons / tradeoffs:**
- We now treat `initMap` failure the same as `initWatermarkTool` failure — both are caught and execution continues. If the map fails, everything after it that depends on `window.map` will also fail, producing multiple errors rather than one clean fatal. The tradeoff is accepted: knowing all the failures is better than stopping at the first one.
- Errors are console-only. There is no user-visible fallback state when a module fails. That is Fix #2's job (the loader never-dismiss problem).

**How much better:**
- Before: 1 broken init = silent cascade = app in unknown broken state, 0 diagnostic info.
- After: 1 broken init = 1 named console error, all other features still initialize normally, boot summary lists everything that failed. Debugging time cut from "unknown, must re-read all code" to "read the console."

### Fix #2 — Loader Never Dismisses on Firebase Failure
**File:** `modules/mapEngine.js`
**Date:** 2026-04-28

**What was wrong:**
`window.dismissBarkLoader()` was called in exactly two places — both inside the `onAuthStateChanged` callback in `authService.js` (line 361 for logged-in users, line 396 for logged-out users). If Firebase fails to initialize, the SDK doesn't load from CDN, or the network is down, `onAuthStateChanged` never fires. The `#bark-loader` spinner stays on screen permanently and blocks the entire app — users can't see the map, can't search, can't do anything. The app is 100% inaccessible.

**The fix:**
One line added in `initMap()`, directly after `dismissBarkLoader` is defined:
```javascript
setTimeout(() => window.dismissBarkLoader(), 8000);
```
After 8 seconds, the loader is force-dismissed regardless of Firebase state. `dismissBarkLoader` is already idempotent — it checks `loader.style.opacity !== '0'` before acting, so calling it from both the fallback and Firebase is safe. Whichever fires first wins; the second call is a no-op.

**Why 8 seconds:**
Firebase Auth on a normal connection resolves in under 2 seconds. 8 seconds is generous enough to cover slow networks, CDN hiccups, and cold-start Cloud Function latency — without making users wait unreasonably long when Firebase is actually down.

**Pros of this approach:**
- The map is always usable. Firebase failure becomes a degraded experience (no visited places, no cloud settings) rather than a total block.
- `dismissBarkLoader` was already idempotent, so no defensive code needed — the fix is genuinely one line.
- The fallback fires from inside `initMap()`, which is the right place: it owns the loader, and it always runs before Firebase init.
- Zero risk of interfering with the normal Firebase path — the normal calls still happen exactly as before.

**Cons / tradeoffs:**
- If Firebase auth takes exactly 8.1 seconds (extremely slow but not failing), the loader dismisses before visited places and cloud settings are hydrated. The user sees the map in a logged-out state briefly, then the UI corrects itself when Firebase resolves. Acceptable — partial data briefly is far better than blocked forever.
- 8 seconds is a guess. If Firebase routinely takes longer on slow connections this could be raised to 10s, but 8s is the right starting point.

**How much better:**
- Before: Firebase down = 100% of the app blocked, user sees spinner forever, no recourse.
- After: Firebase down = map loads in 8s, user can browse parks, search, plan trips — just without their personal data until Firebase recovers.

---

## Rules for This Project
- Keep all existing features. Do not remove anything without asking.
- One fix at a time. Mark done in this file before starting the next.
- After each fix: update the checkbox above, update "Current Work" section.
- Do not start a new fix mid-conversation if context is getting long. Finish the current one, update this file, then start fresh.
- Settings changes must go through `window.BARK.settings.set()`, not raw window assignment.
- Firestore calls must go through `firebaseService.js`.
- DOM lookups should use `window.BARK.DOM` where elements are registered there.
