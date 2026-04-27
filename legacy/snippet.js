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
