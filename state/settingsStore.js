/**
 * settingsStore.js - Mirrored persistent settings store.
 * Loaded after legacy hydration so it can preserve current boot timing.
 */
(function () {
    window.BARK = window.BARK || {};

    const STORAGE_KEYS = {
        allowUncheck: 'barkAllowUncheck',
        standardClusteringEnabled: 'barkStandardClustering',
        premiumClusteringEnabled: 'barkPremiumClustering',
        lowGfxEnabled: 'barkLowGfxEnabled',
        simplifyTrails: 'barkSimplifyTrails',
        instantNav: 'barkInstantNav',
        rememberMapPosition: 'remember-map-toggle',
        startNationalView: 'barkNationalView',
        stopAutoMovements: 'barkStopAutoMove',
        reducePinMotion: 'barkReducePinMotion',
        removeShadows: 'barkRemoveShadows',
        stopResizing: 'barkStopResizing',
        viewportCulling: 'barkViewportCulling',
        ultraLowEnabled: 'barkUltraLowEnabled',
        lockMapPanning: 'barkLockMapPanning',
        disable1fingerZoom: 'barkDisable1Finger',
        disableDoubleTap: 'barkDisableDoubleTap',
        disablePinchZoom: 'barkDisablePinchZoom'
    };

    const SETTING_KEYS = Object.keys(STORAGE_KEYS);
    const DERIVED_KEYS = new Set(['clusteringEnabled']);
    const values = {};
    const listeners = new Map();

    function normalizeBoolean(value) {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return Boolean(value);
    }

    function assertKnownKey(key) {
        if (!Object.prototype.hasOwnProperty.call(STORAGE_KEYS, key) && !DERIVED_KEYS.has(key)) {
            throw new Error(`Unknown BARK settings key: ${key}`);
        }
    }

    function persist(key, value) {
        const storageKey = STORAGE_KEYS[key];
        if (!storageKey) return;

        try {
            localStorage.setItem(storageKey, normalizeBoolean(value) ? 'true' : 'false');
        } catch (error) {
            console.error(`Failed to persist BARK setting "${key}" to localStorage.`, error);
            throw error;
        }
    }

    function notify(key, value, previousValue) {
        const callbacks = listeners.get(key);
        if (!callbacks) return;

        callbacks.forEach((callback) => {
            try {
                callback(value, previousValue, key);
            } catch (error) {
                console.error(`BARK settings listener failed for "${key}".`, error);
            }
        });
    }

    function getDerivedValue(key) {
        if (key === 'clusteringEnabled') {
            return values.standardClusteringEnabled || values.premiumClusteringEnabled;
        }
        throw new Error(`Unknown derived BARK settings key: ${key}`);
    }

    function get(key) {
        assertKnownKey(key);
        if (DERIVED_KEYS.has(key)) return getDerivedValue(key);
        return values[key];
    }

    function applyValue(key, value) {
        const normalizedValue = normalizeBoolean(value);
        const previousValue = values[key];

        values[key] = normalizedValue;
        persist(key, normalizedValue);

        if (!Object.is(previousValue, normalizedValue)) {
            notify(key, normalizedValue, previousValue);
        }
    }

    function set(key, value) {
        assertKnownKey(key);

        if (DERIVED_KEYS.has(key)) {
            throw new Error(`BARK setting "${key}" is derived and cannot be set directly.`);
        }

        const previousClusterState = get('clusteringEnabled');
        applyValue(key, value);

        if (key === 'ultraLowEnabled' && values.ultraLowEnabled) {
            applyValue('lowGfxEnabled', true);
            applyValue('standardClusteringEnabled', true);
            applyValue('instantNav', true);
            applyValue('simplifyTrails', true);
        }

        const nextClusterState = get('clusteringEnabled');
        if (!Object.is(previousClusterState, nextClusterState)) {
            notify('clusteringEnabled', nextClusterState, previousClusterState);
        }
    }

    function onChange(key, callback) {
        assertKnownKey(key);

        if (typeof callback !== 'function') {
            throw new Error(`BARK settings listener for "${key}" must be a function.`);
        }

        if (!listeners.has(key)) listeners.set(key, new Set());
        listeners.get(key).add(callback);

        return function unsubscribe() {
            listeners.get(key).delete(callback);
        };
    }

    function hydrateFromLegacyGlobals() {
        SETTING_KEYS.forEach((key) => {
            values[key] = normalizeBoolean(window[key]);
        });

        if (values.ultraLowEnabled) {
            values.lowGfxEnabled = true;
            values.standardClusteringEnabled = true;
            values.instantNav = true;
            values.simplifyTrails = true;
        }
    }

    function installLegacyWindowMirrors() {
        SETTING_KEYS.forEach((key) => {
            Object.defineProperty(window, key, {
                configurable: true,
                enumerable: true,
                get() {
                    return get(key);
                },
                set(value) {
                    set(key, value);
                }
            });
        });

        Object.defineProperty(window, 'clusteringEnabled', {
            configurable: true,
            enumerable: true,
            get() {
                return get('clusteringEnabled');
            },
            set() {
                // Legacy callers still assign this after cluster toggles. The value is derived.
            }
        });
    }

    hydrateFromLegacyGlobals();
    installLegacyWindowMirrors();

    window.BARK.settings = {
        get,
        set,
        onChange
    };
})();
