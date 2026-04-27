/**
 * app.js - B.A.R.K. Ranger Map Bootstrap Orchestrator
 * Owns boot order only. Feature logic lives in modules, engines, services, and state.
 */
(function () {
    window.BARK = window.BARK || {};

    function callInit(name, label) {
        if (typeof window.BARK[name] !== 'function') return;
        window.BARK[name]();
        if (label) console.log(`  OK ${label}`);
    }

    document.addEventListener('DOMContentLoaded', () => {
        console.log('B.A.R.K. Boot Sequence: Initializing...');

        // 1. Initialize Map (must exist before data/UI bind to it)
        if (window.BARK.initMap) window.BARK.initMap();

        // 2. Initialize Controllers/UI
        if (window.BARK.initSettings) window.BARK.initSettings();
        if (window.BARK.initUI) window.BARK.initUI();
        callInit('initSearchEngine', 'Search engine bound');
        callInit('initTrailToggles', 'Trail toggles bound');
        callInit('initSpinWheel');
        callInit('initManualMiles');
        callInit('initTrainingUI', 'Expedition engine initialized');
        callInit('initTripPlanner', 'Trip planner initialized');
        callInit('initWatermarkTool');
        callInit('initQRCode');
        callInit('initCSVExport', 'Share engine initialized');

        // 3. Initialize Firebase & Auth (This triggers onSnapshot -> hydration -> syncState)
        if (window.BARK.services && window.BARK.services.auth) {
            window.BARK.services.auth.initFirebase();
        }

        // 4. Load CSV Data
        if (window.BARK.loadData) {
            window.BARK.loadData();
        }

        if (typeof window.BARK.safeDataPoll === 'function') {
            window.BARK.safeDataPoll();
        }

        if (typeof window.BARK.safePoll === 'function') {
            setTimeout(() => window.BARK.safePoll(), 2000);
        }

        if (typeof window.BARK.updateTripUI === 'function') {
            setTimeout(() => window.BARK.updateTripUI(), 500);
        }

        console.log('B.A.R.K. Boot Sequence: Complete!');
    });
})();
