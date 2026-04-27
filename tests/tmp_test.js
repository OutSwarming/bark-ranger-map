let APP_VERSION = parseInt(localStorage.getItem('bark_seen_version') || '26');
console.log(`B.A.R.K. Engine v${APP_VERSION}: Performance Optimized`);

// ====== SETTINGS UI LOGIC ======
window.allowUncheck = localStorage.getItem('barkAllowUncheck') === 'true';

// 3-Way Bubble Logic
window.standardClusteringEnabled = localStorage.getItem('barkStandardClustering') !== 'false'; // Default ON
window.premiumClusteringEnabled = localStorage.getItem('barkPremiumClustering') === 'true';   // Default OFF

// Master state for the engine
window.clusteringEnabled = window.standardClusteringEnabled || window.premiumClusteringEnabled;

// 🛡️ STRICT HARDWARE FIX: Only auto-detect if the user has NEVER touched the setting.
// Once they flip the toggle, their choice is permanent. It does not matter the device.
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
window.startNationalView = localStorage.getItem('barkNationalView') === 'true'; // ✨ NEW
window.stopAutoMovements = localStorage.getItem('barkStopAutoMove') === 'true';

// 🛑 REDUCE PIN SCALING / MOTION STATE
window.reducePinMotion = localStorage.getItem('barkReducePinMotion') === 'true';

if (window.reducePinMotion) {
    document.body.classList.add('reduce-pin-motion');
} else {
    document.body.classList.remove('reduce-pin-motion');
}

// 🚀 B.A.R.K. PERFORMANCE MODIFIERS (V24 — 4 Toggles)
window.removeShadows = localStorage.getItem('barkRemoveShadows') === 'true';
window.stopResizing = localStorage.getItem('barkStopResizing') === 'true';
window.viewportCulling = localStorage.getItem('barkViewportCulling') === 'true';

if (window.removeShadows) document.body.classList.add('remove-shadows');
if (window.stopResizing) document.body.classList.add('stop-resizing');
if (window.viewportCulling) document.body.classList.add('viewport-culling');

// 🔨 ULTRA-LOW SLEDGEHAMMER STATE
window.ultraLowEnabled = localStorage.getItem('barkUltraLowEnabled') === 'true';

// Master state for the engine
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
    window.simplifyTrails = true; // Added missing master-forced state
    window.clusteringEnabled = true;
    document.body.classList.add('ultra-low');
    document.body.classList.add('low-graphics'); // Ensure both are on
} else {
    // Safety: Ensure class is gone if setting is off
    document.body.classList.remove('ultra-low');
}

// Global Lookup Engine (v25 Performance)
window.parkLookup = new Map();

let mapSaveTimeout;

// Apply initial Low Graphics class strictly based on the final setting
if (window.lowGfxEnabled) {
    document.body.classList.add('low-graphics');
} else {
    document.body.classList.remove('low-graphics');
}

// ====== iOS SAFARI MAGNIFIER & SELECTION HACK ======
// Prevent the long-press and double-tap-and-hold magnifying glass (loupe)
document.addEventListener('contextmenu', function (e) {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
    }
});

let lastTouchTime = 0;
document.addEventListener('touchstart', function (e) {
    const time = new Date().getTime();
    const timeSince = time - lastTouchTime;
    // Intercept the second tap of a double tap (which can lead to a magnifying glass if held)
    if (timeSince < 300 && timeSince > 0) {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && !e.target.isContentEditable) {
            e.preventDefault();
        }
    }
    lastTouchTime = time;
}, { passive: false });


// ====== SAFETY & COST CONTROLS ======
let globalRequestCounter = 0;
window.SESSION_MAX_REQUESTS = 600;
window._SESSION_REQUEST_COUNT = 0;
window._cloudSettingsLoaded = false; // ✨ Guard flag for cloud sync feedback loops

function incrementRequestCount() {
    globalRequestCounter++;
    if (globalRequestCounter > SESSION_MAX_REQUESTS) {
        console.error("CRITICAL: Session request limit reached. Background sync disabled.");
        throw new Error("Safety Shutdown: API limit reached for this session.");
    }
}

window.attemptDailyStreakIncrement = async function () {
    if (typeof firebase === 'undefined' || !firebase.auth().currentUser) return { success: false, message: "Not logged in" };

    const user = firebase.auth().currentUser;
    const today = new Date().toISOString().split('T')[0];

    const docRef = firebase.firestore().collection('users').doc(user.uid);
    const doc = await docRef.get();
    const data = doc.exists ? doc.data() : {};

    const lastStreakDate = data.lastStreakDate || localStorage.getItem('lastStreakDate');
    if (lastStreakDate === today) return { success: false, message: "Already incremented today" };

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    let currentStreak = parseInt(data.streakCount || localStorage.getItem('streakCount') || 0);

    if (lastStreakDate === yesterdayStr) {
        currentStreak += 1;
    } else {
        currentStreak = 1;
    }

    incrementRequestCount();
    await docRef.set({
        streakCount: currentStreak,
        lastStreakDate: today
    }, { merge: true });

    localStorage.setItem('lastStreakDate', today);
    localStorage.setItem('streakCount', currentStreak);

    const streakLabel = document.getElementById('streak-count-label');
    if (streakLabel) streakLabel.textContent = currentStreak;

    return { success: true, count: currentStreak };
};

// ====== iOS KEYBOARD LAYOUT FIX ======
// iOS Safari resizes the visual viewport when the keyboard opens,
// but position:fixed elements (like the nav bar) don't move with it.
// This causes the nav bar to float over or under the screen.
(function () {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // Method 1: visualViewport resize detection (most reliable)
    if (window.visualViewport) {
        let initialHeight = window.visualViewport.height;
        window.visualViewport.addEventListener('resize', () => {
            const currentHeight = window.visualViewport.height;
            // If viewport shrunk significantly, keyboard is likely open.
            // Using 25% of height as a more robust threshold than a fixed pixel value.
            if (initialHeight - currentHeight > window.screen.height * 0.2) {
                document.body.classList.add('keyboard-open');
                if (window.innerWidth < 768 && slidePanel) {
                    slidePanel.classList.remove('open');
                }
            } else {
                document.body.classList.remove('keyboard-open');
            }
        });
        // Update baseline on orientation change
        window.addEventListener('orientationchange', () => {
            setTimeout(() => { initialHeight = window.visualViewport.height; }, 1000); // Wait for Safari chrome animation
        });
    }

    // Method 2: Focus/blur on input elements (fallback)
    document.addEventListener('focusin', (e) => {
        if (e.target.matches('input, textarea')) {
            document.body.classList.add('keyboard-open');

            // Explicitly close slide panel on mobile if typing starts
            if (window.innerWidth < 768 && typeof slidePanel !== 'undefined' && slidePanel) {
                slidePanel.classList.remove('open');
            }

            // Scroll the focused element into view after a short delay
            if (isIOS) {
                setTimeout(() => {
                    e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 400); // Slightly longer for Safari stability
            }
        }
    });
    document.addEventListener('focusout', (e) => {
        if (e.target.matches('input, textarea')) {
            document.body.classList.remove('keyboard-open');
            // Force iOS to recalculate layout
            if (isIOS) {
                window.scrollTo(0, 0);
            }
        }
    });
})();

// Initialize map centered on the US
const mapOptions = window.ultraLowEnabled ? {
    preferCanvas: true,          // Use Canvas instead of SVG
    updateWhenIdle: true,        // DO NOT update tiles while moving
    updateWhenZooming: false,     // This is your "slow resize" fix
    markerZoomAnimation: false,  // Stop pins from "growing" during zoom
    zoomAnimation: false,        // Snap zoom instantly
    fadeAnimation: false,        // No cross-fading tiles
    inertia: false,              // Stop the map from "sliding" after a flick
    zoomControl: false,
    worldCopyJump: true,
    renderer: L.canvas({ padding: 0.5 })
} : {
    zoomControl: false,
    worldCopyJump: true,
    renderer: L.canvas({ padding: 0.5 }),
    preferCanvas: true,
    zoomSnap: 0.5,
    zoomDelta: 1,
    wheelDebounceTime: 40,
    wheelPxPerZoomLevel: 120,
    doubleClickZoom: false, // 🛑 Managed by Custom Engine
    touchZoom: !window.disablePinchZoom,
    dragging: !window.lockMapPanning,

    // Let Leaflet's native GPU scaling handle the tile stretch
    markerZoomAnimation: true
};

const map = L.map('map', mapOptions);

// 🎯 MAP MEMORY INJECTION
function setInitialMapView(defaultLat, defaultLng) {
    const savedLat = localStorage.getItem('mapLat');
    const savedLng = localStorage.getItem('mapLng');
    const savedZoom = localStorage.getItem('mapZoom') || 7;

    if (window.rememberMapPosition && savedLat && savedLng) {
        console.log("📍 Restoring last known map position...");
        map.setView([parseFloat(savedLat), parseFloat(savedLng)], parseInt(savedZoom), { animate: false });
        return true; // Use saved position
    } else {
        console.log("📍 Starting at default/current location...");
        // ✨ NEW: If National View is ON, start at Zoom 4. Otherwise, use Zoom 7.
        const startZoom = window.startNationalView ? 4 : 7;
        map.setView([defaultLat, defaultLng], startZoom, { animate: false });
        return false; // Use default position
    }
}

// Initial view set to US center as a placeholder during load
setInitialMapView(39.8283, -98.5795);

// 🎯 CUSTOM DOUBLE CLICK ZOOM ENGINE
// Replaces Leaflet's native handler to guarantee execution without conflict
map.on('dblclick', (e) => {
    if (window.disableDoubleTap) return; // Respect the settings toggle

    // Zoom in smoothly around the cursor/tap point
    map.setZoomAround(e.containerPoint, map.getZoom() + 1);
});

// 🚀 MAP POSITION SAVER
map.on('moveend', () => {
    clearTimeout(mapSaveTimeout);
    mapSaveTimeout = setTimeout(() => {
        const center = map.getCenter();
        localStorage.setItem('mapLat', center.lat.toFixed(6));
        localStorage.setItem('mapLng', center.lng.toFixed(6));
        localStorage.setItem('mapZoom', map.getZoom());
    }, 500);

    // 🚀 VIEWPORT CULLING DYNAMIC RENDER (Throttled to prevent flash)
    if (window.viewportCulling) {
        if (!window._cullingTimeout) {
            window._cullingTimeout = setTimeout(() => {
                window._cullingTimeout = null;
                window.syncState();
            }, 300);
        }
    }
});

// 🧨 EXPLOSION TRIGGER: Re-evaluate pins every time the zoom changes
map.on('zoomend', () => {
    if (window.premiumClusteringEnabled) {
        window.syncState();
    }
});

// 🧊 TRACKPAD ZOOM DEBOUNCER: Native Leaflet on Mac trackpads fires 100s of continuous
// zoom events per second instead of using a single GPU animation. This prevents the jitter.
let trackpadZoomTimeout = null;
map.on('zoomstart', () => {
    if (window.stopResizing) {
        document.body.classList.add('map-is-zooming');
    }
});
map.on('zoomend', () => {
    if (window.stopResizing) {
        clearTimeout(trackpadZoomTimeout);
        trackpadZoomTimeout = setTimeout(() => {
            document.body.classList.remove('map-is-zooming');
        }, 150); // Wait 150ms after the last scroll tick
    }
});

// Helper to manually dismiss the cold-start loader exactly when we want to (e.g. after sync)
window.dismissBarkLoader = function () {
    const loader = document.getElementById('bark-loader');
    if (loader && loader.style.opacity !== '0') {
        loader.style.opacity = '0';
        setTimeout(() => loader.remove(), 600);
    }
};

L.control.zoom({
    position: 'bottomleft'
}).addTo(map);

// 🌍 MAP STYLE PERSISTENCE
const mapStyleSelect = document.getElementById('map-style-select');
const savedMapStyle = localStorage.getItem('barkMapStyle') || 'default'; // Check memory

let currentTileLayer;
const loadLayer = (style) => {
    if (currentTileLayer) map.removeLayer(currentTileLayer);
    if (style === 'terrain') {
        currentTileLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)', maxZoom: 17 }).addTo(map);
    } else if (style === 'satellite') {
        currentTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community', maxZoom: 18 }).addTo(map);
    } else if (style === 'streets') {
        currentTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012', maxZoom: 18 }).addTo(map);
    } else {
        currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 18 }).addTo(map);
    }
};

// Load saved layer on boot
loadLayer(savedMapStyle);

if (mapStyleSelect) {
    mapStyleSelect.value = savedMapStyle; // Update dropdown UI
    mapStyleSelect.addEventListener('change', (e) => {
        const style = e.target.value;
        localStorage.setItem('barkMapStyle', style); // Save choice to memory
        loadLayer(style);
    });
}

// Add Locate Control
const LocateControl = L.Control.extend({
    options: {
        position: 'bottomleft'
    },
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control custom-locate-btn');
        const button = L.DomUtil.create('a', '', container);
        button.innerHTML = '⌖';
        button.href = '#';
        button.title = 'Find My Location';
        button.setAttribute('role', 'button');

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.on(button, 'click', function (e) {
            L.DomEvent.preventDefault(e);
            map.locate({ setView: true, maxZoom: 10 });
        });

        return container;
    }
});
map.addControl(new LocateControl());

let userLocationMarker = null;

map.on('locationfound', function (e) {
    if (userLocationMarker) {
        map.removeLayer(userLocationMarker);
    }

    // 🎯 PULSING BLUE DOT UPGRADE
    const pulsingIcon = L.divIcon({
        className: 'custom-location-pulse',
        html: '<div class="pulse-location-dot" style="width: 16px; height: 16px;"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });

    userLocationMarker = L.marker(e.latlng, { icon: pulsingIcon }).addTo(map);
    userLocationMarker.bindPopup('You are here!', { autoPan: false }).openPopup();

    // 🎯 RE-CALCULATE AND RE-SORT ACHIEVEMENTS NOW THAT WE HAVE ACTUAL LOCATION
    window.syncState();
});

map.on('locationerror', function (e) {
    console.warn("Could not access your location. Please check your browser permissions.");
});

// Prompt for location immediately on load
setTimeout(() => {
    // ✨ NEW: Only let the GPS grab the camera if BOTH settings are OFF
    const usedSaved = window.rememberMapPosition && localStorage.getItem('mapLat');

    if (!usedSaved && !window.startNationalView) {
        // Standard behavior: zoom to user
        map.locate({ setView: true, maxZoom: 10 });
    } else {
        // Just drop the blue dot, DO NOT move the camera
        map.locate({ setView: false, watch: false });
    }
}, 500);

// Create a marker layer group for easy clearing
const markerLayer = L.layerGroup().addTo(map);

// Creates the clustering engine, but does NOT add it to the map yet.
const markerClusterGroup = L.markerClusterGroup({
    // 🎯 Use Leaflet's internal bounding-block logic when toggled on
    chunkedLoading: window.stopPinResizing,
    chunkInterval: 200, // Process in blocks of 200ms
    chunkDelay: 50,     // Yield to the CPU so the map doesn't freeze

    removeOutsideVisibleBounds: true, // Deletes off-screen pins to save RAM
    disableClusteringAtZoom: 16, // Ungroups when zoomed in close
    animate: false, // Turned off specifically to save CPU on older phones

    maxClusterRadius: function (zoom) {
        if (window.premiumClusteringEnabled) {
            // Aggressive grouping for country-level only
            return 80;
        }
        if (window.standardClusteringEnabled) {
            // Standard behavior
            if (zoom <= 5) return 40;
            if (zoom <= 8) return 60;
            return 80;
        }
        return 80;
    },

    // ✨ THE PREMIUM B.A.R.K. LOGO CLUSTER ✨
    iconCreateFunction: function (cluster) {
        const childCount = cluster.getChildCount();

        const markerHtml = `
            <div class="cluster-enamel-wrapper">
                <img src="bark-logo.jpeg" alt="B.A.R.K. Cluster" loading="lazy" />
                <div class="cluster-count-badge">${childCount}</div>
            </div>
        `;

        return L.divIcon({
            html: markerHtml,
            className: 'bark-cluster-marker',
            iconSize: [46, 46],   // Slightly larger than standard pins
            iconAnchor: [23, 23]  // Perfectly centered
        });
    }
});

// (Settings state moved to top of file)

document.addEventListener('DOMContentLoaded', () => {
    // 1. SELECT ALL ELEMENTS FIRST (Prevents ReferenceErrors)
    const settingsGearBtn = document.getElementById('settings-gear-btn');
    const settingsOverlay = document.getElementById('settings-overlay');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const allowUncheckToggle = document.getElementById('allow-uncheck-setting');
    const standardToggle = document.getElementById('standard-cluster-toggle');
    const premiumToggle = document.getElementById('premium-cluster-toggle');
    const lowGfxToggle = document.getElementById('low-gfx-toggle');
    const simplifyTrailToggle = document.getElementById('simplify-trail-toggle');
    const instantNavToggle = document.getElementById('instant-nav-toggle');
    const rememberMapToggle = document.getElementById('remember-map-toggle');
    const motionToggle = document.getElementById('reduce-motion-toggle');
    const ultraLowToggle = document.getElementById('ultra-low-toggle');
    const mapSmoothnessToggle = document.getElementById('map-smoothness-toggle');

    // 2. SYNC TOGGLE VISUALS TO SAVED STATE
    if (settingsGearBtn && settingsOverlay) {
        if (allowUncheckToggle) allowUncheckToggle.checked = window.allowUncheck;
        if (lowGfxToggle) lowGfxToggle.checked = window.lowGfxEnabled;
        if (standardToggle) standardToggle.checked = window.standardClusteringEnabled;
        if (premiumToggle) premiumToggle.checked = window.premiumClusteringEnabled;
        if (simplifyTrailToggle) simplifyTrailToggle.checked = window.simplifyTrails;
        if (instantNavToggle) instantNavToggle.checked = window.instantNav;
        if (rememberMapToggle) rememberMapToggle.checked = window.rememberMapPosition;
        if (motionToggle) motionToggle.checked = window.reducePinMotion;
        if (ultraLowToggle) ultraLowToggle.checked = window.ultraLowEnabled;

        // Set version dynamically
        const versionLabel = document.getElementById('settings-app-version');
        if (versionLabel) versionLabel.textContent = APP_VERSION;

        settingsGearBtn.addEventListener('click', () => {
            populateTrailWarpGrid(); // Lazy-load: TOP_10_TRAILS is defined later in the file
            settingsOverlay.classList.add('active');
            document.body.style.overflow = 'hidden'; // 🔒 Lock background scroll
        });

        const closeSettings = () => {
            settingsOverlay.classList.remove('active');
            document.body.style.overflow = ''; // 🔓 Restore background scroll
        };

        closeSettingsBtn.addEventListener('click', closeSettings);

        // Close on backdrop click
        settingsOverlay.addEventListener('click', (e) => {
            if (e.target === settingsOverlay) closeSettings();
        });

        if (allowUncheckToggle) {
            allowUncheckToggle.addEventListener('change', (e) => {
                allowUncheck = e.target.checked;
                localStorage.setItem('barkAllowUncheck', window.allowUncheck ? 'true' : 'false');
            });
        }

        if (standardToggle) {
            standardToggle.checked = window.standardClusteringEnabled;
            standardToggle.addEventListener('change', (e) => {
                window.standardClusteringEnabled = e.target.checked;
                localStorage.setItem('barkStandardClustering', window.standardClusteringEnabled);

                // If turning on standard, turn off premium to avoid math conflicts
                if (window.standardClusteringEnabled && premiumToggle) {
                    window.premiumClusteringEnabled = false;
                    premiumToggle.checked = false;
                    localStorage.setItem('barkPremiumClustering', false);
                }

                window.clusteringEnabled = window.standardClusteringEnabled || window.premiumClusteringEnabled;
                window.syncState();
            });
        }

        if (premiumToggle) {
            premiumToggle.checked = window.premiumClusteringEnabled;
            premiumToggle.addEventListener('change', (e) => {
                window.premiumClusteringEnabled = e.target.checked;
                localStorage.setItem('barkPremiumClustering', window.premiumClusteringEnabled);

                // If turning on premium, turn off standard
                if (window.premiumClusteringEnabled && standardToggle) {
                    window.standardClusteringEnabled = false;
                    standardToggle.checked = false;
                    localStorage.setItem('barkStandardClustering', false);
                }

                window.clusteringEnabled = window.standardClusteringEnabled || window.premiumClusteringEnabled;
                window.syncState();
            });
        }

        if (lowGfxToggle) {
            lowGfxToggle.addEventListener('change', (e) => {
                window.lowGfxEnabled = e.target.checked;
                localStorage.setItem('barkLowGfxEnabled', window.lowGfxEnabled ? 'true' : 'false');

                if (window.lowGfxEnabled) {
                    document.body.classList.add('low-graphics');
                } else {
                    document.body.classList.remove('low-graphics');
                }

                // Re-sync markers to apply/remove the new logic instantly
                window.syncState();
            });
        }

        if (motionToggle) {
            motionToggle.checked = window.reducePinMotion;
            motionToggle.addEventListener('change', (e) => {
                const newVal = e.target.checked;

                if (newVal !== window.reducePinMotion) {
                    const msg = newVal
                        ? "Enabling Reduced Pin Resizing requires a page reload to reconfigure the map engine. Proceed?"
                        : "Restoring full pin animations requires a page reload. Proceed?";

                    if (window.confirm(msg)) {
                        localStorage.setItem('barkReducePinMotion', newVal ? 'true' : 'false');
                        location.reload();
                    } else {
                        // User cancelled — snap toggle back
                        e.target.checked = window.reducePinMotion;
                    }
                }
            });
        }

        // 🚀 B.A.R.K. PERFORMANCE MODIFIERS (V24 — 4 Toggles)
        const setupPerfToggle = (id, windowVar, storageKey, className) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.checked = window[windowVar];
            el.addEventListener('change', (e) => {
                window[windowVar] = e.target.checked;
                localStorage.setItem(storageKey, window[windowVar] ? 'true' : 'false');
                document.body.classList.toggle(className, window[windowVar]);
                window.syncState(); // Force re-render for ALL toggles
            });
        };

        setupPerfToggle('toggle-remove-shadows', 'removeShadows', 'barkRemoveShadows', 'remove-shadows');
        setupPerfToggle('toggle-stop-resizing', 'stopResizing', 'barkStopResizing', 'stop-resizing');
        setupPerfToggle('toggle-viewport-culling', 'viewportCulling', 'barkViewportCulling', 'viewport-culling');

        const disableDoubleTapEl = document.getElementById('toggle-disable-double-tap');
        if (disableDoubleTapEl) {
            disableDoubleTapEl.checked = window.disableDoubleTap;
            disableDoubleTapEl.addEventListener('change', (e) => {
                window.disableDoubleTap = e.target.checked;
                localStorage.setItem('barkDisableDoubleTap', window.disableDoubleTap ? 'true' : 'false');
            });
        }

        const disablePinchEl = document.getElementById('toggle-disable-pinch');
        if (disablePinchEl) {
            disablePinchEl.checked = window.disablePinchZoom;
            disablePinchEl.addEventListener('change', (e) => {
                window.disablePinchZoom = e.target.checked;
                localStorage.setItem('barkDisablePinchZoom', window.disablePinchZoom ? 'true' : 'false');
                if (window.disablePinchZoom) {
                    map.touchZoom.disable();
                } else {
                    map.touchZoom.enable();
                }
            });
        }

        const disable1FingerEl = document.getElementById('toggle-disable-1finger');
        if (disable1FingerEl) {
            disable1FingerEl.checked = window.disable1fingerZoom;
            disable1FingerEl.addEventListener('change', (e) => {
                window.disable1fingerZoom = e.target.checked;
                localStorage.setItem('barkDisable1Finger', window.disable1fingerZoom ? 'true' : 'false');
            });
        }

        const lockMapPanningEl = document.getElementById('toggle-lock-map-panning');
        if (lockMapPanningEl) {
            lockMapPanningEl.checked = window.lockMapPanning;
            lockMapPanningEl.addEventListener('change', (e) => {
                window.lockMapPanning = e.target.checked;
                localStorage.setItem('barkLockMapPanning', window.lockMapPanning ? 'true' : 'false');
                if (window.lockMapPanning) {
                    map.dragging.disable();
                } else {
                    map.dragging.enable();
                }
            });
        }

        // Ultra Low Toggle — uses the outer declaration from line 500
        if (ultraLowToggle) {
            ultraLowToggle.addEventListener('change', (e) => {
                const isEnabled = e.target.checked;

                // 1. Confirm with user for safety since it results in a reload
                const msg = isEnabled ?
                    "⚠️ ENABLE ULTRA-LOW GRAPHICS?\n\nThis will disable all animations, effects, and live updates.\nPage will reload to optimize the map engine." :
                    "Switching to High Graphics requires a page reload to restore all visual effects. Proceed?";

                if (!window.confirm(msg)) {
                    e.target.checked = !isEnabled;
                    return;
                }

                // 2. Instantly update the window variable & synchronous save to local storage
                window.ultraLowEnabled = isEnabled;
                localStorage.setItem('barkUltraLowEnabled', isEnabled ? 'true' : 'false');

                // 3. Add a visual warning
                const label = e.target.closest('.setting-row') || e.target.parentElement;
                if (label) {
                    label.style.opacity = '0.5';
                    label.innerHTML += "<br><span style='color:red; font-weight:bold; font-size:12px;'>RELOADING ENGINE...</span>";
                }

                // 4. Set a skip flag so Firebase doesn't wipe this change out upon reload
                sessionStorage.setItem('skipCloudHydration', 'true');

                // 5. Give the browser 150ms to finish writing to memory BEFORE killing the page thread
                setTimeout(() => {
                    window.location.reload(true); // forces hard refresh from server
                }, 150);
        // Ultra Low Toggle — uses the one already declared at line 413
        if (ultraLowToggle) {
            ultraLowToggle.addEventListener('change', (e) => {
                const isTurningOn = e.target.checked;

                if (isTurningOn) {
                    // === ENTERING ULTRA LOW ===
                    const confirmOn = window.confirm(
                        "⚠️ ENABLE ULTRA-LOW GRAPHICS?\n\nThis will disable all animations, effects, and live updates.\nPage will reload to optimize the map engine."
                    );

                    if (confirmOn) {
                        // Write ALL state to localStorage FIRST, then reload
                        localStorage.setItem('barkUltraLowEnabled', 'true');
                        localStorage.setItem('barkLowGfxEnabled', 'true');
                        localStorage.setItem('barkStandardClustering', 'true');
                        localStorage.setItem('barkPremiumClustering', 'false');
                        localStorage.setItem('barkInstantNav', 'true');
                        localStorage.setItem('barkSimplifyTrails', 'true');
                        window.location.reload(); // Hard reset the Leaflet engine
                    } else {
                        // User cancelled — snap toggle back
                        e.target.checked = false;
                    }

                } else {
                    // === EXITING ULTRA LOW ===
                    const confirmOff = window.confirm(
                        "Switching to High Graphics requires a page reload to restore all visual effects. Proceed?"
                    );

                    if (confirmOff) {
                        // Write ALL state to localStorage FIRST, then reload
                        localStorage.setItem('barkUltraLowEnabled', 'false');
                        localStorage.setItem('barkLowGfxEnabled', 'false');
                        localStorage.setItem('barkStandardClustering', 'true');
                        localStorage.setItem('barkPremiumClustering', 'false');
                        localStorage.setItem('barkInstantNav', 'false');
                        localStorage.setItem('barkSimplifyTrails', 'false');
                        window.location.reload(); // Clean slate — Leaflet rebuilds smooth
                    } else {
                        // User cancelled — snap toggle back to ON
                        e.target.checked = true;
                    }
                }
            });
        }

        if (simplifyTrailToggle) {
            simplifyTrailToggle.addEventListener('change', (e) => {
                window.simplifyTrails = e.target.checked;
                localStorage.setItem('barkSimplifyTrails', window.simplifyTrails ? 'true' : 'false');
                // Trigger re-render of trails if active
                if (window.lastActiveTrailId) {
                    renderVirtualTrailOverlay(window.lastActiveTrailId, window.lastMilesCompleted || 0);
                }
                if (typeof renderCompletedTrailsOverlay === 'function') {
                    // Logic to refresh completed trails
                    const user = firebase.auth().currentUser;
                    if (user) {
                        firebase.firestore().collection('users').doc(user.uid).get().then(doc => {
                            if (doc.exists && doc.data().completedExpeditions) {
                                renderCompletedTrailsOverlay(doc.data().completedExpeditions);
                            }
                        });
                    }
                }
            });
        }

        if (instantNavToggle) {
            instantNavToggle.addEventListener('change', (e) => {
                window.instantNav = e.target.checked;
                localStorage.setItem('barkInstantNav', window.instantNav ? 'true' : 'false');
            });
        }

        const nationalViewToggle = document.getElementById('national-view-toggle');
        if (rememberMapToggle) {
            rememberMapToggle.addEventListener('change', (e) => {
                window.rememberMapPosition = e.target.checked;
                localStorage.setItem('remember-map-toggle', window.rememberMapPosition ? 'true' : 'false');

                // 🔌 Mutual Exclusivity: Turn off National View if this is on
                if (window.rememberMapPosition && nationalViewToggle) {
                    nationalViewToggle.checked = false;
                    window.startNationalView = false;
                    localStorage.setItem('barkNationalView', 'false');
                }
            });
        }

        if (nationalViewToggle) {
            nationalViewToggle.checked = window.startNationalView;
            nationalViewToggle.addEventListener('change', (e) => {
                window.startNationalView = e.target.checked;
                localStorage.setItem('barkNationalView', window.startNationalView ? 'true' : 'false');

                // 🔌 Mutual Exclusivity: Turn off Remember Position if this is on
                if (window.startNationalView && rememberMapToggle) {
                    rememberMapToggle.checked = false;
                    window.rememberMapPosition = false;
                    localStorage.setItem('remember-map-toggle', 'false');
                }
            });
        }

        const stopAutoMoveEl = document.getElementById('toggle-stop-auto-move');
        if (stopAutoMoveEl) {
            stopAutoMoveEl.checked = window.stopAutoMovements;
            stopAutoMoveEl.addEventListener('change', (e) => {
                window.stopAutoMovements = e.target.checked;
                localStorage.setItem('barkStopAutoMove', window.stopAutoMovements ? 'true' : 'false');
            });
        }

        // ☢️ TERMINATE & RELOAD ENGINE
        const terminateBtn = document.getElementById('terminate-reload-btn');
        if (terminateBtn) {
            terminateBtn.addEventListener('click', async () => {
                const proceed = window.confirm(
                    "☢️ WARNING: NUCLEAR OPTION ☢️\n\n" +
                    "This will completely wipe all local app memory, reset all map settings to default, and log you out.\n\n" +
                    "Don't worry: Your verified visits, reward points, and expedition walks are safely backed up in the cloud and will restore when you log back in.\n\n" +
                    "Are you absolutely sure you want to terminate and reload?"
                );

                if (proceed) {
                    // 1. Change button state to show it's working
                    terminateBtn.textContent = 'TERMINATING...';
                    terminateBtn.style.opacity = '0.5';
                    terminateBtn.disabled = true;

                    try {
                        // 2. Force a final sync to Firebase just to be absolutely safe (if logged in)
                        if (typeof firebase !== 'undefined' && firebase.auth().currentUser && typeof syncUserProgress === 'function') {
                            await syncUserProgress();
                        }

                        // 3. Log out of Firebase
                        if (typeof firebase !== 'undefined' && firebase.auth().currentUser) {
                            await firebase.auth().signOut();
                        }
                    } catch (e) {
                        console.error("Non-fatal error during termination sync/logout", e);
                    }

                    // 4. Nuke the Local Storage (Wipes settings, CSV cache, map position, etc)
                    localStorage.clear();

                    // 5. Force a hard, cache-bypassing reload of the web app
                    window.location.reload(true);
                }
            });
        }

        // ☁️ SAVE SETTINGS TO FIREBASE (1 Single Write)
        const saveSettingsBtn = document.getElementById('save-settings-cloud-btn');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', async () => {
                // Ensure user is logged in
                if (typeof firebase === 'undefined' || !firebase.auth().currentUser) {
                    alert("You must be logged in to save settings to the cloud.");
                    return;
                }

                // Button visual feedback
                const originalText = saveSettingsBtn.innerHTML;
                saveSettingsBtn.innerHTML = '⏳ SAVING...';
                saveSettingsBtn.disabled = true;

                // Bundle all settings into ONE payload
                const settingsPayload = {
                    allowUncheck: window.allowUncheck || false,
                    rememberMapPosition: window.rememberMapPosition || false,
                    startNationalView: window.startNationalView || false,
                    instantNav: window.instantNav || false,
                    premiumClustering: window.premiumClusteringEnabled || false,
                    standardClustering: window.standardClusteringEnabled !== false,
                    simplifyTrails: window.simplifyTrails || false,
                    stopAutoMovements: window.stopAutoMovements || false,
                    lowGfxEnabled: window.lowGfxEnabled || false,
                    removeShadows: window.removeShadows || false,
                    stopResizing: window.stopResizing || false,
                    viewportCulling: window.viewportCulling || false,
                    ultraLowEnabled: window.ultraLowEnabled || false,
                    lockMapPanning: window.lockMapPanning || false,
                    disablePinchZoom: window.disablePinchZoom || false,
                    disable1fingerZoom: window.disable1fingerZoom || false,
                    disableDoubleTap: window.disableDoubleTap || false,
                    mapStyle: localStorage.getItem('barkMapStyle') || 'default',
                    visitedFilter: localStorage.getItem('barkVisitedFilter') || 'all'
                };

                try {
                    // Fire the single write to Firestore
                    await firebase.firestore().collection('users')
                        .doc(firebase.auth().currentUser.uid)
                        .set({ settings: settingsPayload }, { merge: true });

                    saveSettingsBtn.innerHTML = '✅ SAVED TO CLOUD';
                    setTimeout(() => {
                        saveSettingsBtn.innerHTML = originalText;
                        saveSettingsBtn.disabled = false;
                    }, 2000);
                } catch (error) {
                    console.error("Error saving settings to cloud:", error);
                    saveSettingsBtn.innerHTML = '❌ ERROR SAVING';
                    saveSettingsBtn.disabled = false;
                }
            });
        }
    }
});
