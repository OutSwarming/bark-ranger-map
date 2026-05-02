const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

process.env.NODE_ENV = "test";

const {
    __test: {
        buildCheckoutReturnUrl,
        buildLemonSqueezyCheckoutPayload,
        handleCreateCheckoutSession
    }
} = require("../index.js");

function authedContext(uid = "user-a", token = {}) {
    return { auth: { uid, token } };
}

function getHttpsErrorCode(error) {
    return String(error && error.code ? error.code : "").replace(/^functions\//, "");
}

async function assertRejectsCode(promise, code) {
    await assert.rejects(
        promise,
        (error) => getHttpsErrorCode(error) === code
    );
}

const config = {
    apiKey: "test-api-key",
    storeId: "363425",
    annualVariantId: "1604336",
    appBaseUrl: "https://outswarming.github.io/bark-ranger-map/"
};

describe("Lemon Squeezy checkout session helpers", () => {
    it("builds checkout return URLs from the app base URL", () => {
        assert.equal(
            buildCheckoutReturnUrl(config.appBaseUrl, "success"),
            "https://outswarming.github.io/bark-ranger-map/?checkout=success&provider=lemonsqueezy"
        );
        assert.equal(
            buildCheckoutReturnUrl(config.appBaseUrl, "canceled"),
            "https://outswarming.github.io/bark-ranger-map/?checkout=canceled&provider=lemonsqueezy"
        );
    });

    it("builds a test-mode annual checkout payload with Firebase UID custom data", () => {
        const payload = buildLemonSqueezyCheckoutPayload({
            uid: "real-user",
            token: {
                email: "ranger@example.test",
                name: "Ranger Tester"
            },
            config
        });

        assert.equal(payload.data.type, "checkouts");
        assert.equal(payload.data.attributes.test_mode, true);
        assert.deepEqual(payload.data.attributes.product_options.enabled_variants, [1604336]);
        assert.equal(
            payload.data.attributes.product_options.redirect_url,
            "https://outswarming.github.io/bark-ranger-map/?checkout=success&provider=lemonsqueezy"
        );
        assert.equal(payload.data.attributes.checkout_data.email, "ranger@example.test");
        assert.equal(payload.data.attributes.checkout_data.name, "Ranger Tester");
        assert.equal(payload.data.attributes.checkout_data.custom.firebase_uid, "real-user");
        assert.equal(payload.data.attributes.checkout_data.custom.plan, "annual");
        assert.equal(payload.data.relationships.store.data.id, "363425");
        assert.equal(payload.data.relationships.variant.data.id, "1604336");
    });
});

describe("Lemon Squeezy checkout session callable", () => {
    it("rejects unauthenticated checkout requests", async () => {
        await assertRejectsCode(
            handleCreateCheckoutSession({}, {}, {
                ...config,
                axiosPost: async () => {
                    throw new Error("should not call Lemon Squeezy");
                }
            }),
            "unauthenticated"
        );
    });

    it("returns only the hosted checkout URL for signed-in users", async () => {
        let captured = null;

        const result = await handleCreateCheckoutSession(
            {
                uid: "client-forged",
                variantId: "client-variant",
                price: "free",
                test_mode: false
            },
            authedContext("server-user", {
                email: "server-user@example.test",
                name: "Server User"
            }),
            {
                apiKey: config.apiKey,
                axiosPost: async (url, body, requestConfig) => {
                    captured = { url, body, requestConfig };
                    return {
                        data: {
                            data: {
                                attributes: {
                                    url: "https://usbarkrangers.lemonsqueezy.com/checkout/test-session"
                                }
                            }
                        }
                    };
                }
            }
        );

        assert.deepEqual(result, {
            checkoutUrl: "https://usbarkrangers.lemonsqueezy.com/checkout/test-session"
        });
        assert.equal(captured.url, "https://api.lemonsqueezy.com/v1/checkouts");
        assert.equal(captured.requestConfig.headers.Accept, "application/vnd.api+json");
        assert.equal(captured.requestConfig.headers["Content-Type"], "application/vnd.api+json");
        assert.equal(captured.requestConfig.headers.Authorization, "Bearer test-api-key");
        assert.equal(captured.body.data.attributes.test_mode, true);
        assert.deepEqual(captured.body.data.attributes.product_options.enabled_variants, [1604336]);
        assert.equal(captured.body.data.relationships.store.data.id, "363425");
        assert.equal(captured.body.data.relationships.variant.data.id, "1604336");
        assert.equal(captured.body.data.attributes.checkout_data.custom.firebase_uid, "server-user");
        assert.equal(captured.body.data.attributes.checkout_data.email, "server-user@example.test");
        assert.equal(captured.body.data.attributes.checkout_data.name, "Server User");
    });

    it("ignores client-provided uid, price, variant, and test mode", async () => {
        let capturedBody = null;

        await handleCreateCheckoutSession(
            {
                uid: "attacker",
                firebase_uid: "attacker",
                storeId: "1",
                variantId: "2",
                price: 0,
                test_mode: false
            },
            authedContext("trusted-uid"),
            {
                apiKey: config.apiKey,
                axiosPost: async (_url, body) => {
                    capturedBody = body;
                    return {
                        data: {
                            data: {
                                attributes: {
                                    url: "https://usbarkrangers.lemonsqueezy.com/checkout/test-session"
                                }
                            }
                        }
                    };
                }
            }
        );

        assert.equal(capturedBody.data.attributes.checkout_data.custom.firebase_uid, "trusted-uid");
        assert.equal(capturedBody.data.relationships.store.data.id, "363425");
        assert.equal(capturedBody.data.relationships.variant.data.id, "1604336");
        assert.deepEqual(capturedBody.data.attributes.product_options.enabled_variants, [1604336]);
        assert.equal(capturedBody.data.attributes.test_mode, true);
    });

    it("forces backend store, variant, and app URL even if options/env try to override them", async () => {
        let capturedBody = null;

        await handleCreateCheckoutSession(
            {},
            authedContext("forced-config-user"),
            {
                apiKey: config.apiKey,
                storeId: "wrong-store",
                annualVariantId: "wrong-variant",
                appBaseUrl: "https://example.invalid/wrong",
                env: {
                    LEMONSQUEEZY_API_KEY: "wrong-env-key",
                    LEMONSQUEEZY_STORE_ID: "wrong-env-store",
                    LEMONSQUEEZY_ANNUAL_VARIANT_ID: "wrong-env-variant",
                    APP_BASE_URL: "https://example.invalid/env"
                },
                axiosPost: async (_url, body) => {
                    capturedBody = body;
                    return {
                        data: {
                            data: {
                                attributes: {
                                    url: "https://usbarkrangers.lemonsqueezy.com/checkout/test-session"
                                }
                            }
                        }
                    };
                }
            }
        );

        assert.equal(capturedBody.data.relationships.store.data.id, "363425");
        assert.equal(capturedBody.data.relationships.variant.data.id, "1604336");
        assert.deepEqual(capturedBody.data.attributes.product_options.enabled_variants, [1604336]);
        assert.equal(
            capturedBody.data.attributes.product_options.redirect_url,
            "https://outswarming.github.io/bark-ranger-map/?checkout=success&provider=lemonsqueezy"
        );
        assert.equal(
            capturedBody.data.attributes.checkout_data.custom.cancel_url,
            "https://outswarming.github.io/bark-ranger-map/?checkout=canceled&provider=lemonsqueezy"
        );
    });

    it("fails closed when the Lemon Squeezy API key is missing", async () => {
        await assertRejectsCode(
            handleCreateCheckoutSession(
                {},
                authedContext("user-without-config"),
                {
                    env: {}
                }
            ),
            "failed-precondition"
        );
    });

    it("returns a safe error when Lemon Squeezy fails", async () => {
        await assertRejectsCode(
            handleCreateCheckoutSession(
                {},
                authedContext("api-failure-user"),
                {
                    apiKey: config.apiKey,
                    axiosPost: async () => {
                        const error = new Error("provider failed");
                        error.response = { status: 500, data: { secret: "do-not-leak" } };
                        throw error;
                    }
                }
            ),
            "internal"
        );
    });

    it("returns a safe error when Lemon Squeezy omits the checkout URL", async () => {
        await assertRejectsCode(
            handleCreateCheckoutSession(
                {},
                authedContext("invalid-response-user"),
                {
                    apiKey: config.apiKey,
                    axiosPost: async () => ({ data: { data: { attributes: {} } } })
                }
            ),
            "internal"
        );
    });

    it("does not write entitlement during checkout creation", async () => {
        let firestoreTouched = false;

        await handleCreateCheckoutSession(
            { entitlement: { premium: true, status: "active" } },
            authedContext("no-entitlement-write"),
            {
                apiKey: config.apiKey,
                firestore: {
                    collection() {
                        firestoreTouched = true;
                        throw new Error("checkout creation must not touch Firestore");
                    }
                },
                axiosPost: async () => ({
                    data: {
                        data: {
                            attributes: {
                                url: "https://usbarkrangers.lemonsqueezy.com/checkout/test-session"
                            }
                        }
                    }
                })
            }
        );

        assert.equal(firestoreTouched, false);
    });
});
