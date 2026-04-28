/**
 * uiController.js — Navigation, Slide Panel, Filter Panel, Modals, iOS Fixes
 * Loaded TWELFTH in the boot sequence.
 */
window.BARK = window.BARK || {};

window.BARK.initUI = function initUI() {
// ====== iOS SAFARI MAGNIFIER PROTECTION ======
document.addEventListener('contextmenu', function (e) {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
    }
});

// ====== iOS KEYBOARD LAYOUT FIX ======
if (window.visualViewport) {
    let initialHeight = window.visualViewport.height;

    window.visualViewport.addEventListener('resize', () => {
        const isKeyboardOpen = (initialHeight - window.visualViewport.height) > window.screen.height * 0.2;
        document.body.classList.toggle('keyboard-open', isKeyboardOpen);
        if (isKeyboardOpen && window.innerWidth < 768) {
            const slidePanel = document.querySelector('.slide-panel');
            if (slidePanel) slidePanel.classList.remove('open');
        }
    });

    window.addEventListener('orientationchange', () => {
        setTimeout(() => { initialHeight = window.visualViewport.height; }, 500);
    });
}

// ====== DOM ELEMENTS ======
const slidePanel = document.getElementById('slide-panel');
const closeSlideBtn = document.getElementById('close-slide-panel');
const navItems = document.querySelectorAll('.nav-item');
const uiViews = document.querySelectorAll('.ui-view');
const filterPanel = document.getElementById('filter-panel');
const leafletControls = document.querySelectorAll('.leaflet-control-container');

function initUIEventListeners() {
    const bindClick = (id, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    };

    // ====== STATIC INLINE HANDLER REPLACEMENTS ======
    bindClick('auto-sort-day-btn', () => {
        if (typeof window.autoSortDay === 'function') window.autoSortDay();
    });
    bindClick('planner-load-btn', () => {
        if (typeof window.togglePlannerRoutes === 'function') window.togglePlannerRoutes();
    });
    bindClick('planner-routes-close-btn', () => {
        if (typeof window.togglePlannerRoutes === 'function') window.togglePlannerRoutes();
    });
    bindClick('share-single-expedition-btn', () => {
        if (typeof window.shareSingleExpedition === 'function') window.shareSingleExpedition();
    });
    bindClick('claim-reward-btn', () => {
        if (typeof window.claimRewardAndReset === 'function') window.claimRewardAndReset();
    });
    bindClick('fly-active-trail-btn', () => {
        if (typeof window.flyToActiveTrail === 'function') window.flyToActiveTrail();
    });
    bindClick('trail-brief-btn', () => {
        const modal = document.getElementById('trail-education-modal');
        if (modal) modal.style.display = 'flex';
    });
    bindClick('training-action-btn', () => {
        if (typeof window.handleTrainingClick === 'function') window.handleTrainingClick();
    });
    bindClick('cancel-training-btn', () => {
        if (typeof window.cancelTrainingWalk === 'function') window.cancelTrainingWalk();
    });
    bindClick('share-all-expeditions-btn', () => {
        if (typeof window.shareAllExpeditions === 'function') window.shareAllExpeditions();
    });
    bindClick('share-vault-btn', () => {
        if (typeof window.shareVaultCard === 'function') window.shareVaultCard();
    });
    bindClick('optimizer-modal-close-btn', () => {
        const modal = document.getElementById('optimizer-modal');
        if (modal) modal.style.display = 'none';
    });
    bindClick('execute-smart-optimization-btn', () => {
        if (typeof window.executeSmartOptimization === 'function') window.executeSmartOptimization();
    });
    bindClick('trail-education-close-btn', () => {
        const modal = document.getElementById('trail-education-modal');
        if (modal) modal.style.display = 'none';
    });
}

initUIEventListeners();

// Stop Leaflet from stealing touches on the UI panels
if (slidePanel) {
    L.DomEvent.disableClickPropagation(slidePanel);
    L.DomEvent.disableScrollPropagation(slidePanel);
}

// Close panel and clear pin
if (closeSlideBtn) {
    closeSlideBtn.addEventListener('click', () => {
        slidePanel.classList.remove('open');
        window.BARK.clearActivePin();
    });
}

// ====== NAVIGATION LOGIC ======
navItems.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');

        navItems.forEach(n => n.classList.remove('active'));
        btn.classList.add('active');

        if (targetId === 'map-view') {
            uiViews.forEach(v => v.classList.remove('active'));
            requestAnimationFrame(() => {
                if (filterPanel) filterPanel.style.display = 'flex';
                if (leafletControls.length) leafletControls[0].style.display = 'block';
                if (window.map) window.map.invalidateSize();
                if (typeof window.BARK.invalidateMarkerVisibility === 'function') {
                    window.BARK.invalidateMarkerVisibility();
                }
                if (typeof window.syncState === 'function') {
                    window.BARK._pendingMarkerSync = false;
                    window.syncState();
                }
            });
        } else {
            uiViews.forEach(v => {
                if (v.id === targetId) v.classList.add('active');
                else v.classList.remove('active');
            });
            if (filterPanel) filterPanel.style.display = 'none';
            if (slidePanel) slidePanel.classList.remove('open');
            if (leafletControls.length) leafletControls[0].style.display = 'none';
        }
    });
});

// ====== MAP INTERACTION HANDLERS ======
if (window.map) {
    // Close panel when clicking on map
    map.on('click', () => {
        if (slidePanel) slidePanel.classList.remove('open');
        window.BARK.clearActivePin();
        document.getElementById('filter-panel').classList.add('collapsed');
    });

    // Auto-collapse filter when user pans
    map.on('movestart', () => {
        const fp = document.getElementById('filter-panel');
        if (fp && !fp.classList.contains('collapsed')) fp.classList.add('collapsed');
    });
}

// Toggle filter panel
const toggleFilterBtn = document.getElementById('toggle-filter-btn');
if (toggleFilterBtn) {
    toggleFilterBtn.addEventListener('click', () => {
        document.getElementById('filter-panel').classList.toggle('collapsed');
    });
}

// ====== VISITED FILTER DROPDOWN ======
const visitedFilterEl = document.getElementById('visited-filter');
if (visitedFilterEl) {
    visitedFilterEl.value = window.BARK.visitedFilterState;
    visitedFilterEl.addEventListener('change', (e) => {
        window.BARK.visitedFilterState = e.target.value;
        localStorage.setItem('barkVisitedFilter', window.BARK.visitedFilterState);
        window.syncState();
    });
}

// ====== SCORING MODAL ======
document.addEventListener('click', (e) => {
    const modal = document.getElementById('scoring-modal');
    if (!modal) return;
    if (e.target.closest('#scoring-info-btn')) modal.style.display = 'flex';
    if (e.target.closest('#close-scoring-modal') || e.target === modal) modal.style.display = 'none';
});

// ====== FEEDBACK PORTAL ======
const submitFeedbackBtn = document.getElementById('submit-feedback-btn');
if (submitFeedbackBtn && typeof firebase !== 'undefined') {
    submitFeedbackBtn.addEventListener('click', () => {
        const textArea = document.getElementById('feedback-text');
        const text = textArea ? textArea.value : '';
        if (!text || text.trim() === '') return;

        const user = firebase.auth().currentUser;
        const sender = user ? (user.displayName || user.uid) : 'Anonymous Guest';

        submitFeedbackBtn.textContent = 'Submitting...';
        submitFeedbackBtn.disabled = true;

        window.BARK.incrementRequestCount();
        firebase.firestore().collection('feedback').add({
            text: text,
            sender: sender,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            submitFeedbackBtn.textContent = 'Feedback Sent!';
            if (textArea) textArea.value = '';
            setTimeout(() => { submitFeedbackBtn.textContent = 'Submit Feedback'; submitFeedbackBtn.disabled = false; }, 3000);
        }).catch(err => {
            console.error('Feedback error:', err);
            submitFeedbackBtn.textContent = 'Error. Try again';
            submitFeedbackBtn.disabled = false;
        });
    });
}

// ====== UPDATE TOAST ======
const refreshBtn = document.getElementById('refresh-btn');
if (refreshBtn) {
    refreshBtn.addEventListener('click', () => window.location.reload(true));
}
};
