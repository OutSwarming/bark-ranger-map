# B.A.R.K. Ranger Map — Master Plan Implementation

This is the operational blueprint for taking the codebase from its current tangled state to a multi-developer, scalable, store-ready architecture. It is sequenced so every phase is independently shippable and so no phase introduces a new tangle.

Read this top to bottom once. Then follow phases in order. **Do not skip Phase -1.** It addresses five critical production blockers (admin auth, API key exposure, settings race conditions, god functions, DOM generation in services). Phase -1 is 2–3 days and is a prerequisite for everything else.

Then follow Phases 0–6 in order.

---

## 1. North Star Architecture

Four layers. Information flows down for queries, up for events. **Files in row N may only read from row N+1.** That single rule is the entire architecture.

```
┌──────────────────────────────────────────────────────────────┐
│ VIEWS  (thin — render + dispatch only, no business logic)    │
│  MapView · ParkPanel · TripView · VaultView · StoreView      │
│  ProfileView · SearchBar · SettingsView                      │
└──────────────────────────────────────────────────────────────┘
                       ↓ commands     ↑ events
┌──────────────────────────────────────────────────────────────┐
│ DOMAIN SERVICES  (orchestrate use cases, enforce rules)      │
│  ParkService · CheckinService · TripService · SearchService  │
│  StoreService · IdentityService · PreferencesService         │
└──────────────────────────────────────────────────────────────┘
                       ↓ reads/writes  ↑ change events
┌──────────────────────────────────────────────────────────────┐
│ REPOSITORIES  (own data, expose queries, emit change events) │
│  ParkRepo (+spatial index) · VaultRepo · TripRepo            │
│  OrderRepo · PreferencesRepo                                 │
└──────────────────────────────────────────────────────────────┘
                       ↓ I/O
┌──────────────────────────────────────────────────────────────┐
│ TRANSPORT  (one place per external system, no logic)         │
│  FirestoreClient · CallableClient · CsvClient · StripeClient │
└──────────────────────────────────────────────────────────────┘
```

**Map composition is parallel** — `MapView` owns six independent layers, each following the `TripLayer` pattern (Fix #19):

```
MapView
 ├─ BaseTileLayer
 ├─ ParkLayer            (replaces MarkerLayerManager)
 ├─ SearchResultLayer    (towns/cities + highlighted parks)
 ├─ TripLayer            (already exists — Fix #19)
 ├─ RouteLayer           (generated driving routes)
 └─ UserLocationLayer    (GPS dot + accuracy)
```

Each layer: own its Leaflet objects, expose one `sync(spec)` method, never read `window.*` globals.

---

## 2. Domain Ownership Table (single source of truth)

If a question's answer is not exactly one row in this table, the architecture is leaking. Fix the leak before adding the feature.

| Concern | Owner | Reads from | Writes to |
|---|---|---|---|
| Park records (canonical) | `ParkRepo` | `CsvClient` | — |
| Spatial / viewport queries | `ParkRepo.index` (RBush) | (in-memory) | — |
| User visits + badges + streaks | `VaultRepo` | `FirestoreClient` | `FirestoreClient` |
| Trip days / stops (saved) | `TripRepo` | `FirestoreClient` | `FirestoreClient` |
| Generated route geometry | `TripService` (transient) | `CallableClient.route` | (not persisted) |
| Search results (local + global) | `SearchService` | `ParkRepo.index`, `CallableClient.geocode` | — |
| GPS check-ins | `CheckinService` | `ParkRepo`, browser GPS | `VaultRepo` |
| Achievements | `AchievementService` | `VaultRepo` | `VaultRepo` |
| Cart (local) | `OrderRepo` | localStorage | localStorage |
| Orders / shipping | `OrderRepo` | `FirestoreClient` | `CallableClient.checkout` |
| Auth + premium tier | `IdentityService` | Firebase Auth, `FirestoreClient` | — |
| Settings (per-user) | `PreferencesRepo` | `FirestoreClient`, localStorage | both |
| Map render decisions | `RenderEngine` (pure) | repos + prefs snapshots | — (returns specs) |

---

## 3. Architectural Rules (enforce on every PR)

Pin these in CLAUDE.md after Phase 0:

1. **Layered reads only.** A view reads services. A service reads repositories. A repository reads transport. Never skip a layer.
2. **One owner per concern.** If two files mutate the same data, one of them is wrong. Use the table above.
3. **`sync(spec)` is the contract.** Layers, panels, and any visual surface receive a spec object. They do not read globals to fill in the blanks.
4. **No new bare `window.*` globals.** Everything goes on `window.BARK.*` until Phase 4, then becomes an ES export.
5. **One folder per domain.** A new feature is a new folder under `views/` (and `services/`/`repos/` if it has data). Don't add it to an existing module.
6. **Repositories own change events.** Services subscribe. Views re-render when their service tells them to. Views never subscribe directly.

---

## 4. Phases

Each phase has: **Goal**, **Detangle**, **Move**, **Keep**, **Add**, **Exit criteria**, **Risk**, **Estimate**. Don't start the next phase until exit criteria are met.

**Important:** Phase -1 is not optional. Do it before Phase 0. The architectural plan assumes a baseline of production safety; Phase -1 establishes that baseline.

---

### Phase -1 — Production Guardrails (security, data integrity, critical blockers)

**Goal:** Fix the five critical findings from PRODUCTION_AUDIT_REPORT.md that would break a production deployment. These are not refactors — they are blockers that must be addressed before scaling. Do this week. It unlocks the rest.

**The five blockers:**

1. **Cloud Functions lack admin authorization** ([PRODUCTION_AUDIT_REPORT.md:169-171](https://docs.google.com/document/d/1)). `extractParkData()` and `syncToSpreadsheet()` are callable from any client without auth checks. Any user can trigger the Gemini API and AI data extraction.
   - **Fix:** Add `requireAuthCallable(context)` to both functions. Also add `requireAdminUser(context)` to `syncToSpreadsheet()` (only admins should write the master CSV).
   - **Files:** `functions/index.js` (~10 lines).

2. **API keys are exposed in client code** ([PRODUCTION_AUDIT_REPORT.md:183-185](https://docs.google.com/document/d/1)). ORS API key hardcoded in `modules/barkConfig.js`. Paid Gemini key was hardcoded in `functions/index.js` (already moved to secrets in Fixes #20-22, but needs verification that it's gone).
   - **Fix:** Verify the ORS key rotation plan from Fixes #20-22 is complete. If not, complete it: move `ORS_API_KEY` to Firebase secrets, wire `services/orsService.js` to call `getPremiumRoute` callable instead of hitting ORS directly (this is Phase 2 work, but if keys are still exposed it must be done now).
   - **Files:** `modules/barkConfig.js`, `functions/index.js`, `services/orsService.js`.
   - **Dependency:** This may require Phase 1 + Phase 2 repository work to be clean. If ORS is still hardcoded and exposed, do the key rotation first, even if it means pulling forward some Phase 2 work.

3. **Triple state ownership creates race conditions** ([PRODUCTION_AUDIT_REPORT.md:87-99](https://docs.google.com/document/d/1)). `barkState.js`, `appState.js`, and `settingsStore.js` all install `Object.defineProperty` on `window.*` simultaneously. During auth hydration, one can overwrite another's values, corrupting settings.
   - **Fix:** This is a Phase 0 job, but if it's not done before users log in at scale, settings corruption cascades. Make it a Phase -1 priority if users report corrupted preferences.
   - **For Phase -1:** Audit the startup order in `core/app.js`. Ensure `settingsStore.js` hydrates AFTER `barkState.js` has finished setting defaults. Add a console warning if the hydration order is ever reversed.
   - **Files:** `modules/barkState.js`, `state/settingsStore.js`, `core/app.js` (~20 lines of guards).

4. **`authService.initFirebase()` is a 390-line god function** that handles auth, settings, expedition UI, admin rendering, streak logic in one callback. A single exception cascades across every feature.
   - **Fix:** Wrap the callback in try/catch with clear error logging (you already have the pattern from Fix #1). Add a user-visible "Auth failed" banner if the callback throws.
   - **Files:** `services/authService.js` (~20 lines).

5. **`firebaseService.loadSavedRoutes()` generates DOM inside a service and modifies state** ([PRODUCTION_AUDIT_REPORT.md:120-131](https://docs.google.com/document/d/1)). If the UI layout changes, this function breaks silently.
   - **Fix:** Extract the pagination state (`window._lastSavedRouteDoc`) into a local variable. Move DOM generation out into a thin renderer function. The service returns data; the renderer renders.
   - **Files:** `services/firebaseService.js` (~50 lines refactored).

**What NOT to do in Phase -1:**
- Do not attempt the full Phase 0 detangle of `smartMarkerMode` or `markerLayerPolicy.js`.
- Do not restructure repositories or introduce the 4-layer model.
- Do not refactor the DOM-in-renderer problems in `panelRenderer.js`, `tripPlannerCore.js`, or `expeditionEngine.js` (those are Phase 2 service extraction).

**Detangle:** Only the five blockers above. Be surgical.

**Move:** Minimal. Reorganization is Phase 0.

**Keep:** Everything else untouched.

**Add:**
- Try/catch with logging around `authService.initFirebase()`.
- Admin auth checks in `functions/index.js`.
- Guards on settings hydration order in `core/app.js` and `barkState.js`.
- Verify ORS key rotation status (Fixes #20-22).

**Exit criteria:**
- `rg "ORS_API_KEY.*=" modules/barkConfig.js` returns nothing (key is gone, using callable).
- `authService.initFirebase()` has a try/catch that logs to console if any exception occurs.
- `syncToSpreadsheet()` and `extractParkData()` in `functions/index.js` have auth checks.
- Settings load order is documented in a comment in `core/app.js` and guarded with assertions if load order is ever wrong.
- App boots without settings corruption under rapid auth state changes.

**Risk:** Low if you stay surgical. High if you try to combine this with Phase 0 detangling.

**Estimate:** 2–3 days.

---

---

### Phase 0 — Detangle (no scale work, no new features)

**Goal:** Stop the bleeding. Everything below depends on this baseline being calm.

**Detangle:**
- Delete the orphaned `smartMarkerMode` setting and all its plumbing. It is currently dead (`ENABLE_SMART_MARKER_EXPERIMENT = false`) but wired through five files where users could toggle it with no effect.
  - Remove from `modules/settingsRegistry.js` (~line 129 entry).
  - Remove from `state/settingsStore.js` (lines 22, 35, 49, 190, 198, 216).
  - Remove from `modules/settingsController.js` (lines 270, 277, 281, 283, 284 — the disabled-state logic).
  - Remove from `modules/renderEngine.js` (lines 213–215 in fingerprint).
  - Remove from `modules/mapEngine.js` (line 192 condition).
  - Delete the entire `if (smartMode && !window.forcePlainMarkers)` branch in `modules/markerLayerPolicy.js` (lines 11, 26, 35–66).
- Collapse `modules/markerLayerPolicy.js` from "ten `window.*` reads scattered across one function" into one `getRenderContext()` that returns a frozen object. The renderer reads only that object.

**Move:** Nothing. This phase only deletes and consolidates.

**Keep:**
- All current user-facing features (clustering toggles, low-gfx, ultra-low, viewport culling).
- `MarkerLayerManager` and `TripLayerManager` (these are the patterns you'll generalize).
- Existing search debounce + chunking from Fix #11.

**Add:**
- The architectural rules (Section 3) into `CLAUDE.md`.
- The domain ownership table (Section 2) into `CLAUDE.md`.
- A short note in `plans/AI_TECHNICAL_NORTH_STAR.md` linking to this document.

**Exit criteria:**
- `rg "smartMarkerMode\|ENABLE_SMART_MARKER"` returns zero matches outside this document.
- `markerLayerPolicy.js` reads `window.*` exactly once at the top of `getRenderContext()`.
- App boots and behaves identically to before.

**Risk:** Very low. Pure cleanup.

**Estimate:** 1–2 days solo.

---

### Phase 1 — Repository Seam (plumbing, no perf change)

**Goal:** Get every park/visit data read going through one interface so later phases can swap implementations without touching consumers.

**Detangle:**
- Search the codebase for every direct read of `window.BARK.allPoints` and `window.BARK.userVisitedPlaces`. Make a list. Each is a consumer to convert.
- Common offenders: `searchEngine.js`, `checkinService.js`, `renderEngine.js`, `profileEngine.js`, `expeditionEngine.js`, `tripPlannerCore.js`.

**Move:**
- Move ownership of the `allPoints` array out of `modules/barkState.js` and into a new `repos/ParkRepo.js`. `barkState.js` keeps a getter that delegates for one phase only (compatibility shim, gone in Phase 2).
- Move ownership of the `userVisitedPlaces` Map out of `modules/barkState.js` and into a new `repos/VaultRepo.js`. Same shim pattern.
- Move the `onSnapshot(users/{uid})` subscription out of `services/authService.js` and into `repos/VaultRepo.js`. Auth still triggers the subscription, but the repo owns it.

**Keep:**
- The CSV polling loop in `dataService.js`. It now writes into `ParkRepo` instead of `barkState.js`.
- The CSV rollback guard. Move it into `ParkRepo.replaceAll()`.
- All public function names that consumers currently call. Phase 1 is a transparent swap.

**Add:**
- `repos/ParkRepo.js` with: `getAll()`, `getById(id)`, `replaceAll(parks)`, `subscribe(fn)` (emits on data changes). Initially backed by a plain array — no spatial index yet.
- `repos/VaultRepo.js` with: `getVisits()`, `getVisit(parkId)`, `addVisit(visit)`, `removeVisit(parkId)`, `subscribe(fn)`. Wraps the existing Map + Firestore writes.
- New folder `repos/`. Wire into `index.html` script load order *before* anything that consumes them.
- A migration checklist file `plans/PHASE_1_CONSUMERS.md` that lists every file converted, ticked off as you go.

**Exit criteria:**
- `rg "window.BARK.allPoints"` returns zero matches outside `ParkRepo.js`.
- `rg "userVisitedPlaces"` returns zero matches outside `VaultRepo.js`.
- All Fix #10 cache invalidation calls now go through `VaultRepo` events instead of being scattered.
- App behaves identically.

**Risk:** Medium. Surface area is wide because many files read these globals today. The shim pattern keeps it incremental.

**Estimate:** 1 week.

---

### Phase 2 — Spatial Index + Service Extraction

**Goal:** Make 10k pins technically viable. Make use cases live in one file each.

**Detangle:**
- Remove the compatibility shims from `barkState.js` left over from Phase 1. `barkState.js` shrinks to: trip planner runtime state, request count, app version. That's it.
- Identify every place that does a manual viewport scan (`allPoints.filter(p => bounds.contains(...))`). Replace with `parkRepo.queryViewport(bounds)`.
- The Levenshtein chunked search from Fix #11 stays for now. It will move to a worker in Phase 6 if needed.

**Move:**
- Move GPS check-in validation from `services/checkinService.js` into a thin `services/CheckinService.js` that orchestrates: GPS read → `ParkRepo.queryRadius()` → `VaultRepo.addVisit()` → `AchievementService.evaluate()`. The current `checkinService.js` already does this loosely; this phase formalizes it.
- Move trip mutation logic out of `engines/tripPlannerCore.js` into `services/TripService.js`. The "engine" file becomes just the UI controller for the trip view.
- Move search orchestration out of `modules/searchEngine.js` into `services/SearchService.js`. The "engine" file becomes the searchbar UI controller.
- Move all direct Firestore reads from `modules/profileEngine.js` and `modules/expeditionEngine.js` into `repos/VaultRepo.js` (these were partially fixed in Fix #14; finish the job).
- Move auth state and premium tier checks scattered across `searchEngine.js`, `tripPlannerCore.js`, and `authService.js` into `services/IdentityService.js`. One source of truth for "is the user signed in" and "is the user premium."

**Keep:**
- `services/firebaseService.js` as the FirestoreClient transport. Don't add domain logic to it.
- `services/orsService.js` as the CallableClient transport for routing/geocode.
- The settings store from Fix #12. It becomes `PreferencesRepo` with the same descriptors and behavior.

**Add:**
- RBush dependency (~3KB) into `ParkRepo.index`. Build on every `replaceAll()`.
- New methods on `ParkRepo`: `queryViewport(bounds)`, `queryRadius(latlng, km)`, `queryNearest(latlng, n)`.
- `services/AchievementService.js` extracted from `gamificationLogic.js` orchestration code (the pure engine class stays where it is).
- `services/PreferencesService.js` thin wrapper over `PreferencesRepo` that knows the cloud-hydration rules currently in `authService.js handleCloudSettingsHydration`.

**Exit criteria:**
- The architectural rules can be statically verified: `rg "firebase.firestore" services/` shows only `firebaseService.js`. `rg "L\\." services/ repos/` shows zero hits (no Leaflet in services or repos).
- ParkRepo viewport query is faster than O(n). Verify with a benchmark in `tests/`.
- One file per service. No service file is over 400 lines (split if it grows).

**Risk:** Medium-high. This is the phase where ownership shifts the most. Use feature flags if needed to land services incrementally.

**Estimate:** 2 weeks.

---

### Phase 3 — Layer Unification (the map sanity phase)

**Goal:** Every map layer follows the `TripLayer` pattern. Adding a new layer is one file. The toggle web disappears.

**Detangle:**
- Audit `MarkerLayerManager` for global reads. Each one becomes a field on the spec passed to `sync()`.
- Delete the Standard Clustering / Premium Clustering / Force Plain / Smart Marker / Viewport Culling toggles from settings. They are replaced by a single preset.
- Delete `modules/markerLayerPolicy.js` once `RenderEngine.computeSpec()` covers its job.

**Move:**
- Rename `modules/MarkerLayerManager.js` to `modules/layers/ParkLayer.js`. Refactor its public API to match `TripLayer.sync(spec)`.
- Move the base Leaflet tile layer creation out of `mapEngine.js` into `modules/layers/BaseTileLayer.js`.
- Move the GPS user-location pin code (currently in `mapEngine.js` and `checkinService.js`) into `modules/layers/UserLocationLayer.js`.
- Move the generated driving route polyline rendering (currently `currentRouteLayers` in `tripPlannerCore.js`) into `modules/layers/RouteLayer.js`.
- Move the global geocode result rendering (currently inline in `searchEngine.js`) into `modules/layers/SearchResultLayer.js`.

**Keep:**
- `TripLayerManager` (rename to `modules/layers/TripLayer.js` for consistency, otherwise unchanged).
- The diff-return pattern from Fix #19. Generalize it to all layers: `sync(spec)` returns `{ added, removed, changed }` for any cross-layer coordination.
- Body-class CSS performance toggles (`body.low-gfx`, `body.ultra-low`, etc.). They're already the right pattern.

**Add:**
- `modules/RenderEngine.js` (rewrite of current `renderEngine.js`) with one public method: `computeSpec()` that returns `{ park, search, trip, route, userLocation }` — one sub-spec per layer.
- `MapView` coordinator that mounts all six layers and dispatches `sync()` calls. This is where the `<script>` load order finally collapses into one place.
- The new "Render preset" setting: `Auto | Quality | Speed`. Three values, one setting. Default is `Auto`. `Auto` reads `parkRepo.queryViewport(bounds).length` (now cheap thanks to Phase 2) and decides clustering vs plain. The previous Smart Marker attempt failed because viewport count was expensive — Phase 2 fixed that.

**Exit criteria:**
- Adding a new map layer is exactly one new file under `modules/layers/` and one line in `MapView`.
- The settings panel has one "Render preset" dropdown instead of five clustering/perf toggles.
- `rg "L\\." modules/layers/` is the only place Leaflet is touched outside `mapEngine.js`.

**Risk:** Medium. UI-visible — preset replaces familiar toggles. Migrate saved settings: any user with `clusteringEnabled=true, premiumClusteringEnabled=true` becomes `preset=auto`. Document it.

**Estimate:** 1.5–2 weeks.

---

### Phase 4 — Bundler + ES Modules

**Goal:** Unblock multi-developer work. Make dependency graph explicit.

**Detangle:**
- Remove the `<script>` tag dependency wall from `index.html`. The HTML now loads one bundle.
- Delete `window.BARK.*` exports as the global registry pattern. Real ES imports replace them.
- Delete `?v=N` cache busters. The bundler does that with content hashing.

**Move:**
- Reorganize the flat `modules/` / `services/` / `repos/` layout into the folder structure from Section 1:

```
src/
  app/            (boot, router)
  views/
    map/
      layers/     (ParkLayer, TripLayer, RouteLayer, …)
      MapView.js
    park-panel/
    trip/
    vault/
    profile/
    settings/
    search/
  services/
  repos/
  transport/
  domain/         (pure types: Park, Visit, TripStop, Order)
  ui/             (reusable Modal, Sheet, Button, etc.)
```

**Keep:**
- Firebase v8 compat for now (or migrate to v9 modular at this step — it's a discrete decision). Firebase v9 modular is leaner but requires touching every Firebase call site.
- All existing CDN dependencies (Leaflet, markercluster, PapaParse). Decide per-dependency whether to bundle or keep CDN. Recommend bundle Leaflet to eliminate the "Leaflet CDN failed" failure mode entirely.

**Add:**
- Vite (or esbuild if you want lighter). Vite is recommended — it has the best DX for this kind of project and zero config to start.
- `package.json` build scripts: `dev`, `build`, `preview`.
- Update `firebase.json` `hosting.public` to `dist/` (the build output). The defensive ignore list from Fix #16 simplifies dramatically because `dist/` only contains build output.
- A `CONTRIBUTING.md` with the architectural rules and the import graph explanation. This is what new devs read first.

**Exit criteria:**
- `npm run build` produces a working `dist/`.
- `npm run dev` runs locally with HMR.
- `import` and `export` replace `window.BARK.*` for all internal modules.
- No `<script>` tags in `index.html` except the entry bundle and Firebase compat (if not yet migrated to v9 modular).

**Risk:** Medium. The migration itself is mostly mechanical, but testing surface is the whole app. Plan a freeze week for QA before this lands.

**Estimate:** 1 week.

---

### Phase 5 — Storefront

**Goal:** Ship the swag store on the existing skeleton without inventing new patterns.

**Detangle:** Nothing. Storefront is additive.

**Move:** Nothing.

**Keep:** Every existing pattern. The store reuses everything.

**Add:**

**Repositories:**
- `repos/OrderRepo.js`. Owns: cart in localStorage (`bark_cart_v1`), order history under `users/{uid}/orders/{orderId}`. Methods: `getCart()`, `addToCart(productId, qty, variant)`, `removeFromCart(productId)`, `clearCart()`, `getOrders()`, `subscribe(fn)`.
- `repos/ProductRepo.js`. Reads from new Firestore collection `products/`. Methods: `getAll()`, `getById(id)`, `subscribe(fn)`. Cached locally with Firestore offline persistence.

**Services:**
- `services/StoreService.js`. Orchestrates: `addToCart()`, `getCheckoutSession()`, `confirmOrder(sessionId)`. Reads `IdentityService` for `uid` and `PreferencesRepo` for shipping address.
- Premium tier read on `IdentityService.tier` (currently hardcoded to "signed-in user = premium" — Phase 5 replaces this with a real Firestore field `users/{uid}.tier` written only by the Stripe webhook).

**Views:**
- `views/store/StoreView.js` — catalog grid.
- `views/store/ProductView.js` — product detail.
- `views/store/CartSheet.js` — cart drawer (uses `ui/Sheet`).
- `views/store/CheckoutView.js` — Stripe redirect.
- `views/store/OrderHistoryView.js` — past orders list.

**Cloud Functions:**
- `functions/createCheckoutSession` — callable, requires auth. Reads cart, validates against `products/`, creates Stripe Checkout session, returns URL.
- `functions/stripeWebhook` — HTTP function (Stripe webhook). Verifies signature, writes order to `users/{uid}/orders/{orderId}`, sets `users/{uid}.tier` if applicable, sends confirmation email via Mailgun/SendGrid.
- Both functions use Firebase secrets pattern from Fix #20: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

**Admin tooling:**
- A simple admin page (locked behind admin custom claim, like the existing admin tools) for editing the `products/` collection. CRUD only. Don't overbuild.

**Data shapes (write to `domain/Product.js`, `domain/Order.js`):**
```
Product: { id, sku, title, description, price_cents, currency, images[],
           stock, variants[], shipping_class, swag_category, active }
Order:   { id, uid, items[], subtotal_cents, shipping_cents, tax_cents,
           total_cents, currency, status, stripe_session_id,
           shipping_address, created_at, fulfilled_at }
```

**Exit criteria:**
- A logged-in user can add to cart, check out via Stripe, see order in history.
- Stripe webhook successfully writes orders.
- No store code reads from any non-store domain except `IdentityService.uid` and `PreferencesRepo.shippingAddress`.
- Admin can edit products without touching code.

**Risk:** Medium. Payment integration is high-trust; webhook signature verification must be correct. Use Stripe's official Node SDK; do not hand-verify signatures.

**Estimate:** 3–4 weeks.

---

### Phase 6 — Web Worker (only if needed)

**Goal:** Offload search/filter from the main thread. Only do this if 10k pin telemetry shows main-thread cost.

**Detangle:** Nothing.

**Move:**
- Move `SearchService` Levenshtein logic into `workers/search.worker.js`.
- The service stays on the main thread as the orchestrator; it posts messages to the worker and receives results.

**Keep:** Everything.

**Add:**
- The worker file.
- A message protocol: `{ type: 'search', id, query, filters }` → `{ type: 'searchResult', id, matches[], complete }`.
- The cancellation pattern from Fix #11 (`activeSearchRunId`) ports directly — IDs match worker messages instead of `setTimeout` chunks.
- The worker holds its own copy of the park index (built from a one-time message on `ParkRepo.replaceAll`).

**Exit criteria:**
- Main thread does no Levenshtein work.
- Search latency at 10k pins is under 100ms p95.

**Risk:** Low if Phase 2 + 3 are clean. The repository pattern means the worker is one file changing.

**Estimate:** 3–5 days.

---

## 5. File-by-File Migration Map

This is the cheat sheet. Tick off as you go.

### Phase -1 Changes (production guardrails — do this week)

| File | Change | Phase -1 |
|---|---|---|
| `functions/index.js` | Add `requireAuthCallable()` checks to `extractParkData()` and `syncToSpreadsheet()` | ✓ |
| `modules/barkConfig.js` | Verify ORS key is gone (moved to Firebase secret in Fix #20-22) | ✓ |
| `services/orsService.js` | If ORS key is still in barkConfig, refactor to call `getPremiumRoute` callable instead | ✓ if needed |
| `services/authService.js` | Wrap `initFirebase()` callback in try/catch with clear error logging | ✓ |
| `core/app.js` | Add assertions/guards to ensure settingsStore.js hydrates after barkState.js | ✓ |
| `services/firebaseService.js` | Extract pagination state from `window._lastSavedRouteDoc`, separate data fetch from DOM rendering | ✓ |

---

### Files that survive (renamed but keep their soul)

| Current | Becomes | Phase |
|---|---|---|
| `modules/TripLayerManager.js` | `modules/layers/TripLayer.js` (P3) → `src/views/map/layers/TripLayer.js` (P4) | 3, 4 |
| `modules/MarkerLayerManager.js` | `modules/layers/ParkLayer.js` (P3) → `src/views/map/layers/ParkLayer.js` (P4) | 3, 4 |
| `services/firebaseService.js` | `transport/FirestoreClient.js` (P4) | 4 |
| `services/orsService.js` | `transport/CallableClient.js` (P4, expanded for checkout callable) | 4, 5 |
| `state/settingsStore.js` | `repos/PreferencesRepo.js` (P2) | 2 |
| `modules/gamificationLogic.js` | `domain/Achievements.js` (pure engine) + `services/AchievementService.js` (orchestrator) | 2 |

### Files that get extracted into multiple

| Current | Splits into | Phase |
|---|---|---|
| `modules/barkState.js` | `repos/ParkRepo.js` + `repos/VaultRepo.js` + small runtime-state file | 1, 2 |
| `modules/searchEngine.js` | `services/SearchService.js` + `views/search/SearchBar.js` | 2, 4 |
| `engines/tripPlannerCore.js` | `services/TripService.js` + `views/trip/TripView.js` | 2, 4 |
| `services/authService.js` | `services/IdentityService.js` + `repos/VaultRepo.js` (snapshot subscription) + `services/PreferencesService.js` (cloud hydration) | 2 |
| `modules/settingsController.js` | `services/PreferencesService.js` + `views/settings/SettingsView.js` | 2, 4 |
| `modules/profileEngine.js` | `services/AchievementService.js` + `views/profile/ProfileView.js` + `views/vault/VaultView.js` | 2, 4 |
| `modules/expeditionEngine.js` | `services/ExpeditionService.js` + `views/profile/ExpeditionView.js` + `modules/layers/ExpeditionTrailLayer.js` | 2, 3, 4 |
| `modules/mapEngine.js` | `views/map/MapView.js` + individual layer files | 3, 4 |
| `modules/renderEngine.js` | `services/RenderEngine.js` (pure spec computation) | 3 |

### Files that get deleted

| File / Code | Reason | Phase |
|---|---|---|
| `modules/markerLayerPolicy.js` | Replaced by `RenderEngine.computeSpec()` | 3 |
| `smartMarkerMode` plumbing across 5 files | Orphaned dead code | 0 |
| Standard / Premium clustering toggles | Replaced by `Auto / Quality / Speed` preset | 3 |
| `<script>` tag wall in `index.html` | Replaced by bundle entry | 4 |

### Files that don't change

- `functions/index.js` (grows, doesn't restructure — Cloud Functions are already domain-correct).
- `config/domRefs.js` (becomes per-view DOM refs in Phase 4, but format is fine).
- `MapMarkerConfig.js` (data, not code).

---

## 6. Anti-Patterns (forbidden after Phase 0)

Any of these in a PR is a block:

- Reading `window.lowGfxEnabled` (or any setting global) inside a layer or repository. The spec encodes it.
- A view importing `firebase` directly. Goes through a service.
- A service iterating `allPoints` directly. Goes through `ParkRepo`.
- Adding a new boolean setting that toggles renderer behavior. Renderer behavior is one preset.
- A new file that doesn't belong to a domain folder.
- A `setTimeout` polling loop where a repo subscription would do.
- Mutating `userVisitedPlaces` outside `VaultRepo` (check Fix #6 for why this matters).
- A new top-level `window.*` global.

---

## 7. Open Decisions (pick before Phase 4)

These don't block earlier phases but need answers before Phase 4 lands.

1. **Bundler:** Vite vs esbuild vs Parcel. Recommend **Vite** for DX.
2. **Firebase v8 compat → v9 modular:** Do during Phase 4 or as a separate Phase 4.5? Recommend **separate** — combining bundler migration with SDK migration is two big changes at once.
3. **Test framework:** Currently none (Fix #15 removed the fake suite). Recommend **Vitest** for unit, **Playwright** for E2E. Land alongside Phase 4 since Vitest works with Vite out of the box.
4. **Routing:** Hash-based vs History API. App is currently view-toggle-based with no routing. Hash-based is simpler for PWA; History API is cleaner URLs. Recommend **hash-based** for now (simpler, no Firebase Hosting config changes).
5. **State management library:** Currently bespoke (settings store + repos). Recommend **stay bespoke** — you've already built it twice (Fix #12, Fix #14). Adding Redux/Zustand is a fifth pattern, not a unification.
6. **Premium tier source of truth:** Currently `Boolean(firebase.auth().currentUser)`. Phase 5 introduces `users/{uid}.tier`. Decide before Phase 5: free / premium / pro tiers? Or just free / premium?

---

## 8. Velocity & Sequencing Reality Check

Total estimated calendar time, solo: **11–16 weeks** for Phases -1 through 5. Phase 6 is on-demand.

Breakdown:
- Phase -1: 2–3 days (production guardrails)
- Phase 0: 1–2 days (detangle smartMarkerMode, collapse markerLayerPolicy)
- Phase 1: 1 week (repository seam)
- Phase 2: 2 weeks (spatial index + service extraction)
- Phase 3: 1.5–2 weeks (layer unification)
- Phase 4: 1 week (bundler + ES modules)
- Phase 5: 3–4 weeks (storefront)
- **Total: 11–16 weeks**

If a second dev joins after Phase 4, parallel work becomes possible — one dev on storefront (Phase 5), one on telemetry/perf (Phase 6 prep). Before Phase 4, the `<script>` order tangle limits parallelism severely.

**Do not skip Phase -1.** It is blocking. The audit identifies five critical findings that must be fixed before Phase 0. They take 2–3 days and prevent production meltdown at scale.

**Do not skip Phase 0 to "save time."** Every later phase compounds the cost of the current tangle. Phase 0 pays for itself in Phase 1.

**Do not start Phase 5 (storefront) before Phase 3.** Bolting a store onto the current toggle web is exactly how the current mess was made.

**Phase 4 (bundler) is the inflection point** for hiring. Before Phase 4, every contributor pays the no-bundler tax. After Phase 4, onboarding is hours, not days.

---

## 9. The Single Test for "Are We There Yet?"

When all phases complete, this should be true:

> **A new developer can land on `views/store/` (or any single view folder), read it top to bottom, and understand exactly what it does and what it depends on — without reading the rest of the codebase.**

That is the entire goal. Every architectural rule and every phase is in service of this outcome.

If at any point a phase ends and that statement isn't more true than it was before, the phase isn't done.

---

## 10. Why Phase -1 Exists (Alignment with PRODUCTION_AUDIT_REPORT)

The PRODUCTION_AUDIT_REPORT.md identified five P0–P1 findings:
1. `authService.initFirebase()` is a 390-line god function with no error handling.
2. Triple state ownership (`barkState.js` + `appState.js` + `settingsStore.js`) creates race conditions.
3. Cloud Functions lack auth checks on admin-level operations.
4. API keys are exposed in client code and source control.
5. DOM generation and state mutation live inside service files.

These five are not architectural problems — they are **production safety problems**. They must be fixed before:
- Running a load test at scale.
- Adding more users.
- Deploying to production.
- Asking a second dev to work on the codebase (they will hit these issues immediately).

The architectural phases (0–6) assume a baseline of production safety. Phase -1 establishes that baseline.

**The plan is solid.** The four-layer rule, the ownership table, the sync(spec) contract, and the domain decomposition are exactly what this app needs. But apply them **on top of a stable foundation**, not on top of exposed API keys, unauthenticated Cloud Functions, and god functions with no error handling.

That's why Phase -1 comes first.

---

## 11. My Suggestions Before We Start

These are Codex's suggested adjustments after comparing this plan against the audit reports. They are not automatically adopted into the phase list until we choose them deliberately.

### Suggestion 1 — Replace Placeholder Audit Links With Local Repo Links

Phase -1 currently links several findings to placeholder Google Docs URLs. Replace those with local markdown references such as `CODE_AUDIT_REPORT.md`, `plans/PRODUCTION_AUDIT_REPORT.md`, and the relevant line or section names.

**Pros:**
- Keeps the plan self-contained inside the repo.
- Makes future work easier for Codex, Claude, or any developer reading the plan without browser/doc access.
- Avoids stale or broken external links during implementation.

**Cons:**
- Requires a quick pass to map each finding to the right local audit section.
- If the Google Doc has newer content than the repo audits, the repo copy must be updated first.

### Suggestion 2 — Move XSS Fixes Into Phase -1

Unsafe dynamic `innerHTML` paths from sheet data, route names, trip notes, and saved route data should be treated as production blockers, not later architecture cleanup.

**Pros:**
- Reduces the most direct browser security risk before broader refactors.
- Pairs well with the audit's recommendation to replace unsafe HTML with DOM creation, `textContent`, URL validation, and `rel="noopener noreferrer"`.
- Prevents risky user or sheet data from being carried forward into the new architecture unchanged.

**Cons:**
- Adds scope to Phase -1, likely pushing it beyond the current 2-3 day estimate.
- Some fixes may touch UI-heavy files that Phase 2 will later split, causing mild rework.
- Needs focused manual testing because these paths render visible UI.

### Suggestion 3 — Add CSV/Data Validation To Phase -1

Add a small validation script that fails on merge-conflict markers, missing required headers, duplicate IDs, invalid lat/lng, and malformed critical URLs before deployment.

**Pros:**
- Cheap protection against a class of failures already found in the audits.
- Gives every later phase a safer data baseline.
- Can become part of CI/predeploy without waiting for the full bundler migration.

**Cons:**
- Requires deciding the canonical required CSV schema now.
- May expose existing data cleanup work that must be handled before the validator can pass.
- Does not itself solve live Google Sheet reliability; it only blocks bad checked-in or generated data.

### Suggestion 4 — Make ORS Key Removal A Hard Gate

Do not leave ORS key handling conditional or fuzzy. Either remove exposed ORS keys and route paid/quota-bearing calls through a callable function now, or explicitly disable those features until the callable proxy is ready.

**Pros:**
- Closes the API abuse/billing exposure clearly.
- Prevents "temporary" exposed keys from becoming permanent.
- Forces premium/quota-bearing behavior to move toward server-side enforcement.

**Cons:**
- May require pulling forward some callable/service work from Phase 2.
- Could temporarily disable route/global geocode behavior if the proxy is not ready.
- Requires key rotation and deployment coordination, not only code changes.

### Suggestion 5 — Fix The Cloud Functions Contradiction

The plan now correctly says Phase -1 must add auth checks to `functions/index.js`, but the migration map still says Cloud Functions are already domain-correct and mostly unchanged. Update that language so the document does not contradict itself.

**Pros:**
- Prevents future readers from underestimating function/security work.
- Keeps the file-by-file map aligned with Phase -1.
- Makes the plan more trustworthy.

**Cons:**
- Small documentation-only cleanup, so it does not directly improve runtime behavior.
- May require revisiting the "files that don't change" list after Phase -1.

### Suggestion 6 — Reframe `authService.initFirebase()` Try/Catch As A Guardrail

Keep the try/catch and user-visible failure banner, but describe it as containment, not the real fix. The real fix remains Phase 2 extraction into `IdentityService`, `VaultRepo`, and `PreferencesService`.

**Pros:**
- Sets the right expectation: fewer cascading crashes now, cleaner ownership later.
- Avoids mistaking error handling for architecture.
- Keeps Phase -1 surgical while preserving the need for Phase 2.

**Cons:**
- Does not reduce the god function's complexity by itself.
- A caught error can still leave some features partially hydrated unless the fallback UI is clear.
- Requires careful logging so real bugs are not hidden.

### Suggested Adoption Order

If we adopt these before implementation, I recommend this order:

1. Fix placeholder audit links and the Cloud Functions contradiction.
2. Make ORS key removal a hard Phase -1 gate.
3. Add CSV/data validation to Phase -1.
4. Add XSS fixes to Phase -1 if we are willing to expand the Phase -1 estimate.
5. Reword the `authService.initFirebase()` try/catch as a guardrail.
