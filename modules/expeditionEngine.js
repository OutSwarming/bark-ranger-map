/**
 * expeditionEngine.js — Virtual Expedition Lifecycle, WalkTracker, Trail Overlays
 * Loaded EIGHTH in the boot sequence.
 */
window.BARK = window.BARK || {};

// ====== TRAILS DATA CACHE ======
async function getTrailsData() {
    if (window._cachedTrailsData) return window._cachedTrailsData;
    try {
        const response = await fetch('trails.json');
        window._cachedTrailsData = await response.json();
        return window._cachedTrailsData;
    } catch (err) {
        console.error("Failed to fetch trails (Singleton Error):", err);
        throw err;
    }
}

window.BARK.getTrailsData = getTrailsData;

// ====== VIRTUAL TRAIL OVERLAY SYSTEM ======
let virtualTrailLayerGroup = null;
let completedTrailsLayerGroup = null;

function getMapRef() {
    return (typeof window.map !== 'undefined') ? window.map : null;
}

function ensureTrailLayerGroups() {
    if (virtualTrailLayerGroup && completedTrailsLayerGroup) return true;

    if (typeof L === 'undefined' || typeof L.featureGroup !== 'function') {
        console.warn('[expeditionEngine] Leaflet is unavailable; trail overlays cannot initialize yet.');
        return false;
    }

    if (!virtualTrailLayerGroup) virtualTrailLayerGroup = L.featureGroup();
    if (!completedTrailsLayerGroup) completedTrailsLayerGroup = L.featureGroup();
    return true;
}

async function renderCompletedTrailsOverlay(completedExpeditions) {
    if (!ensureTrailLayerGroups()) return;
    completedTrailsLayerGroup.clearLayers();
    if (!completedExpeditions || completedExpeditions.length === 0) return;

    try {
        const trailsData = await getTrailsData();
        completedExpeditions.forEach(exp => {
            const trailId = exp.id || exp.trail_id;
            const trailGeoJson = trailsData[trailId];
            if (trailGeoJson) {
                L.geoJSON(trailGeoJson, {
                    style: { color: '#22c55e', weight: 4, opacity: 0.8, lineCap: 'round', dashArray: '1, 6' },
                    smoothFactor: window.simplifyTrails ? 5.0 : 1.0
                }).addTo(completedTrailsLayerGroup);

                const pt = turf.pointOnFeature(trailGeoJson);
                const coords = pt.geometry.coordinates;
                const pinIcon = L.divIcon({
                    className: 'custom-completed-icon',
                    html: `<div style="font-size: 16px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); background: #22c55e; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 3px solid white;">🏆</div>`,
                    iconSize: [32, 32], iconAnchor: [16, 16]
                });

                const trailName = trailGeoJson.properties ? trailGeoJson.properties.name : "Conquered Trail";
                L.marker([coords[1], coords[0]], { icon: pinIcon })
                    .bindPopup(`<div style="text-align:center;font-weight:800;color:#22c55e;">${trailName}</div><div style="font-size:11px;color:#64748b;text-align:center;margin-top:2px;">Expedition Conquered!</div>`)
                    .addTo(completedTrailsLayerGroup);
            }
        });

        const toggleBtn = document.getElementById('toggle-completed-trails');
        const mapRef = getMapRef();
        if (toggleBtn && toggleBtn.classList.contains('active') && mapRef) {
            completedTrailsLayerGroup.addTo(mapRef);
        }
    } catch (error) {
        console.error("Error rendering completed trails:", error);
    }
}

async function renderVirtualTrailOverlay(trailId, milesCompleted) {
    if (!ensureTrailLayerGroups()) return;
    virtualTrailLayerGroup.clearLayers();
    try {
        const trailsData = await getTrailsData();
        const trailGeoJson = trailsData[trailId];
        if (!trailGeoJson) return;

        const totalMiles = trailGeoJson.properties.total_miles;
        const actualGeoLength = turf.length(trailGeoJson, { units: 'miles' });
        const progressPct = totalMiles > 0 ? Math.min(1, milesCompleted / totalMiles) : 0;
        const geoSafeMiles = actualGeoLength * progressPct;

        if (geoSafeMiles > 0) {
            const completedLine = turf.lineSliceAlong(trailGeoJson, 0, geoSafeMiles, { units: 'miles' });
            L.geoJSON(completedLine, {
                style: { color: '#22c55e', weight: 6, opacity: 0.9, lineCap: 'round' },
                smoothFactor: window.simplifyTrails ? 5.0 : 1.0
            }).addTo(virtualTrailLayerGroup);
        }

        if (geoSafeMiles < actualGeoLength) {
            const remainingLine = turf.lineSliceAlong(trailGeoJson, geoSafeMiles, actualGeoLength, { units: 'miles' });
            L.geoJSON(remainingLine, {
                style: { color: '#ef4444', weight: 4, opacity: 0.6, dashArray: '5, 10', lineCap: 'round' },
                smoothFactor: window.simplifyTrails ? 5.0 : 1.0
            }).addTo(virtualTrailLayerGroup);
        }

        const currentAvatarPoint = turf.along(trailGeoJson, geoSafeMiles, { units: 'miles' });
        const dogIcon = L.divIcon({
            className: 'custom-avatar-icon',
            html: '<div style="font-size: 24px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">🐕</div>',
            iconSize: [30, 30], iconAnchor: [15, 15]
        });

        L.marker([currentAvatarPoint.geometry.coordinates[1], currentAvatarPoint.geometry.coordinates[0]], { icon: dogIcon })
            .addTo(virtualTrailLayerGroup);

        window.lastActiveTrailId = trailId;
        window.lastMilesCompleted = milesCompleted;

        const toggleBtn = document.getElementById('toggle-virtual-trail');
        const mapRef = getMapRef();
        if (toggleBtn && toggleBtn.classList.contains('active') && mapRef) {
            virtualTrailLayerGroup.addTo(mapRef);
        }
    } catch (error) {
        console.error("Error rendering virtual trail:", error);
    }
}

window.BARK.renderVirtualTrailOverlay = renderVirtualTrailOverlay;
window.BARK.renderCompletedTrailsOverlay = renderCompletedTrailsOverlay;

// ====== TRAIL TOGGLE BUTTONS ======
function initTrailToggles() {
    const toggleVirtualBtn = document.getElementById('toggle-virtual-trail');
    if (toggleVirtualBtn) {
        toggleVirtualBtn.addEventListener('click', function () {
            if (!ensureTrailLayerGroups()) return;
            const mapRef = getMapRef();
            if (!mapRef) return;

            this.classList.toggle('active');
            if (this.classList.contains('active')) {
                virtualTrailLayerGroup.addTo(mapRef);
                if (virtualTrailLayerGroup.getLayers().length > 0) {
                    mapRef.fitBounds(virtualTrailLayerGroup.getBounds(), {
                        padding: [50, 50], animate: !window.instantNav, duration: window.instantNav ? 0 : 0.5
                    });
                }
            } else {
                virtualTrailLayerGroup.removeFrom(mapRef);
            }
        });
    }

    const toggleCompletedBtn = document.getElementById('toggle-completed-trails');
    if (toggleCompletedBtn) {
        toggleCompletedBtn.addEventListener('click', function () {
            if (!ensureTrailLayerGroups()) return;
            const mapRef = getMapRef();
            if (!mapRef) return;

            this.classList.toggle('active');
            if (this.classList.contains('active')) {
                completedTrailsLayerGroup.addTo(mapRef);
                if (completedTrailsLayerGroup.getLayers().length > 0) {
                    mapRef.fitBounds(completedTrailsLayerGroup.getBounds(), {
                        padding: [50, 50], animate: !window.instantNav, duration: window.instantNav ? 0 : 0.5
                    });
                }
            } else {
                completedTrailsLayerGroup.removeFrom(mapRef);
            }
        });
    }
}

window.BARK.initTrailToggles = initTrailToggles;

// ====== TRAIL NAVIGATION & EDUCATION ======
window.flyToActiveTrail = function () {
    if (!ensureTrailLayerGroups()) {
        alert("Trail map data is unavailable. Please refresh and try again.");
        return;
    }

    const mapNavBtn = document.querySelector('.nav-item[data-target="map-view"]');
    if (mapNavBtn) mapNavBtn.click();

    const toggleBtn = document.getElementById('toggle-virtual-trail');
    if (toggleBtn && !toggleBtn.classList.contains('active')) toggleBtn.click();

    const mapRef = getMapRef();
    if (mapRef && virtualTrailLayerGroup.getLayers().length > 0) {
        setTimeout(() => {
            mapRef.invalidateSize();
            mapRef.flyToBounds(virtualTrailLayerGroup.getBounds(), {
                padding: [50, 50], maxZoom: 14, animate: !window.lowGfxEnabled, duration: window.lowGfxEnabled ? 0 : 1.5
            });
        }, 350);
    } else {
        alert("Trail map data is still loading. Please try again in a moment.");
    }
};

window.hydrateEducationModal = function (trailId) {
    const trailData = window.BARK.TOP_10_TRAILS.find(t => t.id === trailId);
    if (!trailData) return;
    const parkEl = document.getElementById('edu-park-name');
    const descEl = document.getElementById('edu-trail-desc');
    const distEl = document.getElementById('edu-trail-distance');
    if (parkEl) parkEl.textContent = trailData.park;
    if (descEl) descEl.textContent = trailData.info;
    if (distEl) distEl.textContent = `${trailData.miles.toFixed(1)} Miles`;
};

// ====== SPIN WHEEL ======
function initSpinWheel() {
    const spinBtn = document.getElementById('spin-wheel-btn');
    if (spinBtn) {
        spinBtn.addEventListener('click', async () => {
            const user = firebase.auth().currentUser;
            if (!user) { alert("Please sign in to start your expedition!"); return; }

            spinBtn.textContent = '🎡 Spinning...';
            spinBtn.disabled = true;
            spinBtn.style.opacity = '0.7';

            window.BARK.incrementRequestCount();
            const userRef = firebase.firestore().collection('users').doc(user.uid);

            try {
                const docSnap = await userRef.get();
                const userData = docSnap.data() || {};
                const completedExpeditions = userData.completed_expeditions || [];
                const completionCounts = {};
                window.BARK.TOP_10_TRAILS.forEach(t => completionCounts[t.id] = 0);
                completedExpeditions.forEach(exp => { const id = exp.id || exp.trail_id; if (completionCounts[id] !== undefined) completionCounts[id]++; });
                const minCount = Math.min(...Object.values(completionCounts));
                let availableTrails = window.BARK.TOP_10_TRAILS.filter(trail => completionCounts[trail.id] === minCount);
                const isGrandCanyonAvailable = availableTrails.some(t => t.id === 'grand_canyon_rim2rim');
                if (isGrandCanyonAvailable && availableTrails.length > 1) availableTrails = availableTrails.filter(t => t.id !== 'grand_canyon_rim2rim');
                if (minCount > 0 && availableTrails.length === window.BARK.TOP_10_TRAILS.length - 1) alert(`🌟 Prestige Mode Lap ${minCount + 1}! You've conquered every trail. Spin to start your next lap!`);

                let spinCount = 0;
                let finalTrail = null;
                const nameHeader = document.getElementById('expedition-name');
                const shuffleInterval = setInterval(() => {
                    const randomTrail = availableTrails[Math.floor(Math.random() * availableTrails.length)];
                    if (nameHeader) nameHeader.textContent = randomTrail.name;
                    spinCount++;
                    if (spinCount > 15) {
                        clearInterval(shuffleInterval);
                        finalTrail = availableTrails[Math.floor(Math.random() * availableTrails.length)];
                        if (nameHeader) nameHeader.textContent = finalTrail.name;
                        assignTrailToUser(user.uid, finalTrail);
                        setTimeout(() => { spinBtn.textContent = '🎡 Spin for a Trail'; spinBtn.disabled = false; spinBtn.style.opacity = '1'; }, 500);
                    }
                }, 120);
            } catch (error) {
                console.error("Error fetching spin data:", error);
                alert("Error spinning the wheel. Please check your connection.");
                spinBtn.textContent = '🎡 Spin for a Trail'; spinBtn.disabled = false; spinBtn.style.opacity = '1';
            }
        });
    }
}

window.BARK.initSpinWheel = initSpinWheel;

async function assignTrailToUser(uid, trail) {
    window.BARK.incrementRequestCount();
    const userRef = firebase.firestore().collection('users').doc(uid);
    const doc = await userRef.get();
    const data = doc.data() || {};
    const existingHistory = (data.virtual_expedition && data.virtual_expedition.history) || [];

    await userRef.set({
        virtual_expedition: { active_trail: trail.id, trail_name: trail.name, miles_logged: 0, trail_total_miles: trail.miles, history: existingHistory }
    }, { merge: true });

    document.getElementById('expedition-intro-state').style.display = 'none';
    const activeEl = document.getElementById('expedition-active-state');
    const nameHeader = document.getElementById('expedition-name');
    if (nameHeader) { nameHeader.textContent = trail.name; nameHeader.dataset.trailName = trail.name; }
    activeEl.style.display = 'block';
    window.hydrateEducationModal(trail.id);
    activeEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: 'forwards' });

    renderExpeditionProgress(0, trail.miles);
    renderExpeditionHistory(existingHistory, trail.name);
}

window.BARK.assignTrailToUser = assignTrailToUser;

// ====== GPS DISTANCE HELPER ======
function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ====== MILEAGE PROCESSING ======
async function processMileageAddition(milesToAdd, typeLabel) {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const userRef = firebase.firestore().collection('users').doc(user.uid);
    window.BARK.incrementRequestCount();

    try {
        const docSnap = await userRef.get();
        const userData = docSnap.data();
        let currentMiles = 0, totalMiles = 10, history = [], lifetimeTotal = userData.lifetime_miles || 0;
        const currentTrailName = (userData.virtual_expedition && userData.virtual_expedition.trail_name) || "Active Trail";

        if (userData.virtual_expedition) {
            currentMiles = userData.virtual_expedition.miles_logged || 0;
            totalMiles = userData.virtual_expedition.trail_total_miles || 0;
            history = userData.virtual_expedition.history || [];
        }

        let newTotal = currentMiles + milesToAdd;
        if (totalMiles > 0 && newTotal > totalMiles) newTotal = totalMiles;

        const logEntry = { ts: Date.now(), miles: parseFloat(milesToAdd.toFixed(2)), type: typeLabel, trailName: currentTrailName };
        history.unshift(logEntry);

        await userRef.update({
            "virtual_expedition.miles_logged": newTotal,
            "virtual_expedition.history": history,
            "lifetime_miles": firebase.firestore.FieldValue.increment(parseFloat(milesToAdd.toFixed(2))),
            "walkPoints": firebase.firestore.FieldValue.increment(parseFloat(milesToAdd.toFixed(2)))
        });

        window.currentWalkPoints = (window.currentWalkPoints || 0) + parseFloat(milesToAdd.toFixed(2));
        await window.BARK.syncScoreToLeaderboard();

        renderExpeditionProgress(newTotal, totalMiles, lifetimeTotal + milesToAdd);
        renderExpeditionHistory(history, currentTrailName);

        if (newTotal >= totalMiles) setTimeout(() => alert("🎉 Expedition Complete! You conquered the trail!"), 800);
    } catch (error) {
        console.error("Failed to log miles:", error);
    }
}

// ====== MANUAL MILES ======
function initManualMiles() {
    const logManualBtn = document.getElementById('log-manual-miles-btn');
    if (logManualBtn) {
        logManualBtn.addEventListener('click', () => {
            const inputEl = document.getElementById('miles-input');
            let milesToLog = parseFloat(inputEl.value);
            if (isNaN(milesToLog) || milesToLog <= 0) return;
            if (milesToLog > 15) { alert("Whoa there! You can only log a maximum of 15 miles per day manually."); milesToLog = 15; inputEl.value = 15; }
            processMileageAddition(milesToLog, 'Manual Entry');
            inputEl.value = '';
        });
    }
}

window.BARK.initManualMiles = initManualMiles;

// ====== EXPEDITION PROGRESS ======
function renderExpeditionProgress(current, total, lifetime) {
    const fillEl = document.getElementById('expedition-fill');
    const textEl = document.getElementById('expedition-progress-text');
    const lifetimeEl = document.getElementById('lifetime-miles-display');
    const activeState = document.getElementById('expedition-active-state');
    const completeState = document.getElementById('expedition-complete-state');
    if (!fillEl || !textEl) return;

    const pct = (total > 0) ? Math.min(100, (current / total) * 100) : 0;
    fillEl.style.width = `${pct.toFixed(1)}%`;
    textEl.textContent = `${current.toFixed(1)} / ${total.toFixed(1)} Miles (${pct.toFixed(1)}%)`;

    if (total > 0 && current >= total && activeState && completeState) {
        activeState.style.display = 'none';
        completeState.style.display = 'block';
        document.getElementById('expedition-name').textContent = "CONQUERED";
        const trailName = document.getElementById('celebration-trail-name');
        if (trailName) {
            const currentTrailName = document.getElementById('expedition-name').dataset.trailName || "Expedition";
            trailName.textContent = currentTrailName;
        }
    } else if (activeState && completeState) {
        const nameHeader = document.getElementById('expedition-name');
        if (nameHeader && nameHeader.textContent === "CONQUERED") nameHeader.textContent = nameHeader.dataset.trailName || "";
    }

    if (lifetimeEl && lifetime !== undefined) lifetimeEl.textContent = `${lifetime.toFixed(1)} mi`;
}

window.BARK.renderExpeditionProgress = renderExpeditionProgress;

// ====== EXPEDITION HISTORY ======
function renderExpeditionHistory(historyArray, activeTrailName = "Expedition") {
    const list = document.getElementById('expedition-history-list');
    if (list) {
        const currentTrailLogs = historyArray.filter(log => log.trailName && log.trailName === activeTrailName);
        if (!currentTrailLogs || currentTrailLogs.length === 0) {
            list.innerHTML = '<li style="color: #94a3b8; font-size: 11px; text-align: center; padding: 10px 0; font-style: italic;">No miles logged yet.</li>';
        } else {
            list.innerHTML = currentTrailLogs.slice(0, 5).map(log => {
                const dateStr = new Date(log.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                const icon = log.type === 'GPS Verified' ? '📍' : '✏️';
                return `<li class="log-item"><div class="log-item-left"><span class="log-item-type">${icon} ${log.type}</span><span class="log-item-date">${dateStr}</span></div><div class="log-item-miles">+${log.miles.toFixed(2)} mi</div></li>`;
            }).join('');
        }
    }

    const masterList = document.getElementById('manage-walks-list');
    const masterCount = document.getElementById('manage-walks-count');
    if (masterList) {
        if (masterCount) masterCount.textContent = historyArray.length;
        if (!historyArray || historyArray.length === 0) {
            masterList.innerHTML = '<div style="color: #94a3b8; font-size: 12px; text-align: center; padding: 20px; font-style: italic;">No walks logged yet.</div>';
            return;
        }

        const grouped = historyArray.reduce((acc, log) => {
            const isGeneric = !log.trailName || log.trailName === "Expedition" || log.trailName === "Active Trail";
            const trail = isGeneric ? (activeTrailName || "Expedition") : log.trailName;
            if (!acc[trail]) acc[trail] = [];
            acc[trail].push(log);
            return acc;
        }, {});

        masterList.innerHTML = Object.keys(grouped).map(trail => {
            const logs = grouped[trail];
            const totalTrailMiles = logs.reduce((sum, l) => sum + l.miles, 0);
            return `<div style="margin-bottom: 20px;">
                <div style="font-size: 11px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-bottom: 10px; display: flex; justify-content: space-between; padding: 0 4px;"><span>${trail}</span><span>${totalTrailMiles.toFixed(2)} mi</span></div>
                <ul style="list-style: none; padding: 0; margin: 0; background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #f1f5f9;">
                    ${logs.map(log => {
                const dateStr = new Date(log.ts).toLocaleString([], { month: 'short', day: 'numeric' });
                const icon = log.type === 'GPS Verified' ? '📍' : '✏️';
                return `<li style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #f8fafc;">
                            <div style="display: flex; align-items: center; gap: 8px;"><span style="font-size: 14px;">${icon}</span><div style="display: flex; flex-direction: column;"><span style="font-weight: 700; color: #1e293b; font-size: 13px;">${log.miles.toFixed(2)} mi</span><span style="font-size: 10px; color: #64748b;">${dateStr}</span></div></div>
                            <div style="display: flex; gap: 12px;">
                                <button onclick="editWalkMiles('${log.ts}')" style="background: none; border: none; color: #3b82f6; font-size: 10px; font-weight: 800; cursor: pointer; padding: 4px; letter-spacing: 0.5px;">EDIT</button>
                                <button onclick="deleteWalkLog('${log.ts}')" style="background: none; border: none; color: #ef4444; font-size: 10px; font-weight: 800; cursor: pointer; padding: 4px; letter-spacing: 0.5px;">DELETE</button>
                            </div></li>`;
            }).join('')}</ul></div>`;
        }).join('');
    }
}

window.BARK.renderExpeditionHistory = renderExpeditionHistory;

// ====== EDIT/DELETE WALKS ======
window.editWalkMiles = async function (timestamp) {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const userRef = firebase.firestore().collection('users').doc(user.uid);
    try {
        const doc = await userRef.get();
        const data = doc.data();
        let history = (data.virtual_expedition && data.virtual_expedition.history) || [];
        const logIndex = history.findIndex(l => l.ts.toString() === timestamp.toString());
        if (logIndex === -1) return;
        const currentLog = history[logIndex];
        const activeTrailName = data.virtual_expedition.trail_name;

        const newMilesStr = prompt("Enter new miles for this walk:", currentLog.miles);
        if (newMilesStr === null) return;
        const newMiles = parseFloat(newMilesStr);
        if (isNaN(newMiles) || newMiles < 0) { alert("Please enter a valid mileage."); return; }

        const newTrailName = prompt("Which trail was this on?", currentLog.trailName || "Expedition");
        if (newTrailName === null) return;

        const currentDateStr = new Date(currentLog.ts).toISOString().slice(0, 16);
        const newDateStr = prompt("Edit Date/Time (YYYY-MM-DDTHH:MM):", currentDateStr);
        if (newDateStr === null) return;
        const newTs = new Date(newDateStr).getTime();
        if (isNaN(newTs)) { alert("Invalid date format."); return; }

        const oldMiles = currentLog.miles;
        const oldTrail = currentLog.trailName;
        const diff = newMiles - oldMiles;

        history[logIndex].miles = newMiles;
        history[logIndex].trailName = newTrailName;
        history[logIndex].ts = newTs;
        history.sort((a, b) => b.ts - a.ts);

        let currentProgress = data.virtual_expedition.miles_logged || 0;
        if (oldTrail === activeTrailName && newTrailName === activeTrailName) currentProgress += diff;
        else if (oldTrail === activeTrailName && newTrailName !== activeTrailName) currentProgress -= oldMiles;
        else if (oldTrail !== activeTrailName && newTrailName === activeTrailName) currentProgress += newMiles;
        if (currentProgress < 0) currentProgress = 0;
        const maxMiles = data.virtual_expedition.trail_total_miles || 10;
        if (currentProgress > maxMiles) currentProgress = maxMiles;

        await userRef.update({
            "virtual_expedition.history": history,
            "virtual_expedition.miles_logged": currentProgress,
            "lifetime_miles": firebase.firestore.FieldValue.increment(diff),
            "walkPoints": firebase.firestore.FieldValue.increment(diff)
        });
        window.currentWalkPoints = (window.currentWalkPoints || 0) + diff;
        await window.BARK.syncScoreToLeaderboard();
        if (typeof window.BARK.showTripToast === 'function') window.BARK.showTripToast("Walk log updated ✏️");
    } catch (e) { console.error(e); alert("Failed to update walk."); }
};

window.deleteWalkLog = async function (timestamp) {
    if (!confirm("Are you sure? Removing this walk will subtract these miles from your progress, but you keep your reward points.")) return;
    const user = firebase.auth().currentUser;
    if (!user) return;
    const userRef = firebase.firestore().collection('users').doc(user.uid);
    try {
        const doc = await userRef.get();
        const data = doc.data();
        let history = (data.virtual_expedition && data.virtual_expedition.history) || [];
        const logIndex = history.findIndex(l => l.ts.toString() === timestamp.toString());
        if (logIndex === -1) return;
        const currentLog = history[logIndex];
        const milesToRemove = currentLog.miles;
        const walkTrail = currentLog.trailName;
        const activeTrail = data.virtual_expedition.trail_name;
        history.splice(logIndex, 1);
        let currentProgress = data.virtual_expedition.miles_logged || 0;
        if (walkTrail === activeTrail) currentProgress -= milesToRemove;
        if (currentProgress < 0) currentProgress = 0;

        await userRef.update({
            "virtual_expedition.history": history,
            "virtual_expedition.miles_logged": currentProgress,
            "lifetime_miles": firebase.firestore.FieldValue.increment(-milesToRemove),
            "walkPoints": firebase.firestore.FieldValue.increment(-milesToRemove)
        });
        window.currentWalkPoints = Math.max(0, (window.currentWalkPoints || 0) - milesToRemove);
        await window.BARK.syncScoreToLeaderboard();
        if (typeof window.BARK.showTripToast === 'function') window.BARK.showTripToast("Walk removed 🗑️");
    } catch (e) { console.error(e); alert("Failed to delete walk."); }
};

// ====== CLAIM REWARD ======
window.claimRewardAndReset = async function () {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const userRef = firebase.firestore().collection('users').doc(user.uid);
    try {
        const docSnap = await userRef.get();
        const userData = docSnap.data();
        if (!userData || !userData.virtual_expedition) return;
        const currentTrailName = userData.virtual_expedition.trail_name || "Expedition";
        const trailMiles = userData.virtual_expedition.trail_total_miles || 0;
        const pointsEarned = Math.max(1, Math.round(trailMiles / 2));

        const completedTrail = { id: userData.virtual_expedition.active_trail, name: currentTrailName, miles: trailMiles, points_earned: pointsEarned, date_completed: Date.now() };
        const completedArray = userData.completed_expeditions || [];
        const existingIndex = completedArray.findIndex(exp => exp.id === completedTrail.id);
        if (existingIndex > -1) completedArray[existingIndex].date_completed = Date.now();
        else completedArray.push(completedTrail);

        await userRef.update({
            "completed_expeditions": completedArray,
            "virtual_expedition.active_trail": null, "virtual_expedition.trail_name": null, "virtual_expedition.miles_logged": 0, "virtual_expedition.trail_total_miles": 0,
            "walkPoints": firebase.firestore.FieldValue.increment(pointsEarned)
        });
        window.currentWalkPoints = (window.currentWalkPoints || 0) + pointsEarned;
        await window.BARK.syncScoreToLeaderboard();
        if (typeof window.BARK.showTripToast === 'function') window.BARK.showTripToast(`🏆 +${pointsEarned} PTS! Reward Claimed: ${currentTrailName}`);
    } catch (e) { console.error(e); alert("Failed to claim reward."); }
};

// ====== COMPLETED EXPEDITIONS GRID ======
function renderCompletedExpeditions(expeditionsArray) {
    const grid = document.getElementById('completed-expeditions-grid');
    const caseEl = document.getElementById('expedition-trophy-case');
    if (!grid || !caseEl) return;
    if (!expeditionsArray || expeditionsArray.length === 0) { caseEl.style.display = 'none'; return; }
    caseEl.style.display = 'block';

    grid.innerHTML = expeditionsArray.map(exp => {
        const name = exp.name || exp.trail_name || "Expedition";
        const rawDate = exp.date_completed || exp.ts || Date.now();
        const dateStr = new Date(rawDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        return `<div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px; display: flex; align-items: center; gap: 10px; flex: 0 0 180px; scroll-snap-align: start;">
            <div style="font-size: 24px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.1));">🏅</div>
            <div style="display: flex; flex-direction: column;"><span style="font-size: 12px; font-weight: 800; color: #1e293b; line-height: 1.2; white-space: normal;">${name}</span><span style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-top: 2px;">${dateStr}</span></div>
        </div>`;
    }).join('');
}

window.BARK.renderCompletedExpeditions = renderCompletedExpeditions;

// ====== WALK TRACKER (Advanced GPS Tracking) ======
const WalkTracker = {
    watchId: null, wakeLock: null, points: [], totalMiles: 0, lastValidLocation: null,
    isBlackedOut: false, blackoutStartTime: 0, boundVisibilityHandler: null,

    async start() {
        if (!navigator.geolocation) return alert('GPS not supported');
        this.points = []; this.totalMiles = 0; this.lastValidLocation = null;
        try { if ('wakeLock' in navigator) this.wakeLock = await navigator.wakeLock.request('screen'); } catch (err) { console.warn('Wake Lock failed/denied:', err); }

        const btn = document.getElementById('training-action-btn');
        if (btn) { btn.textContent = 'Tracking Active 🟢'; btn.className = 'glass-btn training-btn active'; btn.onclick = () => this.stopAndSave(); }
        const cancelBtn = document.getElementById('cancel-training-btn');
        if (cancelBtn) cancelBtn.style.display = 'block';

        this.watchId = navigator.geolocation.watchPosition((pos) => this.processGpsPing(pos), (err) => console.error("GPS Error:", err), { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 });
        this.showFloatingBanner();
        this.boundVisibilityHandler = this.handleVisibilityChange.bind(this);
        document.addEventListener('visibilitychange', this.boundVisibilityHandler);
    },

    processGpsPing(pos) {
        if (this.isBlackedOut) return;
        const accMeters = pos.coords.accuracy;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (accMeters > 25) return;
        if (!this.lastValidLocation) { this.lastValidLocation = { lat, lng, ts: Date.now() }; this.points.push(this.lastValidLocation); return; }
        const distMeters = getDistanceMeters(this.lastValidLocation.lat, this.lastValidLocation.lng, lat, lng);
        if (distMeters > 5) {
            const miles = distMeters * 0.000621371;
            this.totalMiles += miles;
            this.lastValidLocation = { lat, lng, ts: Date.now() };
            this.points.push(this.lastValidLocation);
            this.updateDistanceUI();
        }
    },

    handleVisibilityChange() {
        if (document.hidden) { this.isBlackedOut = true; this.blackoutStartTime = Date.now(); }
        else {
            this.isBlackedOut = false;
            const blackoutDurationMins = (Date.now() - this.blackoutStartTime) / 60000;
            if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(wl => this.wakeLock = wl).catch(() => {});
            if (blackoutDurationMins > 2) this.triggerBlackoutFallback(blackoutDurationMins);
        }
    },

    triggerBlackoutFallback(minutesLost) {
        const manualMiles = prompt(`Welcome back! iOS paused your GPS for ${Math.round(minutesLost)} minutes.\n\nWe tracked ${this.totalMiles.toFixed(2)} miles before the pause. How many missing miles? (Enter 0 if none)`);
        const parsed = parseFloat(manualMiles);
        if (!isNaN(parsed) && parsed > 0) { this.totalMiles += parsed; this.updateDistanceUI(); }
    },

    async stopAndSave() {
        const finalMiles = this.totalMiles;
        this.cleanup();
        if (finalMiles < 0.05) alert("Not enough distance recorded to log an expedition.");
        else { alert(`Expedition Complete! You logged ${finalMiles.toFixed(2)} miles.`); await processMileageAddition(finalMiles, 'GPS Active Track'); }
        initTrainingUI();
    },

    cancel() { this.cleanup(); initTrainingUI(); },

    cleanup() {
        if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
        if (this.boundVisibilityHandler) document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
        if (this.wakeLock) { this.wakeLock.release().catch(() => {}); this.wakeLock = null; }
        this.hideFloatingBanner();
        this.watchId = null; this.boundVisibilityHandler = null; this.points = []; this.totalMiles = 0; this.lastValidLocation = null; this.isBlackedOut = false;
    },

    showFloatingBanner() {
        let banner = document.getElementById('live-walk-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'live-walk-banner';
            banner.style.cssText = `position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.95); color: white; padding: 10px 24px; border-radius: 30px; z-index: 10000; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid #10b981; cursor: pointer; font-size: 14px; transition: all 0.3s ease;`;
            banner.onclick = () => { const profileTab = document.querySelector('.nav-item[data-target="profile-view"]'); if (profileTab) profileTab.click(); };
            document.body.appendChild(banner);
            const style = document.createElement('style');
            style.innerHTML = `@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }`;
            document.head.appendChild(style);
        }
        banner.innerHTML = `<span style="animation: pulse 2s infinite;">🟢</span> <strong><span id="floating-distance">0.00</span> mi</strong>`;
        banner.style.display = 'flex';
    },

    hideFloatingBanner() { const banner = document.getElementById('live-walk-banner'); if (banner) banner.style.display = 'none'; },

    updateDistanceUI() {
        const descEl = document.getElementById('training-desc');
        if (descEl) descEl.innerHTML = `Distance: <strong style="color: #10b981;">${this.totalMiles.toFixed(2)} mi</strong>`;
        const floatDistEl = document.getElementById('floating-distance');
        if (floatDistEl) floatDistEl.textContent = this.totalMiles.toFixed(2);
    }
};

window.handleTrainingClick = function () {
    const btn = document.getElementById('training-action-btn');
    if (btn && btn.textContent.includes('Start')) WalkTracker.start();
    else WalkTracker.stopAndSave();
};

window.cancelTrainingWalk = function () {
    if (confirm("Are you sure you want to cancel your walk? You won't earn any points.")) WalkTracker.cancel();
};

function initTrainingUI() {
    ensureTrailLayerGroups();

    const btn = document.getElementById('training-action-btn');
    const cancelBtn = document.getElementById('cancel-training-btn');
    const descEl = document.getElementById('training-desc');
    if (!WalkTracker.watchId) {
        if (btn) { btn.textContent = 'Start Walk'; btn.className = 'glass-btn training-btn'; }
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (descEl) descEl.innerHTML = 'Start walking away from home. Log your turnaround point to calculate total distance and earn <strong style="color: #f59e0b;">+0.5 PTS</strong>.';
    } else {
        if (btn) { btn.textContent = 'Tracking Active 🟢'; btn.className = 'glass-btn training-btn active'; }
        if (cancelBtn) cancelBtn.style.display = 'block';
        if (descEl) descEl.innerHTML = `Distance: <strong style="color: #10b981;">${WalkTracker.totalMiles.toFixed(2)} mi</strong>`;
    }
}

window.BARK.initTrainingUI = initTrainingUI;

// ====== TRAIL WARP GRID (Dev Tool) ======
function populateTrailWarpGrid() {
    const warpGrid = document.getElementById('dev-trail-warp-grid');
    if (!warpGrid) return;
    warpGrid.innerHTML = '';
    window.BARK.TOP_10_TRAILS.forEach(trail => {
        const btn = document.createElement('button');
        btn.className = 'dev-warp-btn';
        btn.textContent = trail.name;
        btn.onclick = async () => {
            const user = firebase.auth().currentUser;
            if (!user) { alert("Please sign in first!"); return; }
            console.log(`🛠️ Dev Test: Warping to ${trail.name}...`);
            await assignTrailToUser(user.uid, trail);
            if (typeof window.flyToActiveTrail === 'function') window.flyToActiveTrail();
            const settingsOverlay = document.getElementById('settings-overlay');
            if (settingsOverlay) settingsOverlay.classList.remove('active');
        };
        warpGrid.appendChild(btn);
    });
}

window.BARK.populateTrailWarpGrid = populateTrailWarpGrid;
