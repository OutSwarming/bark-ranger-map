const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createElement(id) {
    return {
        id,
        innerHTML: '',
        style: { display: 'none' },
        clickCount: 0,
        click() {
            this.clickCount += 1;
        },
        appendChild() {}
    };
}

function loadRouteRenderer(options = {}) {
    const elements = new Map([
        ['planner-saved-routes-container', createElement('planner-saved-routes-container')],
        ['planner-saved-routes-list', createElement('planner-saved-routes-list')],
        ['saved-routes-list', createElement('saved-routes-list')],
        ['saved-routes-count', createElement('saved-routes-count')]
    ]);
    const promptCalls = [];
    const profileTab = createElement('profile-tab');

    const context = {
        window: {
            BARK: {
                services: {
                    firebase: {
                        getCurrentUser: () => options.user || null,
                        loadSavedRoutes: async () => ({ routes: [], nextCursor: null, hasMore: false })
                    }
                },
                authAccountUi: options.withoutAccountUi
                    ? null
                    : {
                        openAccountPrompt(payload) {
                            promptCalls.push(payload);
                        }
                    }
            }
        },
        document: {
            getElementById(id) {
                return elements.get(id) || null;
            },
            querySelector(selector) {
                return selector === '.nav-item[data-target="profile-view"]' ? profileTab : null;
            },
            querySelectorAll() {
                return [];
            },
            createElement: createElement
        },
        console,
        Date
    };
    context.window.window = context.window;

    const source = fs.readFileSync(path.join(__dirname, '..', 'renderers', 'routeRenderer.js'), 'utf8');
    vm.runInNewContext(source, context, { filename: 'renderers/routeRenderer.js' });

    return {
        window: context.window,
        element: id => elements.get(id),
        promptCalls,
        profileTab
    };
}

test('planner load button opens free account prompt when signed out', () => {
    const harness = loadRouteRenderer();

    harness.window.togglePlannerRoutes();

    assert.equal(harness.element('planner-saved-routes-container').style.display, 'block');
    assert.match(harness.element('planner-saved-routes-list').innerHTML, /free account/);
    assert.equal(harness.promptCalls.length, 1);
    assert.equal(harness.promptCalls[0].source, 'load-route');
    assert.equal(harness.promptCalls[0].mode, 'create');
});

test('planner load button falls back to profile sign-up form when account prompt is unavailable', () => {
    const harness = loadRouteRenderer({ withoutAccountUi: true });

    harness.window.togglePlannerRoutes();

    assert.equal(harness.profileTab.clickCount, 1);
});
