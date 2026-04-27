/**
 * app.js — B.A.R.K. Ranger Map Bootstrap Orchestrator
 * 
 * This file is the ENTRY POINT. It contains zero business logic.
 * All functionality lives in the /modules/ directory.
 * 
 * STRICT BOOT SEQUENCE:
 *   1. barkState.js      → window.BARK namespace, all state, localStorage hydration
 *   2. barkConfig.js     → Constants (TOP_10_TRAILS, normalizationDict, firebaseConfig)
 *   3. mapEngine.js      → Leaflet map, tile layers, controls, marker layers, zoom engine
 *   4. renderEngine.js   → updateMarkers(), syncState(), safeUpdateHTML()
 *   5. searchEngine.js   → Search bar, Levenshtein, geocoder
 *   6. dataService.js    → CSV polling, Firebase auth, Firestore sync
 *   7. profileEngine.js  → Gamification, leaderboard, stats, achievements
 *   8. expeditionEngine.js → Virtual expeditions, WalkTracker, trail overlays
 *   9. tripPlannerCore.js → Trip builder, route generation, optimization
 *  10. shareEngine.js    → Export/share, QR codes, watermark
 *  11. settingsController.js → Settings modal, toggles, cloud sync
 *  12. uiController.js   → Navigation, panels, modals, iOS fixes
 *  13. app.js (this file) → Boot sequence trigger
 * 
 * v26 — Modular Architecture
 */

(function bootBARK() {
    'use strict';

    console.log('🐾 B.A.R.K. Boot Sequence: Initializing...');

    // ── PHASE 1: Initialize Firebase ──
    if (typeof window.BARK.initFirebase === 'function') {
        window.BARK.initFirebase();
        console.log('  ✅ Firebase initialized');
    }

    // ── PHASE 2: Bind Search Engine to DOM ──
    if (typeof window.BARK.initSearchEngine === 'function') {
        window.BARK.initSearchEngine();
        console.log('  ✅ Search engine bound');
    }

    // ── PHASE 3: Initialize Trail Overlay Toggles ──
    if (typeof window.BARK.initTrailToggles === 'function') {
        window.BARK.initTrailToggles();
        console.log('  ✅ Trail toggles bound');
    }

    // ── PHASE 4: Initialize Expedition UI ──
    if (typeof window.BARK.initSpinWheel === 'function') {
        window.BARK.initSpinWheel();
    }
    if (typeof window.BARK.initManualMiles === 'function') {
        window.BARK.initManualMiles();
    }
    if (typeof window.BARK.initTrainingUI === 'function') {
        window.BARK.initTrainingUI();
        console.log('  ✅ Expedition engine initialized');
    }

    // ── PHASE 5: Initialize Trip Planner ──
    if (typeof window.BARK.initTripPlanner === 'function') {
        window.BARK.initTripPlanner();
        console.log('  ✅ Trip planner initialized');
    }

    // ── PHASE 6: Initialize Share/Export Tools ──
    if (typeof window.BARK.initWatermarkTool === 'function') {
        window.BARK.initWatermarkTool();
    }
    if (typeof window.BARK.initQRCode === 'function') {
        window.BARK.initQRCode();
    }
    if (typeof window.BARK.initCSVExport === 'function') {
        window.BARK.initCSVExport();
        console.log('  ✅ Share engine initialized');
    }

    // ── PHASE 7: Load Map Data (CSV from cache + network poll) ──
    if (typeof window.BARK.loadData === 'function') {
        window.BARK.loadData();
        console.log('  ✅ Data loading started');
    }

    // ── PHASE 8: Start Background Polling ──
    if (typeof window.BARK.safeDataPoll === 'function') {
        window.BARK.safeDataPoll();
    }

    // ── PHASE 9: Start Version Checker ──
    if (typeof window.BARK.safePoll === 'function') {
        setTimeout(() => window.BARK.safePoll(), 2000);
    }

    // ── PHASE 10: Force Trip Planner UI render ──
    if (typeof window.BARK.updateTripUI === 'function') {
        setTimeout(() => window.BARK.updateTripUI(), 500);
    }

    console.log('🐾 B.A.R.K. Boot Sequence: Complete!');
})();
