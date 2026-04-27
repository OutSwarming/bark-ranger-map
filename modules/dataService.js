/**
 * dataService.js — CSV Fetching, Parsing, Data Polling
 * Firebase/Auth responsibilities live in /services as of Phase 3.
 */
window.BARK = window.BARK || {};
window.BARK.services = window.BARK.services || {};

const dataFirebaseService = window.BARK.services.firebase;
if (!dataFirebaseService) {
    throw new Error('firebaseService.js must load before dataService.js');
}
const dataSyncUserProgress = dataFirebaseService.syncUserProgress;

// ====== CSV PARSING ENGINE ======
const markerCache = new Map();
let isRendering = false;
let pendingCSV = null;

function bindMarkerEvents(marker) {
    if (marker._barkEventsBound) return;
    marker._barkEventsBound = true;

    // 🎯 THE DOM RECYCLING FIX
    marker.on('remove', function () {
        if (this._icon) {
            this._icon.classList.remove('active-pin');
            this._icon.classList.remove('visited-pin');
            this._icon.classList.remove('marker-filter-hidden');
        }
    });

    marker.on('add', function () {
        if (this._icon) {
            if (window.BARK.userVisitedPlaces.has(this._parkData.id)) this._icon.classList.add('visited-pin');
            if (window.BARK.activePinMarker === this) this._icon.classList.add('active-pin');
            this._icon.classList.toggle('marker-filter-hidden', this._barkIsVisible === false);
        }
    });

    marker.on('click', () => {
        window.BARK.renderMarkerClickPanel({
            marker,
            userVisitedPlaces: window.BARK.userVisitedPlaces,
            syncUserProgress: dataSyncUserProgress,
            slidePanel: document.getElementById('slide-panel'),
            titleEl: document.getElementById('panel-title'),
            infoSection: document.getElementById('panel-info-section'),
            infoEl: document.getElementById('panel-info'),
            websitesContainer: document.getElementById('websites-container'),
            picsEl: document.getElementById('panel-pics'),
            videoEl: document.getElementById('panel-video')
        });
    });
}

function processParsedResults(results) {
    const userVisitedPlaces = window.BARK.userVisitedPlaces;
    const markerLayer = window.BARK.markerLayer;
    const markerClusterGroup = window.BARK.markerClusterGroup;
    let activePinMarker = window.BARK.activePinMarker;
    const slidePanel = document.getElementById('slide-panel');

    // Remember currently active pin location
    let activeLat = null, activeLng = null;
    if (activePinMarker && activePinMarker._parkData) {
        activeLat = activePinMarker._parkData.lat;
        activeLng = activePinMarker._parkData.lng;
    }
    if (activePinMarker && activePinMarker._icon) {
        activePinMarker._icon.classList.remove('active-pin');
    }
    window.BARK.activePinMarker = null;

    window.BARK.allPoints = [];
    const newAllPoints = window.BARK.allPoints;
    const incomingParkIds = new Set();

    results.data.forEach(rawItem => {
        const item = {};
        if (rawItem && typeof rawItem === 'object') {
            Object.keys(rawItem).forEach(key => {
                let val = rawItem[key];
                if (typeof val === 'string') val = val.trim();
                item[key] = val;
            });
        }

        const name = item['Location'];
        const state = item['State'];
        const cost = item['Swag Cost'];
        const category = item['Type'];
        const info = item[' Useful/Important/Other Info'];
        const website = item['Website'];
        const pics = item['Swag Pics - If available, and may not be current.'];
        const video = item['Swearing-In Video. Not all sites do this, and ones that do only do it as time permits.'];
        let lat = item['lat'];
        let lng = item['lng'];

        if (name && name.includes('War in the Pacific')) {
            lat = 13.402746;
            lng = 144.6632005;
        }

        if (!lat || !lng) return;

        const swagType = window.BARK.getSwagType(info);
        const parkCategory = window.BARK.getParkCategory(category);

        const id = window.BARK.generatePinId(lat, lng);
        const parkData = { id, name, state, cost, swagType, info, website, pics, video, lat, lng, parkCategory };

        // v25: Pre-Normalized Name
        parkData._cachedNormalizedName = window.BARK.normalizeText(name);

        incomingParkIds.add(id);

        let marker = markerCache.get(id);
        if (!marker) {
            const isVisited = userVisitedPlaces.has(id);
            marker = MapMarkerConfig.createCustomMarker(parkData, isVisited);
            bindMarkerEvents(marker);
            markerCache.set(id, marker);

            marker._layerAdded = false;
            marker._barkLayerType = null;
        } else {
            marker._parkData = parkData;
        }

        parkData.marker = marker;
        parkData.category = parkCategory;
        window.parkLookup.set(id, parkData);
        newAllPoints.push(parkData);
    });

    markerCache.forEach((marker, id) => {
        if (incomingParkIds.has(id)) return;
        markerLayer.removeLayer(marker);
        if (markerClusterGroup) markerClusterGroup.removeLayer(marker);
        marker._layerAdded = false;
        marker._barkLayerType = null;
        markerCache.delete(id);
        window.parkLookup.delete(id);
        if (window.BARK.activePinMarker === marker) {
            window.BARK.activePinMarker = null;
            if (slidePanel) slidePanel.classList.remove('open');
        }
    });

    window.parkLookup.forEach((_, id) => {
        if (!incomingParkIds.has(id)) window.parkLookup.delete(id);
    });

    // Hydrate canonical counts for gamification
    if (window.gamificationEngine && newAllPoints.length > 0) {
        window.gamificationEngine.updateCanonicalCountsFromPoints(newAllPoints);
    }

    window.BARK._markerDataRevision = (window.BARK._markerDataRevision || 0) + 1;

    window.syncState();

    // Restore the previously active pin
    if (activeLat !== null && activeLng !== null) {
        const match = window.parkLookup.get(window.BARK.generatePinId(activeLat, activeLng));
        if (match) {
            window.BARK.activePinMarker = match.marker;
            if (window.BARK.activePinMarker._icon) {
                window.BARK.activePinMarker._icon.classList.add('active-pin');
            }
        } else {
            if (slidePanel) slidePanel.classList.remove('open');
        }
    }
}

function parseCSVString(csvString) {
    if (isRendering) {
        pendingCSV = csvString;
        return;
    }
    isRendering = true;
    Papa.parse(csvString, {
        header: true,
        dynamicTyping: true,
        complete: function (results) {
            processParsedResults(results);
            isRendering = false;
            if (pendingCSV) {
                const next = pendingCSV;
                pendingCSV = null;
                parseCSVString(next);
            }
        },
        error: function (err) {
            console.error('Error parsing CSV data:', err);
            isRendering = false;
        }
    });
}

window.BARK.parseCSVString = parseCSVString;

// ====== DATA POLLING ======
function quickHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + ch;
        hash |= 0;
    }
    return hash;
}

let lastDataHash = null;
let pollInFlight = false;
let seenHashes = new Map();

function pollForUpdates() {
    if (!navigator.onLine || pollInFlight) return Promise.resolve();

    try { window.BARK.incrementRequestCount(); }
    catch (e) { return Promise.reject(e); }

    pollInFlight = true;

    const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRMM2ZRU5lmT-ncrsil4W3qhrbo8NBxnQ-xC877TNkhLYOpTlnCocYA9gNg-dPRyaQr_8e0CWZ0WB2F/pub?output=csv';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    fetch(csvUrl + '&t=' + Date.now() + '&r=' + Math.random(), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' },
        signal: controller.signal
    })
        .then(res => {
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error('Network response was not ok');
            return res.text().then(text => ({ newCsv: text, url: res.url }));
        })
        .then(({ newCsv, url }) => {
            if (!newCsv || newCsv.trim().length < 10) return;
            const newHash = quickHash(newCsv);

            if (!seenHashes.has(newHash)) {
                let revisionTime = Date.now();
                const match = /\/([0-9]{13})\//.exec(url);
                if (match) revisionTime = parseInt(match[1], 10);
                seenHashes.set(newHash, revisionTime);
            }

            if (newHash !== lastDataHash) {
                const newHashTime = seenHashes.get(newHash);
                const currentHashTime = lastDataHash && seenHashes.has(lastDataHash) ? seenHashes.get(lastDataHash) : 0;

                if (lastDataHash !== null && newHashTime < currentHashTime) return;

                lastDataHash = newHash;
                localStorage.setItem('barkCSV', newCsv);
                localStorage.setItem('barkCSV_time', newHashTime.toString());
                parseCSVString(newCsv);
            }
        })
        .catch(err => {
            if (err.name === 'AbortError') {
                console.warn('Poll request timed out after 6s. Retry next cycle.');
            } else {
                console.error('Poll Error:', err);
            }
        })
        .finally(() => { pollInFlight = false; });
}

let dataPollErrorCount = 0;

function getPollInterval() {
    if (document.hidden) return 60000;
    return dataPollErrorCount > 5 ? 60000 : 10000;
}

async function safeDataPoll() {
    if (window.ultraLowEnabled) {
        console.log("Ultra Low Mode: Background polling disabled.");
        return;
    }

    try {
        await pollForUpdates();
        dataPollErrorCount = 0;
    } catch (err) {
        if (err.message && err.message.includes("Safety Shutdown")) {
            console.error("KILL SWITCH: Terminating Data Poll.");
            return;
        }
        dataPollErrorCount++;
        console.error("Data poll failed, backing off...");
    }
    setTimeout(safeDataPoll, getPollInterval());
}

function loadData() {
    const cachedCsv = localStorage.getItem('barkCSV');
    const cachedTime = localStorage.getItem('barkCSV_time');

    if (cachedCsv) {
        lastDataHash = quickHash(cachedCsv);
        if (cachedTime) {
            seenHashes.set(lastDataHash, parseInt(cachedTime, 10));
        } else {
            seenHashes.set(lastDataHash, Date.now());
        }
        parseCSVString(cachedCsv);
    }

    if (!navigator.onLine) {
        const isPremium = localStorage.getItem('premiumLoggedIn') === 'true';
        if (!isPremium && !cachedCsv) {
            alert('Network disconnected. Log in via the Profile tab to enable Premium Offline Mode.');
            window.BARK.markerLayer.clearLayers();
        }
        return;
    }

    pollForUpdates();
}

window.BARK.loadData = loadData;
window.BARK.safeDataPoll = safeDataPoll;

// ====== VERSION CHECK ======
let pollErrorCount = 0;

async function safePoll() {
    if (document.hidden) {
        setTimeout(safePoll, 10000);
        return;
    }

    try {
        await checkForUpdates();
        pollErrorCount = 0;
    } catch (err) {
        if (err.message && err.message.includes("Safety Shutdown")) {
            console.error("KILL SWITCH: Terminating Version Poll.");
            return;
        }
        pollErrorCount++;
        console.error("Update check failed, backing off...", err);
    }

    const nextInterval = pollErrorCount > 5 ? 60000 : 30000;
    setTimeout(safePoll, nextInterval);
}

async function checkForUpdates() {
    if (!navigator.onLine || window.location.protocol === 'file:') return;

    window.BARK.incrementRequestCount();

    const res = await fetch('version.json?cache_bypass=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('version.json not found');

    const data = await res.json();
    const remoteVersion = parseInt(data.version);
    const seenVersion = parseInt(localStorage.getItem('bark_seen_version') || '0');

    const versionLabel = document.getElementById('settings-app-version');
    if (versionLabel) versionLabel.textContent = remoteVersion;

    if (data.version && remoteVersion !== seenVersion) {
        const toast = document.getElementById('update-toast');
        if (toast) toast.classList.add('show');

        localStorage.setItem('bark_seen_version', remoteVersion);
        window.BARK.setAppVersion(remoteVersion);
    }
}

window.BARK.safePoll = safePoll;
