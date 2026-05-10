const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BARK_E2E_BASE_URL || 'http://localhost:4173/index.html';

async function openApp(page) {
    await page.goto(BASE_URL);
    await page.waitForFunction(() => Boolean(
        window.BARK &&
        window.BARK.paywall &&
        window.BARK.services &&
        window.BARK.services.premium &&
        document.getElementById('paywall-promo-code-input') &&
        document.getElementById('profile-premium-card')
    ), { timeout: 30000 });
}

async function installPaywallHarness(page, options = {}) {
    await page.evaluate(({ user, redeemMode }) => {
        const authState = { currentUser: user || null };
        window.__promoRedeemCalls = [];
        window.__checkoutCalls = [];

        if (!window.firebase) window.firebase = {};
        window.firebase.apps = window.firebase.apps && window.firebase.apps.length ? window.firebase.apps : [{}];
        window.firebase.auth = () => ({
            get currentUser() {
                return authState.currentUser;
            },
            onAuthStateChanged(callback) {
                callback(authState.currentUser);
                return () => {};
            }
        });
        window.firebase.functions = () => ({
            httpsCallable(name) {
                return async (payload) => {
                    if (name === 'createCheckoutSession') {
                        window.__checkoutCalls.push({ name, payload });
                        return {
                            data: {
                                checkoutUrl: 'https://usbarkrangers.lemonsqueezy.com/checkout/test-session'
                            }
                        };
                    }
                    if (name !== 'redeemAccessOrPromoCode') {
                        throw new Error(`Unexpected callable ${name}`);
                    }
                    window.__promoRedeemCalls.push({ name, payload });
                    if (redeemMode === 'valid-free') {
                        return {
                            data: {
                                status: 'access_code_granted',
                                grantExpiresAt: '2027-05-09T12:00:00.000Z',
                                autoRenew: false,
                                paymentMethodAttached: false
                            }
                        };
                    }
                    if (redeemMode === 'invalid') {
                        throw new Error('That code was not recognized or has expired.');
                    }
                    return {
                        data: {
                            status: 'lemon_coupon_checkout',
                            checkoutUrl: 'https://usbarkrangers.lemonsqueezy.com/checkout/test-session'
                        }
                    };
                };
            }
        });
    }, options);
}

test.describe('Promo / Access Code paywall UI', () => {
    test('Premium modal exposes exactly one visible Promo / Access Code box before checkout', async ({ page }) => {
        await openApp(page);
        await installPaywallHarness(page, { user: null });

        await page.evaluate(() => window.BARK.paywall.openPaywall({ source: 'manual-upgrade-check' }));

        await expect(page.locator('#paywall-overlay')).toHaveClass(/active/);
        await expect(page.getByLabel('Promo / Access Code')).toBeVisible();
        await expect(page.locator('#paywall-promo-code-btn')).toBeVisible();
        await expect(page.locator('#paywall-primary-btn')).toContainText('Sign in to upgrade');
        await expect(page.locator('#paywall-promo-code-input')).toHaveCount(1);
        await expect(page.getByText('Promo / Access Code')).toHaveCount(1);
        await expect(page.locator('input[id*="coupon"], input[id*="promo"], input[id*="beta"], input[id*="access"]')).toHaveCount(1);
    });

    test('signed-out code entry prompts sign-in and does not call the redeem callable', async ({ page }) => {
        await openApp(page);
        await installPaywallHarness(page, { user: null, redeemMode: 'valid-free' });

        await page.evaluate(() => window.BARK.paywall.openPaywall({ source: 'profile-premium-card' }));
        await page.locator('#paywall-promo-code-input').fill('VIP-2026-TEST');
        await page.locator('#paywall-promo-code-btn').click();

        await expect(page.locator('#paywall-promo-code-message')).toContainText('Sign in first');
        await expect.poll(() => page.evaluate(() => window.__promoRedeemCalls.length)).toBe(0);
    });

    test('signed-in free-code redemption shows activation, expiration, no auto-renew, and no payment method', async ({ page }) => {
        await openApp(page);
        await installPaywallHarness(page, {
            user: { uid: 'free-code-user', email: 'free-code@example.test' },
            redeemMode: 'valid-free'
        });

        await page.evaluate(() => window.BARK.paywall.openPaywall({ source: 'profile-premium-card' }));
        await page.locator('#paywall-promo-code-input').fill('VIP-2026-TEST');
        await page.locator('#paywall-promo-code-btn').click();

        await expect(page.locator('#paywall-promo-code-message')).toContainText('Premium access activated');
        await expect(page.locator('#paywall-promo-code-message')).toContainText('Access ends');
        await expect(page.locator('#paywall-promo-code-message')).toContainText('Auto-renew: No');
        await expect(page.locator('#paywall-promo-code-message')).toContainText('No payment method attached');
        await expect.poll(() => page.evaluate(() => window.__promoRedeemCalls[0].payload.code)).toBe('VIP-2026-TEST');
    });

    test('active access-code entitlement shows free access state without manage billing language', async ({ page }) => {
        await openApp(page);
        await installPaywallHarness(page, {
            user: { uid: 'active-access-user', email: 'active-access@example.test' }
        });

        await page.evaluate(() => {
            window.BARK.services.premium.setEntitlement({
                premium: true,
                status: 'access_code_active',
                source: 'access_code',
                accessCodeAudience: 'admin_mod',
                expiresAt: '2027-05-09T12:00:00.000Z',
                autoRenew: false,
                paymentMethodAttached: false
            }, { uid: 'active-access-user', reason: 'playwright-access-code' });
            window.BARK.paywall.renderCurrentState();
        });

        await expect(page.locator('#profile-premium-status')).toContainText('Free Premium Access');
        await expect(page.locator('#profile-premium-price')).toContainText('No renewal');
        await expect(page.locator('#profile-premium-copy')).toContainText('Auto-renew: No');
        await expect(page.locator('#profile-premium-copy')).toContainText('No payment method attached');
        await expect(page.locator('#profile-premium-copy')).not.toContainText('Manage billing');
    });

    test('expired access-code entitlement shows ended state and subscribe path', async ({ page }) => {
        await openApp(page);
        await installPaywallHarness(page, {
            user: { uid: 'expired-access-user', email: 'expired-access@example.test' }
        });

        await page.evaluate(() => {
            window.BARK.services.premium.setEntitlement({
                premium: true,
                status: 'access_code_active',
                source: 'access_code',
                expiresAt: '2020-01-01T00:00:00.000Z',
                autoRenew: false,
                paymentMethodAttached: false
            }, { uid: 'expired-access-user', reason: 'playwright-expired-access-code' });
            window.BARK.paywall.openPaywall({ source: 'profile-premium-card' });
        });

        await expect(page.locator('#paywall-title')).toContainText('Premium inactive');
        await expect(page.locator('#paywall-body')).toContainText('Free Premium access ended');
        await expect(page.locator('#paywall-primary-btn')).toContainText('Continue to secure checkout');
    });

    test('invalid code shows clean error and leaves normal map browsing available', async ({ page }) => {
        await openApp(page);
        await installPaywallHarness(page, {
            user: { uid: 'invalid-code-user', email: 'invalid@example.test' },
            redeemMode: 'invalid'
        });

        await page.evaluate(() => window.BARK.paywall.openPaywall({ source: 'profile-premium-card' }));
        await page.locator('#paywall-promo-code-input').fill('NOPE-2026-TEST');
        await page.locator('#paywall-promo-code-btn').click();

        await expect(page.locator('#paywall-promo-code-message')).toContainText('That code was not recognized or has expired.');
        await page.locator('#paywall-close-btn').click();
        await expect(page.locator('#park-search')).toBeVisible();
    });

    test('unverified email/password user cannot redeem access code before verification', async ({ page }) => {
        await openApp(page);
        await installPaywallHarness(page, {
            user: {
                uid: 'unverified-code-user',
                email: 'unverified-code@example.test',
                emailVerified: false,
                providerData: [{ providerId: 'password' }]
            },
            redeemMode: 'valid-free'
        });

        await page.evaluate(() => window.BARK.paywall.openPaywall({ source: 'profile-premium-card' }));
        await page.locator('#paywall-promo-code-input').fill('VIP-2026-TEST');
        await page.locator('#paywall-promo-code-btn').click();

        await expect(page.locator('#paywall-promo-code-message')).toContainText('Please verify your email');
        await expect.poll(() => page.evaluate(() => window.__promoRedeemCalls.length)).toBe(0);
    });

    test('unverified email/password user cannot start checkout before verification', async ({ page }) => {
        await openApp(page);
        await installPaywallHarness(page, {
            user: {
                uid: 'unverified-checkout-user',
                email: 'unverified-checkout@example.test',
                emailVerified: false,
                providerData: [{ providerId: 'password' }]
            }
        });

        await page.evaluate(() => window.BARK.paywall.openPaywall({ source: 'profile-premium-card' }));
        await page.locator('#paywall-primary-btn').click();

        await expect(page.locator('#paywall-body')).toContainText('Please verify your email');
        await expect(page.locator('#paywall-promo-code-message')).toContainText('Please verify your email');
        await expect.poll(() => page.evaluate(() => window.__checkoutCalls.length)).toBe(0);
    });
});
