/**
 * tripPlannerCore.js — Trip Builder, Route Generation, Optimization, Map Visuals
 * Loaded NINTH in the boot sequence.
 */
window.BARK = window.BARK || {};

const TRIP_DAY_LIMIT = 50;
const TRIP_DAY_PAGE_SIZE = 9;
const ROUTE_DAY_THROTTLE_THRESHOLD = 8;
const ROUTE_DAY_THROTTLE_MS = 3000;

window.BARK.TRIP_DAY_LIMIT = TRIP_DAY_LIMIT;
window.BARK.TRIP_DAY_PAGE_SIZE = TRIP_DAY_PAGE_SIZE;

function removeTripMapLayer(layer) {
    const mapRef = window.map || (typeof map !== 'undefined' ? map : null);
    if (!layer || !mapRef || typeof mapRef.removeLayer !== 'function') return;

    try {
        mapRef.removeLayer(layer);
    } catch (error) {
        console.warn('[tripPlannerCore] failed to remove trip map layer:', error);
    }
}

function showTripToast(message) {
    let toast = window.BARK.DOM.tripActionToast();
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'trip-action-toast';
        toast.className = 'trip-toast';
        document.body.appendChild(toast);
    }
    toast.innerHTML = `✅ <span>${message}</span>`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

window.BARK.showTripToast = showTripToast;

// Trip overlay (badges, dashed day lines, A/B/🔄 bookends) is owned by
// modules/TripLayerManager.js. tripPlannerCore is the orchestrator: it mutates
// trip state and asks the overlay to sync. It never touches map DOM directly,
// and never appends badges to park marker icons (that path was the source of
// the cluster-recreate bug fixed in #19).
function updateTripMapVisuals() {
    const tripLayer = window.BARK.tripLayer;
    if (!tripLayer || typeof tripLayer.sync !== 'function') return;

    const tripDays = window.BARK.tripDays;
    const bookends = {
        start: window.tripStartNode || null,
        end: window.tripEndNode || null
    };

    // Restore the dashed day lines on every edit; generateAndRenderTripRoute()
    // explicitly hides them when it draws the real driving route.
    if (typeof tripLayer.setDayLinesVisible === 'function') {
        tripLayer.setDayLinesVisible(true);
    }

    const diff = tripLayer.sync(tripDays, bookends) || { added: new Set(), removed: new Set() };

    // Hand the diff to MarkerLayerManager so the park-pin--in-trip class flips
    // for stops that gained or lost trip status. tripLayer never touches park
    // marker DOM; markerManager owns that class.
    const markerManager = window.BARK.markerManager;
    if (markerManager && typeof markerManager.refreshTripStopClasses === 'function') {
        const affected = new Set();
        diff.added.forEach(id => affected.add(id));
        diff.removed.forEach(id => affected.add(id));
        if (affected.size > 0) markerManager.refreshTripStopClasses(affected);
    }

    if (window.BARK.visitedFilterState === 'route' && typeof window.syncState === 'function') {
        if (typeof window.BARK.invalidateMarkerVisibility === 'function') {
            window.BARK.invalidateMarkerVisibility();
        }
        window.syncState();
    }
}

// ====== TRIP UI ======
// Future trip-place identity notes:
//   The current trip stop shape is intentionally minimal: id/name/lat/lng for
//   official parks, or name/lat/lng for custom towns/geocoded places. That is
//   enough for routing, rendering, and removing stops today, but it is not
//   enough for long-term personal memories.
//
//   When the app grows "personal cards" with notes/photos/reviews, do not store
//   that data directly inside tripDays[]. A trip route is an itinerary; user
//   memories are user-owned content. Keep these IDs separate:
//     - placeId: canonical official BARK place id, from allPoints/CSV.
//     - customPlaceId: stable id for a user-created/geocoded non-BARK place.
//     - tripStopId: unique id for this exact stop in this exact route.
//     - memoryId: user-owned notes/photos/reviews for a place or trip stop.
//
//   This separation answers the critical product questions:
//     - Official BARK spots keep official data immutable and shared.
//     - Personal notes/photos never mutate official park records.
//     - Trip planning data can be copied/shared without copying private media.
//     - A user can have a general park memory and a separate per-trip note.
//
//   Refactor target:
//     Replace lat/lng-derived fallback keys with generated tripStopId values,
//     then route all stop actions through a trip planner service/controller.
//     The map overlay should keep calling small APIs like removeTripStopByKey,
//     never mutate tripDays directly.
function getTotalStops() {
    return window.BARK.tripDays.reduce((sum, d) => sum + d.stops.length, 0);
}

function getPremiumService() {
    return window.BARK && window.BARK.services && window.BARK.services.premium;
}

function isPremiumRoutingUnlocked() {
    const premiumService = getPremiumService();
    return Boolean(
        premiumService &&
        typeof premiumService.isPremium === 'function' &&
        premiumService.isPremium()
    );
}

function setPlannerActionButtonLabel(button, label, icon = '') {
    if (!button) return;
    const iconMarkup = icon ? `<span class="planner-action-icon">${icon}</span>` : '';
    button.innerHTML = `${iconMarkup}<span>${label}</span>`;
}

function openRoutePremiumPaywall() {
    const paywall = window.BARK && window.BARK.paywall;
    if (paywall && typeof paywall.openPaywall === 'function') {
        paywall.openPaywall({ source: 'route-generation' });
        return;
    }

    alert('Premium is required to generate driving routes.');
}

function openFreeAccountPrompt(source) {
    const accountUi = window.BARK && window.BARK.authAccountUi;
    if (accountUi && typeof accountUi.openAccountPrompt === 'function') {
        accountUi.openAccountPrompt({ source });
        return;
    }

    const profileTab = document.querySelector('.nav-item[data-target="profile-view"]');
    if (profileTab) profileTab.click();
}

function clearRouteTelemetryStatus() {
    const telemetryEl = window.BARK.DOM.routeTelemetry();
    if (!telemetryEl) return;

    telemetryEl.style.display = 'none';
    telemetryEl.innerHTML = '';
    delete telemetryEl.dataset.routeStatus;
}

function setRouteTelemetryStatus(status, title, detail = '') {
    const telemetryEl = window.BARK.DOM.routeTelemetry();
    if (!telemetryEl) return;

    telemetryEl.style.display = 'block';
    telemetryEl.dataset.routeStatus = status;
    telemetryEl.innerHTML = '';

    const titleEl = document.createElement('span');
    titleEl.className = 'route-telemetry-title';
    titleEl.textContent = title;
    telemetryEl.appendChild(titleEl);

    if (detail) {
        const detailEl = document.createElement('span');
        detailEl.className = 'route-telemetry-detail';
        detailEl.textContent = detail;
        telemetryEl.appendChild(detailEl);
    }
}

function setRouteTelemetrySummary(miles, hrs, mins) {
    const telemetryEl = window.BARK.DOM.routeTelemetry();
    if (!telemetryEl) return;

    telemetryEl.style.display = 'block';
    telemetryEl.dataset.routeStatus = 'complete';
    telemetryEl.innerHTML = '';

    const label = document.createElement('span');
    label.className = 'route-telemetry-title';
    label.textContent = 'Total Drive:';
    telemetryEl.appendChild(label);
    telemetryEl.appendChild(document.createTextNode(` ${miles} Miles | ${hrs}h ${mins}m`));
}

function waitForRouteDayThrottle(routeDayIndex, routableDayCount) {
    if (routableDayCount <= ROUTE_DAY_THROTTLE_THRESHOLD || routeDayIndex >= routableDayCount - 1) {
        return Promise.resolve();
    }

    return new Promise(resolve => setTimeout(resolve, ROUTE_DAY_THROTTLE_MS));
}

function focusMapSearchForTripStop(dayNumber, dayColor) {
    const searchInput = window.BARK.DOM.parkSearch();
    const mapTab = document.querySelector('.nav-item[data-target="map-view"]');
    if (mapTab) mapTab.click();
    if (!searchInput) return;

    const filterPanel = document.getElementById('filter-panel');
    if (filterPanel) filterPanel.style.display = 'flex';
    searchInput.placeholder = `Search parks or towns to add to Day ${dayNumber}`;

    const focusSearch = () => {
        try {
            if (typeof searchInput.scrollIntoView === 'function') {
                searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            if (typeof searchInput.focus === 'function') searchInput.focus({ preventScroll: false });
            if (typeof searchInput.select === 'function') searchInput.select();
            searchInput.style.boxShadow = `0 0 0 4px ${dayColor}44`;
            setTimeout(() => { searchInput.style.boxShadow = ''; }, 1500);
        } catch (error) {
            console.warn('[tripPlannerCore] search focus failed:', error);
        }
    };

    // First focus stays inside the tap/click gesture for mobile keyboards; the
    // later retries catch slower tab/layout transitions without changing state.
    focusSearch();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focusSearch);
    setTimeout(focusSearch, 80);
}

function updateRouteGenerationButtonState() {
    const button = window.BARK.DOM.startRouteBtn();
    if (!button) return;

    const isPremium = isPremiumRoutingUnlocked();
    button.classList.toggle('planner-action-premium-locked', !isPremium);
    button.dataset.premiumRequired = isPremium ? 'false' : 'true';
    button.setAttribute('aria-disabled', isPremium ? 'false' : 'true');

    if (!isPremium) {
        button.disabled = false;
        button.title = 'Premium is required to generate driving routes.';
        setPlannerActionButtonLabel(button, 'Premium Route');
        return;
    }

    button.disabled = false;
    button.title = '';
    setPlannerActionButtonLabel(button, 'Generate Route');
}

function getTripStopKey(stop) {
    if (!stop) return '';
    return stop.id || `${stop.lat},${stop.lng}`;
}

function getFiniteCoordinate(value) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
}

function getCleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function getTripDayColor(dayIndex, fallbackColor = null) {
    const colors = Array.isArray(window.BARK.DAY_COLORS) && window.BARK.DAY_COLORS.length > 0
        ? window.BARK.DAY_COLORS
        : ['#1976D2'];
    return fallbackColor || colors[dayIndex % colors.length];
}

function createTripDay(dayIndex, stops = []) {
    return {
        color: getTripDayColor(dayIndex),
        stops: Array.isArray(stops) ? stops : [],
        notes: ""
    };
}

function normalizeTripDaysForPlanner(days) {
    const sourceDays = Array.isArray(days) && days.length > 0
        ? days.slice(0, TRIP_DAY_LIMIT)
        : [createTripDay(0)];

    return sourceDays.map((day, dayIndex) => ({
        color: getCleanString(day && day.color) || getTripDayColor(dayIndex),
        stops: Array.isArray(day && day.stops) ? day.stops.filter(Boolean) : [],
        notes: typeof (day && day.notes) === 'string' ? day.notes : ''
    }));
}

function enforceTripDayLimit(options = {}) {
    const existingDays = Array.isArray(window.BARK.tripDays) ? window.BARK.tripDays : [];
    const wasOverLimit = existingDays.length > TRIP_DAY_LIMIT;

    if (!Array.isArray(window.BARK.tripDays) || window.BARK.tripDays.length === 0 || wasOverLimit) {
        window.BARK.tripDays = normalizeTripDaysForPlanner(window.BARK.tripDays);
    } else {
        window.BARK.tripDays.forEach((day, dayIndex) => {
            if (!day || typeof day !== 'object') {
                window.BARK.tripDays[dayIndex] = createTripDay(dayIndex);
                return;
            }
            if (!getCleanString(day.color)) day.color = getTripDayColor(dayIndex);
            if (!Array.isArray(day.stops)) day.stops = [];
            if (typeof day.notes !== 'string') day.notes = '';
        });
    }

    const lastIndex = Math.max(0, window.BARK.tripDays.length - 1);
    const requestedActiveDay = Number(window.BARK.activeDayIdx);
    window.BARK.activeDayIdx = Number.isFinite(requestedActiveDay)
        ? Math.min(Math.max(0, Math.floor(requestedActiveDay)), lastIndex)
        : 0;

    if (wasOverLimit && options.notify) {
        notifyTripDayLimit('Trips can include up to 50 days. Extra days were left off.');
    }

    return { wasOverLimit };
}

function notifyTripDayLimit(message = 'Trips can include up to 50 days.') {
    if (typeof window.BARK.showTripToast === 'function') {
        window.BARK.showTripToast(message);
        return;
    }
    if (typeof alert === 'function') alert(message);
}

function canAddTripDay(options = {}) {
    const tripDays = Array.isArray(window.BARK.tripDays) ? window.BARK.tripDays : [];
    if (tripDays.length < TRIP_DAY_LIMIT) return true;
    if (options.notify) notifyTripDayLimit();
    return false;
}

function appendTripDayFromPrevious() {
    const tripDays = window.BARK.tripDays;
    if (!canAddTripDay({ notify: true })) return false;

    const prevDay = tripDays[tripDays.length - 1];
    const initialStops = [];
    if (prevDay && Array.isArray(prevDay.stops) && prevDay.stops.length > 0) {
        initialStops.push({ ...prevDay.stops[prevDay.stops.length - 1] });
    }

    tripDays.push(createTripDay(tripDays.length, initialStops));
    window.BARK.activeDayIdx = tripDays.length - 1;
    updateTripUI();
    return true;
}

function serializeTripNodeForSave(node) {
    if (!node || typeof node !== 'object') return null;

    const name = getCleanString(node.name);
    const lat = getFiniteCoordinate(node.lat);
    const lng = getFiniteCoordinate(node.lng);
    if (!name || lat === null || lng === null) return null;

    const serialized = { name, lat, lng };
    const optionalStringFields = ['id', 'state', 'category', 'swagType', 'customPlaceId', 'placeId'];
    optionalStringFields.forEach(field => {
        const value = getCleanString(node[field]);
        if (value) serialized[field] = value;
    });

    return serialized;
}

function serializeTripDayForSave(day) {
    const stops = Array.isArray(day && day.stops)
        ? day.stops.map(serializeTripNodeForSave).filter(Boolean)
        : [];
    return {
        color: getCleanString(day && day.color) || window.BARK.DAY_COLORS[0],
        stops,
        notes: getCleanString(day && day.notes)
    };
}

function buildSavedRouteData(tripName, tripDays) {
    const serializedDays = Array.isArray(tripDays)
        ? tripDays.slice(0, TRIP_DAY_LIMIT).map(serializeTripDayForSave)
        : [];
    const routeData = {
        tripName,
        tripDays: serializedDays
    };

    const startNode = serializeTripNodeForSave(window.tripStartNode);
    const endNode = serializeTripNodeForSave(window.tripEndNode);
    if (startNode) routeData.tripStartNode = startNode;
    if (endNode) routeData.tripEndNode = endNode;

    return routeData;
}

window.BARK.serializeTripNodeForSave = serializeTripNodeForSave;
window.BARK.buildSavedRouteData = buildSavedRouteData;
window.BARK.normalizeTripDaysForPlanner = normalizeTripDaysForPlanner;

function removeTripDay(dayIdx) {
    const tripDays = window.BARK.tripDays;
    if (!Array.isArray(tripDays) || tripDays.length <= 1) return;

    const day = tripDays[dayIdx];
    if (!day) return;

    if (day.stops && day.stops.length > 0) {
        const label = `Day ${dayIdx + 1}`;
        if (!confirm(`${label} has ${day.stops.length} stop${day.stops.length === 1 ? '' : 's'}. Delete this day?`)) return;
    }

    tripDays.splice(dayIdx, 1);
    if (window.BARK.activeDayIdx >= tripDays.length) {
        window.BARK.activeDayIdx = tripDays.length - 1;
    } else if (window.BARK.activeDayIdx > dayIdx) {
        window.BARK.activeDayIdx--;
    }
    updateTripUI();
}

window.BARK.removeTripStopByKey = function removeTripStopByKey(stopKey) {
    if (!stopKey) return false;

    const tripDays = window.BARK.tripDays;
    for (let dayIdx = 0; dayIdx < tripDays.length; dayIdx++) {
        const day = tripDays[dayIdx];
        const stopIdx = (day.stops || []).findIndex(stop => getTripStopKey(stop) === stopKey);
        if (stopIdx === -1) continue;

        const stop = day.stops[stopIdx];
        const name = stop && stop.name ? stop.name : 'this stop';
        if (!confirm(`Remove "${name}" from Day ${dayIdx + 1}?`)) return false;

        day.stops.splice(stopIdx, 1);
        updateTripUI();
        showTripToast('Stop removed.');
        return true;
    }

    return false;
};

window.addStopToTrip = function (stopData) {
    const tripDays = window.BARK.tripDays;
    let activeDayIdx = window.BARK.activeDayIdx;

    for (let i = 0; i < tripDays.length; i++) {
        if (tripDays[i].stops.find(s => s.lat === stopData.lat && s.lng === stopData.lng)) {
            alert(`This location is already in your trip on Day ${i + 1}!`);
            return false;
        }
    }

    if (tripDays[activeDayIdx].stops.length >= 10) {
        const lastStopOfCurrentDay = tripDays[activeDayIdx].stops[tripDays[activeDayIdx].stops.length - 1];
        if (activeDayIdx + 1 < tripDays.length) {
            window.BARK.activeDayIdx = ++activeDayIdx;
        } else {
            if (!canAddTripDay({ notify: true })) return false;
            tripDays.push(createTripDay(tripDays.length, [{ ...lastStopOfCurrentDay }]));
            window.BARK.activeDayIdx = tripDays.length - 1;
            activeDayIdx = window.BARK.activeDayIdx;
        }
        showTripToast(`Day full! Auto-moved to Day ${activeDayIdx + 1} 🚐`);
    }

    tripDays[activeDayIdx].stops.push(stopData);
    updateTripUI();
    setTimeout(() => showTripToast(`Added to Day ${activeDayIdx + 1}!`), 50);
    return true;
};

window.autoSortDay = function () {
    const tripDays = window.BARK.tripDays;
    const activeDayIdx = window.BARK.activeDayIdx;
    const day = tripDays[activeDayIdx];
    if (day.stops.length <= 2) { alert('You need at least 3 stops to sort a route!'); return; }

    const sorted = [day.stops[0]];
    const unvisited = day.stops.slice(1);
    let currentStop = sorted[0];
    while (unvisited.length > 0) {
        let nearestIdx = 0, minDist = Infinity;
        for (let i = 0; i < unvisited.length; i++) {
            const dist = window.BARK.haversineDistance(currentStop.lat, currentStop.lng, unvisited[i].lat, unvisited[i].lng);
            if (dist < minDist) { minDist = dist; nearestIdx = i; }
        }
        currentStop = unvisited.splice(nearestIdx, 1)[0];
        sorted.push(currentStop);
    }
    tripDays[activeDayIdx].stops = sorted;
    updateTripUI();
    showTripToast('✨ Route Optimized!');
};

window.executeSmartOptimization = function () {
    const tripDays = window.BARK.tripDays;
    const userMaxStops = parseInt(window.BARK.DOM.optMaxStops().value) || 5;
    const userMaxHours = parseFloat(window.BARK.DOM.optMaxHours().value) || 4;
    const totalStops = tripDays.reduce((sum, d) => sum + d.stops.length, 0);
    if (totalStops < 2) { alert('Add at least two stops before optimizing!'); return; }

    let allUniqueStops = [];
    tripDays.forEach(day => {
        day.stops.forEach(stop => {
            if (allUniqueStops.length === 0) allUniqueStops.push(stop);
            else {
                const lastStop = allUniqueStops[allUniqueStops.length - 1];
                const isDuplicate = stop.id && lastStop.id ? stop.id === lastStop.id : (stop.lat === lastStop.lat && stop.lng === lastStop.lng);
                if (!isDuplicate) allUniqueStops.push(stop);
            }
        });
    });

    let sorted = [], unvisited = [...allUniqueStops], currentStop;
    if (window.tripStartNode) currentStop = window.tripStartNode;
    else { currentStop = unvisited.shift(); sorted.push(currentStop); }
    while (unvisited.length > 0) {
        let nearestIdx = 0, minDist = Infinity;
        for (let i = 0; i < unvisited.length; i++) {
            const dist = window.BARK.haversineDistance(currentStop.lat, currentStop.lng, unvisited[i].lat, unvisited[i].lng);
            if (dist < minDist) { minDist = dist; nearestIdx = i; }
        }
        currentStop = unvisited.splice(nearestIdx, 1)[0];
        sorted.push(currentStop);
    }

    let newTripDays = [], currentDayStops = [], currentDayHours = 0, dayColorIndex = 0, hitTripDayLimit = false;
    for (let i = 0; i < sorted.length; i++) {
        const stop = sorted[i];
        if (currentDayStops.length > 0) {
            const prev = currentDayStops[currentDayStops.length - 1];
            const distKm = window.BARK.haversineDistance(prev.lat, prev.lng, stop.lat, stop.lng);
            currentDayHours += (distKm * 0.621371) / 55;
        }
        currentDayStops.push(stop);
        const isLastStop = i === sorted.length - 1;
        if (isLastStop || currentDayStops.length >= userMaxStops || currentDayHours >= userMaxHours) {
            if (newTripDays.length >= TRIP_DAY_LIMIT) {
                const remainingStops = sorted.slice(i + 1);
                newTripDays[TRIP_DAY_LIMIT - 1].stops.push(...currentDayStops, ...remainingStops);
                hitTripDayLimit = true;
                break;
            }
            newTripDays.push({ color: window.BARK.DAY_COLORS[dayColorIndex % window.BARK.DAY_COLORS.length], stops: [...currentDayStops], notes: tripDays[dayColorIndex] ? tripDays[dayColorIndex].notes : "" });
            dayColorIndex++;
            if (!isLastStop) { currentDayStops = [{ ...stop }]; currentDayHours = 0; }
        }
    }

    window.BARK.tripDays = newTripDays;
    window.BARK.activeDayIdx = 0;
    window.BARK.DOM.optimizerModal().style.display = 'none';
    updateTripUI();
    showTripToast(hitTripDayLimit ? 'Smart Optimization Complete. Trip capped at 50 days.' : '✨ Smart Optimization Complete!');
};

window.exportDayToMaps = function (dayIdx) {
    const tripDays = window.BARK.tripDays;
    const day = tripDays[dayIdx];
    const waypoints = [];
    if (dayIdx === 0 && window.tripStartNode) waypoints.push(`${window.tripStartNode.lat},${window.tripStartNode.lng}`);
    if (dayIdx > 0 && tripDays[dayIdx - 1].stops.length > 0) {
        const prevLast = tripDays[dayIdx - 1].stops[tripDays[dayIdx - 1].stops.length - 1];
        waypoints.push(`${prevLast.lat},${prevLast.lng}`);
    }
    day.stops.forEach(stop => waypoints.push(`${stop.lat},${stop.lng}`));
    if (dayIdx === tripDays.length - 1 && window.tripEndNode) waypoints.push(`${window.tripEndNode.lat},${window.tripEndNode.lng}`);
    if (waypoints.length < 2) { alert('Not enough stops to generate a driving route for this day!'); return; }
    window.open(`https://www.google.com/maps/dir/${waypoints.join('/')}`, '_blank');
};

// ====== DAY MANAGEMENT ======
window.shiftDayLeft = function () {
    const tripDays = window.BARK.tripDays;
    let activeDayIdx = window.BARK.activeDayIdx;
    if (activeDayIdx === 0) return;
    const temp = tripDays[activeDayIdx - 1];
    tripDays[activeDayIdx - 1] = tripDays[activeDayIdx];
    tripDays[activeDayIdx] = temp;
    window.BARK.activeDayIdx--;
    updateTripUI(); updateTripMapVisuals();
};

window.shiftDayRight = function () {
    const tripDays = window.BARK.tripDays;
    let activeDayIdx = window.BARK.activeDayIdx;
    if (activeDayIdx === tripDays.length - 1) return;
    const temp = tripDays[activeDayIdx + 1];
    tripDays[activeDayIdx + 1] = tripDays[activeDayIdx];
    tripDays[activeDayIdx] = temp;
    window.BARK.activeDayIdx++;
    updateTripUI(); updateTripMapVisuals();
};

window.insertDayAfter = function () {
    const tripDays = window.BARK.tripDays;
    if (!canAddTripDay({ notify: true })) return;
    const insertIndex = window.BARK.activeDayIdx + 1;
    tripDays.splice(insertIndex, 0, createTripDay(insertIndex));
    window.BARK.activeDayIdx++;
    updateTripUI();
};

window.editBookend = function (type) {
    const el = type === 'start' ? window.BARK.DOM.uiStartNode() : window.BARK.DOM.uiEndNode();
    const currentName = type === 'start' ? (window.tripStartNode ? window.tripStartNode.name : '') : (window.tripEndNode ? window.tripEndNode.name : '');
    const color = type === 'start' ? '#22c55e' : '#ef4444';
    const bg = type === 'start' ? '#f0fdf4' : '#fef2f2';

    el.innerHTML = `
    <div style="background: ${bg}; border: 2px solid ${color}; border-radius: 12px; padding: 12px; margin-top: ${type === 'end' ? '15px' : '0'}; margin-bottom: 15px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <div style="font-size: 11px; font-weight: 900; color: ${color}; margin-bottom: 8px; text-transform: uppercase;">📍 Set Trip ${type}</div>
        <div style="display: flex; gap: 5px;">
            <input type="text" id="inline-${type}-input" value="${currentName}" placeholder="Search park, town, or 'My location'" style="flex: 1; padding: 10px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1); font-size: 13px; outline: none; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
            <button onclick="processInlineSearch('${type}')" class="glass-btn primary-btn" style="padding: 10px 15px; border-radius: 8px; font-size: 12px; font-weight: 800;">🔍</button>
            <button onclick="updateTripUI()" class="glass-btn" style="padding: 10px; border-radius: 8px; font-size: 12px; font-weight: 800; color: #666;">✕</button>
        </div>
        <div id="inline-suggest-${type}" style="display: none; background: white; border: 1px solid rgba(0,0,0,0.1); border-radius: 8px; margin-top: 8px; max-height: 200px; overflow-y: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
        ${currentName ? `<div style="text-align:right; margin-top: 8px;"><button onclick="window.trip${type === 'start' ? 'Start' : 'End'}Node=null; updateTripUI()" style="background: transparent; color: #dc2626; border: none; font-size: 11px; font-weight: 800; cursor: pointer; text-decoration: underline;">Remove ${type.toUpperCase()}</button></div>` : ''}
    </div>`;

    const inlineInput = window.BARK.DOM.inlineInput(type);
    if (inlineInput) {
        let inlineSearchTimer = null;

        setTimeout(() => {
            inlineInput.focus();
            inlineInput.select();
        }, 50);

        inlineInput.addEventListener('input', () => {
            clearTimeout(inlineSearchTimer);
            inlineSearchTimer = setTimeout(() => {
                if (window.BARK.runInlinePlannerSearch) {
                    window.BARK.runInlinePlannerSearch(type, { executeGlobal: false });
                }
            }, 250);
        });

        inlineInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.processInlineSearch(type);
            } else if (e.key === 'Escape') {
                if (window.BARK.hideInlinePlannerSuggestions) {
                    window.BARK.hideInlinePlannerSuggestions(type);
                }
                inlineInput.blur();
            }
        });

        inlineInput.addEventListener('blur', () => {
            clearTimeout(inlineSearchTimer);
            const suggestBox = window.BARK.DOM.inlineSuggest(type);
            if (suggestBox && suggestBox.contains(document.activeElement)) return;

            if (window.BARK.hideInlinePlannerSuggestions) {
                window.BARK.hideInlinePlannerSuggestions(type);
            } else if (suggestBox) {
                suggestBox.style.display = 'none';
            }
        });
    }
};

function createTripDayTab(day, dayIndex, activeDayIdx, tripDays) {
    const tab = document.createElement('div');
    tab.className = `trip-day-tab${dayIndex === activeDayIdx ? ' active' : ''}`;
    tab.setAttribute('role', 'button');
    tab.setAttribute('tabindex', '0');
    tab.setAttribute('aria-pressed', dayIndex === activeDayIdx ? 'true' : 'false');
    tab.setAttribute('aria-label', `Day ${dayIndex + 1}, ${day.stops.length} stop${day.stops.length === 1 ? '' : 's'}`);
    tab.style.setProperty('--day-color', day.color);

    const swatch = document.createElement('input');
    swatch.type = 'color';
    swatch.value = day.color;
    swatch.title = 'Change day color';
    swatch.className = 'trip-day-color-input';
    swatch.onclick = (event) => event.stopPropagation();
    swatch.oninput = (event) => {
        tripDays[dayIndex].color = event.target.value;
        updateTripUI();
    };

    const label = document.createElement('span');
    label.className = 'trip-day-tab-label';
    label.textContent = `Day ${dayIndex + 1} (${day.stops.length})`;

    tab.appendChild(swatch);
    tab.appendChild(label);

    if (tripDays.length > 1 && (window.isTripEditMode || day.stops.length === 0)) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'trip-day-remove-btn';
        delBtn.textContent = '×';
        delBtn.title = 'Remove day';
        delBtn.setAttribute('aria-label', `Remove Day ${dayIndex + 1}`);
        delBtn.onclick = (event) => {
            event.stopPropagation();
            removeTripDay(dayIndex);
        };
        tab.appendChild(delBtn);
    }

    const activateTab = () => {
        window.BARK.activeDayIdx = dayIndex;
        updateTripUI();
    };
    tab.onclick = activateTab;
    tab.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activateTab();
        }
    };

    return tab;
}

function createAddDayButton() {
    const addDayBtn = document.createElement('button');
    addDayBtn.type = 'button';
    addDayBtn.className = 'trip-day-tab trip-day-add-btn';
    addDayBtn.textContent = '+ Add Day';
    addDayBtn.disabled = !canAddTripDay();
    addDayBtn.onclick = appendTripDayFromPrevious;
    if (addDayBtn.disabled) addDayBtn.title = 'Trips can include up to 50 days.';
    return addDayBtn;
}

function scrollTripDayPager(viewport, pageIndex, pageControls) {
    const boundedPage = Math.max(0, Math.min(pageIndex, pageControls.totalPages - 1));
    if (pageControls.track && pageControls.track.style && typeof pageControls.track.style.setProperty === 'function') {
        pageControls.track.style.setProperty('--trip-day-page-index', boundedPage);
    }
    updateTripDayPagerControls(pageControls, boundedPage);
}

function updateTripDayPagerControls(pageControls, pageIndex) {
    const boundedPage = Math.max(0, Math.min(pageIndex, pageControls.totalPages - 1));
    pageControls.currentPage = boundedPage;
    if (pageControls.count) pageControls.count.textContent = `${boundedPage + 1} / ${pageControls.totalPages}`;
    if (pageControls.prev) pageControls.prev.disabled = boundedPage === 0;
    if (pageControls.next) pageControls.next.disabled = boundedPage === pageControls.totalPages - 1;
    pageControls.dots.forEach((dot, dotIndex) => {
        dot.classList.toggle('active', dotIndex === boundedPage);
        dot.setAttribute('aria-current', dotIndex === boundedPage ? 'true' : 'false');
    });
}

function renderTripDayTabs(tabContainer, tripDays, activeDayIdx) {
    if (!tabContainer) return;

    const canAddDay = tripDays.length < TRIP_DAY_LIMIT;
    const totalSlots = tripDays.length + (canAddDay ? 1 : 0);
    const totalPages = Math.max(1, Math.ceil(totalSlots / TRIP_DAY_PAGE_SIZE));
    const activePageIdx = Math.min(totalPages - 1, Math.floor(activeDayIdx / TRIP_DAY_PAGE_SIZE));

    tabContainer.innerHTML = '';
    tabContainer.className = `trip-day-tabs${totalPages > 1 ? ' trip-day-tabs-paged' : ''}`;
    tabContainer.style.cssText = '';
    tabContainer.dataset.pageCount = String(totalPages);
    tabContainer.dataset.dayLimit = String(TRIP_DAY_LIMIT);

    const viewport = document.createElement('div');
    viewport.className = 'trip-day-pages-viewport';
    viewport.setAttribute('aria-label', 'Trip days');

    const track = document.createElement('div');
    track.className = 'trip-day-pages-track';
    track.style.setProperty('--trip-day-page-index', activePageIdx);

    let dayIndex = 0;
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
        const page = document.createElement('div');
        page.className = 'trip-day-page';
        page.setAttribute('aria-label', `Trip day page ${pageIndex + 1}`);

        while (dayIndex < tripDays.length && page.children.length < TRIP_DAY_PAGE_SIZE) {
            page.appendChild(createTripDayTab(tripDays[dayIndex], dayIndex, activeDayIdx, tripDays));
            dayIndex++;
        }

        if (canAddDay && dayIndex >= tripDays.length && page.children.length < TRIP_DAY_PAGE_SIZE && pageIndex === totalPages - 1) {
            page.appendChild(createAddDayButton());
        }

        track.appendChild(page);
    }

    viewport.appendChild(track);
    tabContainer.appendChild(viewport);

    if (totalPages > 1) {
        const controls = document.createElement('div');
        controls.className = 'trip-day-page-controls';

        const prev = document.createElement('button');
        prev.type = 'button';
        prev.className = 'trip-day-page-button';
        prev.textContent = '‹';
        prev.title = 'Previous trip days';
        prev.setAttribute('aria-label', 'Previous trip days');

        const dots = [];
        const dotWrap = document.createElement('div');
        dotWrap.className = 'trip-day-page-dots';
        for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'trip-day-page-dot';
            dot.setAttribute('aria-label', `Show trip days page ${pageIndex + 1}`);
            dotWrap.appendChild(dot);
            dots.push(dot);
        }

        const count = document.createElement('span');
        count.className = 'trip-day-page-count';

        const next = document.createElement('button');
        next.type = 'button';
        next.className = 'trip-day-page-button';
        next.textContent = '›';
        next.title = 'Next trip days';
        next.setAttribute('aria-label', 'Next trip days');

        const pageControls = { totalPages, prev, next, count, dots, track, currentPage: activePageIdx };
        prev.onclick = () => scrollTripDayPager(viewport, pageControls.currentPage - 1, pageControls);
        next.onclick = () => scrollTripDayPager(viewport, pageControls.currentPage + 1, pageControls);
        dots.forEach((dot, pageIndex) => {
            dot.onclick = () => scrollTripDayPager(viewport, pageIndex, pageControls);
        });

        let touchStartX = null;
        viewport.addEventListener('touchstart', (event) => {
            touchStartX = event.touches && event.touches[0] ? event.touches[0].clientX : null;
        }, { passive: true });
        viewport.addEventListener('touchend', (event) => {
            if (touchStartX === null) return;
            const touchEndX = event.changedTouches && event.changedTouches[0] ? event.changedTouches[0].clientX : touchStartX;
            const deltaX = touchEndX - touchStartX;
            touchStartX = null;
            if (Math.abs(deltaX) < 40) return;
            scrollTripDayPager(viewport, pageControls.currentPage + (deltaX < 0 ? 1 : -1), pageControls);
        });

        controls.appendChild(prev);
        controls.appendChild(dotWrap);
        controls.appendChild(count);
        controls.appendChild(next);
        tabContainer.appendChild(controls);
        updateTripDayPagerControls(pageControls, activePageIdx);
    }
}

function updateTripUI() {
    enforceTripDayLimit({ notify: true });
    const tripDays = window.BARK.tripDays;
    let activeDayIdx = window.BARK.activeDayIdx;
    const plannerBadge = window.BARK.DOM.plannerBadge();
    const list = window.BARK.DOM.tripQueueList();
    if (!list) return;

    const total = getTotalStops();
    if (plannerBadge) {
        if (total > 0) { plannerBadge.style.display = 'block'; plannerBadge.textContent = total; }
        else { plannerBadge.style.display = 'none'; }
    }

    let tabContainer = window.BARK.DOM.tripDayTabs();
    if (!tabContainer && list.parentElement) {
        tabContainer = document.createElement('div');
        tabContainer.id = 'trip-day-tabs';
        list.parentElement.insertBefore(tabContainer, list);
    }

    // START BOOKEND
    let startEl = window.BARK.DOM.uiStartNode();
    if (!startEl && tabContainer && tabContainer.parentElement) {
        startEl = document.createElement('div');
        startEl.id = 'ui-start-node';
        tabContainer.parentElement.insertBefore(startEl, tabContainer);
    }

    if (startEl && window.tripStartNode) {
        startEl.innerHTML = `<div onclick="editBookend('start')" class="trip-node-card" style="background: #f0fdf4; cursor: pointer; padding: 10px; margin-bottom: 10px; border-radius: 8px;"><div style="display: flex; align-items: center; gap: 10px;"><span style="background: #22c55e; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; justify-content: center; align-items: center; font-size: 11px; font-weight: 800;">A</span><div><div class="planner-metadata" style="color: #15803d; font-size: 10px;">Trip Start</div><div style="font-weight: 700; color: #333; font-size: 13px;">${window.tripStartNode.name}</div></div></div><div class="planner-metadata" style="opacity: 0.6; font-size: 10px;">Edit</div></div>`;
    } else if (startEl) {
        startEl.innerHTML = `<button onclick="editBookend('start')" class="glass-btn" style="width: 100%; height: 36px; background: #fff; border: 1px dashed #22c55e; color: #15803d; font-weight: 800; font-size: 11px; margin-bottom: 10px; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 8px;"><span>➕</span> SET TRIP START</button>`;
    }

    // DAY TABS
    renderTripDayTabs(tabContainer, tripDays, activeDayIdx);

    // Day management bar
    let dayManager = window.BARK.DOM.dayManagementBar();
    if (!dayManager) { dayManager = document.createElement('div'); dayManager.id = 'day-management-bar'; list.parentElement.insertBefore(dayManager, list); }
    if (window.isTripEditMode) {
        dayManager.innerHTML = `<div class="trip-day-management-row"><button onclick="window.shiftDayLeft()" class="trip-day-management-btn" ${activeDayIdx === 0 ? 'disabled' : ''}>← Shift Day</button><button onclick="window.insertDayAfter()" class="trip-day-management-btn trip-day-management-insert" ${tripDays.length >= TRIP_DAY_LIMIT ? 'disabled title="Trips can include up to 50 days."' : ''}>+ Insert Day</button><button onclick="window.shiftDayRight()" class="trip-day-management-btn" ${activeDayIdx === tripDays.length - 1 ? 'disabled' : ''}>Shift Day →</button></div>`;
        dayManager.style.display = 'block';
    } else { dayManager.style.display = 'none'; }

    // Render stops
    const activeDay = tripDays[activeDayIdx];
    if (typeof window.isTripEditMode === 'undefined') window.isTripEditMode = false;
    window.toggleTripEditMode = () => { window.isTripEditMode = !window.isTripEditMode; updateTripUI(); };

    list.innerHTML = '';

    if (activeDay.stops.length > 0 || tripDays.length > 1) {
        const actionBar = document.createElement('div');
        actionBar.className = 'trip-edit-action-bar';
        actionBar.innerHTML = `<button onclick="toggleTripEditMode()" class="trip-edit-toggle-btn${window.isTripEditMode ? ' active' : ''}">${window.isTripEditMode ? 'Done Editing' : '✏️ Edit Stops & Days'}</button>`;
        list.appendChild(actionBar);
    }

    if (activeDay.stops.length === 0) {
        const empty = document.createElement('li');
        empty.style.cssText = 'color:#aaa; font-size:13px; text-align:center; padding:18px 0;';
        empty.textContent = 'No stops yet. Add parks or a town above!';
        list.appendChild(empty);
    }

    activeDay.stops.forEach((stop, index) => {
        const li = document.createElement('li');
        li.className = 'stop-list-item';
        let controlsHtml = '';
        if (window.isTripEditMode) {
            const moveToDayOptions = tripDays.map((d, di) => di !== activeDayIdx ? `<option value="${di}">Day ${di + 1}</option>` : '').join('');
            const moveSelect = moveToDayOptions ? `<select class="move-to-day-select" data-index="${index}" style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px; background: white; font-size: 11px; cursor:pointer; color:#475569; outline:none; font-weight:600;"><option value="">↳ Move</option>${moveToDayOptions}</select>` : '';
            controlsHtml = `<div style="display: flex; gap: 6px; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(0,0,0,0.05); width: 100%;">${moveSelect}<div style="flex: 1;"></div><button class="move-up-btn" data-index="${index}" style="background:#f1f5f9; border:none; border-radius:6px; cursor:pointer; font-size:14px; color:#475569; padding:4px 10px; ${index === 0 ? 'visibility:hidden;' : ''}" title="Move Up">↑</button><button class="move-down-btn" data-index="${index}" style="background:#f1f5f9; border:none; border-radius:6px; cursor:pointer; font-size:14px; color:#475569; padding:4px 10px; ${index === activeDay.stops.length - 1 ? 'visibility:hidden;' : ''}" title="Move Down">↓</button><button class="remove-stop-btn" data-index="${index}" style="background:#fee2e2; border:none; border-radius:6px; color:#ef4444; font-weight:900; font-size:12px; cursor:pointer; padding:6px 12px; margin-left: 4px;" title="Remove">✕</button></div>`;
        }
        li.innerHTML = `<div style="display: flex; flex-direction: column; width: 100%; padding: ${window.isTripEditMode ? '8px' : '12px 4px'}; background: ${window.isTripEditMode ? '#f8fafc' : 'transparent'}; border-radius: 10px; border: ${window.isTripEditMode ? '1px solid #e2e8f0' : '1px solid transparent'}; transition: all 0.2s;"><div style="display: flex; align-items: center; width: 100%;"><span style="background:${activeDay.color}; color:white; border-radius: 6px; width: 24px; height: 24px; min-width: 24px; display: inline-flex; justify-content: center; align-items: center; font-size: 12px; font-weight:900; margin-right: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">${index + 1}</span><span style="font-weight: 700; color: #1e293b; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;" title="${stop.name}">${stop.name}</span></div>${controlsHtml}</div>`;
        list.appendChild(li);
    });

    // Ghost button
    const ghostBtn = document.createElement('div');
    ghostBtn.style.cssText = `margin: 10px 4px; padding: 12px; border: 2px dashed #e2e8f0; border-radius: 10px; color: #94a3b8; font-size: 12px; font-weight: 800; text-align: center; cursor: pointer; transition: all 0.2s; text-transform: uppercase; letter-spacing: 0.5px;`;
    ghostBtn.innerHTML = `➕ Add Stop to Day ${activeDayIdx + 1}`;
    ghostBtn.onmouseover = () => { ghostBtn.style.borderColor = activeDay.color; ghostBtn.style.color = activeDay.color; };
    ghostBtn.onmouseout = () => { ghostBtn.style.borderColor = '#e2e8f0'; ghostBtn.style.color = '#94a3b8'; };
    ghostBtn.onclick = () => focusMapSearchForTripStop(activeDayIdx + 1, activeDay.color);
    list.appendChild(ghostBtn);

    // Notes
    const notesContainer = window.BARK.DOM.dayNotesContainer();
    if (notesContainer) {
        notesContainer.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;"><label style="font-size:11px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; margin:0;">📋 Day ${activeDayIdx + 1} Notes</label><button onclick="exportDayToMaps(${activeDayIdx})" style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; font-size:10px; font-weight:800; padding:4px 8px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:4px; transition:all 0.2s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">🗺️ Drive Day ${activeDayIdx + 1}</button></div><textarea id="day-notes-textarea" placeholder="Hiking trails, confirmation #s, lunch spots..." style="width:100%; height:60px; padding:10px; border-radius:8px; border:none; background:#f8fafc; font-size:13px; outline:none; resize:none; font-family:inherit; color:#334155; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);" onfocus="this.style.boxShadow='inset 0 0 0 2px ${activeDay.color}'" onblur="this.style.boxShadow='inset 0 2px 4px rgba(0,0,0,0.02)'">${activeDay.notes || ""}</textarea><div style="text-align:right; font-size:10px; color:#cbd5e1; margin-top:4px;"><span id="char-count">${(activeDay.notes || "").length}</span> / 1000</div>`;
        const textarea = window.BARK.DOM.dayNotesTextarea();
        const charCount = window.BARK.DOM.charCount();
        textarea.oninput = (e) => { let val = e.target.value; if (val.length > 1000) { val = val.substring(0, 1000); e.target.value = val; } activeDay.notes = val; charCount.textContent = val.length; };
    }

    // Wire up buttons
    document.querySelectorAll('.remove-stop-btn').forEach(btn => { btn.onclick = (e) => { tripDays[activeDayIdx].stops.splice(parseInt(e.currentTarget.getAttribute('data-index')), 1); updateTripUI(); }; });
    document.querySelectorAll('.move-up-btn').forEach(btn => { btn.onclick = (e) => { const idx = parseInt(e.currentTarget.getAttribute('data-index')); if (idx > 0) { const stops = tripDays[activeDayIdx].stops; [stops[idx], stops[idx - 1]] = [stops[idx - 1], stops[idx]]; updateTripUI(); } }; });
    document.querySelectorAll('.move-down-btn').forEach(btn => { btn.onclick = (e) => { const idx = parseInt(e.currentTarget.getAttribute('data-index')); const stops = tripDays[activeDayIdx].stops; if (idx < stops.length - 1) { [stops[idx], stops[idx + 1]] = [stops[idx + 1], stops[idx]]; updateTripUI(); } }; });
    document.querySelectorAll('.move-to-day-select').forEach(sel => { sel.onchange = (e) => { const fromIdx = parseInt(e.currentTarget.getAttribute('data-index')); const toDayIdx = parseInt(e.target.value); if (isNaN(toDayIdx)) return; const stop = tripDays[activeDayIdx].stops.splice(fromIdx, 1)[0]; tripDays[toDayIdx].stops.push(stop); updateTripUI(); }; });

    // END BOOKEND
    let endEl = window.BARK.DOM.uiEndNode();
    if (!endEl) { const wrapper = window.BARK.DOM.itineraryTimelineWrapper(); if (wrapper) { endEl = document.createElement('div'); endEl.id = 'ui-end-node'; wrapper.appendChild(endEl); } }
    if (endEl && window.tripEndNode) {
        endEl.innerHTML = `<div onclick="editBookend('end')" style="cursor:pointer; background: #fef2f2; border: 2px solid #ef4444; border-radius: 8px; padding: 10px; margin-top: 10px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 6px rgba(239,68,68,0.05);"><div style="font-size: 13px; font-weight: 900; color: #b91c1c; display: flex; align-items: center; gap: 8px;"><span style="background: #ef4444; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; justify-content: center; align-items: center; font-size: 11px;">B</span> TRIP END: <span style="font-weight:600; color:#333; margin-left: 4px;">${window.tripEndNode.name}</span></div><div style="font-size:10px; color:#ef4444; font-weight:800; text-transform:uppercase;">Edit</div></div>`;
    } else if (endEl) {
        endEl.innerHTML = `<button onclick="editBookend('end')" style="width:100%; cursor:pointer; background: #fff; border: 1px dashed #ef4444; color:#b91c1c; border-radius: 8px; padding: 10px; margin-top: 10px; font-weight:800; text-transform:uppercase; font-size:11px;">+ Set Trip End</button>`;
    }

    try { updateTripMapVisuals(); } catch (e) { console.error("Map visuals update failed:", e); }
    updateRouteGenerationButtonState();
}

window.BARK.updateTripUI = updateTripUI;

// ====== INIT TRIP PLANNER ======
function initTripPlanner() {
    const clearTripBtn = window.BARK.DOM.clearTripBtn();
    const startRouteBtn = window.BARK.DOM.startRouteBtn();
    const saveRouteBtn = window.BARK.DOM.saveRouteBtn();
    const optimizeTripBtn = window.BARK.DOM.optimizeTripBtn();
    let currentRouteLayers = [];
    let routeRenderGeneration = 0;

    function resetTripPlannerRuntime(options = {}) {
        const resetName = options.resetName !== false;

        window.BARK.tripDays = [{ color: window.BARK.DAY_COLORS[0], stops: [], notes: "" }];
        window.BARK.activeDayIdx = 0;
        window.tripStartNode = null;
        window.tripEndNode = null;
        window.isTripEditMode = false;
        routeRenderGeneration++;

        currentRouteLayers.forEach(removeTripMapLayer);
        currentRouteLayers = [];
        if (window.BARK.tripLayer && typeof window.BARK.tripLayer.clear === 'function') {
            const diff = window.BARK.tripLayer.clear() || { added: new Set(), removed: new Set() };
            const markerManager = window.BARK.markerManager;
            if (markerManager && typeof markerManager.refreshTripStopClasses === 'function' && diff.removed.size > 0) {
                markerManager.refreshTripStopClasses(diff.removed);
            }
        }

        if (resetName) {
            const nameInput = window.BARK.DOM.tripNameInput();
            if (nameInput) nameInput.value = '';
        }

        clearRouteTelemetryStatus();

        document.querySelectorAll('[id^="inline-suggest-"]').forEach(el => {
            el.style.display = 'none';
            el.innerHTML = '';
        });

        updateTripUI();
    }

    window.BARK.resetTripPlannerRuntime = resetTripPlannerRuntime;

    if (optimizeTripBtn) {
        optimizeTripBtn.onclick = () => { window.BARK.DOM.optimizerModal().style.display = 'flex'; };
    }

    if (clearTripBtn) {
        clearTripBtn.onclick = () => {
            if (getTotalStops() > 0 || window.tripStartNode || window.tripEndNode) {
                if (!confirm("Are you sure you want to clear your trip?")) return;
            }
            resetTripPlannerRuntime();
        };
    }

    if (saveRouteBtn) {
        saveRouteBtn.onclick = async () => {
            setPlannerActionButtonLabel(saveRouteBtn, 'Saving...');
            saveRouteBtn.disabled = true;
            const saved = await saveCurrentTrip();
            setPlannerActionButtonLabel(saveRouteBtn, 'Save', '💾');
            saveRouteBtn.disabled = false;
            if (saved) alert('✅ Trip saved! Check Profile → Saved Routes.');
        };
    }

    if (startRouteBtn) {
        startRouteBtn.onclick = () => {
            if (!isPremiumRoutingUnlocked()) {
                openRoutePremiumPaywall();
                updateRouteGenerationButtonState();
                return;
            }
            if (getTotalStops() === 0) return;
            generateAndRenderTripRoute();
        };
    }

    const premiumService = getPremiumService();
    if (premiumService && typeof premiumService.subscribe === 'function') {
        premiumService.subscribe(() => updateTripUI());
    }

    async function saveCurrentTrip() {
        const user = (typeof firebase !== 'undefined') ? firebase.auth().currentUser : null;
        if (!user) {
            openFreeAccountPrompt('saved-route');
            return false;
        }
        window.BARK.incrementRequestCount();
        if (getTotalStops() === 0) { alert('Nothing to save — add some stops first!'); return false; }
        const nameInput = window.BARK.DOM.tripNameInput();
        const tripName = nameInput ? nameInput.value.trim() : "";
        if (!tripName) { alert('Please enter a name for your trip.'); if (nameInput) nameInput.focus(); return false; }
        try {
            const tripDays = window.BARK.tripDays;
            const routeData = buildSavedRouteData(tripName, tripDays);
            routeData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            if (!routeData.tripDays.some(day => day.stops.length > 0)) {
                alert('Nothing to save — add a valid stop first!');
                return false;
            }
            await firebase.firestore().collection('users').doc(user.uid).collection('savedRoutes').add(routeData);
            window.BARK.loadSavedRoutes(user.uid);
            return true;
        } catch (err) { console.error('Save failed:', err); alert('Could not save route: ' + err.message); return false; }
    }

    async function generateAndRenderTripRoute() {
        const user = (typeof firebase !== 'undefined') ? firebase.auth().currentUser : null;
        if (!user) { alert("Please sign in to generate routes."); return; }
        if (!isPremiumRoutingUnlocked()) {
            openRoutePremiumPaywall();
            updateRouteGenerationButtonState();
            return;
        }
        const routeRunId = ++routeRenderGeneration;
        window.BARK.incrementRequestCount();
        const tripDays = window.BARK.tripDays;
        const routableDays = tripDays
            .map((day, originalIndex) => {
                const dayStops = Array.isArray(day.stops) ? [...day.stops] : [];
                if (originalIndex === 0 && window.tripStartNode) dayStops.unshift(window.tripStartNode);
                if (originalIndex === tripDays.length - 1 && window.tripEndNode) dayStops.push(window.tripEndNode);
                return { day, dayStops, originalIndex };
            })
            .filter(routeDay => routeDay.dayStops.length >= 2);
        if (routableDays.length === 0) { alert("Each day needs at least 2 stops, including trip start/end."); return; }

        currentRouteLayers.forEach(removeTripMapLayer); currentRouteLayers = [];
        // Hide the dashed day lines while the generated driving route is on the map.
        // Badges and bookends stay visible so the user keeps stop ordering context.
        if (window.BARK.tripLayer && typeof window.BARK.tripLayer.setDayLinesVisible === 'function') {
            window.BARK.tripLayer.setDayLinesVisible(false);
        }

        if (startRouteBtn) {
            setPlannerActionButtonLabel(startRouteBtn, 'Generating...');
            startRouteBtn.disabled = true;
        }

        setRouteTelemetryStatus('working', 'Generating route...', `Building drive lines for ${routableDays.length} day${routableDays.length === 1 ? '' : 's'}.`);
        const slowRouteTimer = setTimeout(() => {
            if (routeRunId !== routeRenderGeneration) return;
            setRouteTelemetryStatus('slow', 'Still generating route...', 'This might take a few minutes for bigger trips.');
        }, 1800);

        const allBounds = [];
        let anySucceeded = false, totalDistMeters = 0, totalDurSeconds = 0;

        try {
            for (let routeDayIndex = 0; routeDayIndex < routableDays.length; routeDayIndex += 1) {
                const routeDay = routableDays[routeDayIndex];
                const { day, dayStops } = routeDay;

                try {
                    const currentStatus = window.BARK.DOM.routeTelemetry()?.dataset.routeStatus;
                    if (routableDays.length > 1) {
                        setRouteTelemetryStatus(
                            currentStatus === 'slow' ? 'slow' : 'working',
                            currentStatus === 'slow' ? 'Still generating route...' : 'Generating route...',
                            `Building drive line ${routeDayIndex + 1} of ${routableDays.length}.`
                        );
                    }

                    const orsCoordinates = dayStops.map(s => [Number(s.lng), Number(s.lat)]);
                    const parkRepo = window.BARK.repos && window.BARK.repos.ParkRepo;
                    const orsWaypoints = dayStops.map((stop, index) => {
                        const canonical = stop && stop.id && parkRepo && typeof parkRepo.getById === 'function'
                            ? parkRepo.getById(stop.id)
                            : null;
                        return {
                            id: stop && stop.id ? stop.id : null,
                            name: stop && stop.name ? stop.name : '',
                            state: (stop && stop.state) || (canonical && canonical.state) || '',
                            lat: orsCoordinates[index][1],
                            lng: orsCoordinates[index][0],
                            country: 'US'
                        };
                    });
                    const geoJSONData = await window.BARK.services.ors.directions(orsCoordinates, {
                        radiuses: new Array(orsCoordinates.length).fill(-1),
                        waypoints: orsWaypoints
                    });
                    const stillSignedIn = typeof firebase !== 'undefined' && firebase.auth().currentUser;
                    if (routeRunId !== routeRenderGeneration || !stillSignedIn) break;
                    const layer = L.geoJSON(geoJSONData, { style: () => ({ color: day.color, weight: 5, opacity: 0.85, dashArray: '10, 8' }) }).addTo(map);
                    currentRouteLayers.push(layer); allBounds.push(layer.getBounds()); anySucceeded = true;
                    const summary = geoJSONData.features[0].properties.summary;
                    if (summary) { totalDistMeters += summary.distance; totalDurSeconds += summary.duration; }
                } catch (err) { console.error(`Route failed for day (${day.color}):`, err); alert(`A day's route failed: ${err.message}`); }

                if (routeRunId !== routeRenderGeneration) break;
                await waitForRouteDayThrottle(routeDayIndex, routableDays.length);
            }

            if (allBounds.length > 0) {
                const combined = allBounds.reduce((acc, b) => acc.extend(b), allBounds[0]);
                map.fitBounds(combined, { padding: [50, 50], animate: !window.instantNav, duration: window.instantNav ? 0 : 0.5 });
            }

            if (routeRunId === routeRenderGeneration) {
                if (anySucceeded) {
                    const miles = (totalDistMeters * 0.000621371).toFixed(1);
                    const hrs = Math.floor(totalDurSeconds / 3600);
                    const mins = Math.floor((totalDurSeconds % 3600) / 60);
                    setRouteTelemetrySummary(miles, hrs, mins);
                } else {
                    setRouteTelemetryStatus('error', 'Route was not generated.', 'Try again or use fewer stops per day.');
                }
            }

            if (anySucceeded) document.querySelector('[data-target="map-view"]')?.click();
        } finally {
            clearTimeout(slowRouteTimer);
            if (routeRunId === routeRenderGeneration && startRouteBtn) {
                setPlannerActionButtonLabel(startRouteBtn, 'Generate Route');
                startRouteBtn.disabled = false;
            }
        }
    }
}

window.BARK.initTripPlanner = initTripPlanner;
