/**
 * settingsController.js — Settings Modal, Toggles, Cloud Sync, Terminate & Reload
 * Loaded ELEVENTH in the boot sequence.
 */
window.BARK = window.BARK || {};

window.BARK.initSettings = function initSettings() {
    const settingsGearBtn = document.getElementById('settings-gear-btn');
    const settingsOverlay = document.getElementById('settings-overlay');
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
    const settingsStore = window.BARK.settings;
    const settingsRegistry = window.BARK.SETTINGS_REGISTRY || {};
    const performanceSettingKeys = window.BARK.PERFORMANCE_SETTING_KEYS || [];

    const syncPerformanceControls = () => {
        const lowGraphicsActive = Boolean(window.lowGfxEnabled);
        performanceSettingKeys.forEach((key) => {
            const setting = settingsRegistry[key];
            if (!setting) return;

            const input = document.getElementById(setting.elementId);
            const row = input ? input.closest('[data-setting-key]') : null;
            if (!input) return;

            input.checked = Boolean(window[key]);
            input.disabled = lowGraphicsActive && !setting.master;
            if (row) row.style.opacity = input.disabled ? '0.62' : '1';
        });
    };

    const renderPerformanceSettings = () => {
        const container = document.getElementById('performance-settings-registry');
        if (!container || container.dataset.rendered === 'true') return;

        container.innerHTML = performanceSettingKeys.map((key) => {
            const setting = settingsRegistry[key];
            if (!setting) return '';

            const rowStyle = setting.master
                ? 'display: flex; justify-content: space-between; align-items: flex-start; gap: 15px; background: rgba(33, 150, 243, 0.06); padding: 10px; border-radius: 8px; border: 1px solid rgba(33, 150, 243, 0.14);'
                : 'display: flex; justify-content: space-between; align-items: flex-start; gap: 15px;';

            return `
                <div data-setting-key="${key}" style="${rowStyle}">
                    <div style="flex: 1;">
                        <div style="font-size: 15px; font-weight: 800; color: #1e293b;">${setting.label}</div>
                        <div style="font-size: 12px; color: #64748b; font-weight: 500; margin-top: 4px; line-height: 1.4;">${setting.description}</div>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="${setting.elementId}">
                        <span class="slider round"></span>
                    </label>
                </div>
            `;
        }).join('');

        container.dataset.rendered = 'true';
    };

    const refreshTrailRendering = () => {
        if (window.lastActiveTrailId && typeof window.BARK.renderVirtualTrailOverlay === 'function') {
            window.BARK.renderVirtualTrailOverlay(window.lastActiveTrailId, window.lastMilesCompleted || 0);
        }
        if (typeof window.BARK.renderCompletedTrailsOverlay === 'function' && typeof firebase !== 'undefined') {
            const user = firebase.auth().currentUser;
            if (user) {
                firebase.firestore().collection('users').doc(user.uid).get().then(doc => {
                    if (doc.exists && doc.data().completedExpeditions) {
                        window.BARK.renderCompletedTrailsOverlay(doc.data().completedExpeditions);
                    }
                });
            }
        }
    };

    const applyRegistrySettingEffects = (setting) => {
        if (!setting) return;

        if (typeof window.BARK.applyGlobalStyles === 'function') window.BARK.applyGlobalStyles();
        if (setting.impact === window.BARK.SETTING_IMPACTS.MAP_BEHAVIOR && typeof window.BARK.applyMapPerformancePolicy === 'function') {
            window.BARK.applyMapPerformancePolicy();
        }
        if (setting.impact === window.BARK.SETTING_IMPACTS.MARKER_LAYER && typeof window.BARK.rebuildMarkerLayer === 'function') {
            window.BARK.rebuildMarkerLayer();
        }
        if (setting.impact === window.BARK.SETTING_IMPACTS.TRAIL_RENDER) {
            refreshTrailRendering();
        }
        if (typeof window.syncState === 'function') window.syncState();
    };

    const setupRegistryPerformanceToggles = () => {
        performanceSettingKeys.forEach((key) => {
            const setting = settingsRegistry[key];
            const input = setting ? document.getElementById(setting.elementId) : null;
            if (!setting || !input || input.dataset.bound === 'true') return;

            input.dataset.bound = 'true';
            input.checked = Boolean(window[key]);
            input.addEventListener('change', (e) => {
                if (settingsStore && typeof settingsStore.set === 'function') {
                    settingsStore.set(key, e.target.checked);
                } else {
                    window[key] = e.target.checked;
                    if (setting.storageKey) localStorage.setItem(setting.storageKey, window[key] ? 'true' : 'false');
                    syncPerformanceControls();
                    applyRegistrySettingEffects(setting);
                }
            });

            if (settingsStore && typeof settingsStore.onChange === 'function') {
                settingsStore.onChange(key, () => {
                    syncPerformanceControls();
                    applyRegistrySettingEffects(setting);
                });
            }
        });

        syncPerformanceControls();
    };

    window.BARK.syncSettingsControls = function syncSettingsControls() {
        syncPerformanceControls();
    };

    const syncClusterToggles = () => {
        if (standardToggle) standardToggle.checked = window.standardClusteringEnabled;
        if (premiumToggle) premiumToggle.checked = window.premiumClusteringEnabled;
    };
    let clusterRefreshScheduled = false;
    const scheduleClusterRefresh = () => {
        if (clusterRefreshScheduled) return;
        clusterRefreshScheduled = true;
        requestAnimationFrame(() => {
            clusterRefreshScheduled = false;
            if (typeof window.BARK.rebuildMarkerLayer === 'function') window.BARK.rebuildMarkerLayer();
            if (typeof window.syncState === 'function') window.syncState();
        });
    };

    if (settingsStore && typeof settingsStore.onChange === 'function') {
        settingsStore.onChange('clusteringEnabled', () => {
            syncClusterToggles();
            scheduleClusterRefresh();
        });
        settingsStore.onChange('standardClusteringEnabled', () => {
            syncClusterToggles();
            scheduleClusterRefresh();
        });
        settingsStore.onChange('premiumClusteringEnabled', () => {
            syncClusterToggles();
            scheduleClusterRefresh();
        });
    }

    if (settingsGearBtn && settingsOverlay) {
        renderPerformanceSettings();
        setupRegistryPerformanceToggles();

        // Sync visuals to state
        if (allowUncheckToggle) allowUncheckToggle.checked = window.allowUncheck;
        if (lowGfxToggle) lowGfxToggle.checked = window.lowGfxEnabled;
        if (standardToggle) standardToggle.checked = window.standardClusteringEnabled;
        if (premiumToggle) premiumToggle.checked = window.premiumClusteringEnabled;
        if (simplifyTrailToggle) simplifyTrailToggle.checked = window.simplifyTrails;
        if (instantNavToggle) instantNavToggle.checked = window.instantNav;
        if (rememberMapToggle) rememberMapToggle.checked = window.rememberMapPosition;
        if (motionToggle) motionToggle.checked = window.reducePinMotion;
        if (ultraLowToggle) ultraLowToggle.checked = window.ultraLowEnabled;

        const versionLabel = document.getElementById('settings-app-version');
        if (versionLabel) versionLabel.textContent = window.BARK.APP_VERSION;

        settingsGearBtn.addEventListener('click', () => {
            if (typeof window.BARK.populateTrailWarpGrid === 'function') window.BARK.populateTrailWarpGrid();
            settingsOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        });

        const closeSettings = () => {
            settingsOverlay.classList.remove('active');
            document.body.style.overflow = '';
        };

        closeSettingsBtn.addEventListener('click', closeSettings);
        settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) closeSettings(); });

        if (allowUncheckToggle) {
            allowUncheckToggle.addEventListener('change', (e) => {
                window.allowUncheck = e.target.checked;
                localStorage.setItem('barkAllowUncheck', window.allowUncheck ? 'true' : 'false');
            });
        }

        if (standardToggle) {
            standardToggle.checked = window.standardClusteringEnabled;
            standardToggle.addEventListener('change', (e) => {
                if (settingsStore && typeof settingsStore.set === 'function') {
                    settingsStore.set('standardClusteringEnabled', e.target.checked);
                } else {
                    window.standardClusteringEnabled = e.target.checked;
                    if (typeof window.BARK.rebuildMarkerLayer === 'function') window.BARK.rebuildMarkerLayer();
                    if (typeof window.syncState === 'function') window.syncState();
                }
            });
        }

        if (premiumToggle) {
            premiumToggle.checked = window.premiumClusteringEnabled;
            premiumToggle.addEventListener('change', (e) => {
                if (settingsStore && typeof settingsStore.set === 'function') {
                    settingsStore.set('premiumClusteringEnabled', e.target.checked);
                } else {
                    window.premiumClusteringEnabled = e.target.checked;
                    if (typeof window.BARK.rebuildMarkerLayer === 'function') window.BARK.rebuildMarkerLayer();
                    if (typeof window.syncState === 'function') window.syncState();
                }
            });
        }

        if (motionToggle) {
            motionToggle.checked = window.reducePinMotion;
            motionToggle.addEventListener('change', (e) => {
                const newVal = e.target.checked;
                if (newVal !== window.reducePinMotion) {
                    const msg = newVal
                        ? "Enabling Reduced Pin Resizing requires a page reload. Proceed?"
                        : "Restoring full pin animations requires a page reload. Proceed?";
                    if (window.confirm(msg)) {
                        localStorage.setItem('barkReducePinMotion', newVal ? 'true' : 'false');
                        location.reload();
                    } else {
                        e.target.checked = window.reducePinMotion;
                    }
                }
            });
        }

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
                if (window.disablePinchZoom) map.touchZoom.disable(); else map.touchZoom.enable();
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
                if (window.lockMapPanning) map.dragging.disable(); else map.dragging.enable();
            });
        }

        // Ultra Low Toggle
        if (ultraLowToggle) {
            ultraLowToggle.addEventListener('change', (e) => {
                const isEnabled = e.target.checked;
                const msg = isEnabled ?
                    "⚠️ ENABLE ULTRA-LOW GRAPHICS?\n\nThis will disable all animations and effects.\nPage will reload." :
                    "Switching to High Graphics requires a page reload. Proceed?";
                if (!window.confirm(msg)) { e.target.checked = !isEnabled; return; }

                window.ultraLowEnabled = isEnabled;
                localStorage.setItem('barkUltraLowEnabled', isEnabled ? 'true' : 'false');
                if (isEnabled) {
                    localStorage.setItem('barkLowGfxEnabled', 'true');
                    localStorage.setItem('barkStandardClustering', 'true');
                    localStorage.setItem('barkPremiumClustering', 'false');
                    localStorage.setItem('barkInstantNav', 'true');
                    localStorage.setItem('barkSimplifyTrails', 'true');
                } else {
                    localStorage.setItem('barkLowGfxEnabled', 'false');
                    localStorage.setItem('barkInstantNav', 'false');
                    localStorage.setItem('barkSimplifyTrails', 'false');
                }

                sessionStorage.setItem('skipCloudHydration', 'true');
                setTimeout(() => window.location.reload(true), 150);
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

        // ☢️ TERMINATE & RELOAD
        const terminateBtn = document.getElementById('terminate-reload-btn');
        if (terminateBtn) {
            terminateBtn.addEventListener('click', async () => {
                const proceed = window.confirm("☢️ WARNING: NUCLEAR OPTION ☢️\n\nThis will wipe all local app memory and log you out.\nCloud data remains safe.\n\nProceed?");
                if (proceed) {
                    terminateBtn.textContent = 'TERMINATING...';
                    terminateBtn.style.opacity = '0.5';
                    terminateBtn.disabled = true;
                    try {
                        if (typeof firebase !== 'undefined' && firebase.auth().currentUser && typeof window.BARK.syncUserProgress === 'function') await window.BARK.syncUserProgress();
                        if (typeof firebase !== 'undefined' && firebase.auth().currentUser) await firebase.auth().signOut();
                    } catch (e) { console.error("Non-fatal error during termination", e); }
                    localStorage.clear();
                    window.location.reload(true);
                }
            });
        }

        // ☁️ SAVE SETTINGS TO CLOUD
        const saveSettingsBtn = document.getElementById('save-settings-cloud-btn');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', async () => {
                if (typeof firebase === 'undefined' || !firebase.auth().currentUser) { alert("You must be logged in."); return; }
                const originalText = saveSettingsBtn.innerHTML;
                saveSettingsBtn.innerHTML = '⏳ SAVING...';
                saveSettingsBtn.disabled = true;

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
                    forcePlainMarkers: window.forcePlainMarkers || false,
                    ultraLowEnabled: window.ultraLowEnabled || false,
                    lockMapPanning: window.lockMapPanning || false,
                    disablePinchZoom: window.disablePinchZoom || false,
                    disable1fingerZoom: window.disable1fingerZoom || false,
                    disableDoubleTap: window.disableDoubleTap || false,
                    mapStyle: localStorage.getItem('barkMapStyle') || 'default',
                    visitedFilter: localStorage.getItem('barkVisitedFilter') || 'all'
                };
                Object.entries(settingsRegistry).forEach(([key, setting]) => {
                    if (setting.cloudKey) settingsPayload[setting.cloudKey] = Boolean(window[key]);
                });

                try {
                    await firebase.firestore().collection('users').doc(firebase.auth().currentUser.uid).set({ settings: settingsPayload }, { merge: true });
                    saveSettingsBtn.innerHTML = '✅ SAVED TO CLOUD';
                    setTimeout(() => { saveSettingsBtn.innerHTML = originalText; saveSettingsBtn.disabled = false; }, 2000);
                } catch (error) {
                    console.error("Error saving settings:", error);
                    saveSettingsBtn.innerHTML = '❌ ERROR SAVING';
                    saveSettingsBtn.disabled = false;
                }
            });
        }
    }
};
