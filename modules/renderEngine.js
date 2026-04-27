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
window.syncState = function () {
    if (syncScheduled) return;
    syncScheduled = true;
    window.requestAnimationFrame(() => {
        syncScheduled = false;
        if (typeof window.BARK.updateMarkers === 'function') {
            window.BARK.updateMarkers();
        }
        if (typeof window.BARK.updateStatsUI === 'function') {
            window.BARK.updateStatsUI();
        }
        // 🏆 Evaluate achievements (renders vault, dossiers, leaderboard)
        if (typeof window.BARK.evaluateAchievements === 'function' && !window._evalInProgress) {
            window._evalInProgress = true;
            window.BARK.evaluateAchievements(window.BARK.userVisitedPlaces).finally(() => {
                window._evalInProgress = false;
            });
        }
    });
};

// ====== THE RENDERING ENGINE — updateMarkers() ======
function updateMarkers() {
    const map = window.map;
    const allPoints = window.BARK.allPoints;
    const markerLayer = window.BARK.markerLayer;
    const markerClusterGroup = window.BARK.markerClusterGroup;
    const activeSwagFilters = window.BARK.activeSwagFilters;
    const activeSearchQuery = window.BARK.activeSearchQuery;
    const activeTypeFilter = window.BARK.activeTypeFilter;
    const userVisitedPlaces = window.BARK.userVisitedPlaces;
    const tripDays = window.BARK.tripDays;
    const visitedFilterState = window.BARK.visitedFilterState;
    const _searchResultCache = window.BARK._searchResultCache;

    const currentZoom = map.getZoom();
    // 🛑 PERFORMANCE BYPASS: MarkerClusterGroup internally destroys/rebuilds DOM nodes.
    let forceNoClustering = (window.premiumClusteringEnabled && currentZoom >= 7) || window.stopResizing;

    let visibleBounds = L.latLngBounds();
    const screenBounds = map.getBounds().pad(0.2);
    const activeMarkerIds = new Set();

    // Collect DOM writes to batch them (avoids layout thrashing)
    const markerClassUpdates = [];

    allPoints.forEach(item => {
        const matchesSwag = activeSwagFilters.size === 0 || activeSwagFilters.has(item.swagType);
        const cachedSearch = _searchResultCache;
        const queryNorm = window.BARK.normalizeText(activeSearchQuery);
        const nameNorm = item._cachedNormalizedName;
        let matchesSearch = !activeSearchQuery || (cachedSearch.matchedIds?.has(item.id) ?? true) || (!queryNorm || nameNorm.includes(queryNorm));

        if (!matchesSearch && queryNorm.length > 2) {
            let minDist = window.BARK.levenshtein(queryNorm, nameNorm);
            for (const word of nameNorm.split(' ')) {
                minDist = Math.min(minDist, window.BARK.levenshtein(queryNorm, word));
            }
            if (minDist <= 2) matchesSearch = true;
        }

        const matchesType = activeTypeFilter === 'all' || item.category === activeTypeFilter;
        let matchesVisited = true;
        const isVisited = userVisitedPlaces.has(item.id);
        if (visitedFilterState === 'visited' && !isVisited) matchesVisited = false;
        if (visitedFilterState === 'unvisited' && isVisited) matchesVisited = false;
        const isInTrip = Array.from(tripDays).some(day => day.stops.some(s => s.id === item.id));

        let isVisible = (matchesSwag && matchesSearch && matchesType && matchesVisited) || isInTrip;

        // 🎯 VIEWPORT CULLING: Skip off-screen pins entirely
        if (isVisible && window.viewportCulling && !screenBounds.contains([item.lat, item.lng])) {
            isVisible = false;
        }

        // Ensure marker exists for all items (for reuse)
        if (!item.marker) {
            item.marker = MapMarkerConfig.createCustomMarker(item, isVisited);
        }

        // 🛑 CRITICAL: NEVER remove/add markers from layers during filtering.
        // Markers are added to their target layer ONCE here if they haven't been added yet.
        if (!item.marker._layerAdded) {
            const targetLayer = (forceNoClustering || !window.clusteringEnabled) ? markerLayer : markerClusterGroup;
            targetLayer.addLayer(item.marker);
            item.marker._layerAdded = true;
        }

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

    // 🏭 BATCH: Apply visited-pin class (avoids interleaved read/write layout thrash)
    markerClassUpdates.forEach(({ icon, isVisited }) => {
        icon.classList.toggle('visited-pin', isVisited);
    });

    // Handle Map Layer Assignment
    if (window.clusteringEnabled && !forceNoClustering) {
        if (!map.hasLayer(markerClusterGroup)) map.addLayer(markerClusterGroup);
        if (map.hasLayer(markerLayer)) map.removeLayer(markerLayer);
    } else {
        if (!map.hasLayer(markerLayer)) map.addLayer(markerLayer);
        if (map.hasLayer(markerClusterGroup)) map.removeLayer(markerClusterGroup);
    }

    // 🎯 SMART AUTO-FRAMING (Interrupt Protection)
    const currentFilterState = activeSearchQuery + '|' + Array.from(activeSwagFilters).join(',');
    if (window._lastFilterState !== currentFilterState) {
        window._lastFilterState = currentFilterState;

        if (!window.stopAutoMovements && (activeSwagFilters.size > 0 || activeSearchQuery.length > 2) && visibleBounds.isValid()) {
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
