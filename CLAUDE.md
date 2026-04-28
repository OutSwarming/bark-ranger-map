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

- [x] **#10 — `getMarkerVisibilityStateKey()` sorts visited IDs on every RAF** (`modules/renderEngine.js`, `services/authService.js`, `services/checkinService.js`, `services/firebaseService.js`) ✅

- [x] **#11 — Levenshtein search is unbounded on main thread** (`modules/searchEngine.js`, `modules/renderEngine.js`) ✅

- [x] **#12 — `barkState.js` redundant settings initialization** (`modules/barkState.js`) ✅

- [ ] **#13 — `authService.js` cloud hydration has 90+ hardcoded element IDs** (`services/authService.js`, `handleCloudSettingsHydration`): The final `ids` object hardcodes 20 element IDs that already exist in `SETTINGS_REGISTRY[key].elementId`. Replace with a loop over the registry.

- [ ] **#14 — `settingsController.js` queries Firestore directly** (`modules/settingsController.js:79`): `refreshTrailRendering()` calls `firebase.firestore()` directly. All Firestore access belongs in `firebaseService.js`. Extract to a `firebaseService.getCompletedExpeditions(uid)` helper.

- [ ] **#15 — Dead code in `tests/` is misleading** (`tests/`): `app.test.js` (286KB old monolith), `tmp_test.js` (another copy), `test.js` (broken syntax). Delete all three with `git rm`. Do not add a test framework yet — that is a separate workstream.

- [ ] **#16 — `firebase.json` missing hosting config**: Add the `"hosting"` block so `firebase deploy --only hosting` works. Public directory is the repo root. Ignore `node_modules`, `functions`, `raw_trails`, `data`, `scripts`, `legacy`, `tests`, `plans`, `docs`.

- [ ] **#17 — iOS settings overlay scroll leak** (`modules/settingsController.js`): `document.body.style.overflow = 'hidden'` does not work on iOS Safari. Use `document.body.style.position = 'fixed'` with scroll offset preservation on open, restore on close.

- [ ] **#18 — User-visible degraded state when `initMap` fails**: When the map fails (Leaflet CDN down, DOM node missing, etc.), the user sees nothing — no error, no message, just a broken blank screen. Add a visible in-page message ("Map unavailable — try refreshing") that appears if `initMap` is not in `_bootErrors` within N seconds, or if `window.map` is still undefined after boot. This is distinct from Fix #2 (loader stuck) — the loader dismisses, but the user still has no signal that something is wrong.

## Current Work
Fix #12 complete. Start with Fix #13 next session.

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

**Rating: 9 / 10**

| Dimension | Score | Reasoning |
|---|---|---|
| Long-term solution | 9 | `callInit()` is scalable, async-aware, and easy to extend; unified pattern replaces inconsistent raw `if` calls |
| Speed | 10 | Zero overhead when nothing fails; try/catch and `await` add negligible cost on the happy path |
| Code efficiency | 9 | Unified pattern eliminated redundant code; boot summary is new capability with no extra complexity |
| Reliability | 9 | Catches both sync throws and rejected Promises; every failure is named in the boot summary |

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

**Rating: 8 / 10**

| Dimension | Score | Reasoning |
|---|---|---|
| Long-term solution | 8 | 8-second timeout is a reasonable judgment call; moving to module scope was the correct structural fix |
| Speed | 10 | No performance impact; loader dismissal is CSS opacity + a single `setTimeout` |
| Code efficiency | 9 | Minimal change; module-scope definition cleanly eliminates the ordering dependency |
| Reliability | 8 | Covers Firebase failure and Leaflet CDN failure; 8s edge case (auth slow but not dead) is a known, accepted tradeoff |

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

**Rating: 8 / 10**

| Dimension | Score | Reasoning |
|---|---|---|
| Long-term solution | 9 | Registry-driven hydration auto-handles new settings without touching `authService.js` |
| Speed | 8 | `onChange` fires synchronously for each of up to 15 settings; RAF batching absorbs the effects but the notify volume is unchanged |
| Code efficiency | 9 | ~90 lines → ~50 lines, one code path, four redundant mechanisms removed |
| Reliability | 8 | Correct and clean; synchronous `onChange` burst is absorbed by RAF but not minimally efficient |

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

**Rating: 8.5 / 10**

| Dimension | Score | Reasoning |
|---|---|---|
| Long-term solution | 8 | Lazy init is the right pattern; turf CDN is the same category of risk and remains unguarded |
| Speed | 9 | O(1) null check on every render call — zero measurable overhead on the happy path |
| Code efficiency | 9 | Minimal surface area changed, no new abstractions, well-scoped |
| Reliability | 8 | Correctly prevents the parse-time crash; `flyToActiveTrail()` error message is slightly misleading when Leaflet is the real failure |

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

**Rating: 9 / 10**

| Dimension | Score | Reasoning |
|---|---|---|
| Long-term solution | 9 | Named constants, correct responsibility split, error backoff, and all the right guards |
| Speed | 10 | 96.7% reduction in background CSV requests — maximum possible without removing the feature |
| Code efficiency | 8 | The 4-function chain (`loadData` → `runDataPollCycle` → `runScheduledDataPoll` → `scheduleNextDataPoll`) is slightly deeper than needed but each function has a clear single purpose |
| Reliability | 9 | Kill switch, stop flag, `pollInFlight` guard, and idempotent listener all present; fire-and-forget in `loadData()` is the only gap |

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

**Rating: 8.5 / 10**

| Dimension | Score | Reasoning |
|---|---|---|
| Long-term solution | 8 | Shallow copy is correct for this data shape; future nested mutations would need separate attention |
| Speed | 9 | One spread per visited park per achievement eval — submillisecond even at 1,000 parks |
| Code efficiency | 9 | Five lines changed, zero new abstractions, exactly what was needed |
| Reliability | 9 | Three defensive guards (null check, `parkLookup` existence, `mapPoint` null) — all correct |

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

**Rating: 9.5 / 10**

| Dimension | Score | Reasoning |
|---|---|---|
| Long-term solution | 9 | `getLocalDateKey` is reusable if streak logic expands; manual formatting is more portable than `toLocaleDateString` especially on Cloud Functions runtimes with small-ICU |
| Speed | 10 | Three date reads and two `padStart()` calls — can't get cheaper |
| Code efficiency | 10 | One helper, zero new abstractions, implementation strictly better than the original spec |
| Reliability | 9 | Calendar arithmetic handles DST and month rollover correctly; one-time sting for users with existing UTC-shifted records |

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

**Rating: 9.5 / 10**

| Dimension | Score | Reasoning |
|---|---|---|
| Long-term solution | 9 | Trailing debounce + overlap guard is the canonical pattern, correctly implemented |
| Speed | 9 | `clearTimeout` + `setTimeout` are O(1); minor: fires on every RAF frame even for non-achievement state changes |
| Code efficiency | 9 | Three module-local variables, clean separation of scheduling and execution, no globals |
| Reliability | 10 | `finally` prevents deadlock, boolean flag deduplicates correctly, error path fully handled |

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

**Rating: 9 / 10**

| Dimension | Score | Reasoning |
|---|---|---|
| Long-term solution | 9 | Single data entry point for boot is cleaner; data service owns its full lifecycle |
| Speed | 9 | No change to polling cadence — same 5-minute intervals, same refocus behavior |
| Code efficiency | 9 | Two fewer lines in `app.js`, one cleaner comment, no regressions |
| Reliability | 9 | Online and offline paths both correct; timer-before-fetch ordering is intentional and safe |

### Fix #10 — Cached Visited-ID Render Fingerprint
**Files:** `modules/renderEngine.js`, `services/authService.js`, `services/checkinService.js`, `services/firebaseService.js`
**Date:** 2026-04-28

**What was wrong:**
`getMarkerVisibilityStateKey()` rebuilt the visited-ID part of the marker fingerprint on every heartbeat with `Array.from(userVisitedPlaces.keys()).sort().join(',')`. That is unnecessary work during map movement, filtering, and other render cycles where the visited set has not changed. As the visit count grows, sorting those IDs repeatedly becomes wasted main-thread work.

**The fix:**
- Added `getVisitedIdsCacheKey()` in `renderEngine.js`.
- It returns `window.BARK._visitedIdsCacheKey` when present.
- It only rebuilds the sorted visited-ID string when the cache is missing.
- Added `window.BARK.invalidateVisitedIdsCache()`.
- The invalidation helper clears `_visitedIdsCacheKey` and also invalidates marker visibility so changed visit IDs refresh pin classes.
- Added cache invalidation when cloud auth sync replaces `userVisitedPlaces`.
- Added cache invalidation when logout clears `userVisitedPlaces`.
- Added cache invalidation for GPS verified check-ins.
- Added cache invalidation for manual mark-as-visited add/remove.
- Added cache invalidation for manage-portal removal.

**Why this matters:**
The marker fingerprint is part of the central render heartbeat. Anything inside it should be cheap and stable. Visited IDs change only when the user adds/removes/checks in/syncs visits, not every frame. Moving the sort to mutation time keeps the render path fast and makes the cost proportional to actual visit changes instead of UI heartbeat frequency.

**Pros of this approach:**
- Removes repeated visited-ID sorting from the hot render path.
- Keeps the existing fingerprint behavior and marker refresh semantics.
- Invalidation is explicit at every known ID-changing mutation point.
- The cache is stored on `window.BARK`, making it easy to inspect in the console during debugging.
- Manual removal and GPS check-ins are covered in addition to the original cloud/manual mark flows.
- The cache sentinel uses `typeof window.BARK._visitedIdsCacheKey === 'string'` rather than a truthiness check — this correctly handles the zero-visits state where the key is `''` (empty string). A truthiness check would treat `''` as a cache miss and re-sort on every frame when the user has no visits.
- All six invalidation call sites guard with `if (typeof window.BARK.invalidateVisitedIdsCache === 'function')` — if `renderEngine.js` fails to boot, service files degrade to a safe no-op instead of throwing a ReferenceError mid-check-in or mid-sync.
- `invalidateVisitedIdsCache()` calling `invalidateMarkerVisibility()` is redundant when IDs actually change (the fingerprint differs anyway), but it provides a correctness guarantee for any future preventive invalidation — forcing the next heartbeat to re-evaluate unconditionally without relying on the fingerprint comparison.

**Cons / tradeoffs:**
- Correctness now depends on every future visit-ID mutation calling `window.BARK.invalidateVisitedIdsCache()`.
- The cache stores only IDs, not visit metadata; changing a visit date or verification detail does not invalidate it because those changes do not alter marker visibility membership.
- There is still sorting work when the visited set changes, but that is the right time to pay it.

**User-visible difference:**
Users with many visited places should get smoother map/render behavior during interactions that do not change visits, because the app no longer sorts the full visited-ID list on every heartbeat. Pins still update immediately after add/remove/check-in/cloud sync because those paths invalidate the cache.

**How much better:**
- Before: every marker fingerprint rebuild sorted all visited IDs.
- After: visited IDs are sorted once per visit-set change and reused until invalidated.

**Rating: 8.5 / 10**

| Dimension | Score | Reasoning |
|---|---|---|
| Long-term solution | 8 | Correct caching pattern; maintenance burden grows as more visit-mutation paths are added |
| Speed | 9 | O(n log n) sort moved off every RAF frame; cost now proportional to actual visit changes |
| Code efficiency | 8 | Four files, six call sites — correctly guarded everywhere, but wider surface area than most fixes |
| Reliability | 9 | `typeof === 'string'` handles zero-visits correctly; typeof guards on all call sites; redundant but safe `invalidateMarkerVisibility()` |

### Fix #11 — Budgeted Levenshtein Search
**Files:** `modules/searchEngine.js`, `modules/renderEngine.js`
**Date:** 2026-04-28

**What was wrong:**
The search input waited for the 300ms debounce, then ran fuzzy matching synchronously across every park in `window.BARK.allPoints`. For each park it could run Levenshtein against the full normalized park name, then against individual words. At ~1,000 parks this may feel acceptable on a desktop. At 5,000+ parks, especially on a mobile device, the worst-case path can monopolize the main thread long enough to cause input jank, delayed paints, and a "the app froze while I typed" feeling.

There was also a second hidden version of the same risk in `renderEngine.js`: if `_searchResultCache` was missing or mismatched, marker rendering could run its own Levenshtein fallback inside the marker loop. That means a partial/budgeted search fix in `searchEngine.js` alone would not be enough. The expensive work could still reappear during `updateMarkers()`, which is exactly the render heartbeat path we are trying to keep cheap.

One more user-facing issue appeared once search became partial: the existing global-town fallback could fire as soon as local suggestions were empty. With chunking, "empty so far" is not the same as "empty after checking all parks." The fallback needed to wait until local search finished, otherwise premium users could trigger unnecessary global geocode calls before the app had finished checking the local park list.

**The fix:**
- Added named search constants:
  - `SEARCH_INPUT_DEBOUNCE_MS = 300`
  - `SEARCH_FRAME_BUDGET_MS = 16`
  - `SEARCH_CONTINUATION_DELAY_MS = 0`
  - `SEARCH_SUGGESTION_LIMIT = 8`
  - `SEARCH_SCORE_THRESHOLD = 2`
  - `SEARCH_GLOBAL_MIN_LENGTH = 3`
- Extracted search scoring into `scoreSearchItem(item, queryNorm)` so the scoring rules live in one place instead of being buried inside the event handler.
- Renamed the misleading code comment from `O(1) LEVENSHTEIN` to `SPACE-OPTIMIZED LEVENSHTEIN`. The implementation uses one row of dynamic-programming state, so memory is optimized, but runtime is still proportional to the compared string lengths.
- Replaced the one-shot `allPoints.forEach(...)` search with a budgeted chunk runner:
  - It records `performance.now()` at the start of each chunk.
  - It processes parks until the elapsed chunk time reaches the 16ms budget.
  - It publishes partial results into `_searchResultCache`.
  - It schedules the remainder with `setTimeout(..., 0)`.
  - It repeats until every park has been checked.
- Added a per-search `activeSearchRunId` cancellation guard. Every new keystroke, clear action, or suggestion click invalidates older scheduled work so stale chunks cannot repaint old results over the new query.
- Expanded `_searchResultCache` shape:
  - `query`
  - `matchedIds`
  - `complete`
  - `processedCount`
  - `totalCount`
- Suggestions now render from the incremental `matches` array instead of doing a second full `allPoints.filter(...)` pass after scoring.
- While a large local search is still running, the dropdown can show partial local matches plus a "Searching local map..." status row.
- The global towns/cities fallback now waits until local search is complete. "No local matches yet" no longer triggers geocoding.
- Suggestion click now cancels pending search work and seeds `_searchResultCache` with the selected park. That keeps marker rendering deterministic after the active search text changes to the selected park name.
- `renderEngine.js` now normalizes the active search query once per marker update instead of once per marker.
- `renderEngine.js` now trusts a matching `_searchResultCache` and no longer runs Levenshtein inside the marker loop.
- If the render cache is unavailable or mismatched, `renderEngine.js` only falls back to a cheap substring check. Fuzzy search is now owned by `searchEngine.js`, not duplicated in the render heartbeat.
- The marker visibility fingerprint now includes whether the search cache is partial or complete.
- Map auto-framing waits for the matching search cache to be complete. This prevents the map from flying to partial early results, then refusing to re-frame when the full result set finishes.
- Search suggestion UI now uses DOM nodes and `textContent` for user-entered query text in the rebuilt rows, instead of injecting the query through `innerHTML`.

**Why this matters:**
The main thread is the user's whole app: typing, painting, scrolling, map movement, marker visibility, and click response all share it. A synchronous fuzzy search that scales linearly with park count and string-comparison cost is okay only while the dataset is small. It becomes a reliability bug as the data grows.

This fix keeps the same local fuzzy-search behavior, but changes the scheduling model. Instead of "finish all fuzzy matching before the browser can breathe," the app now does "work for a small budget, publish what is known, then continue." That is the right long-term direction for a map app that wants to scale from ~1,000 parks to 5,000+ without making mobile users pay for the whole search in one blocking task.

**Pros of this approach:**
- Keeps the existing fuzzy search behavior: substring matches still win, typo tolerance still works for local park names, and the score threshold remains `<= 2`.
- Prevents one search from monopolizing the main thread for the full dataset.
- Gives the UI a chance to paint between chunks on large searches.
- Results become progressive: the app can show early local matches while still checking the rest.
- Stale search work is cancelled cleanly with `activeSearchRunId`, so fast typers do not get old-query results rendered after a new query starts.
- The cache is now self-describing: `complete`, `processedCount`, and `totalCount` make debugging much easier in the console.
- Global geocoding is more correct because it only runs after local search is truly complete.
- The render heartbeat becomes cheaper and easier to reason about because fuzzy matching no longer happens in `updateMarkers()`.
- Normalizing the query once per marker update removes repeated string work from the marker loop.
- Auto-framing waits for complete search results, which avoids camera movement based on an incomplete subset.
- Rebuilding the global fallback button with DOM nodes avoids injecting raw user search text into `innerHTML`.
- The solution fits the current architecture: vanilla JS, no bundler, no new dependency, no worker build pipeline, no server change.

**Cons / tradeoffs of this approach:**
- Total search work is still linear across all parks. Chunking improves responsiveness, not total algorithmic complexity.
- The 16ms budget is best-effort. If one individual park comparison is unusually expensive, that one comparison still has to finish before the loop can yield.
- The dropdown may briefly show partial local results plus a "Searching local map..." row on very large datasets or slow devices.
- Markers can update progressively as the cache fills. That is intentional, but it means the visible filtered set may be incomplete for a moment during a large fuzzy search.
- Global town/city fallback is delayed until local search completes. This is the correct behavior, but premium users searching for a city may wait a little longer before the global search begins.
- `renderEngine.js` no longer performs fuzzy fallback if some external code sets `window.BARK.activeSearchQuery` without going through the search engine. In that rare case, render falls back to cheap substring matching only. Normal user typing still goes through the budgeted fuzzy cache.
- More helper functions exist inside `initSearchEngine()`. The complexity is still scoped, but the search module is larger than before.
- `setTimeout(..., 0)` yields work in small tasks but is not the same as a true background thread. A Web Worker would isolate CPU work more strongly, but would require a larger architectural change.

**Alternative solution A — Web Worker search:**

**Pros:**
- Best main-thread isolation. Fuzzy matching could run off the UI thread entirely.
- Scales better for very large datasets and slower mobile CPUs.
- Cancellation can be implemented with worker message IDs similar to `activeSearchRunId`.
- Would make future heavier ranking algorithms safer.

**Cons:**
- Larger architecture change in this app because there is no bundler and modules attach to `window.BARK`.
- Worker needs a serializable copy of park search fields. Markers and Leaflet objects cannot cross the worker boundary.
- Requires a sync/update protocol whenever `allPoints` changes.
- Debugging becomes more complex because search state is split between the main thread and worker thread.
- More moving parts for a store-launch reliability pass. Good future option, bigger than Fix #11.

**Verdict:**
Best long-term ceiling, but heavier than needed today. The chunked main-thread approach gets most of the responsiveness win with much lower implementation risk.

**Alternative solution B — Prebuilt client-side search index (`Fuse.js`, `FlexSearch`, MiniSearch, trie/prefix index):**

**Pros:**
- Faster repeated searches after the index is built.
- Better ranking, weighting, and typo behavior if using a mature library.
- Could support richer search fields later: park name, state, swag type, aliases, nearby towns.
- A purpose-built index can reduce per-keystroke brute-force work.

**Cons:**
- Adds dependency and load-order concerns to a no-bundler app.
- Index build time still has to happen somewhere and must be refreshed when CSV data updates.
- Fuzzy libraries can be surprisingly heavy on mobile if configured broadly.
- Different scoring can subtly change search results users are used to.
- More surface area to debug if search results look "wrong."

**Verdict:**
Good future product improvement if search becomes a major feature. For Fix #11, it is more change than needed to solve the immediate main-thread reliability problem.

**Alternative solution C — Remove Levenshtein and use substring/prefix search only:**

**Pros:**
- Fastest and simplest client-side option.
- Very easy to reason about.
- No typo-distance cost.
- Marker render fallback would stay cheap everywhere.

**Cons:**
- Loses typo tolerance. A user searching `Yosimite`, `Acadiaa`, or `Grnad Canyon` may get no local result.
- Makes the app feel less forgiving.
- Does not match the existing user experience.

**Verdict:**
Excellent for raw speed, too large a UX regression for this app. Kept fuzzy search instead.

**Alternative solution D — Server-side search endpoint:**

**Pros:**
- Keeps heavy search work off the client.
- Can scale with a proper database/index.
- Could support analytics, synonyms, aliases, and typo correction centrally.

**Cons:**
- Requires backend work and network availability for a core local-map interaction.
- Adds latency and possible cost.
- Offline/PWA behavior gets worse.
- Current park data already lives client-side after CSV load, so server round trips are unnecessary for local park search.

**Verdict:**
Not the right fit for local park search right now. Better reserved for richer future search products or admin/store features.

**Alternative solution E — Increase debounce only:**

**Pros:**
- Tiny change.
- Reduces how often search runs while the user is typing.
- No behavioral complexity.

**Cons:**
- Does not fix the blocking search once it starts.
- Makes search feel slower.
- Fails the 5,000+ parks scalability goal because the final query still runs as one synchronous block.

**Verdict:**
Helpful only as a band-aid. The app already had a 300ms debounce; the real issue was the unbounded post-debounce work.

**Use cases and what the user sees:**

**Use case 1 — Exact local park search:**
A user types `Acadia`. On normal devices and current data size, results should appear almost exactly as before. Internally, the search may still complete in one chunk if it stays under budget. If the dataset is much larger or the device is slower, the dropdown can show early local matches while the rest of the map is still being checked.

**Use case 2 — Typo-tolerant local search:**
A user types a slightly wrong park name like `Acadiaa` or `Yosimite`. Fuzzy matching still works because the Levenshtein scoring rules were preserved. The difference is that typo matching no longer has to finish across every park before the browser can paint.

**Use case 3 — Massive future dataset on a phone:**
At 5,000+ parks, a single synchronous fuzzy loop can make the keyboard, dropdown, or map feel stuck. With this fix, the app works in slices. The user may see a "Searching local map..." row briefly, but the page stays responsive and results fill in progressively.

**Use case 4 — Premium user searches for a town/city not in local parks:**
Before chunking, the global fallback ran after the full local pass. With naive chunking, it could have accidentally run after only a partial local pass. This fix preserves the correct behavior: the app waits until local search is complete, then offers/runs global search if there are no local matches.

**Use case 5 — User types quickly, then changes their mind:**
If the user types `aca`, then quickly changes to `yose`, the older `aca` chunks are invalidated by `activeSearchRunId`. Old work cannot repaint stale suggestions over the new query.

**Use case 6 — User taps a local suggestion while search is still running:**
The app cancels remaining chunks, sets the input to the chosen park, seeds the cache with that exact park, hides suggestions, syncs markers, and opens the marker. There is no delayed stale chunk coming behind it.

**Use case 7 — Map auto-framing during large search:**
The map no longer flies to the first partial set of search results. It waits until the matching cache is complete, then frames the final visible result set. This is less jumpy and avoids a subtle "camera moved to the wrong subset" problem.

**Debugging notes:**
Inspect `window.BARK._searchResultCache` in the console while typing. During a large search it should look like:

```js
{
  query: "acadia",
  matchedIds: Set(...),
  complete: false,
  processedCount: 240,
  totalCount: 5000
}
```

When the search finishes, `complete` becomes `true` and `processedCount === totalCount`. If a stale query ever appears, check `activeSearchRunId` logic in `initSearchEngine()` first. If marker visibility looks wrong, confirm that `searchCache.query` equals `window.BARK.normalizeText(window.BARK.activeSearchQuery)` and that `matchedIds` contains the expected park IDs.

**User-visible difference:**
Search should feel the same on small/current data, but it should stay responsive on larger data and slower devices. On large searches, users may briefly see a local-search status row while results are still being checked. Premium global search starts after local search is complete, not while local search is still partial. The map camera should move after final search results are known rather than reacting to an incomplete subset.

**How much better:**
- Before: one post-debounce search could synchronously fuzzy-match every park on the main thread.
- Before: marker rendering still had a hidden duplicate Levenshtein fallback.
- Before: a chunked search would have risked global fallback and auto-framing based on incomplete local results.
- After: search work is budgeted to ~16ms chunks, stale chunks are cancelled, partial progress is cached, marker rendering avoids fuzzy work, global fallback waits for local completion, and auto-framing waits for the final matching cache.

**Verification:**
- `node --check modules/searchEngine.js`
- `node --check modules/renderEngine.js`
- Mocked DOM/clock smoke test forced the 16ms budget path:
  - Debounced search scheduled correctly at 300ms.
  - First search chunk published `complete: false`.
  - Continuation chunks were scheduled with delay `0`.
  - Final cache published `complete: true`.
  - Expected local match was present in `matchedIds`.

**Rating: 9 / 10**

| Dimension | Score | Reasoning |
|---|---|---|
| Long-term solution | 8 | Correct low-risk bridge for 5,000+ parks; a worker or search index may eventually be better if search grows into a major product surface |
| Speed | 9 | Removes the worst single blocking task and removes render-loop Levenshtein; total work is still linear |
| Code efficiency | 8 | More helper code, but each helper has a specific job and avoids new dependencies |
| Reliability | 9 | Cancellation, partial cache metadata, render-cache alignment, delayed global fallback, and complete-result auto-framing all protect real edge cases |
| Debuggability | 10 | `_searchResultCache.complete`, `processedCount`, and `totalCount` make search state inspectable instead of invisible |

### Fix #12 — `barkState.js` Is Runtime Data State Only
**File:** `modules/barkState.js`
**Date:** 2026-04-28

**What was wrong:**
`barkState.js` was still initializing persistent settings directly from `localStorage` at module load:

```js
window.allowUncheck = localStorage.getItem('barkAllowUncheck') === 'true';
window.standardClusteringEnabled = localStorage.getItem('barkStandardClustering') !== 'false';
window.premiumClusteringEnabled = localStorage.getItem('barkPremiumClustering') === 'true';
window.lowGfxEnabled = ...
window.simplifyTrails = ...
window.instantNav = ...
```

That block was no longer the real settings system. `state/settingsStore.js` loads shortly afterward, reads persistent settings directly, then installs `Object.defineProperty(window, key, { get, set })` mirrors for the same legacy `window.*` names. The `barkState.js` values were temporary raw globals that were overwritten by the canonical settings store.

This created two problems:
- Ownership was unclear. A reader could reasonably think `barkState.js` owned settings because it still contained the old localStorage hydration logic.
- Boot-time debugging was noisier than necessary. There were two places to inspect for settings defaults, low-graphics presets, clustering derivation, gesture toggles, and performance toggles.

The actual app already depended on the later `settingsStore.js` mirrors. Keeping the old block in `barkState.js` made the codebase look less stable than it really was.

**The fix:**
- Removed the entire settings hydration block from `modules/barkState.js`.
- Removed raw initialization for:
  - `allowUncheck`
  - `standardClusteringEnabled`
  - `premiumClusteringEnabled`
  - `clusteringEnabled`
  - `lowGfxEnabled`
  - `simplifyTrails`
  - `instantNav`
  - `rememberMapPosition`
  - `startNationalView`
  - `stopAutoMovements`
  - `reducePinMotion`
  - `removeShadows`
  - `stopResizing`
  - `viewportCulling`
  - `forcePlainMarkers`
  - `limitZoomOut`
  - `simplifyPinsWhileMoving`
  - `ultraLowEnabled`
  - `lockMapPanning`
  - `disable1fingerZoom`
  - `disableDoubleTap`
  - `disablePinchZoom`
- Left runtime data state in `barkState.js`:
  - `allPoints`
  - `userVisitedPlaces`
  - `tripDays`
  - `activeDayIdx`
  - `activeSwagFilters`
  - `activeSearchQuery`
  - `activeTypeFilter`
  - `visitedFilterState`
  - `_searchResultCache`
  - `activePinMarker`
  - trip bookends
  - `parkLookup`
  - app version
  - request-count safety state
  - gamification engine instance
- Updated the file header to make ownership explicit:
  - `barkState.js` owns mutable runtime data state and the `window.BARK` namespace.
  - Persistent user settings are owned by `state/settingsStore.js`.

**Why this is safe:**
The script order in `index.html` is:

```text
modules/settingsRegistry.js
modules/barkState.js
modules/barkConfig.js
config/domRefs.js
state/settingsStore.js
state/appState.js
...
modules/mapEngine.js
modules/renderEngine.js
...
core/app.js
```

The only files between `barkState.js` and `settingsStore.js` are `barkConfig.js` and `domRefs.js`. Those files do not read `window.lowGfxEnabled`, `window.clusteringEnabled`, `window.allowUncheck`, gesture settings, or performance settings during parse. The map/render/search/settings controllers that actually consume those legacy setting globals load after `settingsStore.js` has installed the canonical mirrors.

The smoke test verified this explicitly:
- After `barkState.js`, `window.allowUncheck` and `window.lowGfxEnabled` are not created by `barkState.js`.
- After `settingsStore.js`, the legacy mirrors exist.
- Stored values still hydrate correctly from `localStorage`.
- Derived `window.clusteringEnabled` still works.
- Assigning a legacy mirror like `window.allowUncheck = false` still routes through `settingsStore` and persists to `localStorage`.

**Why this matters:**
This is not a flashy feature fix. It is an ownership fix. For a codebase trying to become reliable at scale, state ownership matters a lot. Settings now have one obvious home:

```text
Persistent settings -> state/settingsStore.js
Runtime app data    -> modules/barkState.js / state/appState.js mirrors
```

That makes future debugging faster. If low graphics mode is wrong, look in `settingsStore.js`, the settings registry, or the cloud hydration path. Do not waste time checking a stale boot-time localStorage block in `barkState.js`. If active search, trip days, visited places, or marker state is wrong, then `barkState.js` is still relevant.

**Pros of this approach:**
- Removes duplicate settings ownership.
- Reduces boot-time code in `barkState.js`.
- Makes `barkState.js` easier to scan: it now starts with app version, then runtime data/state infrastructure.
- Prevents future engineers from editing the wrong settings initialization path.
- Keeps all existing settings behavior because `settingsStore.js` already hydrates from `localStorage`.
- Keeps legacy `window.*` setting reads working for existing modules.
- Keeps low-graphics default behavior in the canonical store, including device-memory auto-detect when no saved value exists.
- Keeps low-graphics and ultra-low presets centralized in one place.
- Keeps derived clustering centralized: `window.clusteringEnabled` remains a read-only derived mirror from standard/premium clustering.
- No dependency, schema, DOM, Firebase, or user-data changes.
- Smaller boot surface: fewer raw global writes before the structured store takes over.

**Cons / tradeoffs:**
- There is now a short parse-time interval between `barkState.js` and `settingsStore.js` where settings globals are intentionally not defined. This is safe with the current load order because no in-between module reads them, but it is a load-order invariant worth preserving.
- If someone later inserts a new script between `barkState.js` and `settingsStore.js` and that script reads `window.lowGfxEnabled` at parse time, it will see `undefined`. The correct fix in that future case is to move the script after `settingsStore.js` or read through `window.BARK.settings` after it exists, not to reintroduce duplicate hydration.
- `barkState.js` still reads `localStorage` for non-settings runtime state (`APP_VERSION`, `visitedFilterState`). That is intentional; this fix removed persistent settings only.
- The legacy global names still exist after `settingsStore.js` because the rest of the app still reads `window.lowGfxEnabled`, `window.instantNav`, etc. This fix clarifies ownership but does not yet remove legacy global reads from every module.

**Alternative solution A — Leave the duplicate block in place:**

**Pros:**
- Zero code change.
- Settings globals exist a few milliseconds earlier during boot.
- No risk from future scripts inserted before `settingsStore.js`.

**Cons:**
- Keeps two apparent sources of truth.
- Future debugging remains confusing.
- A future edit to `barkState.js` settings defaults could appear to work briefly, then be overwritten by `settingsStore.js`.
- Makes the architecture look less mature than it is.

**Verdict:**
Not acceptable for the reliability goal. Duplicate ownership is exactly the kind of thing that causes slow, frustrating debugging later.

**Alternative solution B — Move `settingsStore.js` before `barkState.js`:**

**Pros:**
- Settings mirrors would exist before `barkState.js`.
- Removes the parse-time gap where settings globals are absent.
- Could make settings ownership even earlier in boot.

**Cons:**
- Larger load-order change.
- `settingsStore.js` depends on `settingsRegistry.js` and `LOW_GRAPHICS_PRESET`; moving it safely means re-auditing more boot edges.
- `barkState.js` does not need settings during parse after this fix, so moving the store earlier is unnecessary.
- More risky than removing dead duplicate code.

**Verdict:**
Possibly reasonable later, but not needed for Fix #12. The current script order is safe and already has `settingsStore.js` before every real settings consumer.

**Alternative solution C — Keep fallback defaults in `barkState.js` but mark them temporary:**

**Pros:**
- Settings globals exist early.
- Could protect against accidental future parse-time readers.
- Smaller behavioral change than full removal.

**Cons:**
- Still duplicates settings logic.
- Still leaves two places to update defaults and presets.
- Comments do not enforce ownership.
- Future readers still have to reason about which copy wins.

**Verdict:**
This would preserve the confusion while pretending it is documented. Better to remove the duplicate state.

**Alternative solution D — Move all runtime state out of `barkState.js` into `state/appState.js`:**

**Pros:**
- Cleaner long-term architecture.
- Could eventually eliminate more legacy globals.
- Stronger structured-state story.

**Cons:**
- Much larger refactor.
- High blast radius because many modules still use `window.BARK.allPoints`, `window.BARK.tripDays`, `window.tripStartNode`, and related legacy state.
- Not necessary to solve the settings duplication issue.

**Verdict:**
Good future direction, not Fix #12. This fix intentionally keeps runtime data state stable.

**Use cases and what the user sees:**

**Use case 1 — User has Low Graphics saved:**
A user previously enabled Low Graphics mode. On app boot, `settingsStore.js` still reads `barkLowGfxEnabled`, applies the low-graphics preset, installs `window.lowGfxEnabled`, and the later map modules still read the correct value. The user should see the same low-graphics behavior as before.

**Use case 2 — User has Premium Clustering enabled:**
The stored premium/standard clustering settings still hydrate in `settingsStore.js`. `window.clusteringEnabled` is still derived from those settings. The map and marker layer policy still see the correct clustering mode.

**Use case 3 — User opens settings:**
The settings UI still reads the same legacy mirrors and store values. Checkboxes should still reflect saved preferences. The difference is under the hood: there is no stale pre-store settings copy in `barkState.js`.

**Use case 4 — Developer debugs a setting bug:**
Before this fix, a developer could see `window.lowGfxEnabled` initialized in `barkState.js`, then later mirrored by `settingsStore.js`, and have to reason through which one was real. After this fix, the answer is straightforward: settings live in `settingsStore.js`.

**Use case 5 — A future setting is added:**
The developer should add it to the registry/store path, not to `barkState.js`. This reduces the chance of adding a setting to one place and forgetting the other.

**User-visible difference:**
There should be no intentional visual or interaction change for users. Saved settings should behave the same. The real user benefit is reliability: fewer chances for future setting defaults, low-graphics behavior, clustering behavior, or gesture toggles to drift between two initialization paths.

One concrete app instance: a user who enabled Low Graphics mode should still open the map and get the same reduced-motion/reduced-marker-cost behavior. The difference is that the map now gets that value from the single canonical settings store path, not from a temporary `barkState.js` value that gets overwritten during boot.

**How much better:**
- Before: `barkState.js` appeared to own settings, then `settingsStore.js` actually owned them.
- Before: low-graphics, ultra-low, clustering, gesture, and performance defaults existed in two places.
- After: `barkState.js` owns runtime data; `settingsStore.js` owns persistent settings.
- After: settings debugging starts in one place.

**Verification:**
- `node --check modules/barkState.js`
- `node --check state/settingsStore.js`
- `rg` confirmed the removed setting assignments are gone from `modules/barkState.js`.
- VM smoke test loaded `settingsRegistry.js` -> `barkState.js` -> `settingsStore.js` with mocked `localStorage`, `navigator`, and `GamificationEngine`.
  - Confirmed `barkState.js` does not create setting globals before `settingsStore.js`.
  - Confirmed `settingsStore.js` hydrates stored setting values.
  - Confirmed `window.clusteringEnabled` still derives correctly.
  - Confirmed legacy `window.*` assignment still persists through `settingsStore`.

**Rating: 9 / 10**

| Dimension | Score | Reasoning |
|---|---|---|
| Long-term solution | 9 | Clear ownership split: runtime data in `barkState.js`, persistent settings in `settingsStore.js` |
| Speed | 10 | Fewer boot-time localStorage reads and raw global writes; no runtime cost |
| Code efficiency | 10 | Removed a large obsolete block without adding replacement complexity |
| Reliability | 9 | Behavior preserved by `settingsStore.js`; only caveat is preserving script order so no future pre-store settings reader appears |
| Debuggability | 10 | One canonical place to inspect setting hydration, defaults, derived clustering, and presets |

---

## Rules for This Project
- Keep all existing features. Do not remove anything without asking.
- One fix at a time. Mark done in this file before starting the next.
- After each fix: update the checkbox above, update "Current Work" section.
- Do not start a new fix mid-conversation if context is getting long. Finish the current one, update this file, then start fresh.
- Settings changes must go through `window.BARK.settings.set()`, not raw window assignment.
- Firestore calls must go through `firebaseService.js`.
- DOM lookups should use `window.BARK.DOM` where elements are registered there.
