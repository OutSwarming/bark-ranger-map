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

Known in-place mutation paths to migrate:

- [ ] `services/authService.js` clears and replaces visit entries during logout/hydration.
- [ ] `services/firebaseService.js` performs optimistic clone/mutate/restore flows.
- [ ] `services/firebaseService.js` deletes stale entries directly from the Map.
- [ ] `services/checkinService.js` sets/deletes visits during check-in and manual mark-visited.

## Phase 1C - VaultRepo Snapshot Ownership

Status: not started.

Move this last. It touches auth-state races and listener cleanup:

- [ ] `users/{uid}` `onSnapshot` ownership moves from `services/authService.js` to `repos/VaultRepo.js`.
- [ ] Auth starts/stops the repo subscription, but the repo owns visited-place hydration.
- [ ] Preserve `_firstServerPayloadReceived`, `_serverPayloadSettled`, `_cloudSettingsLoaded`, listener cleanup, and optimistic rollback behavior.

## Deferred Out Of Phase 1

- Centralizing all visited-id cache invalidation through `VaultRepo.subscribe()` is deferred to Phase 1.5 or Phase 2. Keep the manual `invalidateVisitedIdsCache()` calls during Phase 1.
