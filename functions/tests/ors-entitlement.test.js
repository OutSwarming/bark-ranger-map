const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

process.env.NODE_ENV = "test";

const {
    __test: {
        normalizeEntitlement,
        isEffectivePremium,
        requirePremiumCallable,
        handlePremiumRoute,
        handlePremiumGeocode
    }
} = require("../index.js");

function authedContext(uid = "user-a") {
    return { auth: { uid, token: {} } };
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

function makeFirestore({ entitlement, exists = true, data } = {}) {
    const state = {
        reads: 0,
        requestedCollection: null,
        requestedDoc: null
    };

    return {
        state,
        collection(collectionName) {
            state.requestedCollection = collectionName;
            return {
                doc(docId) {
                    state.requestedDoc = docId;
                    return {
                        async get() {
                            state.reads += 1;
                            return {
                                exists,
                                data: () => data || { entitlement }
                            };
                        }
                    };
                }
            };
        }
    };
}

const premiumEntitlement = {
    premium: true,
    status: "manual_active",
    source: "admin_override",
    manualOverride: true,
    currentPeriodEnd: null
};

describe("ORS premium callable entitlement helpers", () => {
    it("normalizes missing and malformed entitlements to non-premium", () => {
        assert.deepEqual(normalizeEntitlement(null), {
            premium: false,
            status: "free",
            source: "none",
            manualOverride: false,
            currentPeriodEnd: null
        });
        assert.equal(isEffectivePremium("premium"), false);
        assert.equal(isEffectivePremium({ premium: true, status: "free" }), false);
    });

    it("allows only active and manual_active premium entitlements", () => {
        assert.equal(isEffectivePremium({ premium: true, status: "active" }), true);
        assert.equal(isEffectivePremium({ premium: true, status: "manual_active" }), true);

        for (const status of ["canceled", "expired", "past_due", "trialing", "free"]) {
            assert.equal(isEffectivePremium({ premium: true, status }), false, status);
        }
    });

    it("rejects unauthenticated premium callable requests", async () => {
        await assertRejectsCode(
            requirePremiumCallable({}, "getPremiumRoute", {
                firestore: makeFirestore({ entitlement: premiumEntitlement })
            }),
            "unauthenticated"
        );
    });

    it("rejects signed-in free users", async () => {
        const firestore = makeFirestore({
            entitlement: { premium: false, status: "free", source: "none" }
        });

        await assertRejectsCode(
            requirePremiumCallable(authedContext("free-user"), "getPremiumRoute", { firestore }),
            "permission-denied"
        );

        assert.equal(firestore.state.requestedCollection, "users");
        assert.equal(firestore.state.requestedDoc, "free-user");
        assert.equal(firestore.state.reads, 1);
    });

    it("rejects malformed and inactive premium entitlements", async () => {
        for (const entitlement of [
            "premium",
            { premium: true },
            { premium: true, status: "canceled" },
            { premium: true, status: "expired" },
            { premium: true, status: "past_due" }
        ]) {
            await assertRejectsCode(
                requirePremiumCallable(authedContext("inactive-user"), "getPremiumGeocode", {
                    firestore: makeFirestore({ entitlement })
                }),
                "permission-denied"
            );
        }
    });

    it("allows premium manual override users", async () => {
        const result = await requirePremiumCallable(authedContext("premium-user"), "getPremiumRoute", {
            firestore: makeFirestore({ entitlement: premiumEntitlement })
        });

        assert.equal(result.uid, "premium-user");
        assert.equal(result.entitlement.premium, true);
        assert.equal(result.entitlement.status, "manual_active");
    });
});

describe("ORS premium callable handlers", () => {
    it("rejects free route requests before ORS is called and ignores client isPremium", async () => {
        let postCalls = 0;

        await assertRejectsCode(
            handlePremiumRoute(
                {
                    data: {
                        coordinates: [[-122.4, 37.8], [-122.5, 37.9]],
                        isPremium: true
                    }
                },
                authedContext("free-user"),
                {
                    firestore: makeFirestore({
                        entitlement: { premium: false, status: "free", source: "none" }
                    }),
                    getOrsApiKey: () => "test-key",
                    axiosPost: async () => {
                        postCalls += 1;
                        return { data: { ok: true } };
                    }
                }
            ),
            "permission-denied"
        );

        assert.equal(postCalls, 0);
    });

    it("rejects free geocode requests before ORS is called and ignores client isPremium", async () => {
        let getCalls = 0;

        await assertRejectsCode(
            handlePremiumGeocode(
                { text: "San Francisco", isPremium: true },
                authedContext("free-user"),
                {
                    firestore: makeFirestore({
                        entitlement: { premium: false, status: "free", source: "none" }
                    }),
                    getOrsApiKey: () => "test-key",
                    axiosGet: async () => {
                        getCalls += 1;
                        return { data: { features: [] } };
                    }
                }
            ),
            "permission-denied"
        );

        assert.equal(getCalls, 0);
    });

    it("allows premium route requests through to the ORS transport path", async () => {
        let capturedRequest = null;

        const result = await handlePremiumRoute(
            {
                data: {
                    coordinates: [[-122.4, 37.8], [-122.5, 37.9]],
                    radiuses: [350, 350]
                }
            },
            authedContext("premium-user"),
            {
                firestore: makeFirestore({ entitlement: premiumEntitlement }),
                getOrsApiKey: () => "test-key",
                axiosPost: async (url, body, config) => {
                    capturedRequest = { url, body, config };
                    return { data: { type: "FeatureCollection" } };
                }
            }
        );

        assert.deepEqual(result, { type: "FeatureCollection" });
        assert.match(capturedRequest.url, /openrouteservice\.org\/v2\/directions/);
        assert.deepEqual(capturedRequest.body.radiuses, [350, 350]);
        assert.equal(capturedRequest.config.headers.Authorization, "test-key");
    });

    it("allows premium geocode requests through to the ORS transport path", async () => {
        let capturedUrl = "";

        const result = await handlePremiumGeocode(
            { data: { text: "Seattle", size: 3, country: "US" } },
            authedContext("premium-user"),
            {
                firestore: makeFirestore({ entitlement: premiumEntitlement }),
                getOrsApiKey: () => "test-key",
                axiosGet: async (url) => {
                    capturedUrl = url;
                    return { data: { features: [{ properties: { label: "Seattle" } }] } };
                }
            }
        );

        assert.equal(result.features[0].properties.label, "Seattle");
        assert.match(capturedUrl, /openrouteservice\.org\/geocode\/search/);
        assert.match(capturedUrl, /text=Seattle/);
        assert.match(capturedUrl, /size=3/);
        assert.match(capturedUrl, /boundary\.country=US/);
    });
});
