const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createClassList(element) {
    const readClasses = () => new Set(String(element.className || '').split(/\s+/).filter(Boolean));
    const writeClasses = classes => {
        element.className = Array.from(classes).join(' ');
    };

    return {
        add(...names) {
            const classes = readClasses();
            names.forEach(name => classes.add(name));
            writeClasses(classes);
        },
        remove(...names) {
            const classes = readClasses();
            names.forEach(name => classes.delete(name));
            writeClasses(classes);
        },
        toggle(name, force) {
            const classes = readClasses();
            const shouldAdd = force === undefined ? !classes.has(name) : Boolean(force);
            if (shouldAdd) classes.add(name);
            else classes.delete(name);
            writeClasses(classes);
            return shouldAdd;
        },
        contains(name) {
            return readClasses().has(name);
        }
    };
}

function createStyle() {
    return {
        cssText: '',
        setProperty(name, value) {
            this[name] = value;
        }
    };
}

function createElement(tagName = 'div') {
    const element = {
        tagName: String(tagName).toUpperCase(),
        id: '',
        className: '',
        children: [],
        parentElement: null,
        dataset: {},
        attributes: {},
        style: createStyle(),
        textContent: '',
        value: '',
        disabled: false,
        scrollLeft: 0,
        clientWidth: 320,
        appendChild(child) {
            child.parentElement = this;
            this.children.push(child);
            return child;
        },
        insertBefore(child, reference) {
            child.parentElement = this;
            const index = this.children.indexOf(reference);
            if (index === -1) this.children.push(child);
            else this.children.splice(index, 0, child);
            return child;
        },
        setAttribute(name, value) {
            this.attributes[name] = String(value);
        },
        getAttribute(name) {
            return this.attributes[name];
        },
        addEventListener() {},
        focus() {
            this.focused = true;
        },
        select() {
            this.selected = true;
        },
        scrollIntoView() {
            this.scrolled = true;
        },
        click() {
            this.clickCount = (this.clickCount || 0) + 1;
            if (typeof this.onclick === 'function') this.onclick({ currentTarget: this, target: this });
        },
        scrollTo(options) {
            this.scrollLeft = options && Number.isFinite(Number(options.left)) ? Number(options.left) : 0;
        },
        contains(node) {
            return this.children.includes(node);
        }
    };
    element.classList = createClassList(element);
    Object.defineProperty(element, 'innerHTML', {
        get() {
            return this._innerHTML || '';
        },
        set(value) {
            this._innerHTML = String(value || '');
            this.children = [];
        }
    });
    return element;
}

function findByClass(root, className) {
    const found = [];
    const visit = (node) => {
        if (!node) return;
        if (node.classList && node.classList.contains(className)) found.push(node);
        (node.children || []).forEach(visit);
    };
    visit(root);
    return found;
}

function directChildrenByClass(root, className) {
    return (root.children || []).filter(child => child.classList && child.classList.contains(className));
}

function getTextContent(root) {
    if (!root) return '';
    return `${root.textContent || ''}${root._innerHTML || ''}${(root.children || []).map(getTextContent).join('')}`;
}

function loadTripPlanner(options = {}) {
    const elements = new Map();
    const byId = id => {
        if (!elements.has(id)) {
            const element = createElement(id === 'trip-queue-list' ? 'ul' : id === 'park-search' ? 'input' : 'div');
            element.id = id;
            elements.set(id, element);
        }
        return elements.get(id);
    };

    const wrapper = byId('itinerary-timeline-wrapper');
    wrapper.appendChild(byId('ui-start-node'));
    wrapper.appendChild(byId('trip-day-tabs'));
    wrapper.appendChild(byId('day-management-bar'));
    wrapper.appendChild(byId('trip-queue-list'));
    wrapper.appendChild(byId('ui-end-node'));
    const mapNav = createElement('button');
    const timers = [];
    const timerMode = options.timerMode || 'immediate';

    let directionsResolver = null;

    const context = {
        window: {
            BARK: {
                DAY_COLORS: ['#1976D2', '#2E7D32', '#E65100', '#6A1B9A', '#C62828'],
                tripDays: [{ color: '#1976D2', stops: [], notes: '' }],
                activeDayIdx: 0,
                services: {
                    premium: {
                        isPremium: () => true,
                        subscribe: () => {}
                    },
                    ors: {
                        directions: () => new Promise(resolve => { directionsResolver = resolve; })
                    }
                },
                DOM: {
                    tripActionToast: () => byId('trip-action-toast'),
                    plannerBadge: () => byId('planner-badge'),
                    tripQueueList: () => byId('trip-queue-list'),
                    tripDayTabs: () => byId('trip-day-tabs'),
                    uiStartNode: () => byId('ui-start-node'),
                    uiEndNode: () => byId('ui-end-node'),
                    itineraryTimelineWrapper: () => byId('itinerary-timeline-wrapper'),
                    dayManagementBar: () => byId('day-management-bar'),
                    dayNotesContainer: () => byId('day-notes-container'),
                    dayNotesTextarea: () => byId('day-notes-textarea'),
                    charCount: () => byId('char-count'),
                    clearTripBtn: () => byId('clear-trip-btn'),
                    startRouteBtn: () => byId('start-route-btn'),
                    saveRouteBtn: () => byId('save-route-btn'),
                    optimizeTripBtn: () => byId('optimize-trip-btn'),
                    tripNameInput: () => byId('tripNameInput'),
                    routeTelemetry: () => byId('route-telemetry'),
                    parkSearch: () => byId('park-search'),
                    optimizerModal: () => byId('optimizer-modal'),
                    optMaxStops: () => ({ value: '5' }),
                    optMaxHours: () => ({ value: '4' })
                },
                haversineDistance: () => 1,
                incrementRequestCount() {}
            },
            tripStartNode: null,
            tripEndNode: null,
            isTripEditMode: false
        },
        document: {
            body: createElement('body'),
            activeElement: null,
            createElement,
            createTextNode: text => ({ textContent: String(text || ''), children: [] }),
            getElementById: id => elements.get(id) || null,
            querySelector: selector => (
                selector === '.nav-item[data-target="map-view"]' || selector === '[data-target="map-view"]'
                    ? mapNav
                    : null
            ),
            querySelectorAll: () => []
        },
        firebase: {
            auth: () => ({ currentUser: { uid: 'test-user' } })
        },
        L: {
            geoJSON() {
                return {
                    addTo() {
                        return this;
                    },
                    getBounds() {
                        return {
                            extend() {
                                return this;
                            }
                        };
                    }
                };
            }
        },
        map: {
            fitBounds() {
                this.fitBoundsCalled = true;
            }
        },
        console,
        alert() {},
        confirm: () => true,
        setTimeout: (callback) => {
            if (timerMode === 'manual') {
                timers.push(callback);
                return timers.length;
            }
            callback();
            return 1;
        },
        clearTimeout() {},
        requestAnimationFrame: (callback) => callback(),
        Date
    };
    context.window.window = context.window;

    const source = fs.readFileSync(path.join(__dirname, '..', 'engines', 'tripPlannerCore.js'), 'utf8');
    vm.runInNewContext(source, context, { filename: 'engines/tripPlannerCore.js' });

    return {
        window: context.window,
        element: byId,
        findByClass,
        directChildrenByClass,
        getTextContent,
        mapNav,
        runTimers: () => {
            timers.splice(0).forEach(callback => callback());
        },
        resolveDirections: () => {
            if (!directionsResolver) throw new Error('Directions call has not started.');
            directionsResolver({
                features: [{
                    properties: {
                        summary: {
                            distance: 1609.344,
                            duration: 3600
                        }
                    }
                }]
            });
        }
    };
}

function makeDays(count) {
    return Array.from({ length: count }, (_, index) => ({
        color: ['#1976D2', '#2E7D32', '#E65100', '#6A1B9A', '#C62828'][index % 5],
        stops: [{ name: `Stop ${index + 1}`, lat: index, lng: index }],
        notes: ''
    }));
}

test('trip day selector pages days after the first nine', () => {
    const harness = loadTripPlanner();
    harness.window.BARK.tripDays = makeDays(15);
    harness.window.BARK.activeDayIdx = 14;

    harness.window.BARK.updateTripUI();

    const tabs = harness.element('trip-day-tabs');
    assert.equal(tabs.dataset.pageCount, '2');
    assert.equal(tabs.classList.contains('trip-day-tabs-paged'), true);

    const pages = harness.findByClass(tabs, 'trip-day-page');
    assert.equal(pages.length, 2);
    assert.equal(harness.directChildrenByClass(pages[0], 'trip-day-tab').length, 9);
    assert.equal(harness.directChildrenByClass(pages[1], 'trip-day-tab').length, 7);

    const activeTabs = harness.findByClass(tabs, 'active')
        .filter(element => element.classList.contains('trip-day-tab'));
    assert.equal(activeTabs.length, 1);
    assert.match(harness.getTextContent(activeTabs[0]), /Day 15/);
    assert.equal(harness.findByClass(tabs, 'trip-day-add-btn').length, 1);
});

test('trip planner enforces the 50 day limit for insert and automatic day creation', () => {
    const harness = loadTripPlanner();
    harness.window.BARK.tripDays = makeDays(50);
    harness.window.BARK.activeDayIdx = 49;
    harness.window.BARK.tripDays[49].stops = Array.from({ length: 10 }, (_, index) => ({
        name: `Full day stop ${index}`,
        lat: 100 + index,
        lng: 100 + index
    }));

    harness.window.BARK.updateTripUI();
    assert.equal(harness.findByClass(harness.element('trip-day-tabs'), 'trip-day-add-btn').length, 0);

    harness.window.insertDayAfter();
    assert.equal(harness.window.BARK.tripDays.length, 50);

    const added = harness.window.addStopToTrip({ name: 'Overflow stop', lat: 999, lng: 999 });
    assert.equal(added, false);
    assert.equal(harness.window.BARK.tripDays.length, 50);
    assert.equal(harness.window.BARK.tripDays[49].stops.length, 10);
});

test('add stop action opens map tab and focuses the search input for the active day', () => {
    const harness = loadTripPlanner();
    harness.window.BARK.tripDays = makeDays(10);
    harness.window.BARK.activeDayIdx = 9;

    harness.window.BARK.updateTripUI();

    const ghostButton = harness.element('trip-queue-list').children
        .find(child => harness.getTextContent(child).includes('Add Stop to Day 10'));
    assert.ok(ghostButton, 'expected Add Stop to Day 10 control to render');

    ghostButton.onclick();

    const searchInput = harness.element('park-search');
    assert.equal(harness.mapNav.clickCount, 1);
    assert.equal(searchInput.focused, true);
    assert.equal(searchInput.selected, true);
    assert.equal(searchInput.scrolled, true);
    assert.match(searchInput.placeholder, /Day 10/);
});

test('route generation shows working and slow status messages before completion', async () => {
    const harness = loadTripPlanner({ timerMode: 'manual' });
    harness.window.BARK.tripDays = [{
        color: '#1976D2',
        stops: [
            { name: 'Stop A', lat: 1, lng: 1 },
            { name: 'Stop B', lat: 2, lng: 2 }
        ],
        notes: ''
    }];
    harness.window.BARK.activeDayIdx = 0;
    harness.window.BARK.initTripPlanner();
    harness.window.BARK.updateTripUI();

    harness.element('start-route-btn').onclick();
    await Promise.resolve();

    assert.equal(harness.element('route-telemetry').dataset.routeStatus, 'working');
    assert.match(harness.getTextContent(harness.element('route-telemetry')), /Generating route/);

    harness.runTimers();
    assert.equal(harness.element('route-telemetry').dataset.routeStatus, 'slow');
    assert.match(harness.getTextContent(harness.element('route-telemetry')), /might take a few minutes/);

    harness.resolveDirections();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(harness.element('route-telemetry').dataset.routeStatus, 'complete');
    assert.match(harness.getTextContent(harness.element('route-telemetry')), /Total Drive/);
    assert.match(harness.element('start-route-btn').innerHTML, /Generate Route/);
});
