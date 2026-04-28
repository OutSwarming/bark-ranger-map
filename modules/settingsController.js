/**
 * settingsController.js — Settings Modal, Toggles, Cloud Sync, Terminate & Reload
 * Loaded ELEVENTH in the boot sequence.
 */
window.BARK = window.BARK || {};

window.BARK.initSettings = function initSettings() {
    const settingsGearBtn = document.getElementById('settings-gear-btn');
    const settingsOverlay = document.getElementById('settings-overlay');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const standardToggle = document.getElementById('standard-cluster-toggle');
    const premiumToggle = document.getElementById('premium-cluster-toggle');
    const rememberMapToggle = document.getElementById('remember-map-toggle');
    const motionToggle = document.getElementById('reduce-motion-toggle');
    const ultraLowToggle = document.getElementById('ultra-low-toggle');
    const settingsStore = window.BARK.settings;
    const settingsRegistry = window.BARK.SETTINGS_REGISTRY || {};
    const performanceSettingKeys = window.BARK.PERFORMANCE_SETTING_KEYS || [];

    const syncRegisteredControls = () => {
        const lowGraphicsActive = Boolean(window.lowGfxEnabled);
        const lowGraphicsPreset = window.BARK.LOW_GRAPHICS_PRESET || {};
        Object.keys(settingsRegistry).forEach((key) => {
            const setting = settingsRegistry[key];
            if (!setting) return;

            const input = document.getElementById(setting.elementId);
            const row = input ? input.closest('[data-setting-key]') : null;
            if (!input) return;

            input.checked = Boolean(window[key]);
            input.disabled = lowGraphicsActive && !setting.master && Object.prototype.hasOwnProperty.call(lowGraphicsPreset, key);
            if (row) row.style.opacity = input.disabled ? '0.62' : '1';
        });
        syncClusterToggles();
    };

    const renderPerformanceSettings = () => {
        const masterContainer = document.getElementById('performance-settings-master');
        const container = document.getElementById('performance-settings-registry');
        if (!container || container.dataset.rendered === 'true') return;

        const renderRows = (keys) => keys.map((key) => {
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

        if (masterContainer) {
            masterContainer.innerHTML = renderRows(performanceSettingKeys.filter((key) => settingsRegistry[key] && settingsRegistry[key].master));
        }
        container.innerHTML = renderRows(performanceSettingKeys.filter((key) => settingsRegistry[key] && !settingsRegistry[key].master));
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

    const applyGestureSettings = () => {
        if (!window.map) return;
        if (window.lockMapPanning) window.map.dragging.disable();
        else window.map.dragging.enable();

        if (window.map.touchZoom) {
            if (window.disablePinchZoom) window.map.touchZoom.disable();
            else window.map.touchZoom.enable();
        }
    };

    let effectFrame = null;
    const pendingImpacts = new Set();
    const scheduleRegistrySettingEffects = (setting) => {
        if (!setting) return;
        pendingImpacts.add(setting.impact);
        if (effectFrame) return;

        effectFrame = requestAnimationFrame(() => {
            effectFrame = null;
            const impacts = new Set(pendingImpacts);
            pendingImpacts.clear();

            if (typeof window.BARK.applyGlobalStyles === 'function') window.BARK.applyGlobalStyles();
            if (impacts.has(window.BARK.SETTING_IMPACTS.MAP_GESTURE)) applyGestureSettings();
            if (impacts.has(window.BARK.SETTING_IMPACTS.MAP_BEHAVIOR) && typeof window.BARK.applyMapPerformancePolicy === 'function') {
                window.BARK.applyMapPerformancePolicy();
            }
            if (impacts.has(window.BARK.SETTING_IMPACTS.MARKER_LAYER) && typeof window.BARK.rebuildMarkerLayer === 'function') {
                window.BARK.rebuildMarkerLayer();
            }
            if (impacts.has(window.BARK.SETTING_IMPACTS.TRAIL_RENDER)) {
                refreshTrailRendering();
            }
            if (typeof window.syncState === 'function') window.syncState();
        });
    };

    const setupRegistryToggles = () => {
        Object.keys(settingsRegistry).forEach((key) => {
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
                    syncRegisteredControls();
                    scheduleRegistrySettingEffects(setting);
                }
            });

            if (settingsStore && typeof settingsStore.onChange === 'function') {
                settingsStore.onChange(key, () => {
                    syncRegisteredControls();
                    scheduleRegistrySettingEffects(setting);
                });
            }
        });

        syncRegisteredControls();
    };

    window.BARK.syncSettingsControls = function syncSettingsControls() {
        syncRegisteredControls();
    };

    const syncClusterToggles = () => {
        const lowGraphicsActive = Boolean(window.lowGfxEnabled);
        const preset = window.BARK.LOW_GRAPHICS_PRESET || {};
        const standardRow = standardToggle ? standardToggle.closest('[data-cluster-setting]') : null;
        const premiumRow = premiumToggle ? premiumToggle.closest('[data-cluster-setting]') : null;

        if (standardToggle) {
            standardToggle.checked = lowGraphicsActive ? preset.standardClusteringEnabled === true : window.standardClusteringEnabled;
            standardToggle.disabled = lowGraphicsActive;
        }
        if (premiumToggle) {
            premiumToggle.checked = lowGraphicsActive ? preset.premiumClusteringEnabled === true : window.premiumClusteringEnabled;
            premiumToggle.disabled = lowGraphicsActive;
        }
        if (standardRow) standardRow.style.opacity = lowGraphicsActive ? '0.62' : '1';
        if (premiumRow) premiumRow.style.opacity = lowGraphicsActive ? '0.62' : '1';
    };

    if (settingsGearBtn && settingsOverlay) {
        renderPerformanceSettings();
        setupRegistryToggles();

        // Sync visuals to state
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
                    rememberMapPosition: window.rememberMapPosition || false,
                    startNationalView: window.startNationalView || false,
                    ultraLowEnabled: window.ultraLowEnabled || false,
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
