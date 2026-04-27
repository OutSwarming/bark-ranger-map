/**
 * barkState.js — Central State Store
 * Owns all mutable application state and the window.BARK namespace.
 * Loaded FIRST in the boot sequence.
 */
window.BARK = window.BARK || {};

// ====== APP VERSION ======
let APP_VERSION = parseInt(localStorage.getItem('bark_seen_version') || '26');
console.log(`B.A.R.K. Engine v${APP_VERSION}: Performance Optimized`);
window.BARK.APP_VERSION = APP_VERSION;
window.BARK.setAppVersion = function (v) { APP_VERSION = v; window.BARK.APP_VERSION = v; };

// ====== SETTINGS STATE (localStorage hydration) ======
window.allowUncheck = localStorage.getItem('barkAllowUncheck') === 'true';

// 3-Way Bubble Logic
window.standardClusteringEnabled = localStorage.getItem('barkStandardClustering') !== 'false'; // Default ON
window.premiumClusteringEnabled = localStorage.getItem('barkPremiumClustering') === 'true';   // Default OFF

// Master state for the engine
window.clusteringEnabled = window.standardClusteringEnabled || window.premiumClusteringEnabled;

// 🛡️ STRICT HARDWARE FIX: Only auto-detect if the user has NEVER touched the setting.
let lowGfxSaved = localStorage.getItem('barkLowGfxEnabled');
window.lowGfxEnabled = false;

if (lowGfxSaved !== null) {
    window.lowGfxEnabled = lowGfxSaved === 'true';
} else {
    const deviceRAM = navigator.deviceMemory || 4;
    window.lowGfxEnabled = (deviceRAM < 4);
}
window.simplifyTrails = localStorage.getItem('barkSimplifyTrails') === 'true';
window.instantNav = localStorage.getItem('barkInstantNav') === 'true';
window.rememberMapPosition = localStorage.getItem('remember-map-toggle') === 'true';
window.startNationalView = localStorage.getItem('barkNationalView') === 'true';
window.stopAutoMovements = localStorage.getItem('barkStopAutoMove') === 'true';

// 🛑 REDUCE PIN SCALING / MOTION STATE
window.reducePinMotion = localStorage.getItem('barkReducePinMotion') === 'true';

// 🚀 B.A.R.K. PERFORMANCE MODIFIERS (V24 — 4 Toggles)
window.removeShadows = localStorage.getItem('barkRemoveShadows') === 'true';
window.stopResizing = localStorage.getItem('barkStopResizing') === 'true';
window.viewportCulling = localStorage.getItem('barkViewportCulling') === 'true';

// 🔨 ULTRA-LOW SLEDGEHAMMER STATE
window.ultraLowEnabled = localStorage.getItem('barkUltraLowEnabled') === 'true';

// Master state for the engine (recomputed)
window.clusteringEnabled = window.standardClusteringEnabled || window.premiumClusteringEnabled;

// 1-Finger Zoom disabled state
window.lockMapPanning = localStorage.getItem('barkLockMapPanning') === 'true';
window.disable1fingerZoom = localStorage.getItem('barkDisable1Finger') === 'true';
window.disableDoubleTap = localStorage.getItem('barkDisableDoubleTap') === 'true';
window.disablePinchZoom = localStorage.getItem('barkDisablePinchZoom') === 'true';

// Apply Master Override if Ultra Low is ON
if (window.ultraLowEnabled) {
    window.lowGfxEnabled = true;
    window.standardClusteringEnabled = true;
    window.instantNav = true;
    window.simplifyTrails = true;
    window.clusteringEnabled = true;
}

// ====== GLOBAL LOOKUP ENGINE (v25 Performance) ======
window.parkLookup = new Map();

// ====== SAFETY & COST CONTROLS ======
let globalRequestCounter = 0;
window.SESSION_MAX_REQUESTS = 600;
window._SESSION_REQUEST_COUNT = 0;
window._cloudSettingsLoaded = false;

function incrementRequestCount() {
    globalRequestCounter++;
    if (globalRequestCounter > window.SESSION_MAX_REQUESTS) {
        console.error("CRITICAL: Session request limit reached. Background sync disabled.");
        throw new Error("Safety Shutdown: API limit reached for this session.");
    }
}
window.BARK.incrementRequestCount = incrementRequestCount;

// ====== CORE DATA STATE ======
let allPoints = [];
let _searchResultCache = { query: '', matchedIds: null };
let activePinMarker = null;

function clearActivePin() {
    if (activePinMarker && activePinMarker._icon) {
        activePinMarker._icon.classList.remove('active-pin');
    }
    activePinMarker = null;
}

let activeSwagFilters = new Set();
let activeSearchQuery = '';
let activeTypeFilter = 'all';

let userVisitedPlaces = new Map();
let visitedFilterState = localStorage.getItem('barkVisitedFilter') || 'all';

// ====== TRIP PLANNER STATE ======
const DAY_COLORS = ['#1976D2', '#2E7D32', '#E65100', '#6A1B9A', '#C62828'];
let tripDays = [{ color: DAY_COLORS[0], stops: [], notes: "" }];
let activeDayIdx = 0;
window.tripStartNode = null;
window.tripEndNode = null;

// ====== UTILITY FUNCTIONS ======
if (
    typeof window.BARK.generatePinId !== 'function' ||
    typeof window.BARK.haversineDistance !== 'function' ||
    typeof window.BARK.sanitizeWalkPoints !== 'function'
) {
    throw new Error('geoUtils.js must load before barkState.js');
}

// ====== GAMIFICATION ENGINE INSTANCE ======
window.gamificationEngine = new GamificationEngine();
window.currentWalkPoints = window.currentWalkPoints || 0;
window._lastSyncedScore = window._lastSyncedScore || 0;

// ====== EXPOSE STATE TO BARK NAMESPACE ======
// Using property accessors so modules always get live references
Object.defineProperties(window.BARK, {
    allPoints:          { get() { return allPoints; },          set(v) { allPoints = v; } },
    _searchResultCache: { get() { return _searchResultCache; }, set(v) { _searchResultCache = v; } },
    activePinMarker:    { get() { return activePinMarker; },    set(v) { activePinMarker = v; } },
    activeSwagFilters:  { get() { return activeSwagFilters; },  set(v) { activeSwagFilters = v; } },
    activeSearchQuery:  { get() { return activeSearchQuery; },  set(v) { activeSearchQuery = v; } },
    activeTypeFilter:   { get() { return activeTypeFilter; },   set(v) { activeTypeFilter = v; } },
    userVisitedPlaces:  { get() { return userVisitedPlaces; },  set(v) { userVisitedPlaces = v; } },
    visitedFilterState: { get() { return visitedFilterState; }, set(v) { visitedFilterState = v; } },
    tripDays:           { get() { return tripDays; },           set(v) { tripDays = v; } },
    activeDayIdx:       { get() { return activeDayIdx; },       set(v) { activeDayIdx = v; } },
});

window.BARK.DAY_COLORS = DAY_COLORS;
window.BARK.clearActivePin = clearActivePin;
