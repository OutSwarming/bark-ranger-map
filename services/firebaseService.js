/**
 * firebaseService.js - Firestore CRUD and Firebase-backed user data helpers.
 * Saved-route DOM rendering lives in renderers/routeRenderer.js.
 */
window.BARK = window.BARK || {};
window.BARK.services = window.BARK.services || {};

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

async function loadSavedRoutes(uid, cursor = null, limit = null) {
    try {
        const fetchLimit = limit || (cursor ? 5 : 3);
        window.BARK.incrementRequestCount();

        let query = firebase.firestore()
            .collection('users').doc(uid)
            .collection('savedRoutes')
            .orderBy('createdAt', 'desc');

        if (cursor) query = query.startAfter(cursor);

        const snapshot = await query.limit(fetchLimit).get();
        const routes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        return {
            routes,
            nextCursor: snapshot.empty ? null : snapshot.docs[snapshot.docs.length - 1],
            hasMore: snapshot.size === fetchLimit
        };
    } catch (error) {
        console.error("[firebaseService] loadSavedRoutes failed:", error);
        throw error;
    }
}

async function loadSavedRoute(uid, routeId) {
    try {
        window.BARK.incrementRequestCount();
        const docSnap = await firebase.firestore()
            .collection('users').doc(uid)
            .collection('savedRoutes').doc(routeId).get();
        return docSnap.exists ? { id: docSnap.id, ...docSnap.data() } : null;
    } catch (error) {
        console.error("[firebaseService] loadSavedRoute failed:", error);
        throw error;
    }
}

async function deleteSavedRoute(uid, routeId) {
    try {
        window.BARK.incrementRequestCount();
        await firebase.firestore()
            .collection('users').doc(uid)
            .collection('savedRoutes').doc(routeId).delete();
    } catch (error) {
        console.error("[firebaseService] deleteSavedRoute failed:", error);
        throw error;
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
    loadSavedRoute,
    deleteSavedRoute,
    adminEditPoints
};

window.BARK.services.firebase = firebaseService;
window.attemptDailyStreakIncrement = attemptDailyStreakIncrement;
window.BARK.syncUserProgress = syncUserProgress;
window.BARK.updateCurrentUserVisitedPlaces = updateCurrentUserVisitedPlaces;
window.BARK.updateVisitDate = updateVisitDate;
window.BARK.removeVisitedPlace = removeVisitedPlace;
window.adminEditPoints = adminEditPoints;
