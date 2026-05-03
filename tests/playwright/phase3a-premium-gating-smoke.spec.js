const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BARK_E2E_BASE_URL;
const STORAGE_STATE = process.env.BARK_E2E_STORAGE_STATE;
const DEFAULT_BASE_URL = 'http://localhost:4173/index.html';
const DEFAULT_STORAGE_STATE = 'node_modules/.cache/bark-e2e/storage-state.json';

const missingBaseEnv = [
    !BASE_URL ? 'BARK_E2E_BASE_URL' : null,
].filter(Boolean);

const missingSignedInEnv = [
    !BASE_URL ? 'BARK_E2E_BASE_URL' : null,
    !STORAGE_STATE ? 'BARK_E2E_STORAGE_STATE' : null
].filter(Boolean);

const storageStatePath = STORAGE_STATE ? path.resolve(STORAGE_STATE) : null;
const storageStateExists = storageStatePath ? fs.existsSync(storageStatePath) : false;

function buildEnvHelp(missing = missingSignedInEnv) {
    return [
        'Phase 3A premium gating smoke tests are skipped because required configuration is missing.',
        `Missing: ${missing.join(', ')}`,
        '',
        'Local setup:',
        '  python3 -m http.server 4173 --bind localhost',
        `  export BARK_E2E_BASE_URL=${DEFAULT_BASE_URL}`,
        `  export BARK_E2E_STORAGE_STATE="$PWD/${DEFAULT_STORAGE_STATE}"`,
        '  npm run e2e:auth:save',
        '  npm run test:e2e:premium',
        '',
        'Notes:',
        '  - The storage state should be created with the Firebase Email/Password E2E test account.',
        '  - Google OAuth remains blocked in Playwright Chromium.',
        '  - Real users still use Google sign-in; no email/password UI was added.'
    ].join('\n');
}

if (missingBaseEnv.length > 0) {
    console.warn(buildEnvHelp(missingBaseEnv));
} else if (missingSignedInEnv.length > 0) {
    console.warn(buildEnvHelp(missingSignedInEnv));
}

test.skip(missingBaseEnv.length > 0, buildEnvHelp(missingBaseEnv));

test.beforeAll(() => {
    if (!BASE_URL) return;
    try {
        new URL(BASE_URL);
    } catch (error) {
        throw new Error(`BARK_E2E_BASE_URL is not a valid absolute URL: ${BASE_URL}`);
    }

    if (STORAGE_STATE && !storageStateExists) {
        throw new Error([
            `BARK_E2E_STORAGE_STATE points to a missing file: ${storageStatePath}`,
            'Generate it with:',
            `  export BARK_E2E_BASE_URL=${DEFAULT_BASE_URL}`,
            `  export BARK_E2E_STORAGE_STATE="$PWD/${DEFAULT_STORAGE_STATE}"`,
            '  npm run e2e:auth:save'
        ].join('\n'));
    }
});

async function openApp(page) {
    await page.goto(BASE_URL);
    await page.waitForFunction(() => {
        const bark = window.BARK;
        return Boolean(
            bark &&
            bark.authPremiumUi &&
            typeof bark.authPremiumUi.applyPremiumGating === 'function' &&
            document.getElementById('premium-filters-wrap') &&
            document.getElementById('visited-filter') &&
            document.getElementById('map-style-select')
        );
    }, { timeout: 30000 });
}

async function waitForSignedInApp(page) {
    await openApp(page);
    await page.waitForFunction(() => {
        return Boolean(
            window.firebase &&
            typeof window.firebase.auth === 'function' &&
            window.firebase.auth().currentUser
        );
    }, { timeout: 30000 });
    await page.waitForFunction(() => {
        const service = window.BARK && window.BARK.services && window.BARK.services.premium;
        if (!service || typeof service.getDebugState !== 'function') return false;
        const state = service.getDebugState();
        return Boolean(state && state.meta && /^auth-user-snapshot/.test(state.meta.reason || ''));
    }, { timeout: 30000 });
}

async function waitForSignedOutApp(page) {
    await openApp(page);
    await page.waitForFunction(() => {
        return Boolean(
            window.firebase &&
            typeof window.firebase.auth === 'function' &&
            !window.firebase.auth().currentUser
        );
    }, { timeout: 30000 });
}

async function getTrailButtonStates(page) {
    return page.locator('#toggle-virtual-trail, #toggle-completed-trails').evaluateAll(buttons => (
        buttons.map(button => ({
            id: button.id,
            disabled: button.disabled === true,
            ariaDisabled: button.getAttribute('aria-disabled')
        }))
    ));
}

async function expectLowRiskPremiumControlsLocked(page) {
    const premiumWrap = page.locator('#premium-filters-wrap');
    const visitedFilter = page.locator('#visited-filter');
    const mapStyleSelect = page.locator('#map-style-select');

    await expect(premiumWrap).toHaveCount(1);
    await expect(premiumWrap).toHaveClass(/premium-locked/);
    await expect(premiumWrap).not.toHaveClass(/premium-unlocked/);

    await expect(visitedFilter).toHaveCount(1);
    await expect(visitedFilter).toBeDisabled();
    await expect(visitedFilter).toHaveValue('all');

    await expect(mapStyleSelect).toHaveCount(1);
    await expect(mapStyleSelect).toBeDisabled();
    await expect(mapStyleSelect).toHaveValue('default');
}

async function expectTrailButtonsLocked(page) {
    const trailButtons = await getTrailButtonStates(page);
    for (const button of trailButtons) {
        expect(button.disabled, `${button.id} should be disabled`).toBe(true);
        expect(button.ariaDisabled, `${button.id} should be aria-disabled`).toBe('true');
    }
}

async function expectLowRiskPremiumControlsUnlocked(page) {
    const premiumWrap = page.locator('#premium-filters-wrap');
    const visitedFilter = page.locator('#visited-filter');
    const mapStyleSelect = page.locator('#map-style-select');

    await expect(premiumWrap).toHaveCount(1);
    await expect(premiumWrap).toHaveClass(/premium-unlocked/);
    await expect(premiumWrap).not.toHaveClass(/premium-locked/);

    await expect(visitedFilter).toHaveCount(1);
    await expect(visitedFilter).toBeEnabled();

    await expect(mapStyleSelect).toHaveCount(1);
    await expect(mapStyleSelect).toBeEnabled();
}

async function expectTrailButtonsUnlocked(page) {
    const trailButtons = await getTrailButtonStates(page);
    for (const button of trailButtons) {
        expect(button.disabled, `${button.id} should be enabled`).toBe(false);
        expect(button.ariaDisabled, `${button.id} should not be aria-disabled`).toBe('false');
    }
}

test.describe('Phase 3A premium gating smoke', () => {
    test('signed-out app locks premium controls', async ({ page }) => {
        await waitForSignedOutApp(page);
        await expectLowRiskPremiumControlsLocked(page);
        await expectTrailButtonsLocked(page);
    });

    test('signed-out app sanitizes stored premium map surfaces', async ({ browser }) => {
        const context = await browser.newContext();
        await context.addInitScript(() => {
            window.localStorage.setItem('barkMapStyle', 'terrain');
            window.localStorage.setItem('barkVisitedFilter', 'visited');
            window.localStorage.setItem('barkPremiumClustering', 'true');
            window.localStorage.setItem('premiumLoggedIn', 'true');
        });

        const page = await context.newPage();
        try {
            await waitForSignedOutApp(page);
            await expectLowRiskPremiumControlsLocked(page);
            await expectTrailButtonsLocked(page);
            await page.waitForFunction(() => {
                const styleEl = document.getElementById('map-style-select');
                const filterEl = document.getElementById('visited-filter');
                return Boolean(
                    styleEl &&
                    filterEl &&
                    styleEl.value === 'default' &&
                    filterEl.value === 'all' &&
                    window.BARK &&
                    window.BARK.visitedFilterState === 'all' &&
                    window.premiumClusteringEnabled === false &&
                    window.localStorage.getItem('barkMapStyle') === 'default' &&
                    window.localStorage.getItem('barkVisitedFilter') === 'all' &&
                    window.localStorage.getItem('barkPremiumClustering') === 'false'
                );
            }, { timeout: 30000 });

            const state = await page.evaluate(() => ({
                isPremium: window.BARK.services.premium.isPremium(),
                premiumLoggedIn: window.localStorage.getItem('premiumLoggedIn'),
                attribution: document.querySelector('.leaflet-control-attribution')?.textContent || '',
                tileUrls: Array.from(document.querySelectorAll('img.leaflet-tile')).map(img => img.src)
            }));

            expect(state.isPremium, 'premiumLoggedIn localStorage must not unlock premium').toBe(false);
            expect(state.premiumLoggedIn).toBe('true');
            expect(state.attribution).not.toContain('OpenTopoMap');
            expect(state.tileUrls.some(url => url.includes('opentopomap'))).toBe(false);
        } finally {
            await context.close();
        }
    });

    test('stale premium entitlement for a previous account does not unlock signed-out runtime', async ({ page }) => {
        await waitForSignedOutApp(page);
        const state = await page.evaluate(() => {
            const service = window.BARK.services.premium;
            service.setEntitlement({
                premium: true,
                status: 'manual_active',
                source: 'admin_override',
                manualOverride: true,
                currentPeriodEnd: null
            }, {
                uid: 'previous-premium-user',
                reason: 'bug-003-stale-uid-regression'
            });

            const debugState = service.getDebugState();
            return {
                currentUid: firebase.auth().currentUser ? firebase.auth().currentUser.uid : null,
                isPremium: service.isPremium(),
                entitlement: service.getEntitlement(),
                debugUid: debugState && debugState.meta ? debugState.meta.uid : null
            };
        });

        expect(state.currentUid).toBeNull();
        expect(state.debugUid).toBe('previous-premium-user');
        expect(state.entitlement).toMatchObject({
            premium: true,
            status: 'manual_active',
            source: 'admin_override',
            manualOverride: true,
            currentPeriodEnd: null
        });
        expect(state.isPremium, 'stale previous-account entitlement must not unlock premium').toBe(false);
        await expectLowRiskPremiumControlsLocked(page);
        await expectTrailButtonsLocked(page);
    });

    test('signed-out app blocks premium clustering setting changes', async ({ page }) => {
        await waitForSignedOutApp(page);
        await page.waitForFunction(() => Boolean(
            window.BARK &&
            window.BARK.settings &&
            document.getElementById('premium-cluster-toggle')
        ), { timeout: 30000 });

        const state = await page.evaluate(() => {
            const toggle = document.getElementById('premium-cluster-toggle');
            const before = {
                isPremium: window.BARK.services.premium.isPremium(),
                premiumClusteringEnabled: window.premiumClusteringEnabled,
                checked: toggle.checked,
                disabled: toggle.disabled,
                ariaDisabled: toggle.getAttribute('aria-disabled'),
                stored: window.localStorage.getItem('barkPremiumClustering')
            };

            toggle.checked = true;
            toggle.dispatchEvent(new Event('change', { bubbles: true }));

            return {
                before,
                after: {
                    isPremium: window.BARK.services.premium.isPremium(),
                    premiumClusteringEnabled: window.premiumClusteringEnabled,
                    checked: toggle.checked,
                    disabled: toggle.disabled,
                    ariaDisabled: toggle.getAttribute('aria-disabled'),
                    stored: window.localStorage.getItem('barkPremiumClustering')
                }
            };
        });

        expect(state.before.isPremium).toBe(false);
        expect(state.after.isPremium).toBe(false);
        expect(state.after.premiumClusteringEnabled).toBe(false);
        expect(state.after.checked).toBe(false);
        expect(state.after.disabled).toBe(true);
        expect(state.after.ariaDisabled).toBe('true');
        expect(state.after.stored).toBe('false');
    });

    test('signed-in free app keeps entitlement-gated controls locked', async ({ browser }) => {
        test.skip(missingSignedInEnv.length > 0, buildEnvHelp(missingSignedInEnv));
        const context = await browser.newContext({ storageState: storageStatePath });
        const page = await context.newPage();
        try {
            await waitForSignedInApp(page);
            await expect(page.evaluate(() => window.BARK.services.premium.isPremium())).resolves.toBe(false);
            await expectLowRiskPremiumControlsLocked(page);
            await expectTrailButtonsLocked(page);
        } finally {
            await context.close();
        }
    });
});
