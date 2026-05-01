const { after, before, beforeEach, describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment
} = require('@firebase/rules-unit-testing');

const {
    collection,
    deleteDoc,
    doc,
    getDoc,
    setDoc,
    updateDoc
} = require('firebase/firestore');

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-bark-ranger-rules-test';
const RULES_PATH = path.resolve(__dirname, '../../firestore.rules');

let testEnv;

function authedDb(uid) {
    return testEnv.authenticatedContext(uid).firestore();
}

async function seedDoc(pathSegments, data) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), ...pathSegments), data);
    });
}

describe('Firestore entitlement and admin field rules', () => {
    before(async () => {
        testEnv = await initializeTestEnvironment({
            projectId: PROJECT_ID,
            firestore: {
                rules: fs.readFileSync(RULES_PATH, 'utf8')
            }
        });
    });

    beforeEach(async () => {
        await testEnv.clearFirestore();
    });

    after(async () => {
        await testEnv.cleanup();
    });

    it('allows a user to read only their own user document', async () => {
        await seedDoc(['users', 'alice'], {
            settings: { mapStyle: 'default' },
            entitlement: { premium: true, status: 'manual_active' }
        });
        await seedDoc(['users', 'bob'], {
            settings: { mapStyle: 'satellite' }
        });

        const aliceDb = authedDb('alice');

        await assertSucceeds(getDoc(doc(aliceDb, 'users', 'alice')));
        await assertFails(getDoc(doc(aliceDb, 'users', 'bob')));
    });

    it('allows current app-owned settings and visitedPlaces writes on the owner user document', async () => {
        const aliceDb = authedDb('alice');
        const aliceRef = doc(aliceDb, 'users', 'alice');

        await assertSucceeds(setDoc(aliceRef, {
            settings: {
                mapStyle: 'default',
                visitedFilter: 'all',
                premiumClustering: false
            }
        }));

        await assertSucceeds(updateDoc(aliceRef, {
            visitedPlaces: [
                { id: 'yosemite', name: 'Yosemite', ts: 1710000000000 }
            ]
        }));
    });

    it('allows allowed user writes while preserving server-written entitlement', async () => {
        await seedDoc(['users', 'alice'], {
            entitlement: {
                premium: true,
                status: 'manual_active',
                source: 'admin_override',
                manualOverride: true,
                currentPeriodEnd: null
            },
            settings: { mapStyle: 'default' }
        });

        const aliceDb = authedDb('alice');
        const aliceRef = doc(aliceDb, 'users', 'alice');

        await assertSucceeds(updateDoc(aliceRef, {
            settings: { mapStyle: 'terrain', visitedFilter: 'visited' },
            visitedPlaces: [{ id: 'zion', name: 'Zion', ts: 1710000000001 }]
        }));
    });

    it('denies creating a user document with entitlement fields', async () => {
        const aliceDb = authedDb('alice');

        await assertFails(setDoc(doc(aliceDb, 'users', 'alice'), {
            settings: { mapStyle: 'default' },
            entitlement: {
                premium: true,
                status: 'manual_active'
            }
        }));
    });

    it('denies updating entitlement fields, including nested entitlement.premium', async () => {
        await seedDoc(['users', 'alice'], {
            settings: { mapStyle: 'default' },
            entitlement: {
                premium: false,
                status: 'free',
                source: 'none',
                manualOverride: false,
                currentPeriodEnd: null
            }
        });

        const aliceDb = authedDb('alice');
        const aliceRef = doc(aliceDb, 'users', 'alice');

        await assertFails(updateDoc(aliceRef, {
            entitlement: {
                premium: true,
                status: 'manual_active',
                source: 'admin_override',
                manualOverride: true,
                currentPeriodEnd: null
            }
        }));

        await assertFails(updateDoc(aliceRef, {
            'entitlement.premium': true
        }));

        await assertFails(updateDoc(aliceRef, {
            'entitlement.status': 'manual_active'
        }));
    });

    it('denies top-level premium, provider, and admin escalation fields', async () => {
        const protectedFields = [
            ['premium', true],
            ['premiumStatus', 'active'],
            ['subscription', { status: 'active' }],
            ['subscriptions', [{ status: 'active' }]],
            ['plan', 'pro'],
            ['manualOverride', true],
            ['providerCustomerId', 'cus_test'],
            ['providerSubscriptionId', 'sub_test'],
            ['currentPeriodEnd', 1999999999999],
            ['source', 'admin_override'],
            ['status', 'manual_active'],
            ['isAdmin', true],
            ['admin', true],
            ['role', 'admin'],
            ['roles', ['admin']]
        ];

        const aliceDb = authedDb('alice');

        for (const [field, value] of protectedFields) {
            await assertFails(setDoc(doc(aliceDb, 'users', `alice-${field}`), {
                settings: { mapStyle: 'default' },
                [field]: value
            }));
        }
    });

    it('denies deleting the owner user document', async () => {
        await seedDoc(['users', 'alice'], {
            settings: { mapStyle: 'default' },
            entitlement: { premium: true, status: 'manual_active' }
        });

        const aliceDb = authedDb('alice');

        await assertFails(deleteDoc(doc(aliceDb, 'users', 'alice')));
    });

    it('allows own savedRoutes and denies another user savedRoutes', async () => {
        const aliceDb = authedDb('alice');

        await assertSucceeds(setDoc(doc(aliceDb, 'users', 'alice', 'savedRoutes', 'route-1'), {
            tripName: 'Rules Test Trip',
            createdAt: 1710000000000,
            tripDays: []
        }));

        await assertSucceeds(getDoc(doc(aliceDb, 'users', 'alice', 'savedRoutes', 'route-1')));
        await assertFails(setDoc(doc(aliceDb, 'users', 'bob', 'savedRoutes', 'route-1'), {
            tripName: 'Other User Trip',
            createdAt: 1710000000000,
            tripDays: []
        }));
        await assertFails(getDoc(doc(aliceDb, 'users', 'bob', 'savedRoutes', 'route-1')));
    });

    it('allows owner leaderboard writes and denies writing another user leaderboard doc', async () => {
        const aliceDb = authedDb('alice');

        await assertSucceeds(setDoc(doc(aliceDb, 'leaderboard', 'alice'), {
            displayName: 'Alice',
            photoURL: '',
            totalPoints: 42,
            totalVisited: 3,
            hasVerified: false
        }));

        await assertFails(setDoc(doc(aliceDb, 'leaderboard', 'bob'), {
            displayName: 'Bob',
            photoURL: '',
            totalPoints: 999,
            totalVisited: 999,
            hasVerified: true
        }));
    });

    it('denies unknown subcollections under users by default', async () => {
        const aliceDb = authedDb('alice');

        await assertFails(setDoc(doc(collection(aliceDb, 'users', 'alice', 'entitlement')), {
            premium: true,
            status: 'manual_active'
        }));
    });
});
