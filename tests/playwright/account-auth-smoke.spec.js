const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BARK_E2E_BASE_URL;
const STORAGE_STATE = process.env.BARK_E2E_STORAGE_STATE;
const DEFAULT_BASE_URL = 'http://localhost:4173/index.html';
const DEFAULT_STORAGE_STATE = 'playwright/.auth/free-user.json';

const storageStatePath = STORAGE_STATE ? path.resolve(STORAGE_STATE) : null;
const storageStateExists = storageStatePath ? fs.existsSync(storageStatePath) : false;

function buildEnvHelp() {
    return [
        'Account auth UI smoke tests are skipped because BARK_E2E_BASE_URL is missing.',
        '',
        'Local setup:',
        '  python3 -m http.server 4173 --bind localhost',
        `  export BARK_E2E_BASE_URL=${DEFAULT_BASE_URL}`,
        `  export BARK_E2E_STORAGE_STATE="$PWD/${DEFAULT_STORAGE_STATE}"`,
        '  npm run test:e2e:auth-ui'
    ].join('\n');
}

if (!BASE_URL) {
    console.warn(buildEnvHelp());
}

test.skip(!BASE_URL, buildEnvHelp());

test.beforeAll(() => {
    if (!BASE_URL) return;
    try {
        new URL(BASE_URL);
    } catch (error) {
        throw new Error(`BARK_E2E_BASE_URL is not a valid absolute URL: ${BASE_URL}`);
    }
});

async function openApp(page) {
    await page.goto(BASE_URL);
    await page.waitForFunction(() => {
        return Boolean(
            window.BARK &&
            window.BARK.authAccountUi &&
            typeof window.BARK.authAccountUi.showMode === 'function' &&
            window.firebase &&
            typeof window.firebase.auth === 'function' &&
            document.getElementById('account-auth-card')
        );
    }, { timeout: 30000 });
}

async function openProfile(page) {
    await page.locator('.nav-item[data-target="profile-view"]').click();
    await expect(page.locator('#profile-view')).toBeVisible();
}

test.describe('account auth UI smoke', () => {
    test('signed-out users see Google, email sign-in, create, and reset options', async ({ page }) => {
        await openApp(page);
        await page.evaluate(() => window.firebase.auth().signOut());
        await page.waitForFunction(() => !window.firebase.auth().currentUser, { timeout: 30000 });
        await openProfile(page);
        await expect(page.locator('#login-container')).toBeVisible();
        await expect(page.locator('#google-login-btn')).toBeVisible();
        await expect(page.locator('#account-signin-form')).toBeVisible();
        await expect(page.locator('#account-signin-email')).toBeVisible();
        await expect(page.locator('#account-signin-password')).toBeVisible();

        await page.locator('#account-mode-create').click();
        await expect(page.locator('#account-create-form')).toBeVisible();
        await expect(page.locator('#account-create-password')).toHaveAttribute('minlength', '8');

        await page.locator('#account-mode-reset').click();
        await expect(page.locator('#account-reset-form')).toBeVisible();
        await expect(page.locator('#account-reset-email')).toBeVisible();
    });

    test('signed-in users can sign out from the account card', async ({ browser }) => {
        test.skip(!storageStateExists, [
            `BARK_E2E_STORAGE_STATE points to a missing file: ${storageStatePath || '(unset)'}`,
            `Generate it with BARK_E2E_STORAGE_STATE="$PWD/${DEFAULT_STORAGE_STATE}" npm run e2e:auth:save`
        ].join('\n'));

        const context = await browser.newContext({ storageState: storageStatePath });
        const page = await context.newPage();
        try {
            await openApp(page);
            await page.waitForFunction(() => window.firebase.auth().currentUser, { timeout: 30000 });
            await openProfile(page);
            await expect(page.locator('#account-status-card')).toBeVisible();
            await expect(page.locator('#account-display-uid')).not.toHaveText('Loading');

            await page.locator('#account-signout-btn').click();
            await page.waitForFunction(() => !window.firebase.auth().currentUser, { timeout: 30000 });
            await expect(page.locator('#account-status-card')).toBeHidden();
            await expect(page.locator('#login-container')).toBeVisible();
        } finally {
            await context.close();
        }
    });
});
