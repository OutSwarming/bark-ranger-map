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

- [x] **#3 — Cloud settings bypass the settings store** (`services/authService.js`, `handleCloudSettingsHydration`) ✅

- [x] **#4 — `expeditionEngine.js` calls `L.featureGroup()` at module scope** (`modules/expeditionEngine.js`) ✅

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

- [ ] **#18 — User-visible degraded state when `initMap` fails**: When the map fails (Leaflet CDN down, DOM node missing, etc.), the user sees nothing — no error, no message, just a broken blank screen. Add a visible in-page message ("Map unavailable — try refreshing") that appears if `initMap` is not in `_bootErrors` within N seconds, or if `window.map` is still undefined after boot. This is distinct from Fix #2 (loader stuck) — the loader dismisses, but the user still has no signal that something is wrong.

## Current Work
Fix #4 complete. Start with Fix #5 next session.

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
- Errors are console-only. There is no user-visible fallback state when a module fails. That is Fix #18's job.

**Code review correction applied (same session):**
Original `callInit()` used synchronous `try/catch`. If an init returned a rejected Promise, it slipped through — `callInit()` reported success and execution continued with the failure uncaught. Fixed: `callInit()` is now `async` and uses `await window.BARK[name]()`. The `DOMContentLoaded` handler is also `async` with `await` on each `callInit()` call to preserve boot order.

**How much better:**
- Before: 1 broken init = silent cascade, 0 diagnostic info, async rejections invisible.
- After: 1 broken init = 1 named console error, all subsequent features still initialize, async rejections caught and named, boot summary lists every failure. Debugging time cut from "re-read all code" to "read the console."

### Fix #2 — Loader Never Dismisses on Firebase Failure
**File:** `modules/mapEngine.js`
**Date:** 2026-04-28

**What was wrong:**
`window.dismissBarkLoader()` was called in exactly two places — both inside the `onAuthStateChanged` callback in `authService.js`. If Firebase fails to initialize, the SDK doesn't load from CDN, or the network is down, `onAuthStateChanged` never fires. The `#bark-loader` spinner stays on screen permanently and blocks the entire app.

**Initial fix:**
Added an 8-second fallback `setTimeout(() => window.dismissBarkLoader(), 8000)` inside `initMap()`.

**Code review correction applied (same session):**
A code review identified a second, deeper bug: `dismissBarkLoader` was originally defined at ~line 242 inside `window.BARK.initMap()`. The function calls `L.map()` at ~line 79. If Leaflet CDN fails, `L.map()` throws → `initMap()` exits early → `dismissBarkLoader` is never assigned to `window` → the 8-second fallback is never scheduled → `authService.js` later calls `window.dismissBarkLoader()` → `TypeError: window.dismissBarkLoader is not a function`.

**Final state:**
Both `window.dismissBarkLoader` definition and `setTimeout(() => window.dismissBarkLoader(), 8000)` moved to **module scope** — outside and before `window.BARK.initMap`. The function is globally safe from the moment the script tag is parsed, regardless of whether Leaflet loads or `initMap()` completes.

**Why 8 seconds:**
Firebase Auth on a normal connection resolves in under 2 seconds. 8 seconds covers slow networks, CDN hiccups, and cold-start Cloud Function latency.

**Pros of this approach:**
- The map is always usable. Firebase failure = degraded experience, not total block.
- `dismissBarkLoader` is globally safe from module parse time — no ordering dependency on `initMap()`.
- Idempotent — whichever call fires first wins, second is a no-op.
- Zero risk of interfering with the normal Firebase path.

**Cons / tradeoffs:**
- If Firebase auth takes exactly 8.1 seconds (extremely slow but not failing), the loader dismisses before visited places and cloud settings hydrate. User sees logged-out state briefly then UI corrects. Acceptable.
- 8 seconds is a judgment call — could raise to 10s if slow-connection feedback warrants it.

**How much better:**
- Before: Firebase down = 100% blocked, spinner forever, and a latent crash if Leaflet also failed.
- After: Firebase down = map loads in ≤8s regardless of CDN state, user can browse/search/plan.

---

### Code Review Opinion — Analysis & Verdict (2026-04-28)

A code review raised three points. All three were valid. Here's the verdict and what was done:

**Point 1 — `dismissBarkLoader` unsafe if `initMap()` throws early**
- Valid. `dismissBarkLoader` was defined inside `initMap()`, after `L.map()`. Leaflet failure → function never exists → `authService.js` crash.
- Action: Moved definition and fallback `setTimeout` to module scope. ✅ Fixed in code.

**Point 2 — `callInit()` misses rejected Promises (async errors slip through)**
- Valid. Original `callInit()` was synchronous `try/catch`. A `return Promise.reject(...)` from an init function would not be caught — `callInit()` would log success and execution would continue.
- Action: Made `callInit()` `async` with `await window.BARK[name]()`. Made `DOMContentLoaded` handler `async` with `await` on each `callInit()` to preserve boot order. ✅ Fixed in core/app.js.

**Point 3 — App needs a user-visible degraded state when `initMap` fails**
- Valid. After Fix #1 the console shows everything, but the user sees a blank screen with no indication of what's wrong.
- Action: Added as **Fix #18** in the queue. Not implemented yet — it belongs in its own slot so it can be tested properly.

### Fix #3 — Cloud Settings Bypass the Settings Store
**File:** `services/authService.js` — `handleCloudSettingsHydration()`
**Date:** 2026-04-28

**What was wrong:**
The function had a local `applySetting(storageKey, val)` helper that wrote directly to `localStorage`, then assigned the return value to `window[key]`. Although `settingsStore.js` installs property descriptors on `window` that route assignments through `store.set()` → `notify()`, the code also had a redundant registry loop calling `store.set()` a second time. Result: each setting had localStorage written 2–3 times per cloud hydration, registry settings were processed twice (once via window assignment, once via the loop), gesture settings (`lockMapPanning`, `disablePinchZoom`) were applied inline AND via the onChange → `scheduleRegistrySettingEffects` pipeline, and an `ids` object of 20 hardcoded element IDs manually updated checkboxes that `syncRegisteredControls()` already handles. The `window.clusteringEnabled = ...` assignment was also a no-op since its property descriptor has a no-op setter.

**The fix:**
Rewrote `handleCloudSettingsHydration` with one explicit path:
1. `store.set('lowGfxEnabled', ...)` first — its setter applies `LOW_GRAPHICS_PRESET`, individual settings below can then override.
2. Resolve `standardClustering` default logic (derives from `premiumClustering` when absent from cloud data).
3. One `store.set()` call per registry setting via `Object.entries(registry)` loop — skips settings absent from cloud data using `hasOwnProperty`.
4. `store.set()` for non-registry settings (`ultraLowEnabled`, `rememberMapPosition`, `startNationalView`).
5. Manual DOM update for only the 3 non-registry toggles that have no `onChange` listener.
6. `mapStyle` and `visitedFilter` still written directly to `localStorage` (they're strings, not boolean settings the store manages).
7. Removed: `applySetting()`, `applyRegistrySetting()`, the hardcoded 15-setting block, the duplicate registry loop, inline gesture side-effects, the 20-ID `ids` object, `window.clusteringEnabled = ...`.
8. Added early `return` after the `skipCloudHydration` branch (previously the national view check still ran after the skip).

**Pros of this approach:**
- Each setting goes through the store exactly once — `persist()` called once, `notify()` fires once, no double-write.
- `onChange` listeners in `settingsController` fire correctly for all registry settings, which calls `syncRegisteredControls()` and `scheduleRegistrySettingEffects()` — no manual DOM sync needed for them.
- Adding a new setting to `SETTINGS_REGISTRY` with a `cloudKey` is now automatically hydrated — no changes to `authService.js` required.
- Gesture effects (lockMapPanning, disablePinchZoom) are applied via the normal `MAP_GESTURE` impact pipeline, not inline.
- Code went from ~90 lines to ~50 lines with one clear path.

**Cons / tradeoffs:**
- `store.set()` fires `onChange` synchronously for each registry setting in the loop — if 15 settings all change, `syncRegisteredControls()` is called 15 times in the same tick. This was the same before (each window assignment triggered the property descriptor setter). The RAF batching in `scheduleRegistrySettingEffects` absorbs the effect calls, so it's correct but not minimally efficient. A future optimization could batch all cloud settings into one notify pass — that is a separate workstream.
- The `skipCloudHydration` path now returns early before the national view check. Previously it ran that check even after skipping. The skip is triggered by `ultraLowEnabled` toggle which force-reloads — in that case `startNationalView` hasn't changed, so skipping the mapView call is correct.

**How much better:**
- Before: 2–3 localStorage writes per setting, duplicate code paths, 20 hardcoded element IDs that drift out of sync when the registry changes.
- After: 1 localStorage write per setting (via `persist()`), one code path, zero hardcoded element IDs for registry settings — new settings added to the registry are automatically hydrated.

### Fix #4 — Expedition Trail Layers Initialized Too Early
**File:** `modules/expeditionEngine.js`
**Date:** 2026-04-28

**What was wrong:**
`expeditionEngine.js` created `virtualTrailLayerGroup` and `completedTrailsLayerGroup` with `L.featureGroup()` at module scope. That code ran as soon as the script tag was parsed, before `core/app.js` could wrap anything in `callInit()`. If the Leaflet CDN failed or `L` was unavailable, this file threw `L is not defined` during parse. That meant the expedition module never finished registering its functions, and the error happened outside the boot summary.

**The fix:**
- Replaced eager module-scope `L.featureGroup()` calls with `null` placeholders.
- Added `ensureTrailLayerGroups()` to lazily create both Leaflet layer groups only after Leaflet exists.
- Called `ensureTrailLayerGroups()` from `initTrainingUI()`, so normal boot still prepares the trail overlay groups during the expedition init step.
- Added the same guard to trail overlay renderers, trail toggle buttons, and `flyToActiveTrail()` so direct calls degrade safely if Leaflet or the map is unavailable.
- Switched touched map operations from the implicit global `map` identifier to a local `mapRef` from `window.map`, avoiding extra reference errors when map initialization fails.

**Why this matters:**
This moves a CDN-dependent operation out of parse time and into controlled runtime initialization. Parse-time crashes are especially bad in this app because script tag order is the dependency graph; if a module dies while loading, the boot orchestrator cannot name it, catch it, or summarize it. Runtime guards keep the app closer to the Fix #1 pattern: fail one feature, log it, keep the rest alive.

**Pros of this approach:**
- `expeditionEngine.js` can now load even when Leaflet is missing.
- The expedition feature initializes its map layers only when the app reaches `initTrainingUI()`.
- Cloud hydration or settings refresh calls into trail rendering no longer crash just because the map layer group was never created.
- Trail toggles and "fly to active trail" use explicit `window.map` checks instead of assuming the global `map` binding exists.
- Existing behavior is unchanged when Leaflet and the map load normally.
- `ensureTrailLayerGroups()` is idempotent — the early-return guard prevents double-creation no matter how many times it is called before or after `initTrainingUI()` runs.

**Cons / tradeoffs:**
- Trail overlay functions now have a small guard path that silently returns after a console warning when Leaflet is unavailable.
- If the map itself fails, expedition trail overlays still cannot render. This fix prevents a boot-time crash; it does not create the user-facing map failure message. That remains Fix #18.
- `initTrailToggles()` still binds before `initTrainingUI()` in `core/app.js`; the click handlers are safe because they call `ensureTrailLayerGroups()`, but the actual layer creation still happens at `initTrainingUI()` during normal boot.
- `turf.*` calls inside both render functions (`turf.length`, `turf.lineSliceAlong`, `turf.along`, `turf.pointOnFeature`) have no `typeof turf` guard. A failed turf CDN would not crash the parse (calls are inside try-catch), but it is the same category of CDN-dependency risk that was just fixed for Leaflet.
- `flyToActiveTrail()` shows `"Trail map data is unavailable. Please refresh and try again."` when `ensureTrailLayerGroups()` returns false. The real cause is Leaflet missing, not trail data — the message is slightly misleading for that failure mode.

**User-visible difference:**
A user opening the app on bad campground Wi-Fi where Leaflet fails to load should no longer lose the expedition module to an uncaught `L is not defined` parse crash. The loader can dismiss, non-map UI can continue booting, and if they tap an expedition trail action the app gives a controlled unavailable state instead of exploding in the console.

**How much better:**
- Before: Leaflet missing = expedition module parse crash before boot error handling can see it.
- After: Leaflet missing = expedition module loads, boot continues, trail overlays initialize lazily when possible, and map-dependent trail actions are guarded.

---

## Rules for This Project
- Keep all existing features. Do not remove anything without asking.
- One fix at a time. Mark done in this file before starting the next.
- After each fix: update the checkbox above, update "Current Work" section.
- Do not start a new fix mid-conversation if context is getting long. Finish the current one, update this file, then start fresh.
- Settings changes must go through `window.BARK.settings.set()`, not raw window assignment.
- Firestore calls must go through `firebaseService.js`.
- DOM lookups should use `window.BARK.DOM` where elements are registered there.
