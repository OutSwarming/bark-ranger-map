/**
 * authAccountUi.js - Public account UI for Google and Email/Password auth.
 *
 * Premium state remains read-only from Firestore entitlement via premiumService.
 */
(function () {
    window.BARK = window.BARK || {};
    window.BARK.services = window.BARK.services || {};

    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const MIN_PASSWORD_LENGTH = 8;
    const MIN_USERNAME_LENGTH = 2;
    const MAX_USERNAME_LENGTH = 30;

    let initialized = false;
    let activeMode = 'signin';
    let unsubscribePremium = null;

    const ACCOUNT_PROMPT_COPY = {
        'mark-visited': {
            title: "Create a free account to save where you've been",
            body: 'Mark parks visited, keep your B.A.R.K. passport backed up, and pick up on any device.',
            source: 'mark visited'
        },
        'verified-checkin': {
            title: 'Create a free account to save verified check-ins',
            body: 'Verified visits earn points and stay attached to your profile only after you sign in.',
            source: 'verified check-in'
        },
        'saved-route': {
            title: 'Create a free account to save this trip',
            body: 'Save routes, day notes, and B.A.R.K. stops so your planning work is still here later.',
            source: 'saved route'
        },
        'load-route': {
            title: 'Create a free account to load saved trips',
            body: 'Saved routes live in your free B.A.R.K. account so you can reopen trips from any device.',
            source: 'load route'
        },
        expedition: {
            title: 'Create a free account to track walks',
            body: 'Walk miles, virtual expeditions, and completed trails are saved to your B.A.R.K. profile.',
            source: 'expedition'
        },
        profile: {
            title: 'Create a free account to unlock your profile',
            body: 'Your visited parks, stats, achievements, and saved trips live in your account.',
            source: 'profile'
        },
        default: {
            title: "Create a free account to save where you've been",
            body: 'Your B.A.R.K. passport, visited parks, verified check-ins, and saved trips stay with your account.',
            source: 'map'
        }
    };

    function getElement(id) {
        return document.getElementById(id);
    }

    function getFirebaseAuth() {
        if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') {
            throw new Error('Firebase Auth is not available yet.');
        }
        return firebase.auth();
    }

    function getPremiumService() {
        return window.BARK.services && window.BARK.services.premium;
    }

    function requestGoogleAccountChooser() {
        const authService = window.BARK.services && window.BARK.services.auth;
        if (authService && typeof authService.requestGoogleAccountChooser === 'function') {
            authService.requestGoogleAccountChooser();
            return;
        }

        window.BARK.auth = window.BARK.auth || {};
        window.BARK.auth.forceGoogleAccountChooserOnNextSignIn = true;
    }

    function setText(id, text) {
        const node = getElement(id);
        if (node) node.textContent = text;
    }

    function setHidden(id, hidden) {
        const node = getElement(id);
        if (node) node.hidden = hidden === true;
    }

    function setStatus(message, tone = 'neutral') {
        const node = getElement('account-auth-message');
        if (!node) return;
        node.textContent = message || '';
        node.dataset.tone = tone;
        node.hidden = !message;
    }

    function getAccountPromptCopy(source) {
        return ACCOUNT_PROMPT_COPY[source] || ACCOUNT_PROMPT_COPY.default;
    }

    function closeAccountPrompt() {
        const overlay = getElement('account-gate-overlay');
        if (!overlay) return;
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
    }

    function focusAccountForm(mode) {
        closeAccountPrompt();
        const profileTab = document.querySelector('.nav-item[data-target="profile-view"]');
        if (profileTab) profileTab.click();

        setTimeout(() => {
            showMode(mode || 'create', { focus: false });
            const loginContainer = getElement('login-container');
            const target = getAccountFormFocusTarget(mode || 'create');
            const googleBtn = getElement('google-login-btn');
            if (loginContainer) loginContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (target) target.focus({ preventScroll: true });
            else if (googleBtn) googleBtn.focus({ preventScroll: true });
        }, 120);
    }

    function openAccountPrompt(options = {}) {
        const overlay = getElement('account-gate-overlay');
        if (!overlay) {
            focusAccountForm(options.mode || 'create');
            return;
        }

        const copy = getAccountPromptCopy(options.source || 'default');
        setText('account-gate-eyebrow', 'Free account');
        setText('account-gate-title', copy.title);
        setText('account-gate-body', copy.body);
        setText('account-gate-source', `Opened from ${copy.source}`);
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');

        const primary = getElement('account-gate-primary-btn');
        if (primary) primary.focus({ preventScroll: true });
    }

    function cleanEmail(value) {
        return typeof value === 'string' ? value.trim() : '';
    }

    function cleanUsername(value) {
        return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
    }

    function readPassword(id) {
        const input = getElement(id);
        return input && typeof input.value === 'string' ? input.value : '';
    }

    function validateUsername(username) {
        if (username.length < MIN_USERNAME_LENGTH) {
            return `Choose a username with at least ${MIN_USERNAME_LENGTH} characters.`;
        }
        if (username.length > MAX_USERNAME_LENGTH) {
            return `Keep your username to ${MAX_USERNAME_LENGTH} characters or fewer.`;
        }
        if (/[\r\n<>]/.test(username)) {
            return 'Use a username without angle brackets or line breaks.';
        }
        return null;
    }

    function validateEmail(email) {
        if (!EMAIL_PATTERN.test(email)) {
            return 'Enter a valid email address.';
        }
        return null;
    }

    function validatePassword(password) {
        if (password.length < MIN_PASSWORD_LENGTH) {
            return `Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`;
        }
        return null;
    }

    function getSafeAuthError(error) {
        const code = error && error.code ? String(error.code) : '';
        switch (code) {
            case 'auth/email-already-in-use':
                return 'That email already has a B.A.R.K. account. Sign in, use Continue with Google, or reset your password.';
            case 'auth/invalid-email':
                return 'Enter a valid email address.';
            case 'auth/weak-password':
                return `Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`;
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-login-credentials':
            case 'auth/invalid-credential':
                return 'Email or password did not match.';
            case 'auth/operation-not-allowed':
                return 'Email/password sign-in is not enabled yet. Enable it in Firebase Console and try again.';
            case 'auth/too-many-requests':
                return 'Too many attempts. Wait a moment, then try again.';
            case 'auth/network-request-failed':
                return 'Network error. Check your connection and try again.';
            case 'auth/popup-closed-by-user':
                return 'Google sign-in was canceled.';
            default:
                return 'Sign-in could not be completed. Please try again.';
        }
    }

    function getProviderLabel(user) {
        const providerIds = (user && Array.isArray(user.providerData) ? user.providerData : [])
            .map(provider => provider && provider.providerId)
            .filter(Boolean);

        if (providerIds.includes('google.com') && providerIds.includes('password')) {
            return 'Google and email/password';
        }
        if (providerIds.includes('google.com')) return 'Google';
        if (providerIds.includes('password')) return 'Email/password';
        return user && user.isAnonymous ? 'Anonymous' : 'Firebase Auth';
    }

    function getUserDisplayName(user) {
        return cleanUsername(user && user.displayName) || 'Bark Ranger';
    }

    function getPremiumLabel() {
        const premiumService = getPremiumService();
        if (!premiumService || typeof premiumService.getEntitlement !== 'function') {
            return 'Loading';
        }

        const entitlement = premiumService.getEntitlement();
        if (premiumService.isPremium && premiumService.isPremium()) {
            return entitlement.status === 'manual_active' ? 'Premium active (manual)' : 'Premium active';
        }
        if (entitlement.status === 'past_due') return 'Premium past due';
        if (entitlement.status === 'expired') return 'Premium expired';
        if (entitlement.status === 'canceled') return 'Premium canceled';
        return 'Free';
    }

    function updateModeButtons() {
        ['signin', 'create', 'reset'].forEach(mode => {
            const button = getElement(`account-mode-${mode}`);
            if (!button) return;
            button.classList.toggle('active', activeMode === mode);
            button.setAttribute('aria-pressed', activeMode === mode ? 'true' : 'false');
        });
    }

    function getAccountFormFocusTarget(mode) {
        if (mode === 'reset') return getElement('account-reset-email');
        if (mode === 'create') return getElement('account-create-username');
        return getElement('account-signin-email');
    }

    function showMode(mode, options = {}) {
        activeMode = ['signin', 'create', 'reset'].includes(mode) ? mode : 'signin';
        setHidden('account-signin-form', activeMode !== 'signin');
        setHidden('account-create-form', activeMode !== 'create');
        setHidden('account-reset-form', activeMode !== 'reset');
        updateModeButtons();
        setStatus('', 'neutral');

        if (options.focus === false) return;
        const target = getAccountFormFocusTarget(activeMode);
        if (target) target.focus({ preventScroll: true });
    }

    function clearPasswordFields() {
        ['account-signin-password', 'account-create-password'].forEach(id => {
            const input = getElement(id);
            if (input) input.value = '';
        });
    }

    function refreshAccountDisplay() {
        let user = null;
        try {
            user = getFirebaseAuth().currentUser;
        } catch (error) {
            user = null;
        }

        const signedIn = Boolean(user);
        setHidden('account-status-card', !signedIn);

        if (!signedIn) return;

        setText('account-display-name', getUserDisplayName(user));
        setText('account-display-email', user.email || 'No email on this account');
        setText('account-display-uid', user.uid || 'Unavailable');
        setText('account-display-provider', getProviderLabel(user));
        setText('account-display-premium', getPremiumLabel());
    }

    function seedAccountEmailFields(email) {
        if (!email) return;
        ['account-signin-email', 'account-reset-email'].forEach(id => {
            const input = getElement(id);
            if (input) input.value = email;
        });
    }

    function clearCreateUsernameField() {
        const input = getElement('account-create-username');
        if (input) input.value = '';
    }

    function getServerTimestamp() {
        if (typeof firebase === 'undefined' || !firebase.firestore || !firebase.firestore.FieldValue) return null;

        try {
            return firebase.firestore.FieldValue.serverTimestamp();
        } catch (error) {
            return null;
        }
    }

    async function saveCreatedAccountProfile(user, username, email) {
        if (!user) return;

        if (typeof user.updateProfile === 'function') {
            try {
                await user.updateProfile({ displayName: username });
            } catch (error) {
                console.warn('[authAccountUi] updateProfile displayName failed:', error);
            }
        }

        try {
            if (typeof firebase === 'undefined' || !firebase.firestore) return;
            if (typeof window.BARK.incrementRequestCount === 'function') window.BARK.incrementRequestCount();

            const timestamp = getServerTimestamp();
            const profilePayload = {
                displayName: username,
                username,
                email: user.email || email || '',
                profileUpdatedAt: timestamp || Date.now()
            };
            if (timestamp) profilePayload.createdAt = timestamp;

            await firebase.firestore().collection('users').doc(user.uid).set(profilePayload, { merge: true });
        } catch (error) {
            console.warn('[authAccountUi] user profile seed failed:', error);
        }

        setText('user-profile-name', username);
        setText('account-display-name', username);
    }

    async function createAccount(event) {
        event.preventDefault();
        const username = cleanUsername(getElement('account-create-username') && getElement('account-create-username').value);
        const email = cleanEmail(getElement('account-create-email') && getElement('account-create-email').value);
        const password = readPassword('account-create-password');
        const validationError = validateUsername(username) || validateEmail(email) || validatePassword(password);
        if (validationError) {
            setStatus(validationError, 'error');
            return;
        }

        try {
            setStatus('Creating account...', 'neutral');
            const auth = getFirebaseAuth();
            const credential = await auth.createUserWithEmailAndPassword(email, password);
            const user = (credential && credential.user) || auth.currentUser;
            await saveCreatedAccountProfile(user, username, email);
            clearPasswordFields();
            clearCreateUsernameField();
            setStatus('Account created. You are signed in.', 'success');
            refreshAccountDisplay();
        } catch (error) {
            console.error('[authAccountUi] createUserWithEmailAndPassword failed:', error);
            if (error && error.code === 'auth/email-already-in-use') seedAccountEmailFields(email);
            setStatus(getSafeAuthError(error), 'error');
        }
    }

    async function signInWithEmail(event) {
        event.preventDefault();
        const email = cleanEmail(getElement('account-signin-email') && getElement('account-signin-email').value);
        const password = readPassword('account-signin-password');
        const validationError = validateEmail(email) || (password ? null : 'Enter your password.');
        if (validationError) {
            setStatus(validationError, 'error');
            return;
        }

        try {
            setStatus('Signing in...', 'neutral');
            await getFirebaseAuth().signInWithEmailAndPassword(email, password);
            clearPasswordFields();
            setStatus('Signed in.', 'success');
        } catch (error) {
            console.error('[authAccountUi] signInWithEmailAndPassword failed:', error);
            setStatus(getSafeAuthError(error), 'error');
        }
    }

    async function sendPasswordReset(event) {
        event.preventDefault();
        const email = cleanEmail(getElement('account-reset-email') && getElement('account-reset-email').value);
        const validationError = validateEmail(email);
        if (validationError) {
            setStatus(validationError, 'error');
            return;
        }

        try {
            setStatus('Sending reset email...', 'neutral');
            await getFirebaseAuth().sendPasswordResetEmail(email);
            setStatus('If this email has a B.A.R.K. password account, a reset link will arrive shortly. Google accounts should use Continue with Google.', 'success');
        } catch (error) {
            console.error('[authAccountUi] sendPasswordResetEmail failed:', error);
            setStatus(getSafeAuthError(error), 'error');
        }
    }

    async function signOut(options = {}) {
        try {
            await getFirebaseAuth().signOut();
            if (options.switchAccount) requestGoogleAccountChooser();
            clearPasswordFields();
            clearCreateUsernameField();
            setStatus(options.switchAccount ? 'Signed out. Choose another account.' : 'Signed out.', 'success');
            showMode('signin');
            const loginContainer = getElement('login-container');
            if (loginContainer) loginContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (error) {
            console.error('[authAccountUi] signOut failed:', error);
            setStatus('Sign-out could not be completed. Please try again.', 'error');
        }
    }

    function bindClick(id, handler) {
        const node = getElement(id);
        if (!node || node.dataset.accountBound === 'true') return;
        node.dataset.accountBound = 'true';
        node.addEventListener('click', handler);
    }

    function bindSubmit(id, handler) {
        const node = getElement(id);
        if (!node || node.dataset.accountBound === 'true') return;
        node.dataset.accountBound = 'true';
        node.addEventListener('submit', handler);
    }

    function subscribePremiumState() {
        const premiumService = getPremiumService();
        if (!premiumService || typeof premiumService.subscribe !== 'function' || unsubscribePremium) return;
        unsubscribePremium = premiumService.subscribe(refreshAccountDisplay);
    }

    function bindAuthObserverWhenReady(attempt = 0) {
        if (typeof firebase === 'undefined' || !firebase.apps || firebase.apps.length === 0 || !firebase.auth) {
            if (attempt < 80) setTimeout(() => bindAuthObserverWhenReady(attempt + 1), 250);
            return;
        }

        try {
            firebase.auth().onAuthStateChanged(() => {
                refreshAccountDisplay();
            });
            refreshAccountDisplay();
        } catch (error) {
            if (attempt < 80) setTimeout(() => bindAuthObserverWhenReady(attempt + 1), 250);
        }
    }

    function initAuthAccountUi() {
        if (initialized) return;
        initialized = true;

        bindClick('account-mode-signin', () => showMode('signin'));
        bindClick('account-mode-create', () => showMode('create'));
        bindClick('account-mode-reset', () => showMode('reset'));
        bindClick('account-forgot-password-btn', () => showMode('reset'));
        bindClick('account-inline-create-btn', () => showMode('create'));
        bindClick('account-signout-btn', () => signOut());
        bindClick('account-switch-btn', () => signOut({ switchAccount: true }));
        bindClick('account-gate-close-btn', closeAccountPrompt);
        bindClick('account-gate-primary-btn', () => focusAccountForm('create'));
        bindClick('account-gate-secondary-btn', () => focusAccountForm('signin'));

        bindSubmit('account-signin-form', signInWithEmail);
        bindSubmit('account-create-form', createAccount);
        bindSubmit('account-reset-form', sendPasswordReset);

        const accountGateOverlay = getElement('account-gate-overlay');
        if (accountGateOverlay && accountGateOverlay.dataset.accountOverlayBound !== 'true') {
            accountGateOverlay.dataset.accountOverlayBound = 'true';
            accountGateOverlay.addEventListener('click', (event) => {
                if (event.target === accountGateOverlay) closeAccountPrompt();
            });
        }

        document.addEventListener('keydown', (event) => {
            const overlay = getElement('account-gate-overlay');
            if (event.key === 'Escape' && overlay && overlay.classList.contains('active')) {
                closeAccountPrompt();
            }
        });

        showMode('signin', { focus: false });
        subscribePremiumState();
        bindAuthObserverWhenReady();
    }

    window.BARK.authAccountUi = {
        initAuthAccountUi,
        showMode,
        openAccountPrompt,
        closeAccountPrompt,
        refreshAccountDisplay,
        signOut
    };
    window.BARK.initAuthAccountUi = initAuthAccountUi;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAuthAccountUi);
    } else {
        initAuthAccountUi();
    }
})();
