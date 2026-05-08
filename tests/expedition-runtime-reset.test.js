const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');

function createClassList() {
    const classes = new Set();
    return {
        add(...names) {
            names.forEach(name => classes.add(name));
        },
        remove(...names) {
            names.forEach(name => classes.delete(name));
        },
        contains(name) {
            return classes.has(name);
        }
    };
}

function createElement(tagName = 'div') {
    const element = {
        tagName: String(tagName).toUpperCase(),
        childNodes: [],
        dataset: {},
        style: {},
        classList: createClassList(),
        attributes: {},
        value: '',
        className: '',
        addEventListener() {},
        setAttribute(name, value) {
            this.attributes[name] = String(value);
        },
        appendChild(node) {
            this.childNodes.push(node);
            return node;
        },
        removeChild(node) {
            const index = this.childNodes.indexOf(node);
            if (index >= 0) this.childNodes.splice(index, 1);
            return node;
        },
        get firstChild() {
            return this.childNodes[0] || null;
        }
    };

    let text = '';
    let html = '';
    Object.defineProperty(element, 'textContent', {
        get() {
            if (this.childNodes.length > 0) {
                return this.childNodes.map(child => child.textContent || '').join('');
            }
            return text;
        },
        set(value) {
            text = String(value);
            html = '';
            this.childNodes = [];
        }
    });
    Object.defineProperty(element, 'innerHTML', {
        get() {
            return html || text;
        },
        set(value) {
            html = String(value);
            text = html.replace(/<[^>]*>/g, '');
            this.childNodes = [];
        }
    });

    return element;
}

function createDocument(elementIds) {
    const elements = new Map();
    elementIds.forEach(id => elements.set(id, createElement('div')));

    return {
        createElement,
        getElementById(id) {
            return elements.get(id) || null;
        },
        __elements: elements
    };
}

function loadExpeditionEngine() {
    const ids = [
        'cancel-training-btn',
        'celebration-trail-name',
        'completed-expeditions-grid',
        'expedition-active-state',
        'expedition-complete-state',
        'expedition-fill',
        'expedition-history-list',
        'expedition-intro-state',
        'expedition-name',
        'expedition-progress-text',
        'expedition-trophy-case',
        'lifetime-miles-display',
        'manage-walks-count',
        'manage-walks-list',
        'miles-input',
        'toggle-completed-trails',
        'toggle-virtual-trail',
        'training-action-btn',
        'training-desc'
    ];
    const document = createDocument(ids);
    const context = {
        console,
        document,
        window: { BARK: {} },
        alert() {},
        confirm() { return true; },
        prompt() { return null; },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        navigator: {}
    };

    vm.runInNewContext(
        fs.readFileSync(path.join(repoRoot, 'modules', 'expeditionEngine.js'), 'utf8'),
        context
    );

    return {
        bark: context.window.BARK,
        document,
        element(id) {
            return document.getElementById(id);
        },
        window: context.window
    };
}

test('expedition runtime reset clears stale account trail and walk UI', () => {
    const { bark, element, window } = loadExpeditionEngine();

    element('toggle-virtual-trail').classList.add('active');
    element('toggle-completed-trails').classList.add('active');
    element('expedition-intro-state').style.display = 'none';
    element('expedition-active-state').style.display = 'block';
    element('expedition-complete-state').style.display = 'block';
    element('expedition-name').textContent = 'Old Premium Trail';
    element('expedition-name').dataset.trailName = 'Old Premium Trail';
    element('celebration-trail-name').textContent = 'Old Premium Trail';
    element('expedition-fill').style.width = '84%';
    element('expedition-progress-text').textContent = '8.4 / 10.0 Miles (84.0%)';
    element('lifetime-miles-display').textContent = '42.0 mi';
    element('miles-input').value = '3.5';
    element('training-action-btn').textContent = 'Tracking Active';
    element('training-action-btn').className = 'glass-btn training-btn active';
    element('cancel-training-btn').style.display = 'block';
    element('training-desc').innerHTML = 'Distance: <strong>3.50 mi</strong>';
    element('expedition-history-list').appendChild(Object.assign(createElement('li'), { textContent: 'Old walk' }));
    element('manage-walks-count').textContent = '7';
    element('manage-walks-list').appendChild(Object.assign(createElement('div'), { textContent: 'Old managed walk' }));
    element('expedition-trophy-case').style.display = 'block';
    element('completed-expeditions-grid').appendChild(Object.assign(createElement('div'), { textContent: 'Old completed trail' }));
    window.lastActiveTrailId = 'old_trail';
    window.lastMilesCompleted = 8.4;

    bark.resetExpeditionRuntimeState();

    assert.equal(element('toggle-virtual-trail').classList.contains('active'), false);
    assert.equal(element('toggle-completed-trails').classList.contains('active'), false);
    assert.equal(element('expedition-intro-state').style.display, 'block');
    assert.equal(element('expedition-active-state').style.display, 'none');
    assert.equal(element('expedition-complete-state').style.display, 'none');
    assert.equal(element('expedition-name').textContent, '');
    assert.equal(element('expedition-name').dataset.trailName, undefined);
    assert.equal(element('celebration-trail-name').textContent, '');
    assert.equal(element('expedition-fill').style.width, '0%');
    assert.equal(element('expedition-progress-text').textContent, '0.0 / 0.0 Miles (0.0%)');
    assert.equal(element('lifetime-miles-display').textContent, '0.0 mi');
    assert.equal(element('miles-input').value, '');
    assert.equal(element('training-action-btn').textContent, 'Start Walk');
    assert.equal(element('training-action-btn').className, 'glass-btn training-btn');
    assert.equal(element('cancel-training-btn').style.display, 'none');
    assert.match(element('training-desc').innerHTML, /Start walking away from home/);
    assert.equal(element('expedition-history-list').textContent, 'No miles logged yet.');
    assert.equal(element('manage-walks-count').textContent, '0');
    assert.equal(element('manage-walks-list').textContent, 'No walks logged yet.');
    assert.equal(element('expedition-trophy-case').style.display, 'none');
    assert.equal(element('completed-expeditions-grid').textContent, 'No expeditions completed yet. Spin the wheel to start!');
    assert.equal(window.lastActiveTrailId, null);
    assert.equal(window.lastMilesCompleted, 0);
});

test('empty completed expeditions render clears stale completed trail cards', () => {
    const { bark, element } = loadExpeditionEngine();

    element('expedition-trophy-case').style.display = 'block';
    element('completed-expeditions-grid').appendChild(Object.assign(createElement('div'), { textContent: 'Old completed trail' }));

    bark.renderCompletedExpeditions([]);

    assert.equal(element('expedition-trophy-case').style.display, 'none');
    assert.equal(element('completed-expeditions-grid').textContent, 'No expeditions completed yet. Spin the wheel to start!');
});
