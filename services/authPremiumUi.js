/**
 * authPremiumUi.js - Premium control gating for entitlement state changes.
 */
window.BARK = window.BARK || {};

(function () {
    function setTrailButtonState(buttons, isUnlocked) {
        buttons.forEach(btn => {
            if (isUnlocked) {
                btn.disabled = false;
                btn.setAttribute('aria-disabled', 'false');
            } else {
                btn.classList.remove('active');
                btn.disabled = true;
                btn.setAttribute('aria-disabled', 'true');
            }
        });
    }

    function applyPremiumGating(isPremium, options = {}) {
        try {
            const premiumWrap = document.getElementById('premium-filters-wrap');
            const visitedSelect = document.getElementById('visited-filter');
            const mapStyleSelectF = document.getElementById('map-style-select');
            const trailButtons = [
                document.getElementById('toggle-virtual-trail'),
                document.getElementById('toggle-completed-trails')
            ].filter(Boolean);
            const trailsUnlocked = options.trailsUnlocked === undefined ? isPremium : options.trailsUnlocked === true;

            if (premiumWrap) {
                if (isPremium) {
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

            setTrailButtonState(trailButtons, trailsUnlocked);
        } catch (error) {
            console.error("[authService] premium gating failed:", error);
        }
    }

    window.BARK.authPremiumUi = {
        applyPremiumGating
    };
})();
