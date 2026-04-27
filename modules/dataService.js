/**
 * dataService.js — CSV Fetching, Firebase Auth/Firestore, Data Polling, User Data Sync
 * Loaded SIXTH in the boot sequence.
 */
window.BARK = window.BARK || {};

// ====== DAILY STREAK ======
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

    window.BARK.incrementRequestCount();
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

// ====== FIREBASE SYNC ======
async function syncUserProgress() {
    if (!firebase.auth().currentUser) return;
    const uid = firebase.auth().currentUser.uid;
    const db = firebase.firestore();
    window.BARK.incrementRequestCount();

    const visitedArray = Array.from(window.BARK.userVisitedPlaces.values());
    await db.collection('users').doc(uid).set({
        visitedPlaces: visitedArray
    }, { merge: true });

    window.syncState();
}

async function updateVisitDate(parkId, newTs) {
    if (window.BARK.userVisitedPlaces.has(parkId)) {
        const place = window.BARK.userVisitedPlaces.get(parkId);
        place.ts = newTs;
        await syncUserProgress();
        window.BARK.renderManagePortal();
    }
}

async function removeVisitedPlace(place) {
    if (window.confirm(`Remove ${place.name}?`)) {
        window.BARK.userVisitedPlaces.delete(place.id);
        await syncUserProgress();
        window.syncState();
        window.BARK.renderManagePortal();
    }
}

window.BARK.syncUserProgress = syncUserProgress;
window.BARK.updateVisitDate = updateVisitDate;
window.BARK.removeVisitedPlace = removeVisitedPlace;

// ====== CSV PARSING ENGINE ======
let isRendering = false;
let pendingCSV = null;

function processParsedResults(results) {
    const allPoints = window.BARK.allPoints;
    const userVisitedPlaces = window.BARK.userVisitedPlaces;
    const markerLayer = window.BARK.markerLayer;
    let activePinMarker = window.BARK.activePinMarker;
    const slidePanel = document.getElementById('slide-panel');
    const titleEl = document.getElementById('panel-title');
    const infoSection = document.getElementById('panel-info-section');
    const infoEl = document.getElementById('panel-info');
    const websitesContainer = document.getElementById('websites-container');
    const picsEl = document.getElementById('panel-pics');
    const videoEl = document.getElementById('panel-video');

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

    // Phase 2 invariance: preserve the existing marker destroy/rebuild path.
    // Future optimization can replace this with a stable marker cache.
    markerLayer.clearLayers();
    window.BARK.allPoints = [];
    const newAllPoints = window.BARK.allPoints;

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

        const isVisited = userVisitedPlaces.has(id);
        const marker = MapMarkerConfig.createCustomMarker(parkData, isVisited);

        parkData.marker = marker;
        parkData.category = parkCategory;
        window.parkLookup.set(id, parkData);
        newAllPoints.push(parkData);

        // 🎯 THE DOM RECYCLING FIX
        marker.on('remove', function () {
            if (this._icon) {
                this._icon.classList.remove('active-pin');
                this._icon.classList.remove('visited-pin');
            }
        });

        marker.on('add', function () {
            if (this._icon) {
                if (window.BARK.userVisitedPlaces.has(this._parkData.id)) this._icon.classList.add('visited-pin');
                if (window.BARK.activePinMarker === this) this._icon.classList.add('active-pin');
            }
        });

        marker.on('click', () => {
            // Pass the same live closure references the inline handler previously captured.
            window.BARK.renderMarkerClickPanel({
                marker,
                userVisitedPlaces,
                syncUserProgress,
                slidePanel,
                titleEl,
                infoSection,
                infoEl,
                websitesContainer,
                picsEl,
                videoEl
            });
        });
    });

    // Hydrate canonical counts for gamification
    if (window.gamificationEngine && newAllPoints.length > 0) {
        window.gamificationEngine.updateCanonicalCountsFromPoints(newAllPoints);
    }

    // Reset the bubble mode layer type tracking so markers get assigned correctly
    window.BARK._lastLayerType = null;

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

// ====== FIREBASE AUTH & FIRESTORE INIT ======
let visitedSnapshotUnsubscribe = null;
window._lastSavedRouteDoc = null;

async function loadSavedRoutes(uid, isLoadMore = false) {
    const savedList = document.getElementById('saved-routes-list');
    const plannerList = document.getElementById('planner-saved-routes-list');
    const savedCount = document.getElementById('saved-routes-count');

    if (!savedList && !plannerList) return;

    if (!isLoadMore) {
        window._lastSavedRouteDoc = null;
        const renderTo = (container) => {
            if (!container) return;
            container.innerHTML = '<p style="color:#aaa; text-align:center; padding:10px 0;">Loading...</p>';
        };
        renderTo(savedList);
        renderTo(plannerList);
    } else {
        document.querySelectorAll('.load-more-routes-btn').forEach(btn => btn.remove());
    }

    try {
        const fetchLimit = isLoadMore ? 5 : 3;
        window.BARK.incrementRequestCount();

        let query = firebase.firestore()
            .collection('users').doc(uid)
            .collection('savedRoutes')
            .orderBy('createdAt', 'desc');

        if (isLoadMore && window._lastSavedRouteDoc) {
            query = query.startAfter(window._lastSavedRouteDoc);
        }

        const snapshot = await query.limit(fetchLimit).get();

        if (!isLoadMore && savedCount) {
            savedCount.textContent = snapshot.size === fetchLimit ? `${fetchLimit}+` : snapshot.size;
        } else if (isLoadMore && savedCount && snapshot.size > 0) {
            const currentObj = parseInt(savedCount.textContent) || 0;
            savedCount.textContent = snapshot.size === fetchLimit ? `${currentObj + snapshot.size}+` : (currentObj + snapshot.size);
        }

        if (!snapshot.empty) {
            window._lastSavedRouteDoc = snapshot.docs[snapshot.docs.length - 1];
        }

        const populateList = (list) => {
            if (!list) return;

            if (snapshot.empty && !isLoadMore) {
                list.innerHTML = '<p style="color:#aaa; text-align:center; padding:10px 0;">No saved routes yet. Generate a route to save it here!</p>';
                return;
            }

            if (!isLoadMore) list.innerHTML = '';

            snapshot.forEach(doc => {
                const data = doc.data();
                const date = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString() : 'Unknown date';
                const dayCount = data.tripDays ? data.tripDays.length : 0;
                const stopCount = data.tripDays ? data.tripDays.reduce((s, d) => s + (d.stops ? d.stops.length : 0), 0) : 0;
                const colorDots = (data.tripDays || []).map(d =>
                    `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${d.color || '#999'}; margin-right:2px;"></span>`
                ).join('');
                const tripName = data.tripName || "Untitled Route";

                const card = document.createElement('div');
                card.style.cssText = 'background:#f9f9f9; border-radius:10px; padding:10px 12px; margin-bottom:8px; border:1px solid rgba(0,0,0,0.06);';
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:6px;">
                        <div>
                            <div style="font-weight:800; font-size:14px; color:#1a1a1a; margin-bottom:2px;">${tripName}</div>
                            <div style="font-weight:600; font-size:12px; color:#555; margin-bottom:4px;">${colorDots} ${dayCount} day${dayCount !== 1 ? 's' : ''} · ${stopCount} stop${stopCount !== 1 ? 's' : ''}</div>
                            <div style="font-size:11px; color:#888;">${date}</div>
                        </div>
                        <div style="display:flex; gap:6px; align-items:center; flex-shrink:0;">
                            <button class="load-route-btn" data-id="${doc.id}" style="background:#22c55e; color:white; border:none; border-radius:8px; padding:5px 10px; font-size:12px; cursor:pointer; font-weight:600;">Load</button>
                            <button class="delete-route-btn" data-id="${doc.id}" style="background:none; border:none; color:#dc2626; font-size:14px; cursor:pointer; font-weight:bold;" title="Delete">×</button>
                        </div>
                    </div>
                `;
                list.appendChild(card);
            });

            list.querySelectorAll('.load-route-btn').forEach(btn => {
                btn.onclick = async () => {
                    const docId = btn.getAttribute('data-id');
                    window.BARK.incrementRequestCount();
                    const docSnap = await firebase.firestore()
                        .collection('users').doc(uid)
                        .collection('savedRoutes').doc(docId).get();
                    if (!docSnap.exists) return;
                    const data = docSnap.data();
                    window.BARK.tripDays = data.tripDays.map(d => ({ color: d.color, stops: d.stops, notes: d.notes || "" }));
                    window.BARK.activeDayIdx = 0;

                    const tripNameInput = document.getElementById('tripNameInput');
                    if (tripNameInput) tripNameInput.value = data.tripName || "";

                    if (typeof window.BARK.updateTripUI === 'function') window.BARK.updateTripUI();

                    const plannerContainer = document.getElementById('planner-saved-routes-container');
                    if (plannerContainer) plannerContainer.style.display = 'none';

                    document.querySelector('[data-target="map-view"]')?.click();
                    if (typeof window.BARK.showTripToast === 'function') window.BARK.showTripToast(`Route Loaded: ${data.tripName || "Untitled"}`);
                };
            });

            list.querySelectorAll('.delete-route-btn').forEach(btn => {
                btn.onclick = async () => {
                    if (!confirm('Delete this saved route?')) return;
                    window.BARK.incrementRequestCount();
                    await firebase.firestore()
                        .collection('users').doc(uid)
                        .collection('savedRoutes').doc(btn.getAttribute('data-id')).delete();
                    loadSavedRoutes(uid);
                };
            });

            if (snapshot.size === fetchLimit) {
                const loadMoreBtn = document.createElement('button');
                loadMoreBtn.className = 'load-more-routes-btn';
                loadMoreBtn.textContent = 'Load More (+5)';
                loadMoreBtn.style.cssText = 'width: 100%; background: rgba(0,0,0,0.05); border: 1px dashed rgba(0,0,0,0.2); border-radius: 8px; padding: 10px; font-size: 13px; cursor: pointer; color: #555; font-weight: 700; margin-top: 5px;';
                loadMoreBtn.onclick = () => loadSavedRoutes(uid, true);
                list.appendChild(loadMoreBtn);
            }
        };

        populateList(savedList);
        populateList(plannerList);
    } catch (error) {
        console.error("Error loading routes:", error);
    }
}

window.BARK.loadSavedRoutes = loadSavedRoutes;

window.togglePlannerRoutes = function () {
    const container = document.getElementById('planner-saved-routes-container');
    if (!container) return;

    if (container.style.display === 'none') {
        container.style.display = 'block';
        const user = firebase.auth().currentUser;
        if (user) {
            loadSavedRoutes(user.uid);
        } else {
            const list = document.getElementById('planner-saved-routes-list');
            if (list) list.innerHTML = '<p style="color:#aaa; text-align:center; padding:10px 0;">Please log in to see saved routes.</p>';
        }
    } else {
        container.style.display = 'none';
    }
};

// ====== INIT FIREBASE ======
function initFirebase() {
    if (typeof firebase === 'undefined') return;

    firebase.initializeApp(window.BARK.firebaseConfig);

    firebase.auth().onAuthStateChanged((user) => {
        window._lastSyncedScore = window._lastSyncedScore || 0;
        window.isAdmin = false;
        window._serverPayloadSettled = false;
        window._firstServerPayloadReceived = false;
        window._lastKnownRank = null;
        window.currentWalkPoints = window.currentWalkPoints || 0;

        const loginContainer = document.getElementById('login-container');
        const offlineStatusContainer = document.getElementById('offline-status-container');
        const logoutBtn = document.getElementById('logout-btn');
        const profileName = document.getElementById('user-profile-name');

        // --- God Mode: 3s Long-Press ---
        let godModeTimer;
        const triggerGodMode = () => {
            const warpContainer = document.getElementById('dev-warp-container');
            const settingsGear = document.getElementById('settings-gear-btn');
            if (warpContainer && settingsGear) {
                warpContainer.style.display = 'block';
                settingsGear.click();
                console.log("🛠️ God Mode Unlocked: Trail Warp Grid Enabled");
            }
        };

        ['touchstart', 'mousedown'].forEach(evt => {
            if (profileName) profileName.addEventListener(evt, () => {
                godModeTimer = setTimeout(triggerGodMode, 3000);
            });
        });
        ['touchend', 'mouseup', 'mouseleave', 'touchcancel'].forEach(evt => {
            if (profileName) profileName.addEventListener(evt, () => {
                clearTimeout(godModeTimer);
            });
        });

        if (user) {
            window._serverPayloadSettled = false;
            window._firstServerPayloadReceived = false;
            window._lastSyncedScore = -1;

            if (loginContainer) loginContainer.style.display = 'none';
            if (offlineStatusContainer) offlineStatusContainer.style.display = 'block';
            if (logoutBtn) logoutBtn.style.display = 'block';
            if (profileName) profileName.textContent = user.displayName || user.email || 'Bark Ranger';

            window.BARK.incrementRequestCount();
            visitedSnapshotUnsubscribe = firebase.firestore().collection('users').doc(user.uid)
                .onSnapshot((doc) => {
                    if (!doc.metadata.fromCache && !window._firstServerPayloadReceived) {
                        window._firstServerPayloadReceived = true;
                        setTimeout(() => { window._serverPayloadSettled = true; }, 1000);
                    }

                    if (doc.exists) {
                        const data = doc.data();

                        // ☁️ CLOUD SETTINGS HYDRATION
                        if (data.settings && !window._cloudSettingsLoaded) {
                            if (!doc.metadata.fromCache) window._cloudSettingsLoaded = true;
                            
                            if (sessionStorage.getItem('skipCloudHydration') === 'true') {
                                sessionStorage.removeItem('skipCloudHydration');
                                console.log("☁️ Cloud settings skipped: Preserving local force-reload state.");
                            } else {
                                const s = data.settings;
                                const applySetting = (key, val) => {
                                    localStorage.setItem(key, val ? 'true' : 'false');
                                    return val;
                                };
                                window._cloudSettingsLoaded = true;

                                window.allowUncheck = applySetting('barkAllowUncheck', s.allowUncheck || false);
                                window.rememberMapPosition = applySetting('remember-map-toggle', s.rememberMapPosition || false);
                                window.startNationalView = applySetting('barkNationalView', s.startNationalView || false);
                                window.instantNav = applySetting('barkInstantNav', s.instantNav || false);
                                window.premiumClusteringEnabled = applySetting('barkPremiumClustering', s.premiumClustering || false);
                                window.standardClusteringEnabled = applySetting('barkStandardClustering', s.standardClustering !== false);
                                window.simplifyTrails = applySetting('barkSimplifyTrails', s.simplifyTrails || false);
                                window.stopAutoMovements = applySetting('barkStopAutoMove', s.stopAutoMovements || false);
                                window.lowGfxEnabled = applySetting('barkLowGfxEnabled', s.lowGfxEnabled || false);
                                window.removeShadows = applySetting('barkRemoveShadows', s.removeShadows || false);
                                window.stopResizing = applySetting('barkStopResizing', s.stopResizing || false);
                                window.viewportCulling = applySetting('barkViewportCulling', s.viewportCulling || false);
                                window.ultraLowEnabled = applySetting('barkUltraLowEnabled', s.ultraLowEnabled || false);
                                window.lockMapPanning = applySetting('barkLockMapPanning', s.lockMapPanning || false);
                                if (typeof map !== 'undefined') {
                                    if (window.lockMapPanning) map.dragging.disable(); else map.dragging.enable();
                                }
                                window.disablePinchZoom = applySetting('barkDisablePinchZoom', s.disablePinchZoom || false);
                                if (typeof map !== 'undefined') {
                                    if (window.disablePinchZoom) map.touchZoom.disable(); else map.touchZoom.enable();
                                }
                                window.disable1fingerZoom = applySetting('barkDisable1Finger', s.disable1fingerZoom || false);
                                window.disableDoubleTap = applySetting('barkDisableDoubleTap', s.disableDoubleTap || false);

                                window.BARK.applyGlobalStyles();

                                const ids = {
                                    'allow-uncheck-setting': window.allowUncheck,
                                    'remember-map-toggle': window.rememberMapPosition,
                                    'national-view-toggle': window.startNationalView,
                                    'instant-nav-toggle': window.instantNav,
                                    'premium-cluster-toggle': window.premiumClusteringEnabled,
                                    'standard-cluster-toggle': window.standardClusteringEnabled,
                                    'simplify-trail-toggle': window.simplifyTrails,
                                    'toggle-stop-auto-move': window.stopAutoMovements,
                                    'low-gfx-toggle': window.lowGfxEnabled,
                                    'toggle-remove-shadows': window.removeShadows,
                                    'toggle-stop-resizing': window.stopResizing,
                                    'toggle-viewport-culling': window.viewportCulling,
                                    'ultra-low-toggle': window.ultraLowEnabled,
                                    'toggle-lock-map-panning': window.lockMapPanning,
                                    'toggle-disable-pinch': window.disablePinchZoom,
                                    'toggle-disable-1finger': window.disable1fingerZoom,
                                    'toggle-disable-double-tap': window.disableDoubleTap
                                };
                                Object.keys(ids).forEach(id => {
                                    const el = document.getElementById(id);
                                    if (el) el.checked = ids[id];
                                });

                                if (s.mapStyle) {
                                    localStorage.setItem('barkMapStyle', s.mapStyle);
                                    const styleEl = document.getElementById('map-style-select');
                                    if (styleEl) styleEl.value = s.mapStyle;
                                    if (typeof window.BARK.loadLayer === 'function') window.BARK.loadLayer(s.mapStyle);
                                }
                                if (s.visitedFilter) {
                                    localStorage.setItem('barkVisitedFilter', s.visitedFilter);
                                    const filterEl = document.getElementById('visited-filter');
                                    if (filterEl) filterEl.value = s.visitedFilter;
                                    window.BARK.visitedFilterState = s.visitedFilter;
                                }

                                window.clusteringEnabled = window.standardClusteringEnabled || window.premiumClusteringEnabled;

                                if (typeof window.syncState === 'function' && window.parkLookup && window.parkLookup.size > 0) {
                                    window.syncState();
                                }
                            }

                            if (window.startNationalView && typeof map !== 'undefined') {
                                map.setView([39.8283, -98.5795], 4, { animate: false });
                            }

                            console.log("☁️ Cloud settings loaded and injected perfectly!");
                        }

                        const placeList = data.visitedPlaces || [];

                        // Admin Dashboard
                        const adminContainer = document.getElementById('admin-controls-container');
                        window.isAdmin = data.isAdmin === true;

                        if (adminContainer) {
                            if (window.isAdmin) {
                                adminContainer.innerHTML = `
                                    <div style="display: flex; gap: 8px; flex-direction: column;">
                                        <button onclick="window.location.href='admin.html'" class="glass-btn primary-btn" style="width: 100%; background: #10b981; color: white; border: none; padding: 14px; border-radius: 12px; font-weight: 800; display: flex; justify-content: center; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"></path></svg>
                                            Enter Data Refinery
                                        </button>
                                        <button onclick="adminEditPoints()" class="glass-btn" style="width: 100%; background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; padding: 10px; border-radius: 10px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px;">
                                            ⚙️ EDIT TEST POINTS (ADMIN)
                                        </button>
                                    </div>`;
                            } else {
                                adminContainer.innerHTML = '';
                            }
                        }

                        // Streak & Walk Points
                        const streakVal = data.streakCount || 0;
                        let walkVal = data.walkPoints || 0;
                        const lifetimeVal = data.lifetime_miles || 0;

                        if (lifetimeVal > walkVal) {
                            walkVal = lifetimeVal;
                            firebase.firestore().collection('users').doc(user.uid).update({ walkPoints: lifetimeVal });
                        }

                        const streakLabel = document.getElementById('streak-count-label');
                        if (streakLabel) streakLabel.textContent = streakVal;

                        window.currentWalkPoints = Math.round(walkVal * 100) / 100;

                        // Virtual Expedition Sync
                        if (data.virtual_expedition && data.virtual_expedition.active_trail) {
                            const miles = data.virtual_expedition.miles_logged || 0;
                            const total = data.virtual_expedition.trail_total_miles || 0;

                            if (typeof window.BARK.renderVirtualTrailOverlay === 'function')
                                window.BARK.renderVirtualTrailOverlay(data.virtual_expedition.active_trail, miles);
                            if (typeof window.hydrateEducationModal === 'function')
                                window.hydrateEducationModal(data.virtual_expedition.active_trail);

                            const isComplete = total > 0 && miles >= total;

                            document.getElementById('expedition-intro-state').style.display = 'none';
                            document.getElementById('expedition-active-state').style.display = isComplete ? 'none' : 'block';
                            document.getElementById('expedition-complete-state').style.display = isComplete ? 'block' : 'none';

                            const nameEl = document.getElementById('expedition-name');
                            if (nameEl) {
                                nameEl.textContent = isComplete ? "CONQUERED" : data.virtual_expedition.trail_name;
                                nameEl.dataset.trailName = data.virtual_expedition.trail_name;
                            }

                            if (isComplete) {
                                const celebName = document.getElementById('celebration-trail-name');
                                if (celebName) celebName.textContent = data.virtual_expedition.trail_name;
                                const claimBtn = document.getElementById('claim-reward-btn');
                                const trailPts = Math.max(1, Math.round(total / 2));
                                if (claimBtn) claimBtn.textContent = `🎁 Claim +${trailPts} PTS & Reset`;
                            }

                            const lifetime = data.lifetime_miles || 0;
                            if (typeof window.BARK.renderExpeditionProgress === 'function')
                                window.BARK.renderExpeditionProgress(miles, total, lifetime);
                            if (typeof window.BARK.renderExpeditionHistory === 'function')
                                window.BARK.renderExpeditionHistory(data.virtual_expedition.history || [], data.virtual_expedition.trail_name);
                        } else {
                            document.getElementById('expedition-intro-state').style.display = 'block';
                            document.getElementById('expedition-active-state').style.display = 'none';
                            document.getElementById('expedition-complete-state').style.display = 'none';
                            document.getElementById('expedition-name').textContent = '';
                        }

                        // Completed Expeditions
                        const cExpeditions = data.completed_expeditions || [];
                        if (typeof window.BARK.renderCompletedExpeditions === 'function')
                            window.BARK.renderCompletedExpeditions(cExpeditions);
                        if (typeof window.BARK.renderCompletedTrailsOverlay === 'function')
                            window.BARK.renderCompletedTrailsOverlay(cExpeditions);

                        if (Array.isArray(placeList)) {
                            window.BARK.userVisitedPlaces = new Map();
                            placeList.forEach(obj => {
                                if (obj && obj.id) window.BARK.userVisitedPlaces.set(obj.id, obj);
                            });
                        }
                    } else {
                        window.BARK.userVisitedPlaces = new Map();
                    }
                    window.syncState();
                    if (typeof window.BARK.updateStatsUI === 'function') window.BARK.updateStatsUI();

                    if (!window._leaderboardLoadedOnce) {
                        window._leaderboardLoadedOnce = true;
                        if (typeof window.BARK.loadLeaderboard === 'function') window.BARK.loadLeaderboard();
                    }

                    window.dismissBarkLoader();

                    if (window.BARK.activePinMarker && window.BARK.activePinMarker._parkData && document.getElementById('mark-visited-btn')) {
                        const d = window.BARK.activePinMarker._parkData;
                        const btn = document.getElementById('mark-visited-btn');
                        const btnText = document.getElementById('mark-visited-text');
                        if (window.BARK.userVisitedPlaces.has(d.id)) {
                            btn.classList.add('visited');
                            btnText.textContent = 'Visited!';
                        } else {
                            btn.classList.remove('visited');
                            btnText.textContent = 'Mark as Visited';
                        }
                    }
                });

            loadSavedRoutes(user.uid);

            // UNLOCK PREMIUM FILTERS
            const premiumWrap = document.getElementById('premium-filters-wrap');
            const visitedSelect = document.getElementById('visited-filter');
            const mapStyleSelectF = document.getElementById('map-style-select');
            if (premiumWrap) {
                premiumWrap.classList.remove('premium-locked');
                premiumWrap.classList.add('premium-unlocked');
                if (visitedSelect) visitedSelect.disabled = false;
                if (mapStyleSelectF) mapStyleSelectF.disabled = false;
            }
        } else {
            if (loginContainer) loginContainer.style.display = 'block';
            if (offlineStatusContainer) offlineStatusContainer.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'none';
            window.BARK.userVisitedPlaces.clear();
            if (visitedSnapshotUnsubscribe) {
                visitedSnapshotUnsubscribe();
                visitedSnapshotUnsubscribe = null;
            }
            window.syncState();
            if (typeof window.BARK.updateStatsUI === 'function') window.BARK.updateStatsUI();

            window.dismissBarkLoader();
            if (typeof window.BARK.loadLeaderboard === 'function') window.BARK.loadLeaderboard();

            const savedList = document.getElementById('saved-routes-list');
            const savedCount = document.getElementById('saved-routes-count');
            if (savedList) savedList.innerHTML = '<p style="color:#aaa; text-align:center; padding:10px 0;">Sign in to view saved routes.</p>';
            if (savedCount) savedCount.textContent = '0';

            // LOCK PREMIUM FILTERS
            const premiumWrap = document.getElementById('premium-filters-wrap');
            const visitedSelect = document.getElementById('visited-filter');
            const mapStyleSelectF = document.getElementById('map-style-select');
            if (premiumWrap) {
                premiumWrap.classList.add('premium-locked');
                premiumWrap.classList.remove('premium-unlocked');
                if (visitedSelect) { visitedSelect.disabled = true; visitedSelect.value = 'all'; }
                if (mapStyleSelectF) { mapStyleSelectF.disabled = true; mapStyleSelectF.value = 'default'; }
            }
        }
    });

    const googleBtn = document.getElementById('google-login-btn');
    if (googleBtn) {
        googleBtn.addEventListener('click', () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            window.BARK.incrementRequestCount();
            firebase.auth().signInWithPopup(provider).catch(err => {
                console.error("Login Error:", err);
                alert("Login Error: " + err.message);
            });
        });
    }

    const logoutBtnEl = document.getElementById('logout-btn');
    if (logoutBtnEl) {
        logoutBtnEl.addEventListener('click', () => {
            firebase.auth().signOut().catch(err => console.error("Logout Error:", err));
        });
    }

    // Email Suggestion Template
    const emailSuggestBtn = document.getElementById('email-suggest-btn');
    if (emailSuggestBtn) {
        const subject = encodeURIComponent("B.A.R.K. Map: Suggest a New Place");
        const bodyTemplate = [
            "--- B.A.R.K. Ranger Map Suggestion ---",
            "Park Name:", "State:",
            "Swag Available (Tag/Bandana/Certificate/Other):",
            "Cost (Free/$$/Other):", "Park Entrance Fee:",
            "ADA Accessibility Areas:", "Useful Info / Rules:",
            "Official Website Link:", "",
            "--- IMPORTANT ---",
            "Please attach photos of the swag, the park entrance, or any relevant signage to help us verify this location! 🐾"
        ].join("\n");
        emailSuggestBtn.href = `mailto:usbarkrangers@gmail.com?subject=${subject}&body=${encodeURIComponent(bodyTemplate)}`;
    }
}

window.BARK.initFirebase = initFirebase;

// ====== ADMIN ENGINE ======
window.adminEditPoints = async function () {
    if (!window.isAdmin) return alert("Unauthorized: Admin credentials required.");

    const uid = firebase.auth().currentUser.uid;
    const currentVal = window.currentWalkPoints || 0;
    const newScore = prompt("ADMIN: Manually override your Walk Points?", currentVal);

    if (newScore !== null && !isNaN(newScore)) {
        const finalPoints = parseFloat(newScore);
        try {
            window.BARK.incrementRequestCount();
            await firebase.firestore().collection('users').doc(uid).set({ walkPoints: finalPoints }, { merge: true });
            alert(`Admin Success: Walk Points set to ${finalPoints}`);
        } catch (err) {
            alert("Failed to override points.");
        }
    }
};
