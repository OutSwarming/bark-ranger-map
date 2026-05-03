/**
 * paywallController.js - Internal test-mode paywall UI and checkout handoff.
 *
 * Premium unlock remains read-only from Firestore entitlement via premiumService.
 */
(function () {
    window.BARK = window.BARK || {};
    window.BARK.services = window.BARK.services || {};

    const PRICE_COPY = '$9.99/year';
    const PROVIDER = 'lemonsqueezy';
    const DEFAULT_VERIFYING_FALLBACK_MS = 15000;

    let initialized = false;
    let lastSource = 'manual';
    let returnState = null;
    let returnStateStartedAt = null;
    let checkoutInFlight = false;
    let unsubscribePremium = null;
    let verificationFallbackTimer = null;

    function getElement(id) {
        return document.getElementById(id);
    }

    function getPremiumService() {
        return window.BARK.services && window.BARK.services.premium;
    }

    function getCurrentUser() {
        try {
            return typeof firebase !== 'undefined' && firebase.auth
                ? firebase.auth().currentUser
                : null;
        } catch (error) {
            return null;
        }
    }

    function isPremiumActive() {
        const premiumService = getPremiumService();
        return Boolean(
            premiumService &&
            typeof premiumService.isPremium === 'function' &&
            premiumService.isPremium()
        );
    }

    function getEntitlement() {
        const premiumService = getPremiumService();
        return premiumService && typeof premiumService.getEntitlement === 'function'
            ? premiumService.getEntitlement()
            : { premium: false, status: 'free', source: 'none' };
    }

    function getReturnStateFromUrl() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('provider') !== PROVIDER) return null;
        const checkout = params.get('checkout');
        if (checkout === 'success' || checkout === 'canceled') return checkout;
        return null;
    }

    function clearCheckoutParams() {
        const url = new URL(window.location.href);
        url.searchParams.delete('checkout');
        url.searchParams.delete('provider');
        window.history.replaceState({}, document.title, url.toString());
        returnState = null;
        returnStateStartedAt = null;
        renderCurrentState();
    }

    function setText(id, text) {
        const node = getElement(id);
        if (node) node.textContent = text;
    }

    function setVisible(id, visible) {
        const node = getElement(id);
        if (!node) return;
        node.hidden = !visible;
    }

    function setButtonState(button, options) {
        if (!button) return;
        button.textContent = options.text;
        button.disabled = options.disabled === true;
        button.dataset.mode = options.mode || '';
    }

    function getInactiveCopy(status) {
        if (status === 'past_due') {
            return 'Premium is past due on this account. You can upgrade again when ready.';
        }
        if (status === 'expired') {
            return 'Premium has expired on this account. You can upgrade again when ready.';
        }
        if (status === 'canceled') {
            return 'Premium is not active on this account. You can upgrade again when ready.';
        }
        return 'Premium is not active on this account.';
    }

    function getFreeUpgradeCopy() {
        if (lastSource === 'route-generation') {
            return {
                title: 'Route generation is a Premium feature',
                eyebrow: 'Premium routing',
                body: 'Upgrade to generate driving routes between trip stops. Free accounts can still plan stops without calling premium routing.',
                primaryText: 'Upgrade Now'
            };
        }

        if (lastSource === 'cloud-settings-sync') {
            return {
                title: 'Cloud settings sync is a Premium feature',
                eyebrow: 'Premium sync',
                body: 'Local settings save automatically on this device. Upgrade to sync your preferences across devices.',
                primaryText: 'Upgrade Now'
            };
        }

        return {
            title: 'Upgrade to BARK Ranger Premium',
            eyebrow: 'Annual plan',
            body: 'Unlock the premium map tools for one annual plan.',
            primaryText: 'Continue to secure checkout'
        };
    }

    function getVerifyingFallbackMs() {
        const configured = Number(window.BARK && window.BARK.PAYWALL_VERIFYING_FALLBACK_MS);
        return Number.isFinite(configured) && configured >= 0
            ? configured
            : DEFAULT_VERIFYING_FALLBACK_MS;
    }

    function getReturnStateElapsedMs() {
        return returnStateStartedAt ? Date.now() - returnStateStartedAt : 0;
    }

    function clearVerificationFallbackTimer() {
        if (!verificationFallbackTimer) return;
        clearTimeout(verificationFallbackTimer);
        verificationFallbackTimer = null;
    }

    function scheduleVerificationFallbackRender(state) {
        clearVerificationFallbackTimer();
        if (!state || state.mode !== 'verifying') return;

        const remainingMs = Math.max(0, getVerifyingFallbackMs() - getReturnStateElapsedMs());
        verificationFallbackTimer = setTimeout(() => {
            verificationFallbackTimer = null;
            renderCurrentState();
        }, remainingMs + 25);
    }

    function getState() {
        const user = getCurrentUser();
        const entitlement = getEntitlement();

        if (returnState === 'canceled') {
            return {
                mode: 'canceled',
                title: 'Checkout canceled',
                eyebrow: 'No charge',
                body: 'Checkout canceled. No charge was made, and your account is still on Free.',
                primaryText: user ? 'Continue to secure checkout' : 'Sign in to upgrade',
                secondaryVisible: true,
                clearVisible: true
            };
        }

        if (returnState === 'success' && !isPremiumActive() && !user) {
            return {
                mode: 'verify-signed-out',
                title: 'Sign in to verify premium',
                eyebrow: 'Account required',
                body: 'Checkout returned, but no signed-in account is available. Sign in with the same account used at checkout to verify premium.',
                primaryText: 'Sign in to verify premium',
                secondaryVisible: true,
                clearVisible: true
            };
        }

        if (returnState === 'success' && !isPremiumActive()) {
            if (getReturnStateElapsedMs() >= getVerifyingFallbackMs()) {
                return {
                    mode: 'verification-delayed',
                    title: 'Still verifying premium',
                    eyebrow: 'Payment pending',
                    body: 'Still verifying premium. Refresh this page, or contact support with the email on this account if premium does not appear.',
                    primaryText: 'Refresh account status',
                    secondaryVisible: true,
                    clearVisible: true
                };
            }

            return {
                mode: 'verifying',
                title: 'Verifying payment...',
                eyebrow: 'Payment pending',
                body: 'Checkout finished. Premium unlocks only after the verified webhook updates this account.',
                primaryText: 'Checking account...',
                primaryDisabled: true,
                secondaryVisible: true,
                clearVisible: true
            };
        }

        if (!user) {
            return {
                mode: 'signed-out',
                title: 'Sign in to upgrade',
                eyebrow: 'Account required',
                body: 'Sign in first so premium can be attached to your BARK Ranger account. You can use Google or email/password.',
                primaryText: 'Sign in to upgrade',
                secondaryVisible: true,
                clearVisible: returnState !== null
            };
        }

        if (isPremiumActive()) {
            const activeCopy = entitlement.status === 'manual_active'
                ? 'Premium is active through a manual account grant.'
                : 'Premium is active on this account.';
            return {
                mode: 'premium',
                title: 'Premium active',
                eyebrow: 'Unlocked',
                body: activeCopy,
                primaryText: 'Premium is active',
                primaryDisabled: true,
                secondaryVisible: true,
                clearVisible: returnState !== null
            };
        }

        if (['past_due', 'expired', 'canceled'].includes(entitlement.status)) {
            return {
                mode: 'inactive',
                title: 'Premium inactive',
                eyebrow: entitlement.status.replace('_', ' '),
                body: getInactiveCopy(entitlement.status),
                primaryText: 'Continue to secure checkout',
                secondaryVisible: true,
                clearVisible: returnState !== null
            };
        }

        const freeCopy = getFreeUpgradeCopy();
        return {
            mode: 'free',
            title: freeCopy.title,
            eyebrow: freeCopy.eyebrow,
            body: freeCopy.body,
            primaryText: freeCopy.primaryText,
            secondaryVisible: true,
            clearVisible: returnState !== null
        };
    }

    function renderProfileCard(state) {
        const card = getElement('profile-premium-card');
        if (!card) return;

        const mode = state.mode;
        card.dataset.paywallState = mode;
        setText('profile-premium-eyebrow', mode === 'premium' ? 'Premium' : 'Premium map tools');
        setText('profile-premium-price', mode === 'premium' ? 'Active' : PRICE_COPY);

        if (mode === 'premium') {
            setText('profile-premium-status', 'Premium active');
            setText('profile-premium-copy', state.body);
            setButtonState(getElement('profile-premium-action'), {
                text: 'Premium is active',
                disabled: true,
                mode
            });
            return;
        }

        if (mode === 'signed-out' || mode === 'verify-signed-out') {
            setText('profile-premium-status', 'Sign in first');
            setText('profile-premium-copy', mode === 'verify-signed-out'
                ? 'Sign in with the same account used at checkout to verify premium.'
                : 'Create or open your account before starting checkout.');
            setButtonState(getElement('profile-premium-action'), {
                text: mode === 'verify-signed-out' ? 'Sign in to verify premium' : 'Sign in to upgrade',
                mode
            });
            return;
        }

        if (mode === 'verifying' || mode === 'verification-delayed') {
            setText('profile-premium-status', mode === 'verification-delayed' ? 'Still verifying premium' : 'Verifying payment...');
            setText('profile-premium-copy', mode === 'verification-delayed'
                ? 'Refresh this page, or contact support with the email on this account if premium does not appear.'
                : 'Premium unlocks when the verified webhook updates Firestore entitlement.');
            setButtonState(getElement('profile-premium-action'), {
                text: mode === 'verification-delayed' ? 'Refresh account status' : 'Checking account...',
                disabled: mode !== 'verification-delayed',
                mode
            });
            return;
        }

        if (mode === 'canceled') {
            setText('profile-premium-status', 'Checkout canceled');
            setText('profile-premium-copy', 'No charge was made. Your account is still on Free.');
            setButtonState(getElement('profile-premium-action'), {
                text: 'Continue to secure checkout',
                mode
            });
            return;
        }

        setText('profile-premium-status', mode === 'inactive' ? 'Premium inactive' : 'Free plan');
        setText('profile-premium-copy', mode === 'inactive' ? state.body : 'Upgrade for visited-aware filters, map styles, trail controls, and global search.');
        setButtonState(getElement('profile-premium-action'), {
            text: 'Upgrade',
            mode
        });
    }

    function renderCurrentState() {
        const state = getState();
        const overlay = getElement('paywall-overlay');
        if (overlay) overlay.dataset.paywallState = state.mode;

        setText('paywall-eyebrow', state.eyebrow);
        setText('paywall-title', state.title);
        setText('paywall-price', PRICE_COPY);
        setText('paywall-body', state.body);
        setText('paywall-source', `Opened from ${lastSource.replace(/-/g, ' ')}`);
        setVisible('paywall-clear-url-btn', state.clearVisible === true);
        setVisible('paywall-secondary-btn', state.secondaryVisible !== false);

        setButtonState(getElement('paywall-primary-btn'), {
            text: checkoutInFlight ? 'Opening checkout...' : state.primaryText,
            disabled: state.primaryDisabled === true || checkoutInFlight,
            mode: state.mode
        });

        renderProfileCard(state);
        scheduleVerificationFallbackRender(state);
        return state;
    }

    function openPaywall(options = {}) {
        lastSource = typeof options.source === 'string' && options.source.trim()
            ? options.source.trim()
            : 'manual';
        const overlay = getElement('paywall-overlay');
        if (!overlay) return;
        renderCurrentState();
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
        const primary = getElement('paywall-primary-btn');
        if (primary) primary.focus({ preventScroll: true });
    }

    function closePaywall() {
        const overlay = getElement('paywall-overlay');
        if (!overlay) return;
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
    }

    function focusSignIn() {
        closePaywall();
        const profileTab = document.querySelector('.nav-item[data-target="profile-view"]');
        if (profileTab) profileTab.click();

        setTimeout(() => {
            const loginContainer = getElement('login-container');
            const emailInput = getElement('account-signin-email');
            const googleBtn = getElement('google-login-btn');
            if (loginContainer) loginContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (emailInput) emailInput.focus({ preventScroll: true });
            else if (googleBtn) googleBtn.focus({ preventScroll: true });
        }, 120);
    }

    function getCheckoutCallable() {
        if (typeof firebase === 'undefined' || typeof firebase.functions !== 'function') {
            throw new Error('Firebase Functions SDK is not available.');
        }
        return firebase.functions().httpsCallable('createCheckoutSession');
    }

    function validateCheckoutUrl(value) {
        if (typeof value !== 'string' || !value.trim()) return null;
        try {
            const url = new URL(value);
            return url.protocol === 'https:' ? url.toString() : null;
        } catch (error) {
            return null;
        }
    }

    async function startCheckout() {
        const state = getState();

        if (state.mode === 'signed-out' || state.mode === 'verify-signed-out') {
            focusSignIn();
            return;
        }

        if (state.mode === 'verification-delayed') {
            window.location.reload();
            return;
        }

        if (state.mode === 'premium' || state.mode === 'verifying') {
            return;
        }

        checkoutInFlight = true;
        renderCurrentState();

        try {
            const createCheckoutSession = getCheckoutCallable();
            if (typeof window.BARK.incrementRequestCount === 'function') {
                window.BARK.incrementRequestCount();
            }
            const result = await createCheckoutSession({});
            const checkoutUrl = validateCheckoutUrl(result && result.data && result.data.checkoutUrl);
            if (!checkoutUrl) throw new Error('Checkout URL was missing from the backend response.');
            window.location.assign(checkoutUrl);
        } catch (error) {
            console.error('[paywallController] createCheckoutSession failed:', error);
            setText('paywall-body', 'Checkout could not start. Please try again in a moment or contact support.');
            setButtonState(getElement('paywall-primary-btn'), {
                text: 'Try again',
                disabled: false,
                mode: 'error'
            });
        } finally {
            checkoutInFlight = false;
            renderProfileCard(getState());
        }
    }

    function bindClick(id, handler) {
        const node = getElement(id);
        if (!node || node.dataset.paywallBound === 'true') return;
        node.dataset.paywallBound = 'true';
        node.addEventListener('click', handler);
    }

    function bindPremiumMapTools() {
        const premiumWrap = getElement('premium-filters-wrap');
        if (!premiumWrap || premiumWrap.dataset.paywallBound === 'true') return;
        premiumWrap.dataset.paywallBound = 'true';

        premiumWrap.addEventListener('click', (event) => {
            if (isPremiumActive()) return;
            const target = event.target;
            if (target && target.closest && target.closest('#premium-login-jump, #premium-upgrade-btn')) return;
            event.preventDefault();
            openPaywall({ source: 'premium-map-tools' });
        }, true);
    }

    function bindAuthObserverWhenReady(attempt = 0) {
        if (typeof firebase === 'undefined' || !firebase.apps || firebase.apps.length === 0 || !firebase.auth) {
            if (attempt < 80) setTimeout(() => bindAuthObserverWhenReady(attempt + 1), 250);
            return;
        }

        try {
            firebase.auth().onAuthStateChanged(() => {
                renderCurrentState();
            });
        } catch (error) {
            if (attempt < 80) setTimeout(() => bindAuthObserverWhenReady(attempt + 1), 250);
        }
    }

    function subscribePremiumState() {
        const premiumService = getPremiumService();
        if (!premiumService || typeof premiumService.subscribe !== 'function' || unsubscribePremium) return;
        unsubscribePremium = premiumService.subscribe(() => {
            renderCurrentState();
        });
    }

    function initPaywall() {
        if (initialized) return;
        initialized = true;
        returnState = getReturnStateFromUrl();
        returnStateStartedAt = returnState ? Date.now() : null;

        bindClick('paywall-close-btn', closePaywall);
        bindClick('paywall-secondary-btn', closePaywall);
        bindClick('paywall-clear-url-btn', clearCheckoutParams);
        bindClick('paywall-primary-btn', startCheckout);
        bindClick('profile-premium-action', () => openPaywall({ source: 'profile-premium-card' }));
        bindClick('premium-upgrade-btn', () => openPaywall({ source: 'premium-map-tools' }));

        const overlay = getElement('paywall-overlay');
        if (overlay && overlay.dataset.paywallBound !== 'true') {
            overlay.dataset.paywallBound = 'true';
            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) closePaywall();
            });
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closePaywall();
        });

        bindPremiumMapTools();
        subscribePremiumState();
        bindAuthObserverWhenReady();
        renderCurrentState();

        if (returnState === 'success' || returnState === 'canceled') {
            openPaywall({ source: `checkout-${returnState}` });
        }
    }

    window.BARK.paywall = {
        openPaywall,
        closePaywall,
        startCheckout,
        clearCheckoutParams,
        renderCurrentState
    };
    window.BARK.initPaywall = initPaywall;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPaywall);
    } else {
        initPaywall();
    }
})();
