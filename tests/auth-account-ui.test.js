const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createClassList() {
    const classes = new Set();
    return {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        toggle(name, force) {
            if (force === true) {
                classes.add(name);
                return true;
            }
            if (force === false) {
                classes.delete(name);
                return false;
            }
            if (classes.has(name)) {
                classes.delete(name);
                return false;
            }
            classes.add(name);
            return true;
        },
        contains: name => classes.has(name)
    };
}

function createElement(id) {
    const listeners = new Map();
    return {
        id,
        value: '',
        textContent: '',
        hidden: false,
        dataset: {},
        style: {},
        attributes: {},
        classList: createClassList(),
        addEventListener(type, handler) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(handler);
        },
        setAttribute(name, value) {
            this.attributes[name] = String(value);
        },
        getAttribute(name) {
            return this.attributes[name];
        },
        focus() {
            this.focused = true;
        },
        scrollIntoView() {
            this.scrolled = true;
        },
        async dispatch(type) {
            const event = {
                target: this,
                preventDefault() {
                    event.defaultPrevented = true;
                },
                defaultPrevented: false
            };
            for (const handler of listeners.get(type) || []) {
                await handler(event);
            }
            return event;
        }
    };
}

function createDocument(ids) {
    const elements = new Map(ids.map(id => [id, createElement(id)]));
    return {
        readyState: 'complete',
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, createElement(id));
            return elements.get(id);
        },
        querySelector() {
            return null;
        },
        addEventListener() {},
        element(id) {
            return elements.get(id);
        }
    };
}

function loadAuthAccountUi(overrides = {}) {
    const ids = [
        'account-auth-message',
        'account-status-card',
        'account-display-name',
        'account-display-email',
        'account-display-uid',
        'account-display-provider',
        'account-display-premium',
        'account-signin-form',
        'account-create-form',
        'account-reset-form',
        'account-signin-email',
        'account-signin-password',
        'account-create-username',
        'account-create-email',
        'account-create-password',
        'account-reset-email',
        'account-mode-signin',
        'account-mode-create',
        'account-mode-reset',
        'account-forgot-password-btn',
        'account-inline-create-btn',
        'account-signout-btn',
        'account-switch-btn',
        'account-gate-close-btn',
        'account-gate-primary-btn',
        'account-gate-secondary-btn',
        'account-gate-overlay',
        'login-container',
        'google-login-btn',
        'user-profile-name'
    ];
    const document = createDocument(ids);
    const writes = [];
    const createCalls = [];
    const updateProfileCalls = [];
    const user = {
        uid: 'uid-123',
        email: '',
        displayName: '',
        providerData: [{ providerId: 'password' }],
        async updateProfile(profile) {
            updateProfileCalls.push({ ...profile });
            Object.assign(user, profile);
        }
    };
    const auth = {
        currentUser: null,
        async createUserWithEmailAndPassword(email, password) {
            createCalls.push({ email, password });
            if (overrides.createError) throw overrides.createError;
            user.email = email;
            auth.currentUser = user;
            return { user };
        },
        async signInWithEmailAndPassword() {},
        async sendPasswordResetEmail() {},
        async signOut() {
            auth.currentUser = null;
        },
        onAuthStateChanged() {}
    };
    const firestore = function firestore() {
        return {
            collection(collectionName) {
                return {
                    doc(docId) {
                        return {
                            async set(payload, options) {
                                writes.push({ collectionName, docId, payload, options });
                            }
                        };
                    }
                };
            }
        };
    };
    firestore.FieldValue = {
        serverTimestamp() {
            return '__server_timestamp__';
        }
    };

    const context = {
        window: {
            BARK: {
                services: {},
                incrementRequestCount() {}
            }
        },
        document,
        firebase: {
            apps: [{}],
            auth: () => auth,
            firestore
        },
        console: {
            ...console,
            error() {},
            warn() {}
        },
        setTimeout: (callback) => callback(),
        Date
    };
    context.window.window = context.window;

    const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'authAccountUi.js'), 'utf8');
    vm.runInNewContext(source, context, { filename: 'services/authAccountUi.js' });

    return {
        document,
        auth,
        createCalls,
        updateProfileCalls,
        writes,
        element: id => document.element(id)
    };
}

test('email account creation requires and saves a username', async () => {
    const harness = loadAuthAccountUi();

    harness.element('account-create-username').value = '  Trail   Boss  ';
    harness.element('account-create-email').value = 'new@example.com';
    harness.element('account-create-password').value = 'password123';

    await harness.element('account-create-form').dispatch('submit');

    assert.deepEqual(harness.createCalls, [{ email: 'new@example.com', password: 'password123' }]);
    assert.deepEqual(harness.updateProfileCalls, [{ displayName: 'Trail Boss' }]);
    assert.equal(harness.auth.currentUser.displayName, 'Trail Boss');
    assert.equal(harness.element('account-display-name').textContent, 'Trail Boss');
    assert.equal(harness.element('user-profile-name').textContent, 'Trail Boss');
    assert.equal(harness.element('account-auth-message').dataset.tone, 'success');

    assert.equal(harness.writes.length, 1);
    assert.equal(harness.writes[0].collectionName, 'users');
    assert.equal(harness.writes[0].docId, 'uid-123');
    assert.equal(harness.writes[0].options.merge, true);
    assert.equal(harness.writes[0].payload.displayName, 'Trail Boss');
    assert.equal(harness.writes[0].payload.username, 'Trail Boss');
    assert.equal(harness.writes[0].payload.email, 'new@example.com');
});

test('duplicate signup email points users back to existing account paths', async () => {
    const duplicateError = new Error('email exists');
    duplicateError.code = 'auth/email-already-in-use';
    const harness = loadAuthAccountUi({ createError: duplicateError });

    harness.element('account-create-username').value = 'Trail Boss';
    harness.element('account-create-email').value = 'taken@example.com';
    harness.element('account-create-password').value = 'password123';

    await harness.element('account-create-form').dispatch('submit');

    assert.equal(harness.element('account-auth-message').dataset.tone, 'error');
    assert.match(harness.element('account-auth-message').textContent, /already has a B\.A\.R\.K\. account/);
    assert.equal(harness.element('account-signin-email').value, 'taken@example.com');
    assert.equal(harness.element('account-reset-email').value, 'taken@example.com');
    assert.equal(harness.updateProfileCalls.length, 0);
    assert.equal(harness.writes.length, 0);
});
