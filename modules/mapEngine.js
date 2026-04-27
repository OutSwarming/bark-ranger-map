/**
 * mapEngine.js — Leaflet Map Init, Tile Layers, Controls, Zoom Handlers
 * Owns window.map, markerLayer, markerClusterGroup, and the Bubble Mode teardown/rebuild.
 * Loaded THIRD in the boot sequence.
 */
window.BARK = window.BARK || {};

// ====== BATCH CSS CLASS APPLICATION ======
/**
 * 🏭 Batch-apply body CSS classes from window state — one DOM write, no layout thrash.
 */
function applyGlobalStyles() {
    const addClasses = [];
    const removeClasses = [];

    if (window.reducePinMotion) addClasses.push('reduce-pin-motion');
    else removeClasses.push('reduce-pin-motion');

    if (window.removeShadows) addClasses.push('remove-shadows');
    else removeClasses.push('remove-shadows');

    if (window.stopResizing) addClasses.push('stop-resizing');
    else removeClasses.push('stop-resizing');

    if (window.viewportCulling) addClasses.push('viewport-culling');
    else removeClasses.push('viewport-culling');

    if (window.ultraLowEnabled) addClasses.push('ultra-low');
    else removeClasses.push('ultra-low');

    if (window.lowGfxEnabled) addClasses.push('low-graphics');
    else removeClasses.push('low-graphics');

    // Single batch DOM write
    if (addClasses.length) document.body.classList.add(...addClasses);
    if (removeClasses.length) document.body.classList.remove(...removeClasses);
}

window.BARK.applyGlobalStyles = applyGlobalStyles;

// ====== MAP INITIALIZATION ======
window.BARK.initMap = function initMap() {
if (window.map && window.BARK.markerLayer && window.BARK.markerClusterGroup) return window.map;

// Apply initial styles
applyGlobalStyles();

let mapSaveTimeout;

const mapOptions = window.ultraLowEnabled ? {
    preferCanvas: true,
    updateWhenIdle: true,
    updateWhenZooming: false,
    markerZoomAnimation: false,
    zoomAnimation: false,
    fadeAnimation: false,
    inertia: false,
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
    doubleClickZoom: false,
    touchZoom: !window.disablePinchZoom,
    dragging: !window.lockMapPanning,
    markerZoomAnimation: true
};

window.map = L.map('map', mapOptions);

// 🎯 MAP MEMORY INJECTION
function setInitialMapView(defaultLat, defaultLng) {
    const savedLat = localStorage.getItem('mapLat');
    const savedLng = localStorage.getItem('mapLng');
    const savedZoom = localStorage.getItem('mapZoom') || 7;

    if (window.rememberMapPosition && savedLat && savedLng) {
        console.log("📍 Restoring last known map position...");
        map.setView([parseFloat(savedLat), parseFloat(savedLng)], parseInt(savedZoom), { animate: false });
        return true;
    } else {
        console.log("📍 Starting at default/current location...");
        const startZoom = window.startNationalView ? 4 : 7;
        map.setView([defaultLat, defaultLng], startZoom, { animate: false });
        return false;
    }
}

// Initial view set to US center as a placeholder during load
setInitialMapView(39.8283, -98.5795);

// 🎯 CUSTOM DOUBLE CLICK ZOOM ENGINE
map.on('dblclick', (e) => {
    if (window.disableDoubleTap) return;
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

// 🧊 TRACKPAD ZOOM DEBOUNCER
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
        }, 150);
    }
});

// Helper to manually dismiss the cold-start loader
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

// ====== MAP STYLE / TILE LAYERS ======
const mapStyleSelect = document.getElementById('map-style-select');
const savedMapStyle = localStorage.getItem('barkMapStyle') || 'default';

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
    mapStyleSelect.value = savedMapStyle;
    mapStyleSelect.addEventListener('change', (e) => {
        const style = e.target.value;
        localStorage.setItem('barkMapStyle', style);
        loadLayer(style);
    });
}
window.BARK.loadLayer = loadLayer;

// ====== LOCATE CONTROL ======
const LocateControl = L.Control.extend({
    options: { position: 'bottomleft' },
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
window.BARK.getUserLocationMarker = function () { return userLocationMarker; };

map.on('locationfound', function (e) {
    if (userLocationMarker) {
        map.removeLayer(userLocationMarker);
    }

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
    const usedSaved = window.rememberMapPosition && localStorage.getItem('mapLat');
    if (!usedSaved && !window.startNationalView) {
        map.locate({ setView: true, maxZoom: 10 });
    } else {
        map.locate({ setView: false, watch: false });
    }
}, 500);

// ====== MARKER LAYERS ======
const markerLayer = L.layerGroup().addTo(map);

const markerClusterGroup = L.markerClusterGroup({
    chunkedLoading: window.stopResizing,
    chunkInterval: 200,
    chunkDelay: 50,
    removeOutsideVisibleBounds: false,
    disableClusteringAtZoom: 16,
    animate: false,
    animateAddingMarkers: false,
    maxClusterRadius: function (zoom) {
        if (window.premiumClusteringEnabled) return 80;
        if (window.standardClusteringEnabled) {
            if (zoom <= 5) return 40;
            if (zoom <= 8) return 60;
            return 80;
        }
        return 80;
    },
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
            iconSize: [46, 46],
            iconAnchor: [23, 23]
        });
    }
});

window.BARK.markerLayer = markerLayer;
window.BARK.markerClusterGroup = markerClusterGroup;

// ====== 🐛 BUBBLE MODE SAFE TEARDOWN/REBUILD ======
// Tracks which layer type markers are currently living in.
// When the layer type changes, this safely migrates all markers.
window.BARK._lastLayerType = null; // 'cluster' | 'plain' | null

window.BARK.rebuildMarkerLayer = function () {
    const allPts = window.BARK.allPoints;
    const forceNoClustering = (window.premiumClusteringEnabled && map.getZoom() >= 7) || window.stopResizing;
    const newLayerType = (window.clusteringEnabled && !forceNoClustering) ? 'cluster' : 'plain';

    // Only rebuild if the layer type actually changed
    if (window.BARK._lastLayerType === newLayerType) return;

    console.log(`🔄 Bubble Mode: Migrating markers from "${window.BARK._lastLayerType}" → "${newLayerType}"`);
    window.BARK._lastLayerType = newLayerType;

    // 1. Detach both layers from the map
    if (map.hasLayer(markerClusterGroup)) map.removeLayer(markerClusterGroup);
    if (map.hasLayer(markerLayer)) map.removeLayer(markerLayer);

    // 2. Clear all markers from both layers
    markerClusterGroup.clearLayers();
    markerLayer.clearLayers();

    // 3. Reset the _layerAdded flag on every marker so they get re-injected
    if (allPts && allPts.length > 0) {
        allPts.forEach(item => {
            if (item.marker) {
                item.marker._layerAdded = false;
            }
        });
    }

    // 4. Add the correct empty layer to the map — syncState/updateMarkers will refill it
    if (newLayerType === 'cluster') {
        markerClusterGroup.addTo(map);
    } else {
        markerLayer.addTo(map);
    }
};

// ====== ONE-FINGER ZOOM ENGINE (Google Maps Style) ======
if ('ontouchstart' in window) {
    const mapContainer = document.getElementById('map');
    let lastTap = 0;
    let isOneFingerZooming = false;
    let zoomStartY = 0;
    let initialZoom = 0;
    let holdTimer = null;
    let pendingDoubleTap = false;
    let zoomRAF = null;

    function resetZoomState() {
        clearTimeout(holdTimer);
        holdTimer = null;
        pendingDoubleTap = false;
        if (zoomRAF) { cancelAnimationFrame(zoomRAF); zoomRAF = null; }

        if (isOneFingerZooming) {
            isOneFingerZooming = false;
            const snappedZoom = Math.round(map.getZoom() * 2) / 2;
            map.setZoom(snappedZoom, { animate: false });
        }

        map.options.zoomSnap = 0.5;
        if (!window.lockMapPanning) map.dragging.enable();
    }

    mapContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;

        if (tapLength < 300 && tapLength > 0) {
            pendingDoubleTap = true;
            const startY = e.touches[0].clientY;

            if (!window.disable1fingerZoom) {
                holdTimer = setTimeout(() => {
                    if (pendingDoubleTap) {
                        isOneFingerZooming = true;
                        zoomStartY = startY;
                        initialZoom = map.getZoom();
                        map.dragging.disable();
                        map.options.zoomSnap = 0;
                    }
                }, 150);
            }
        }
        lastTap = currentTime;
    }, { passive: false });

    mapContainer.addEventListener('touchmove', (e) => {
        if (window.disable1fingerZoom) return;

        if (pendingDoubleTap && !isOneFingerZooming && e.touches.length === 1) {
            clearTimeout(holdTimer);
            isOneFingerZooming = true;
            zoomStartY = e.touches[0].clientY;
            initialZoom = map.getZoom();
            map.dragging.disable();
            map.options.zoomSnap = 0;
        }

        if (!isOneFingerZooming || e.touches.length !== 1) return;

        e.preventDefault();
        const currentY = e.touches[0].clientY;
        const deltaY = currentY - zoomStartY;
        const targetZoom = Math.min(19, Math.max(2, initialZoom + deltaY / 150));

        if (!zoomRAF) {
            if (window.stopResizing) {
                zoomRAF = setTimeout(() => {
                    map.setZoom(targetZoom, { animate: false });
                    zoomRAF = null;
                }, 250);
            } else {
                zoomRAF = requestAnimationFrame(() => {
                    map.setZoom(targetZoom, { animate: false });
                    zoomRAF = null;
                });
            }
        }
    }, { passive: false });

    mapContainer.addEventListener('touchend', (e) => {
        if (pendingDoubleTap && !isOneFingerZooming) {
            if (!window.disableDoubleTap) {
                const touch = e.changedTouches ? e.changedTouches[0] : null;
                if (touch) {
                    const rect = mapContainer.getBoundingClientRect();
                    const x = touch.clientX - rect.left;
                    const y = touch.clientY - rect.top;
                    map.setZoomAround(L.point(x, y), map.getZoom() + 1);
                } else {
                    map.setZoomAround(map.getCenter(), map.getZoom() + 1);
                }
            }
        }
        resetZoomState();
    });
}

return window.map;
};
