/**
 * authService.js - Firebase initialization and authentication lifecycle.
 * Phase 3 move-only extraction from dataService.js; hydration stays in place.
 */
window.BARK = window.BARK || {};
window.BARK.services = window.BARK.services || {};

let visitedSnapshotUnsubscribe = null;

function handleCloudSettingsHydration(data, metadata = {}) {
    try {
        if (!(data.settings && !window._cloudSettingsLoaded)) return;

        if (!metadata.fromCache) window._cloudSettingsLoaded = true;

        if (sessionStorage.getItem('skipCloudHydration') === 'true') {
            sessionStorage.removeItem('skipCloudHydration');
            console.log("☁️ Cloud settings skipped: Preserving local force-reload state.");
        } else {
            const s = data.settings;
            const applySetting = (key, val) => {
                localStorage.setItem(key, val ? 'true' : 'false');
                return val;
            };
            const mapRef = (typeof map !== 'undefined') ? map : window.map;
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
            if (mapRef) {
                if (window.lockMapPanning) mapRef.dragging.disable(); else mapRef.dragging.enable();
            }
            window.disablePinchZoom = applySetting('barkDisablePinchZoom', s.disablePinchZoom || false);
            if (mapRef) {
                if (window.disablePinchZoom) mapRef.touchZoom.disable(); else mapRef.touchZoom.enable();
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

        const mapRef = (typeof map !== 'undefined') ? map : window.map;
        if (window.startNationalView && mapRef) {
            mapRef.setView([39.8283, -98.5795], 4, { animate: false });
        }

        console.log("☁️ Cloud settings loaded and injected perfectly!");
    } catch (error) {
        console.error("[authService] cloud settings hydration failed:", error);
    }
}

function handleAdminCheck(data, user) {
    try {
        const adminContainer = document.getElementById('admin-controls-container');
        window.isAdmin = data.isAdmin === true;

        if (adminContainer) {
            if (window.isAdmin) {
                adminContainer.innerHTML = `
                    <div style="display: flex; gap: 8px; flex-direction: column;">
                        <button onclick="window.location.href='pages/admin.html'" class="glass-btn primary-btn" style="width: 100%; background: #10b981; color: white; border: none; padding: 14px; border-radius: 12px; font-weight: 800; display: flex; justify-content: center; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
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
    } catch (error) {
        console.error("[authService] admin check failed:", error);
    }
}

function handleExpeditionSync(data) {
    try {
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

        const cExpeditions = data.completed_expeditions || [];
        if (typeof window.BARK.renderCompletedExpeditions === 'function')
            window.BARK.renderCompletedExpeditions(cExpeditions);
        if (typeof window.BARK.renderCompletedTrailsOverlay === 'function')
            window.BARK.renderCompletedTrailsOverlay(cExpeditions);
    } catch (error) {
        console.error("[authService] expedition sync failed:", error);
    }
}

function handleVisitedPlacesSync(placeList) {
    try {
        if (Array.isArray(placeList)) {
            window.BARK.userVisitedPlaces = new Map();
            placeList.forEach(obj => {
                if (obj && obj.id) window.BARK.userVisitedPlaces.set(obj.id, obj);
            });
        }
    } catch (error) {
        console.error("[authService] visited places sync failed:", error);
    }
}

function handlePremiumGating(isLoggedIn) {
    try {
        const premiumWrap = document.getElementById('premium-filters-wrap');
        const visitedSelect = document.getElementById('visited-filter');
        const mapStyleSelectF = document.getElementById('map-style-select');
        if (premiumWrap) {
            if (isLoggedIn) {
                premiumWrap.classList.remove('premium-locked');
                premiumWrap.classList.add('premium-unlocked');
                if (visitedSelect) visitedSelect.disabled = false;
                if (mapStyleSelectF) mapStyleSelectF.disabled = false;
            } else {
                premiumWrap.classList.add('premium-locked');
                premiumWrap.classList.remove('premium-unlocked');
                if (visitedSelect) { visitedSelect.disabled = true; visitedSelect.value = 'all'; }
                if (mapStyleSelectF) { mapStyleSelectF.disabled = true; mapStyleSelectF.value = 'default'; }
            }
        }
    } catch (error) {
        console.error("[authService] premium gating failed:", error);
    }
}

function initFirebase() {
    if (typeof firebase === 'undefined') return;

    const loadSavedRoutes = window.BARK.loadSavedRoutes;

    try {
        firebase.initializeApp(window.BARK.firebaseConfig);
    } catch (error) {
        console.error("[authService] initializeApp failed:", error);
        throw error;
    }

    try {
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

                try {
                    window.BARK.incrementRequestCount();
                    visitedSnapshotUnsubscribe = firebase.firestore().collection('users').doc(user.uid)
                        .onSnapshot((doc) => {
                            if (!doc.metadata.fromCache && !window._firstServerPayloadReceived) {
                                window._firstServerPayloadReceived = true;
                                setTimeout(() => { window._serverPayloadSettled = true; }, 1000);
                            }

                            if (doc.exists) {
                                const data = doc.data();

                                handleCloudSettingsHydration(data, doc.metadata);

                                const placeList = data.visitedPlaces || [];

                                handleAdminCheck(data, user);

                                // Streak & Walk Points
                                const streakVal = data.streakCount || 0;
                                let walkVal = data.walkPoints || 0;
                                const lifetimeVal = data.lifetime_miles || 0;

                                if (lifetimeVal > walkVal) {
                                    walkVal = lifetimeVal;
                                    try {
                                        firebase.firestore().collection('users').doc(user.uid).update({ walkPoints: lifetimeVal })
                                            .catch(error => console.error("[authService] walkPoints backfill failed:", error));
                                    } catch (error) {
                                        console.error("[authService] walkPoints backfill failed:", error);
                                    }
                                }

                                const streakLabel = document.getElementById('streak-count-label');
                                if (streakLabel) streakLabel.textContent = streakVal;

                                window.currentWalkPoints = Math.round(walkVal * 100) / 100;

                                handleExpeditionSync(data);
                                handleVisitedPlacesSync(placeList);
                            } else {
                                handleVisitedPlacesSync([]);
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
                        }, (error) => {
                            console.error("[authService] user snapshot failed:", error);
                        });
                } catch (error) {
                    console.error("[authService] subscribe user document failed:", error);
                }

                if (typeof loadSavedRoutes === 'function') loadSavedRoutes(user.uid);
                handlePremiumGating(true);
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

                handlePremiumGating(false);
            }
        });
    } catch (error) {
        console.error("[authService] onAuthStateChanged setup failed:", error);
        throw error;
    }

    const googleBtn = document.getElementById('google-login-btn');
    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            try {
                const provider = new firebase.auth.GoogleAuthProvider();
                window.BARK.incrementRequestCount();
                await firebase.auth().signInWithPopup(provider);
            } catch (error) {
                console.error("[authService] signInWithPopup failed:", error);
                alert("Login Error: " + error.message);
            }
        });
    }

    const logoutBtnEl = document.getElementById('logout-btn');
    if (logoutBtnEl) {
        logoutBtnEl.addEventListener('click', async () => {
            try {
                await firebase.auth().signOut();
            } catch (error) {
                console.error("[authService] signOut failed:", error);
            }
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

window.BARK.services.auth = { initFirebase };
window.BARK.initFirebase = initFirebase;
