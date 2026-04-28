/**
 * app.js - B.A.R.K. Ranger Map Bootstrap Orchestrator
 * Owns boot order only. Feature logic lives in modules, engines, services, and state.
 */
(function () {
    window.BARK = window.BARK || {};

    const _bootErrors = [];

    // async so it catches both synchronous throws and rejected Promises from init functions.
    async function callInit(name, label) {
        if (typeof window.BARK[name] !== 'function') return;
        try {
            await window.BARK[name]();
            if (label) console.log(`  ✓ ${label}`);
        } catch (err) {
            _bootErrors.push(name);
            console.error(`[B.A.R.K. Boot] "${name}" failed — this feature will be unavailable.`, err);
        }
    }

    // async so we can await each callInit and preserve boot order even for future async inits.
    document.addEventListener('DOMContentLoaded', async () => {
        console.log('B.A.R.K. Boot Sequence: Initializing...');

        // 1. Map must exist before data or UI bind to it
        await callInit('initMap', 'Map initialized');

        // 2. Controllers and UI
        await callInit('initSettings', 'Settings initialized');
        await callInit('initUI', 'UI initialized');
        await callInit('initSearchEngine', 'Search engine bound');
        await callInit('initTrailToggles', 'Trail toggles bound');
        await callInit('initSpinWheel', 'Spin wheel initialized');
        await callInit('initManualMiles', 'Manual miles initialized');
        await callInit('initTrainingUI', 'Expedition engine initialized');
        await callInit('initTripPlanner', 'Trip planner initialized');
        await callInit('initWatermarkTool', 'Watermark tool initialized');
        await callInit('initQRCode', 'QR code initialized');
        await callInit('initCSVExport', 'Share engine initialized');

        // 3. Firebase — separate try/catch because a throw here means auth is gone,
        //    not just one feature. Named clearly so the console error is unambiguous.
        try {
            if (window.BARK.services && window.BARK.services.auth) {
                await window.BARK.services.auth.initFirebase();
                console.log('  ✓ Firebase initialized');
            }
        } catch (err) {
            _bootErrors.push('initFirebase');
            console.error('[B.A.R.K. Boot] "initFirebase" failed — auth and cloud sync unavailable.', err);
        }

        // 4. Data loading — grouped because loadData and safeDataPoll are coupled
        try {
            if (typeof window.BARK.loadData === 'function') window.BARK.loadData();
            if (typeof window.BARK.safeDataPoll === 'function') window.BARK.safeDataPoll();
        } catch (err) {
            _bootErrors.push('loadData');
            console.error('[B.A.R.K. Boot] "loadData" failed — map may be empty.', err);
        }

        // 5. Deferred non-critical initializations
        if (typeof window.BARK.safePoll === 'function') {
            setTimeout(() => {
                try { window.BARK.safePoll(); }
                catch (err) { console.error('[B.A.R.K. Boot] "safePoll" failed.', err); }
            }, 2000);
        }

        if (typeof window.BARK.updateTripUI === 'function') {
            setTimeout(() => {
                try { window.BARK.updateTripUI(); }
                catch (err) { console.error('[B.A.R.K. Boot] "updateTripUI" failed.', err); }
            }, 500);
        }

        if (_bootErrors.length === 0) {
            console.log('✅ B.A.R.K. Boot Sequence: Complete');
        } else {
            console.warn(`⚠️ B.A.R.K. Boot Sequence: Complete with ${_bootErrors.length} error(s): [${_bootErrors.join(', ')}]`);
        }
    });
})();
