const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');

function createElementStub() {
    return {
        textContent: '',
        style: {},
        classList: {
            add() {},
            remove() {}
        },
        appendChild() {},
        addEventListener() {}
    };
}

function loadProfileEngineHarness() {
    let receivedRank = undefined;
    const elements = new Map();
    const sandbox = {
        console,
        map: {
            getCenter() {
                return { lat: 39.8283, lng: -98.5795 };
            }
        },
        document: {
            getElementById(id) {
                if (!elements.has(id)) elements.set(id, createElementStub());
                return elements.get(id);
            },
            querySelectorAll() {
                return [];
            },
            createElement() {
                return createElementStub();
            }
        },
        window: {
            currentWalkPoints: 0,
            _lastKnownLeaderboardRank: null,
            BARK: {
                repos: {},
                leaderboardRenderer: {
                    getSafeLeaderboardRank(rank) {
                        const parsed = Number(rank);
                        return Number.isFinite(parsed) && parsed >= 1 ? Math.trunc(parsed) : null;
                    },
                    formatLeaderboardRank(rank) {
                        return rank ? String(rank) : '--';
                    }
                },
                calculateVisitScore() {
                    return {
                        totalScore: 0,
                        totalVisitedCount: 0,
                        verifiedCount: 0
                    };
                },
                getUserLocationMarker() {
                    return null;
                },
                safeUpdateHTML() {},
                incrementRequestCount() {}
            },
            gamificationEngine: {
                async evaluateAndStoreAchievements(userId, visits, userRank) {
                    receivedRank = userRank;
                    return {
                        title: 'B.A.R.K. Trainee',
                        totalScore: 0,
                        rareFeats: [],
                        paws: [],
                        stateBadges: [],
                        mysteryFeats: [],
                        nationalProgress: {
                            percentComplete: 0,
                            totalVisited: 0,
                            totalParks: 1
                        }
                    };
                }
            }
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(repoRoot, 'modules', 'profileEngine.js'), 'utf8'), sandbox);

    return {
        sandbox,
        getReceivedRank: () => receivedRank
    };
}

test('profile achievement evaluation passes the cached leaderboard rank', async () => {
    const harness = loadProfileEngineHarness();

    harness.sandbox.window.BARK.setCurrentLeaderboardRank(1);
    await harness.sandbox.window.BARK.evaluateAchievements([]);

    assert.equal(harness.getReceivedRank(), 1);
});
