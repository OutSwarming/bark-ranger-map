# Phase 1 Consumer Migration Checklist

Phase 1 creates repository seams while preserving current behavior. Do not remove legacy `window.BARK.*` surfaces until the matching repo owns the data and consumers are migrated.

## Phase 1A - ParkRepo

Status: in progress.

Completed:

- [x] Add `repos/ParkRepo.js` with `getAll()`, `getById(id)`, `getLookup()`, `getRevision()`, `replaceAll(parks, options)`, and `subscribe(fn)`.
- [x] Wire `repos/ParkRepo.js` before `modules/barkState.js` in `index.html`.
- [x] Temporarily repoint the existing `window.BARK.allPoints` accessor in `modules/barkState.js` to `ParkRepo` instead of adding a parallel shim.
- [x] Keep `window.parkLookup` as the compatibility lookup while `ParkRepo` owns its backing Map.
- [x] Move the CSV destructive-refresh rollback guard into `ParkRepo.replaceAll()`.
- [x] Move the marker data revision bump into `ParkRepo.replaceAll()` while preserving the `window.BARK._markerDataRevision` fingerprint contract.
- [x] Update `state/appState.js` fallback hydration to read `allPoints` and `parkLookup` from `ParkRepo`.
- [x] Update the single park-data writer, `modules/dataService.js`, to publish through `ParkRepo.replaceAll()`.
- [x] Remove the temporary `window.BARK.allPoints` accessor and legacy `window.allPoints` mirror after all JS readers moved to `ParkRepo`.
- [x] Migrate `modules/TripLayerManager.js` lookup-by-id reads to `ParkRepo.getById()`.
- [x] Remove the legacy `window.parkLookup` global and `state/appState.js` mirror; `ParkRepo` now keeps the lookup Map module-private.

Migrated off the compatibility accessor:

- [x] `services/authService.js`
- [x] `modules/shareEngine.js`
- [x] `services/firebaseService.js`
- [x] `modules/searchEngine.js`
- [x] `modules/renderEngine.js`
- [x] `modules/profileEngine.js`
- [x] `modules/MarkerLayerManager.js`

Phase 1A exit target:

- [x] App boots and loads CSV data through `ParkRepo`.
- [x] Search still returns local park results.
- [x] Marker render still sees the same marker data revision contract.
- [x] `rg "window.BARK.allPoints|window.allPoints"` returns zero JS hits.

## Phase 1B - VaultRepo Map Ownership

Status: not started.

Important constraint: current visit state is mutated in place. `VaultRepo` must expose explicit mutation APIs such as `clear()`, `setVisits()`, `addVisit()`, `removeVisit()`, and `mutate(fn)` before callers stop touching the live Map handle.

Regression safety net before implementation:

- [x] Create git tag `phase-1a-complete`.
- [x] Add Playwright smoke coverage for visit lifecycle persistence.
- [x] Add Playwright smoke coverage for optimistic rollback during `updateVisitDate`.
- [x] Add Playwright smoke coverage for logout clearing visits and login restoring them.
- [ ] Run the existing test suite before changing visit ownership.
- [ ] Run the new Playwright smoke tests before changing visit ownership.

### Planned PR Breakdown

#### 1B.1 Repo skeleton + shim redirect

Goal: add the repo boundary without changing behavior or moving snapshot ownership.

| File | Planned change | Done |
|---|---|---|
| `repos/VaultRepo.js` | Add the repo skeleton with live Map-backed APIs and subscription support. | [ ] |
| `modules/barkState.js` | Redirect the existing `window.BARK.userVisitedPlaces` accessor through `VaultRepo` as a temporary compatibility shim. | [ ] |
| `index.html` | Load `repos/VaultRepo.js` before legacy consumers. | [ ] |
| `plans/PHASE_1_CONSUMERS.md` | Track the shim and consumer migration status. | [ ] |
| Playwright smoke tests | Confirm existing visit lifecycle behavior still passes through the shim. | [ ] |

#### 1B.2 Migrate writers + rollback + pending-mutation API

Goal: make all visit mutations explicit before moving readers.

| File | Planned change | Done |
|---|---|---|
| `repos/VaultRepo.js` | Add mutation APIs for `clear()`, `setVisits()`, `addVisit()`, `removeVisit()`, `mutate(fn)`, and pending mutation helpers. | [ ] |
| `services/firebaseService.js` | Replace direct Map replacement, clone/mutate/restore, stale delete, and pending mutation writes with `VaultRepo` calls. | [ ] |
| `services/checkinService.js` | Replace direct `set()` / `delete()` visit writes with `VaultRepo` mutation APIs while preserving optimistic UI and rollback behavior. | [ ] |
| `services/authService.js` | Use `VaultRepo.clear()` / `VaultRepo.setVisits()` for logout and hydration writes, while leaving snapshot ownership in auth for now. | [ ] |
| Playwright smoke tests | Confirm mark, unmark, reload persistence, and `updateVisitDate` rollback still pass. | [ ] |

#### 1B.3 Migrate readers

Goal: remove direct read dependence on the compatibility Map handle.

| File | Planned change | Done |
|---|---|---|
| `renderers/panelRenderer.js` | Read visit state through `VaultRepo` query helpers instead of the live Map handle. | [ ] |
| `modules/renderEngine.js` | Read visited IDs/state through `VaultRepo` helpers. | [ ] |
| `modules/MarkerLayerManager.js` | Read marker visited state through render specs / repo-backed helpers, preserving current marker classes. | [ ] |
| `modules/TripLayerManager.js` | Read trip overlay visited state through repo-backed helpers. | [ ] |
| `modules/profileEngine.js` | Read manage portal, stats, and achievement input through `VaultRepo` helpers. | [ ] |
| `modules/shareEngine.js` | Read share-card achievement input through `VaultRepo` helpers. | [ ] |
| `services/firebaseService.js` | Read canonical visit arrays through `VaultRepo` helpers. | [ ] |
| `services/checkinService.js` | Read current visit entries through `VaultRepo` helpers. | [ ] |
| `services/authService.js` | Read visit count/current state through `VaultRepo` helpers where needed. | [ ] |
| Playwright smoke tests | Confirm logout clear and login restore behavior after reader migration. | [ ] |

#### 1B.4 Delete shims

Goal: finish Map ownership cleanup after all consumers are migrated.

| File | Planned change | Done |
|---|---|---|
| `modules/barkState.js` | Remove the temporary `window.BARK.userVisitedPlaces` compatibility accessor. | [ ] |
| `repos/VaultRepo.js` | Keep the live Map module-private and expose only repo APIs. | [ ] |
| `plans/PHASE_1_CONSUMERS.md` | Mark Phase 1B migration complete and record verification output. | [ ] |
| Static checks | Confirm `rg "userVisitedPlaces"` returns no active JS hits outside `repos/VaultRepo.js` and approved docs/tests. | [ ] |
| Playwright smoke tests | Run the full visit lifecycle smoke suite after shim deletion. | [ ] |

Known in-place mutation paths to migrate:

- [ ] `services/authService.js` clears and replaces visit entries during logout/hydration.
- [ ] `services/firebaseService.js` performs optimistic clone/mutate/restore flows.
- [ ] `services/firebaseService.js` deletes stale entries directly from the Map.
- [ ] `services/checkinService.js` sets/deletes visits during check-in and manual mark-visited.

## Phase 1C - VaultRepo Snapshot Ownership

Status: not started.

Move this last. It touches auth-state races and listener cleanup:

### Planned PR Breakdown

#### 1C.1 VaultRepo owns visited-places snapshot lifecycle

Goal: move Firestore listener ownership after Map mutation/read ownership is already stable.

| File | Planned change | Done |
|---|---|---|
| `repos/VaultRepo.js` | Own the `users/{uid}` visited-places `onSnapshot` lifecycle, listener cleanup, and snapshot-to-Map hydration. | [ ] |
| `services/authService.js` | Start/stop the `VaultRepo` subscription from auth state without owning visited-place hydration. | [ ] |
| `services/firebaseService.js` | Preserve pending mutation confirmation and rollback contracts through `VaultRepo`. | [ ] |
| `modules/profileEngine.js` | Preserve achievement/profile refresh behavior when repo events arrive. | [ ] |
| Playwright smoke tests | Confirm reload persistence and logout/login restoration with repo-owned snapshots. | [ ] |

#### 1C.2 Cleanup pass

Goal: remove leftover listener-era coupling and document the final ownership boundary.

| File | Planned change | Done |
|---|---|---|
| `services/authService.js` | Remove visited snapshot listener state such as `visitedSnapshotUnsubscribe` after ownership moves. | [ ] |
| `repos/VaultRepo.js` | Document the final public API and event semantics. | [ ] |
| `plans/PHASE_1_CONSUMERS.md` | Mark Phase 1C complete and record final verification commands. | [ ] |
| Static checks | Confirm no direct Firestore visited-place snapshot setup remains outside `repos/VaultRepo.js`. | [ ] |
| Playwright smoke tests | Run the full visit lifecycle smoke suite after cleanup. | [ ] |

- [ ] `users/{uid}` `onSnapshot` ownership moves from `services/authService.js` to `repos/VaultRepo.js`.
- [ ] Auth starts/stops the repo subscription, but the repo owns visited-place hydration.
- [ ] Preserve `_firstServerPayloadReceived`, `_serverPayloadSettled`, `_cloudSettingsLoaded`, listener cleanup, and optimistic rollback behavior.

## Deferred Out Of Phase 1

- Centralizing all visited-id cache invalidation through `VaultRepo.subscribe()` is deferred to Phase 1.5 or Phase 2. Keep the manual `invalidateVisitedIdsCache()` calls during Phase 1.
