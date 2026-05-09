const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

process.env.NODE_ENV = "test";

const {
    __test: {
        hashAccessCode,
        handleCreateCheckoutSession,
        handleRedeemAccessOrPromoCode,
        isEffectivePremium
    }
} = require("../index.js");

const NOW_MS = Date.parse("2026-05-09T12:00:00.000Z");
const SERVER_TIMESTAMP = "SERVER_TIMESTAMP";
const DAY_MS = 24 * 60 * 60 * 1000;

function authedContext(uid = "access-user", token = {}) {
    return { auth: { uid, token } };
}

function ts(millis) {
    return {
        seconds: Math.floor(millis / 1000),
        nanoseconds: (millis % 1000) * 1000000,
        toMillis() {
            return millis;
        }
    };
}

function getHttpsErrorCode(error) {
    return String(error && error.code ? error.code : "").replace(/^functions\//, "");
}

async function assertRejectsCode(promise, code) {
    await assert.rejects(promise, error => getHttpsErrorCode(error) === code);
}

function makeFirestore(seed = {}) {
    const docs = new Map(Object.entries(seed));
    const state = {
        writes: [],
        transactions: 0
    };

    function snapshot(path) {
        return {
            exists: docs.has(path),
            data: () => ({ ...(docs.get(path) || {}) })
        };
    }

    function docRef(collectionName, docId) {
        const path = `${collectionName}/${docId}`;
        return {
            collectionName,
            docId,
            path,
            async get() {
                return snapshot(path);
            },
            async set(value, options = {}) {
                const previous = docs.get(path) || {};
                const next = options.merge ? { ...previous, ...value } : { ...value };
                docs.set(path, next);
                state.writes.push({ path, value, options });
            }
        };
    }

    return {
        state,
        docs,
        collection(collectionName) {
            return {
                doc(docId) {
                    return docRef(collectionName, docId);
                }
            };
        },
        async runTransaction(callback) {
            state.transactions += 1;
            return callback({
                get(ref) {
                    return ref.get();
                },
                set(ref, value, options) {
                    return ref.set(value, options);
                }
            });
        }
    };
}

function seedAccessCode(rawCode, data) {
    return [`accessCodes/${hashAccessCode(rawCode)}`, {
        codeHash: hashAccessCode(rawCode),
        active: true,
        durationDays: 365,
        redemptionCount: 0,
        oneUsePerUser: true,
        audience: "tester",
        reason: "Launch tester access",
        ...data
    }];
}

describe("access code redemption callable", () => {
    it("rejects unauthenticated access code redemption", async () => {
        await assertRejectsCode(
            handleRedeemAccessOrPromoCode({ code: "VIP-2026-ABC" }, {}, {
                firestore: makeFirestore(),
                nowMs: NOW_MS
            }),
            "unauthenticated"
        );
    });

    it("rejects unverified email/password access code redemption before granting premium", async () => {
        const [path, codeData] = seedAccessCode("VIP-2026-VERIFY", {
            type: "premium_free_year"
        });
        const firestore = makeFirestore({ [path]: codeData });

        await assertRejectsCode(
            handleRedeemAccessOrPromoCode(
                { code: "VIP-2026-VERIFY" },
                authedContext("unverified-code-user", {
                    email: "unverified@example.test",
                    email_verified: false,
                    firebase: { sign_in_provider: "password" }
                }),
                {
                    firestore,
                    nowMs: NOW_MS
                }
            ),
            "failed-precondition"
        );

        assert.equal(firestore.docs.has("users/unverified-code-user"), false);
        assert.equal(firestore.docs.get(path).redemptionCount, 0);
    });

    it("grants one year of premium for a valid free-year access code", async () => {
        const [path, codeData] = seedAccessCode("VIP-2026-ABC", {
            type: "premium_free_year",
            audience: "vip",
            reason: "VIP launch access"
        });
        const firestore = makeFirestore({ [path]: codeData });

        const result = await handleRedeemAccessOrPromoCode(
            { code: " vip-2026-abc " },
            authedContext("vip-user"),
            {
                firestore,
                nowMs: NOW_MS,
                timestampFromMillis: ts,
                serverTimestamp: () => SERVER_TIMESTAMP
            }
        );

        assert.equal(result.status, "access_code_granted");
        assert.equal(result.source, "access_code");
        assert.equal(result.autoRenew, false);
        assert.equal(result.paymentMethodAttached, false);
        assert.equal(result.accessCodeAudience, "vip");
        assert.equal(result.grantExpiresAt, "2027-05-09T12:00:00.000Z");

        const userDoc = firestore.docs.get("users/vip-user");
        assert.equal(userDoc.entitlement.premium, true);
        assert.equal(userDoc.entitlement.status, "access_code_active");
        assert.equal(userDoc.entitlement.source, "access_code");
        assert.equal(userDoc.entitlement.accessCodeType, "premium_free_year");
        assert.equal(userDoc.entitlement.accessCodeAudience, "vip");
        assert.equal(userDoc.entitlement.autoRenew, false);
        assert.equal(userDoc.entitlement.paymentMethodAttached, false);
        assert.equal(userDoc.entitlement.providerSubscriptionId, null);
        assert.equal(userDoc.entitlement.lemonSqueezySubscriptionId, null);
        assert.equal(userDoc.entitlement.expiresAt.toMillis(), Date.parse("2027-05-09T12:00:00.000Z"));

        const updatedCode = firestore.docs.get(path);
        assert.equal(updatedCode.redemptionCount, 1);
        assert.equal(firestore.state.transactions, 1);
    });

    it("rejects inactive and expired access codes", async () => {
        const [inactivePath, inactiveCode] = seedAccessCode("SUPPORT-2026-INACTIVE", {
            type: "premium_free_year",
            active: false
        });
        const [expiredPath, expiredCode] = seedAccessCode("SUPPORT-2026-OLD", {
            type: "premium_free_year",
            expiresAt: ts(NOW_MS - 1000)
        });

        await assertRejectsCode(
            handleRedeemAccessOrPromoCode(
                { code: "SUPPORT-2026-INACTIVE" },
                authedContext("inactive-user"),
                { firestore: makeFirestore({ [inactivePath]: inactiveCode }), nowMs: NOW_MS }
            ),
            "failed-precondition"
        );

        await assertRejectsCode(
            handleRedeemAccessOrPromoCode(
                { code: "SUPPORT-2026-OLD" },
                authedContext("expired-user"),
                { firestore: makeFirestore({ [expiredPath]: expiredCode }), nowMs: NOW_MS }
            ),
            "failed-precondition"
        );
    });

    it("enforces maxRedemptions and oneUsePerUser inside the transaction", async () => {
        const [path, codeData] = seedAccessCode("ADMIN-2026-ONE", {
            type: "premium_free_year",
            maxRedemptions: 1,
            redemptionCount: 1
        });

        await assertRejectsCode(
            handleRedeemAccessOrPromoCode(
                { code: "ADMIN-2026-ONE" },
                authedContext("full-user"),
                { firestore: makeFirestore({ [path]: codeData }), nowMs: NOW_MS }
            ),
            "failed-precondition"
        );

        const [dupePath, dupeCode] = seedAccessCode("ADMIN-2026-DUPE", {
            type: "premium_free_year"
        });
        const dupeHash = hashAccessCode("ADMIN-2026-DUPE");
        const redemptionId = require("../index.js").__test.buildAccessCodeRedemptionId("dupe-user", dupeHash);

        await assertRejectsCode(
            handleRedeemAccessOrPromoCode(
                { code: "ADMIN-2026-DUPE" },
                authedContext("dupe-user"),
                {
                    firestore: makeFirestore({
                        [dupePath]: dupeCode,
                        [`accessCodeRedemptions/${redemptionId}`]: {
                            uid: "dupe-user",
                            codeHash: dupeHash
                        }
                    }),
                    nowMs: NOW_MS
                }
            ),
            "failed-precondition"
        );
    });

    it("does not grant premium for invalid or unknown codes", async () => {
        const firestore = makeFirestore();

        await assertRejectsCode(
            handleRedeemAccessOrPromoCode(
                { code: "bad code!" },
                authedContext("bad-user"),
                { firestore, nowMs: NOW_MS }
            ),
            "failed-precondition"
        );

        await assertRejectsCode(
            handleRedeemAccessOrPromoCode(
                { code: "UNKNOWN-2026-CODE" },
                authedContext("unknown-user"),
                { firestore, nowMs: NOW_MS }
            ),
            "failed-precondition"
        );

        assert.equal(firestore.docs.has("users/bad-user"), false);
        assert.equal(firestore.docs.has("users/unknown-user"), false);
    });

    it("routes configured Lemon coupon passthrough codes to checkout without granting premium", async () => {
        const [path, codeData] = seedAccessCode("LAUNCH20", {
            type: "lemon_coupon_passthrough",
            maxRedemptions: null
        });
        const firestore = makeFirestore({ [path]: codeData });
        let capturedBody = null;

        const result = await handleRedeemAccessOrPromoCode(
            { code: "launch20" },
            authedContext("coupon-user", { email: "coupon@example.test" }),
            {
                firestore,
                nowMs: NOW_MS,
                apiKey: "test-api-key",
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

        assert.equal(result.status, "lemon_coupon_checkout");
        assert.equal(result.discountCodeApplied, "LAUNCH20");
        assert.equal(capturedBody.data.attributes.checkout_data.discount_code, "LAUNCH20");
        assert.equal(capturedBody.data.attributes.test_mode, true);
        assert.equal(firestore.docs.has("users/coupon-user"), false);
    });
});

describe("checkout discount passthrough", () => {
    it("passes safe discount codes into Lemon checkout_data while staying in test mode", async () => {
        let capturedBody = null;
        await handleCreateCheckoutSession(
            { discountCode: "launch_20" },
            authedContext("checkout-user", { email: "checkout@example.test" }),
            {
                apiKey: "test-api-key",
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

        assert.equal(capturedBody.data.attributes.checkout_data.discount_code, "LAUNCH_20");
        assert.equal(capturedBody.data.attributes.checkout_data.custom.firebase_uid, "checkout-user");
        assert.equal(capturedBody.data.attributes.test_mode, true);
    });

    it("rejects unsafe discount code strings before calling Lemon Squeezy", async () => {
        let calls = 0;
        await assertRejectsCode(
            handleCreateCheckoutSession(
                { discountCode: "bad code<script>" },
                authedContext("unsafe-user"),
                {
                    apiKey: "test-api-key",
                    axiosPost: async () => {
                        calls += 1;
                    }
                }
            ),
            "invalid-argument"
        );
        assert.equal(calls, 0);
    });

    it("treats active access-code entitlements as premium only until expiresAt", () => {
        const active = {
            premium: true,
            status: "access_code_active",
            source: "access_code",
            expiresAt: ts(NOW_MS + DAY_MS)
        };
        const expired = {
            ...active,
            expiresAt: ts(NOW_MS - DAY_MS)
        };

        assert.equal(isEffectivePremium(active, { nowMs: NOW_MS }), true);
        assert.equal(isEffectivePremium(expired, { nowMs: NOW_MS }), false);
    });
});
