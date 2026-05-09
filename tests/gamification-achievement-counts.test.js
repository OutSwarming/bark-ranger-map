const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');

function loadGamificationEngine(points = []) {
    const sandbox = {
        console,
        window: {
            BARK: {
                debugDataRefresh: false,
                calculateVisitScore(visits, walkPoints = 0) {
                    return {
                        totalScore: visits.length + walkPoints,
                        verifiedCount: visits.filter(visit => visit && visit.verified).length
                    };
                },
                repos: {
                    ParkRepo: {
                        getById(id) {
                            return points.find(point => point.id === id) || null;
                        }
                    }
                }
            }
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(repoRoot, 'gamificationLogic.js'), 'utf8'), sandbox);
    return sandbox.window.GamificationEngine;
}

test('gamification totals count unique physical sites, not state memberships or duplicate rows', () => {
    const points = [
        { id: 'death-valley', name: 'Death Valley National Park', state: 'California / Nevada', lat: 36.5323, lng: -116.9325 },
        { id: 'headwaters-legacy', name: 'Headwaters Forest Reserve', state: 'California', lat: 40.6327009, lng: -124.0651375 },
        { id: 'headwaters-current', name: 'Headwaters Forest Reserve  ', state: 'California', lat: 40.6327009, lng: -124.0651375 },
        { id: 'yosemite', name: 'Yosemite National Park', state: 'California', lat: 37.8651, lng: -119.5383 },
        { id: 'smokies', name: 'Great Smoky Mountains National Park', state: 'North Carolina, Tennessee', lat: 35.6118, lng: -83.4895 }
    ];
    const Engine = loadGamificationEngine(points);
    const engine = new Engine();

    engine.updateCanonicalCountsFromPoints(points);

    assert.equal(engine.totalRawParkRows, 5);
    assert.equal(engine.totalSystemParks, 4);
    assert.equal(engine.stateCanonicalCounts.CA, 3);
    assert.equal(engine.stateCanonicalCounts.NV, 1);
    assert.equal(engine.stateCanonicalCounts.NC, 1);
    assert.equal(engine.stateCanonicalCounts.TN, 1);
});

test('duplicate Park IDs for the same physical site count once in national and state progress', () => {
    const points = [
        { id: 'death-valley', name: 'Death Valley National Park', state: 'California / Nevada', lat: 36.5323, lng: -116.9325 },
        { id: 'headwaters-legacy', name: 'Headwaters Forest Reserve', state: 'California', lat: 40.6327009, lng: -124.0651375 },
        { id: 'headwaters-current', name: 'Headwaters Forest Reserve  ', state: 'California', lat: 40.6327009, lng: -124.0651375 },
        { id: 'yosemite', name: 'Yosemite National Park', state: 'California', lat: 37.8651, lng: -119.5383 }
    ];
    const Engine = loadGamificationEngine(points);
    const engine = new Engine();
    engine.updateCanonicalCountsFromPoints(points);

    const result = engine.evaluate([
        { id: 'death-valley', verified: true, ts: 1 },
        { id: 'headwaters-legacy', verified: true, ts: 2 },
        { id: 'headwaters-current', verified: true, ts: 3 },
        { id: 'yosemite', verified: true, ts: 4 }
    ]);

    const californiaBadge = result.stateBadges.find(badge => badge.id === 'state-ca');
    const mapConqueror = result.mysteryFeats.find(badge => badge.id === 'mapConqueror');

    assert.equal(result.nationalProgress.totalVisited, 3);
    assert.equal(result.nationalProgress.totalParks, 3);
    assert.equal(result.nationalProgress.percentComplete, 100);
    assert.equal(californiaBadge.percentComplete, 100);
    assert.equal(californiaBadge.status, 'unlocked');
    assert.equal(californiaBadge.tier, 'verified');
    assert.equal(mapConqueror.status, 'unlocked');
});
