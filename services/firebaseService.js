/**
 * firebaseService.js - Firestore CRUD and Firebase-backed user data helpers.
 * Phase 3 keeps legacy DOM/render side effects intact while moving Firebase calls.
 */
window.BARK = window.BARK || {};
window.BARK.services = window.BARK.services || {};

window._lastSavedRouteDoc = window._lastSavedRouteDoc || null;

function getCurrentUser() {
    if (typeof firebase === 'undefined') return null;
    return firebase.auth().currentUser;
}

async function attemptDailyStreakIncrement() {
    try {
        const user = getCurrentUser();
        if (!user) return { success: false, message: "Not logged in" };

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
    } catch (error) {
        console.error("[firebaseService] attemptDailyStreakIncrement failed:", error);
        return { success: false, message: error.message || "Failed to update streak" };
    }
}

async function syncUserProgress() {
    try {
        const user = getCurrentUser();
        if (!user) return;

        const db = firebase.firestore();
        window.BARK.incrementRequestCount();

        const visitedArray = Array.from(window.BARK.userVisitedPlaces.values());
        await db.collection('users').doc(user.uid).set({
            visitedPlaces: visitedArray
        }, { merge: true });

        window.syncState();
    } catch (error) {
        console.error("[firebaseService] syncUserProgress failed:", error);
        throw error;
    }
}

async function updateCurrentUserVisitedPlaces(visitedArray) {
    try {
        const user = getCurrentUser();
        if (!user) return;

        window.BARK.incrementRequestCount();
        await firebase.firestore().collection('users').doc(user.uid).update({ visitedPlaces: visitedArray });
    } catch (error) {
        console.error("[firebaseService] updateCurrentUserVisitedPlaces failed:", error);
        throw error;
    }
}

async function updateVisitDate(parkId, newTs) {
    try {
        if (window.BARK.userVisitedPlaces.has(parkId)) {
            const place = window.BARK.userVisitedPlaces.get(parkId);
            place.ts = newTs;
            await syncUserProgress();
            window.BARK.renderManagePortal();
        }
    } catch (error) {
        console.error("[firebaseService] updateVisitDate failed:", error);
        throw error;
    }
}

async function removeVisitedPlace(place) {
    try {
        if (window.confirm(`Remove ${place.name}?`)) {
            window.BARK.userVisitedPlaces.delete(place.id);
            await syncUserProgress();
            window.syncState();
            window.BARK.renderManagePortal();
        }
    } catch (error) {
        console.error("[firebaseService] removeVisitedPlace failed:", error);
        throw error;
    }
}

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
                    try {
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
                    } catch (error) {
                        console.error("[firebaseService] loadSavedRoute failed:", error);
                    }
                };
            });

            list.querySelectorAll('.delete-route-btn').forEach(btn => {
                btn.onclick = async () => {
                    if (!confirm('Delete this saved route?')) return;
                    try {
                        window.BARK.incrementRequestCount();
                        await firebase.firestore()
                            .collection('users').doc(uid)
                            .collection('savedRoutes').doc(btn.getAttribute('data-id')).delete();
                        loadSavedRoutes(uid);
                    } catch (error) {
                        console.error("[firebaseService] deleteSavedRoute failed:", error);
                    }
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
        console.error("[firebaseService] loadSavedRoutes failed:", error);
    }
}

function togglePlannerRoutes() {
    const container = document.getElementById('planner-saved-routes-container');
    if (!container) return;

    if (container.style.display === 'none') {
        container.style.display = 'block';
        const user = getCurrentUser();
        if (user) {
            loadSavedRoutes(user.uid);
        } else {
            const list = document.getElementById('planner-saved-routes-list');
            if (list) list.innerHTML = '<p style="color:#aaa; text-align:center; padding:10px 0;">Please log in to see saved routes.</p>';
        }
    } else {
        container.style.display = 'none';
    }
}

async function adminEditPoints() {
    if (!window.isAdmin) return alert("Unauthorized: Admin credentials required.");

    const user = getCurrentUser();
    if (!user) return alert("Unauthorized: Admin credentials required.");

    const currentVal = window.currentWalkPoints || 0;
    const newScore = prompt("ADMIN: Manually override your Walk Points?", currentVal);

    if (newScore !== null && !isNaN(newScore)) {
        const finalPoints = parseFloat(newScore);
        try {
            window.BARK.incrementRequestCount();
            await firebase.firestore().collection('users').doc(user.uid).set({ walkPoints: finalPoints }, { merge: true });
            alert(`Admin Success: Walk Points set to ${finalPoints}`);
        } catch (error) {
            console.error("[firebaseService] adminEditPoints failed:", error);
            alert("Failed to override points.");
        }
    }
}

const firebaseService = {
    getCurrentUser,
    attemptDailyStreakIncrement,
    syncUserProgress,
    updateCurrentUserVisitedPlaces,
    updateVisitDate,
    removeVisitedPlace,
    loadSavedRoutes,
    togglePlannerRoutes,
    adminEditPoints
};

window.BARK.services.firebase = firebaseService;
window.attemptDailyStreakIncrement = attemptDailyStreakIncrement;
window.BARK.syncUserProgress = syncUserProgress;
window.BARK.updateCurrentUserVisitedPlaces = updateCurrentUserVisitedPlaces;
window.BARK.updateVisitDate = updateVisitDate;
window.BARK.removeVisitedPlace = removeVisitedPlace;
window.BARK.loadSavedRoutes = loadSavedRoutes;
window.togglePlannerRoutes = togglePlannerRoutes;
window.adminEditPoints = adminEditPoints;
