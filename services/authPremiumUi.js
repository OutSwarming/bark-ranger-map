/**
 * authPremiumUi.js - Premium control gating for auth state changes.
 */
window.BARK = window.BARK || {};

(function () {
    function applyPremiumGating(isLoggedIn) {
        try {
            const premiumWrap = document.getElementById('premium-filters-wrap');
            const visitedSelect = document.getElementById('visited-filter');
            const mapStyleSelectF = document.getElementById('map-style-select');
            const trailButtons = [
                document.getElementById('toggle-virtual-trail'),
                document.getElementById('toggle-completed-trails')
            ].filter(Boolean);

            if (premiumWrap) {
                if (isLoggedIn) {
                    premiumWrap.classList.remove('premium-locked');
                    premiumWrap.classList.add('premium-unlocked');
                    if (visitedSelect) visitedSelect.disabled = false;
                    if (mapStyleSelectF) mapStyleSelectF.disabled = false;
                    trailButtons.forEach(btn => {
                        btn.disabled = false;
                        btn.setAttribute('aria-disabled', 'false');
                    });
                } else {
                    premiumWrap.classList.add('premium-locked');
                    premiumWrap.classList.remove('premium-unlocked');
                    if (visitedSelect) { visitedSelect.disabled = true; visitedSelect.value = 'all'; }
                    if (mapStyleSelectF) { mapStyleSelectF.disabled = true; mapStyleSelectF.value = 'default'; }
                    trailButtons.forEach(btn => {
                        btn.classList.remove('active');
                        btn.disabled = true;
                        btn.setAttribute('aria-disabled', 'true');
                    });
                }
            }
        } catch (error) {
            console.error("[authService] premium gating failed:", error);
        }
    }

    window.BARK.authPremiumUi = {
        applyPremiumGating
    };
})();
