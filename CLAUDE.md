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
- `window.BARK.incrementRequestCount()` has a 2,000-request session kill switch. CSV polling is intentionally slow; keep background request loops conservative.
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

- [x] **#5 — Request kill switch fires after ~75 minutes** (`modules/barkState.js`, `modules/dataService.js`) ✅

- [x] **#6 — `evaluateAchievements()` mutates live visit records** (`modules/profileEngine.js`) ✅

- [x] **#7 — Streak date uses UTC instead of local date** (`services/firebaseService.js`) ✅

- [x] **#8 — `evaluateAchievements()` fires on every `syncState()` heartbeat** (`modules/renderEngine.js`) ✅

- [x] **#9 — CSV polling at 10s will get throttled at scale** (`modules/dataService.js`, `core/app.js`) ✅

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
Fix #9 complete. Start with Fix #10 next session.

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
- Data loading (`loadData`) is grouped in its own try/catch with the message `map may be empty`.
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

### Fix #5 — Background Request Cadence & Session Kill Switch
**Files:** `modules/barkState.js`, `modules/dataService.js`
**Date:** 2026-04-28

**What was wrong:**
The session kill switch capped all counted requests at 600, while CSV polling ran every 10 seconds and the version check ran every 30 seconds. Even before normal user actions, the app could consume roughly 8 counted background requests per minute and hit the safety shutdown around 75 minutes. That is bad for long park-planning sessions, bad for trust, and noisy at scale.

**The fix:**
- Raised `SESSION_MAX_REQUESTS` from 600 to 2,000.
- Mirrored the live request count into `window._SESSION_REQUEST_COUNT` for easier console debugging.
- Changed CSV polling from every 10 seconds to every 5 minutes.
- Kept `loadData()` as the immediate fetch path on boot.
- Changed `safeDataPoll()` into the long-running scheduler instead of another immediate fetch.
- Added a `visibilitychange` refresh when the tab becomes visible again, throttled to avoid repeated tab-switch spam.
- Made CSV poll errors back off to 10 minutes after repeated failures.
- Made `pollForUpdates()` return its fetch promise so the scheduler can count failures accurately.

**Why this matters:**
Fresh CSV data does not need a 10-second heartbeat. For this app, the right long-term posture is cache-first, immediate fetch on open, then conservative polling with a quick refresh when the user returns. That keeps the map fresh enough for real use while dramatically reducing background request pressure.

**Pros of this approach:**
- Background CSV traffic drops from about 360 requests/hour to about 12 requests/hour per active tab.
- The 2,000-request cap is still a real runaway guard, but normal sessions should not trip it quickly.
- `loadData()` and `safeDataPoll()` now have clearer responsibilities: immediate load vs. scheduled loop.
- Refocus refresh keeps the app feeling current without constant polling while the user is away.
- The live request counter is visible as `window._SESSION_REQUEST_COUNT`, which helps remote debugging.
- `bindDataPollVisibilityRefresh()` uses a static property flag (`bound`) — the `visibilitychange` listener cannot be double-bound even if `safeDataPoll()` is called more than once.
- The `visibilitychange` handler gates on `dataPollStopped` — after the session kill switch fires, tab-focus events no longer trigger wasteful re-poll attempts.

**Cons / tradeoffs:**
- CSV changes may take up to 5 minutes to appear if the user stays continuously active on the tab.
- Version checks still run every 30 seconds, so this fix reduces the biggest background load but does not fully redesign all polling.
- Refocus refresh is throttled to one request per minute; very rapid tab switching will not fetch every time.
- `loadData()` calls `runDataPollCycle()` fire-and-forget without `await` (the function is not async). `runDataPollCycle()` has its own try-catch covering all expected errors, but a truly unexpected rejection inside `pollForUpdates()` would be unhandled and invisible to the boot error reporting in `app.js`.

**User-visible difference:**
A user planning a long multi-day route can leave the app open for hours without the CSV poll chewing through the session safety limit. If they switch away and come back later, the app checks for fresh park data right away instead of waiting for the next 5-minute tick.

**How much better:**
- Before: 10-second CSV polling + 600 cap = safety shutdown risk after roughly 75 minutes.
- After: 5-minute CSV polling + 2,000 cap = far lower background traffic, better long-session stability, and fewer false kill-switch trips.

### Fix #6 — Achievement Evaluation Mutated Live Visit Records
**File:** `modules/profileEngine.js`
**Date:** 2026-04-28

**What was wrong:**
`evaluateAchievements()` built `visitedArray` directly from `userVisitedPlaces.values()`, then filled missing `visit.state` fields by writing `visit.state = mapPoint.state`. Those `visit` objects were the same objects stored in the live `window.BARK.userVisitedPlaces` Map. A read-only achievement calculation was quietly changing canonical visit records in memory.

**The fix:**
- Changed `visitedArray` construction to create a shallow copy for each visit record.
- Added missing state only to the copied object passed into `gamificationEngine`.
- Left the original `userVisitedPlaces` Map and its visit objects untouched.
- Guarded the `window.parkLookup.get()` path so achievement evaluation stays safe if the lookup is unavailable.

**Why this matters:**
Achievement evaluation runs from the render heartbeat and should be pure from the app-state perspective. Mutating live visit records during a derived calculation makes bugs difficult to reason about: a badge render can change data that other systems treat as source-of-truth. Keeping enrichment local to the achievement input makes the data flow cleaner and easier to debug.

**Pros of this approach:**
- Keeps state badge calculations working even when cloud visit records are missing `state`.
- Removes the hidden side effect from the render/achievement path.
- Very small performance cost: one shallow object copy per visited place during achievement evaluation.
- No schema migration and no cloud write behavior change.
- Makes future debugging cleaner because `userVisitedPlaces` remains exactly what auth/check-in sync put there.
- The null/type guard at the start of the `.map()` callback (`if (!rawVisit || typeof rawVisit !== 'object')`) means the function cannot crash on malformed Firestore entries — hand-edited or migrated documents with unexpected shapes are passed through safely rather than throwing on `{ ...rawVisit }`.

**Cons / tradeoffs:**
- The copy is shallow, not a deep clone. That is intentional because the fix only enriches top-level `state`, but nested object mutation would still need separate care if added later.
- Other code paths that read `userVisitedPlaces` directly still will not see inferred `state` unless they join against `allPoints` or `parkLookup` themselves.
- Achievement evaluation still runs often from `syncState()`; that performance concern remains Fix #8.

**User-visible difference:**
A user with older cloud visit records that do not include `state` can still earn state badges correctly, but opening the profile/vault no longer mutates those saved visit objects behind the scenes. That reduces weird downstream behavior where a profile render could make visit records look different from the original synced data.

**How much better:**
- Before: achievement render = badge calculation plus hidden mutation of live visit objects.
- After: achievement render = badge calculation with copied/enriched inputs only; canonical visit records remain stable.

### Fix #7 — Daily Streak Uses Local Calendar Date
**File:** `services/firebaseService.js`
**Date:** 2026-04-28

**What was wrong:**
`attemptDailyStreakIncrement()` used `new Date().toISOString().split('T')[0]` for both today and yesterday. `toISOString()` always formats in UTC. For US evening users, the UTC date can already be tomorrow, so a check-in at 9:30 PM local time could be stored as the next day and break the daily streak logic.

**The fix:**
- Added `getLocalDateKey(date = new Date())`.
- It formats dates as `YYYY-MM-DD` using local `getFullYear()`, `getMonth()`, and `getDate()`.
- Replaced the UTC `today` key with `getLocalDateKey()`.
- Replaced the UTC `yesterdayStr` key with `getLocalDateKey(yesterday)`.
- Kept the Firestore/localStorage schema unchanged: streak dates are still stored as `YYYY-MM-DD` strings.

**Why this matters:**
Streaks are a user-facing calendar feature. Users think in local days, not UTC days. The app should reward a visit made on Tuesday evening as Tuesday, not Wednesday just because UTC crossed midnight. This keeps streak behavior aligned with the user's lived day and avoids confusing missed/duplicated streak outcomes.

**Pros of this approach:**
- Fixes the US evening/tomorrow-date bug.
- Handles yesterday using the same local date-key logic as today.
- Avoids locale-output ambiguity by manually formatting the local date instead of relying on browser locale string behavior.
- No data migration needed because the stored format stays `YYYY-MM-DD`.
- Very fast: three local date reads and two `padStart()` calls per streak attempt.
- `getLocalDateKey(date = new Date())` accepts an optional `date` parameter — this is what makes the smoke test work (pass a mocked date directly) and keeps future unit tests straightforward without patching the global `Date` constructor.
- `yesterday.setDate(yesterday.getDate() - 1)` uses calendar arithmetic, not millisecond subtraction. `setDate(0)` on the first of a month correctly rolls back to the last day of the previous month, and DST transitions do not cause date drift the way `Date.now() - 86400000` would.

**Cons / tradeoffs:**
- The date is based on the device/browser local timezone. If a user travels across timezones in the same day, streaks follow the device's current local day.
- Existing streak records that were already saved with a UTC-shifted date are not automatically repaired.
- This fixes date-key generation only; it does not add server-side anti-abuse validation for streaks.

**User-visible difference:**
A user checking in during the evening in the US no longer has that check-in counted as tomorrow. Their daily streak should increment or continue based on the actual local calendar day they are using the app.

**How much better:**
- Before: local evening check-in could be stored as tomorrow because the app used UTC.
- After: daily streak dates are generated from the user's local calendar day.

### Fix #8 — Achievement Evaluation Debounced Outside the Render Heartbeat
**File:** `modules/renderEngine.js`
**Date:** 2026-04-28

**What was wrong:**
`syncState()` called `evaluateAchievements()` from inside the RAF heartbeat. The old `window._evalInProgress` boolean prevented overlapping achievement evaluations, but it did not prevent constant re-queuing: any state change after the previous evaluation finished could immediately trigger another profile/vault render and possible Firestore achievement work.

**The fix:**
- Added a 3-second trailing debounce for achievement evaluation.
- `syncState()` still updates markers and stats immediately.
- Replaced the global `window._evalInProgress` gate with a local scheduler in `renderEngine.js`.
- Added a local in-progress guard only to prevent concurrency if an evaluation is still running when the debounce fires.
- If a new evaluation request arrives during an active evaluation, one trailing follow-up evaluation is scheduled after the active run finishes.
- Added error handling around the scheduled evaluation so unexpected rejections are logged by `renderEngine`.

**Why this matters:**
Achievement evaluation is heavier than marker/stat refresh because it renders the vault/dossiers and can touch Firestore through the gamification engine. It should respond to meaningful settled state, not every heartbeat. A trailing debounce keeps the UI responsive while preventing state churn from turning into repeated achievement work.

**Pros of this approach:**
- Collapses bursts of `syncState()` calls into one achievement evaluation.
- Reduces repeated vault rendering and Firestore achievement checks.
- Keeps immediate marker and stat updates intact.
- The scheduler is local to `renderEngine.js`; no new global flags are introduced.
- Handles long-running evaluations safely without overlapping calls.
- `runAchievementEvaluation()` uses `try/catch/finally` — the `finally` block is critical: it guarantees `achievementEvalInProgress` is always reset even if `evaluateAchievements()` throws. Without `finally`, a single error would permanently deadlock all future achievement evaluation for the session.
- `achievementEvalRequestedDuringRun` is a boolean, not a counter or queue — one concurrent state change or one thousand during an active evaluation both collapse to exactly one follow-up evaluation. The flag is idempotent by design.

**Cons / tradeoffs:**
- Profile/vault achievement UI can lag up to 3 seconds after the last relevant state change.
- If state keeps changing continuously, achievement evaluation waits until the app quiets down.
- A long-running evaluation followed by another state change can intentionally produce one follow-up evaluation, so it is debounced, not permanently suppressed.
- `scheduleAchievementEvaluation()` is called unconditionally on every RAF frame, even for state changes that don't affect achievements (map pans, non-data interactions). The debounce absorbs this correctly, but unlike the marker path which short-circuits via `markerVisibilityStateKey`, there is no pre-debounce gate for achievement-specific state changes.

**User-visible difference:**
When a user rapidly filters, checks in, syncs cloud data, or moves through UI states, the app should feel less jittery and do less background achievement work. Badge/rank updates may appear a few seconds after the state settles instead of trying to recompute during every render heartbeat.

**How much better:**
- Before: every settled `syncState()` heartbeat could launch achievement evaluation as soon as the previous run finished.
- After: heartbeat bursts schedule one trailing achievement evaluation after 3 seconds of quiet, with concurrency protection for long runs.

### Fix #9 — CSV Polling Scale Hardening
**Files:** `modules/dataService.js`, `core/app.js`
**Date:** 2026-04-28

**What was wrong:**
CSV polling originally ran every 10 seconds. At scale, that is excessive for a Google Sheets CSV source and creates unnecessary background traffic. The boot path also called both `loadData()` and `safeDataPoll()` directly, which made the data service lifecycle harder to reason about.

**The fix:**
- The 5-minute polling interval and tab-refocus refresh were implemented as part of Fix #5.
- Finished the remaining Fix #9 cleanup by moving the polling scheduler start into `loadData()`.
- Removed the direct `safeDataPoll()` call from `core/app.js`.
- `core/app.js` now has one data entry point: `window.BARK.loadData()`.
- `loadData()` now handles cache hydration, starts the background scheduler, and performs the immediate online fetch.

**Why this matters:**
The app should not ask every active tab to hit the CSV source every 10 seconds. It also should not require the boot orchestrator to know the internals of the data service. One entry point keeps startup simpler, while the data service owns its own immediate-load and background-refresh lifecycle.

**Pros of this approach:**
- Keeps CSV polling at 5 minutes instead of 10 seconds.
- Preserves immediate fetch on app open.
- Preserves refresh-on-return via `visibilitychange`.
- Removes a data-service implementation detail from `core/app.js`.
- Avoids duplicate immediate fetches because `safeDataPoll()` only schedules the next background poll.
- `safeDataPoll()` is called before the `navigator.onLine` check, so the 5-minute timer and refocus listener are bound even when the device starts offline. When the user reconnects and tab-switches, the `visibilitychange` handler already exists and correctly triggers a fetch attempt.
- `window.BARK.safeDataPoll` is still exported but becomes a no-op after `loadData()` runs (because `dataPollLoopStarted = true`). External code cannot accidentally start a second polling loop.

**Cons / tradeoffs:**
- `loadData()` now starts the polling scheduler as a side effect, so callers should not treat it as cache-only.
- CSV updates can still take up to 5 minutes to appear during continuous active use.
- The 1-minute refocus throttle means very rapid tab switching will not fetch every time.
- The 5-minute timer starts from when `safeDataPoll()` is called, not from when the immediate `runDataPollCycle()` fetch completes. On a slow boot network the first scheduled poll and the boot fetch could arrive closer together than expected — at most a few seconds' drift. Not a real problem, but the timer is not strictly "5 minutes after first fetch."

**User-visible difference:**
A user still gets park data immediately on load, and if they return to the tab later the app checks for fresher data. Behind the scenes, the app is far gentler on the CSV source and less likely to contribute to throttling as usage grows.

**How much better:**
- Before: 10-second CSV polling and boot orchestration that knew about both immediate load and polling internals.
- After: 5-minute CSV polling, refocus refresh, and one clean app boot call into the data service.

---

## Rules for This Project
- Keep all existing features. Do not remove anything without asking.
- One fix at a time. Mark done in this file before starting the next.
- After each fix: update the checkbox above, update "Current Work" section.
- Do not start a new fix mid-conversation if context is getting long. Finish the current one, update this file, then start fresh.
- Settings changes must go through `window.BARK.settings.set()`, not raw window assignment.
- Firestore calls must go through `firebaseService.js`.
- DOM lookups should use `window.BARK.DOM` where elements are registered there.
