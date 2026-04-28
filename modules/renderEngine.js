/**
 * renderEngine.js — Marker Rendering Pipeline & Central Heartbeat
 * Owns updateMarkers(), syncState(), safeUpdateHTML(), and marker helper functions.
 * Loaded FOURTH in the boot sequence.
 */
window.BARK = window.BARK || {};

// ====== MARKER HELPER FUNCTIONS ======
function getColor(type) {
    if (type === 'Tag') return '#2196F3';
    if (type === 'Bandana') return '#FF9800';
    if (type === 'Certificate') return '#4CAF50';
    return '#9E9E9E';
}

function getBadgeClass(type) {
    if (type === 'Tag') return 'tag';
    if (type === 'Bandana') return 'bandana';
    if (type === 'Certificate') return 'certificate';
    return 'other';
}

function getParkCategory(typeString) {
    if (!typeString) return 'Other';
    const t = String(typeString).trim().toLowerCase();
    if (t === 'national' || t.includes('national')) return 'National';
    if (t === 'state' || t.includes('state')) return 'State';
    return 'Other';
}

function getSwagType(info) {
    if (!info) return 'Other';
    const lower = String(info).toLowerCase();
    if (lower.includes('tag')) return 'Tag';
    if (lower.includes('bandana') || lower.includes('vest')) return 'Bandana';
    if (lower.includes('certificate') || lower.includes('pledge')) return 'Certificate';
    return 'Other';
}

function formatSwagLinks(text) {
    if (!text) return '';
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex);
    if (!urls) return text;

    let resultHTML = '';
    urls.forEach((url, index) => {
        resultHTML += `<a href="${url}" target="_blank" class="swag-link-btn">📷 Swag Pic ${index + 1}</a> `;
    });
    return resultHTML.trim();
}

window.BARK.getColor = getColor;
window.BARK.getBadgeClass = getBadgeClass;
window.BARK.getParkCategory = getParkCategory;
window.BARK.getSwagType = getSwagType;
window.BARK.formatSwagLinks = formatSwagLinks;

// ====== DOM PROTECTION ======
/**
 * 🧊 Prevents "Layout Thrashing" by verifying content changes before painting.
 */
function safeUpdateHTML(elementId, newHTML) {
    const el = document.getElementById(elementId);
    if (el && el.innerHTML !== newHTML) {
        el.innerHTML = newHTML;
    }
}
window.BARK.safeUpdateHTML = safeUpdateHTML;

// ====== THE HEARTBEAT (v25) ======
/**
 * 💓 Batches DOM updates into a single frame buffer.
 */
let syncScheduled = false;
let lastMarkerVisibilityStateKey = null;
const ACHIEVEMENT_EVAL_DEBOUNCE_MS = 3000;
let achievementEvalTimer = null;
let achievementEvalInProgress = false;
let achievementEvalRequestedDuringRun = false;

function serializeSet(set) {
    return Array.from(set || []).sort().join(',');
}

function getVisitedIdsCacheKey() {
    if (typeof window.BARK._visitedIdsCacheKey === 'string') {
        return window.BARK._visitedIdsCacheKey;
    }

    const visitedPlaces = window.BARK.userVisitedPlaces || new Map();
    window.BARK._visitedIdsCacheKey = Array.from(visitedPlaces.keys()).sort().join(',');
    return window.BARK._visitedIdsCacheKey;
}

function getTargetMarkerLayerType(zoom) {
    if (window.BARK.getMarkerLayerPolicy) return window.BARK.getMarkerLayerPolicy(zoom).layerType;
    const forceNoClustering = window.premiumClusteringEnabled && zoom >= 7;
    return (window.clusteringEnabled && !forceNoClustering) ? 'cluster' : 'plain';
}

function isMapViewActive() {
    return !document.querySelector('.ui-view.active');
}

function isMapViewportReady(map) {
    if (!map || !isMapViewActive()) return false;
    const container = map.getContainer && map.getContainer();
    if (!container) return false;
    const rect = container.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function shouldCullPlainMarkers(zoom) {
    if (!isMapViewportReady(window.map)) return false;
    if (window.BARK.getMarkerLayerPolicy) {
        const policy = window.BARK.getMarkerLayerPolicy(zoom);
        return policy.layerType === 'plain' && policy.cullPlainMarkers;
    }
    return Boolean(window.viewportCulling);
}

function getMarkerVisibilityStateKey() {
    const map = window.map;
    const searchCache = window.BARK._searchResultCache || {};
    const searchCacheIds = searchCache.matchedIds ? Array.from(searchCache.matchedIds).sort().join(',') : '';
    const searchCacheStatus = searchCache.complete === false ? 'search-partial' : 'search-complete';
    const tripStops = (window.BARK.tripDays || [])
        .flatMap(day => (day.stops || []).map(stop => stop.id))
        .sort()
        .join(',');
    const visitedIds = getVisitedIdsCacheKey();
    const zoom = map ? map.getZoom() : 0;
    const shouldCull = shouldCullPlainMarkers(zoom);
    const viewportKey = shouldCull && map
        ? map.getBounds().pad(0.2).toBBoxString()
        : '';

    return [
        window.BARK._markerDataRevision || 0,
        serializeSet(window.BARK.activeSwagFilters),
        window.BARK.activeSearchQuery || '',
        window.BARK.activeTypeFilter || 'all',
        window.BARK.visitedFilterState || 'all',
        visitedIds,
        tripStops,
        searchCache.query || '',
        searchCacheStatus,
        searchCacheIds,
        window.clusteringEnabled ? 'cluster-on' : 'cluster-off',
        window.premiumClusteringEnabled ? 'premium-cluster-on' : 'premium-cluster-off',
        window.standardClusteringEnabled ? 'standard-cluster-on' : 'standard-cluster-off',
        window.lowGfxEnabled ? 'low-gfx-on' : 'low-gfx-off',
        window.forcePlainMarkers ? 'force-plain-on' : 'force-plain-off',
        window.stopResizing ? 'stop-resizing-on' : 'stop-resizing-off',
        window.viewportCulling ? 'viewport-culling-on' : 'viewport-culling-off',
        window.limitZoomOut ? 'limit-zoom-on' : 'limit-zoom-off',
        getTargetMarkerLayerType(zoom),
        shouldCull ? zoom : '',
        viewportKey
    ].join('|');
}

window.BARK.invalidateMarkerVisibility = function () {
    lastMarkerVisibilityStateKey = null;
};
window.BARK.invalidateVisitedIdsCache = function () {
    window.BARK._visitedIdsCacheKey = null;
    window.BARK.invalidateMarkerVisibility();
};
window.BARK.isMapViewActive = isMapViewActive;

function scheduleAchievementEvaluation() {
    if (typeof window.BARK.evaluateAchievements !== 'function') return;

    clearTimeout(achievementEvalTimer);
    achievementEvalTimer = setTimeout(runAchievementEvaluation, ACHIEVEMENT_EVAL_DEBOUNCE_MS);
}

async function runAchievementEvaluation() {
    achievementEvalTimer = null;
    if (typeof window.BARK.evaluateAchievements !== 'function') return;

    if (achievementEvalInProgress) {
        achievementEvalRequestedDuringRun = true;
        return;
    }

    achievementEvalInProgress = true;
    try {
        await window.BARK.evaluateAchievements(window.BARK.userVisitedPlaces);
    } catch (error) {
        console.error('[renderEngine] achievement evaluation failed:', error);
    } finally {
        achievementEvalInProgress = false;
        if (achievementEvalRequestedDuringRun) {
            achievementEvalRequestedDuringRun = false;
            scheduleAchievementEvaluation();
        }
    }
}

window.syncState = function () {
    if (syncScheduled) return;
    syncScheduled = true;
    window.requestAnimationFrame(() => {
        syncScheduled = false;
        if (typeof window.BARK.updateMarkers === 'function') {
            if (!isMapViewActive()) {
                window.BARK._pendingMarkerSync = true;
            } else if (window.BARK._isZooming) {
                window.BARK._pendingMarkerSync = true;
            } else {
                const markerVisibilityStateKey = getMarkerVisibilityStateKey();
                if (markerVisibilityStateKey !== lastMarkerVisibilityStateKey) {
                    lastMarkerVisibilityStateKey = markerVisibilityStateKey;
                    window.BARK.updateMarkers();
                }
            }
        }
        if (typeof window.BARK.updateStatsUI === 'function') {
            window.BARK.updateStatsUI();
        }
        scheduleAchievementEvaluation();
    });
};

// ====== THE RENDERING ENGINE — updateMarkers() ======
function updateMarkers() {
    const map = window.map;
    const allPoints = window.BARK.allPoints;
    const activeSwagFilters = window.BARK.activeSwagFilters;
    const activeSearchQuery = window.BARK.activeSearchQuery;
    const activeTypeFilter = window.BARK.activeTypeFilter;
    const userVisitedPlaces = window.BARK.userVisitedPlaces;
    const tripDays = window.BARK.tripDays;
    const visitedFilterState = window.BARK.visitedFilterState;
    const _searchResultCache = window.BARK._searchResultCache;
    const queryNorm = window.BARK.normalizeText(activeSearchQuery);
    const cachedSearch = _searchResultCache || {};
    const searchCacheMatchesQuery = Boolean(queryNorm && cachedSearch.query === queryNorm && cachedSearch.matchedIds);
    const searchCacheComplete = !searchCacheMatchesQuery || cachedSearch.complete !== false;

    const currentZoom = map.getZoom();
    const targetLayerType = getTargetMarkerLayerType(currentZoom);
    const shouldCull = shouldCullPlainMarkers(currentZoom);

    let visibleBounds = L.latLngBounds();
    const screenBounds = map.getBounds().pad(0.2);
    const activeMarkerIds = new Set();

    // Collect DOM writes to batch them (avoids layout thrashing)
    const markerClassUpdates = [];

    if (window.BARK.markerManager) {
        window.BARK.markerManager.sync(allPoints);
    }

    allPoints.forEach(item => {
        const matchesSwag = activeSwagFilters.size === 0 || activeSwagFilters.has(item.swagType);
        const nameNorm = item._cachedNormalizedName || window.BARK.normalizeText(item.name);
        let matchesSearch = true;

        if (activeSearchQuery) {
            if (!queryNorm) {
                matchesSearch = true;
            } else if (searchCacheMatchesQuery) {
                matchesSearch = cachedSearch.matchedIds.has(item.id);
            } else {
                matchesSearch = nameNorm.includes(queryNorm);
            }
        }

        const matchesType = activeTypeFilter === 'all' || item.category === activeTypeFilter;
        let matchesVisited = true;
        const isVisited = userVisitedPlaces.has(item.id);
        if (visitedFilterState === 'visited' && !isVisited) matchesVisited = false;
        if (visitedFilterState === 'unvisited' && isVisited) matchesVisited = false;
        const isInTrip = Array.from(tripDays).some(day => day.stops.some(s => s.id === item.id));

        let isVisible = (matchesSwag && matchesSearch && matchesType && matchesVisited) || isInTrip;

        // 🎯 VIEWPORT CULLING: Skip off-screen pins entirely
        if (isVisible && shouldCull && !screenBounds.contains([item.lat, item.lng])) {
            isVisible = false;
        }

        item.marker._barkIsVisible = isVisible;

        // 🎯 PURE CSS HIDE/SHOW: No Leaflet API calls, no cluster recalculation, no animation.
        if (isVisible) {
            activeMarkerIds.add(item.id);
            visibleBounds.extend(item.marker.getLatLng());

            if (item.marker._icon) {
                item.marker._icon.classList.remove('marker-filter-hidden');
                markerClassUpdates.push({ icon: item.marker._icon, isVisited });
            }
        } else {
            if (item.marker._icon) {
                item.marker._icon.classList.add('marker-filter-hidden');
            }
        }
    });

    if (window.BARK.markerManager && typeof window.BARK.markerManager.applyVisibility === 'function') {
        window.BARK.markerManager.applyVisibility(allPoints);
    }

    // 🏭 BATCH: Apply visited-pin class (avoids interleaved read/write layout thrash)
    markerClassUpdates.forEach(({ icon, isVisited }) => {
        icon.classList.toggle('visited-pin', isVisited);
    });

    window.BARK._lastLayerType = targetLayerType;

    // 🎯 SMART AUTO-FRAMING (Interrupt Protection)
    const hasLongSearchQuery = activeSearchQuery.length > 2;
    const currentFilterState = [
        activeSearchQuery,
        Array.from(activeSwagFilters).join(','),
        hasLongSearchQuery && searchCacheMatchesQuery && !searchCacheComplete ? 'search-partial' : 'search-complete'
    ].join('|');

    if (window._lastFilterState !== currentFilterState) {
        window._lastFilterState = currentFilterState;

        if (!window.stopAutoMovements && searchCacheComplete && (activeSwagFilters.size > 0 || hasLongSearchQuery) && visibleBounds.isValid()) {
            map.flyToBounds(visibleBounds, {
                padding: [50, 50],
                maxZoom: 12,
                duration: window.lowGfxEnabled ? 0 : 0.8,
                animate: !window.lowGfxEnabled
            });
        }
    }
}

window.BARK.updateMarkers = updateMarkers;
