const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { describe, it } = require("node:test");

process.env.NODE_ENV = "test";

const {
    __test: {
        handleLemonSqueezyWebhook
    }
} = require("../index.js");

const webhookSecret = "test-webhook-secret";
const serverTimestampValue = "SERVER_TIMESTAMP";

function makePayload({
    eventName = "subscription_created",
    uid = "user-a",
    dataType = "subscriptions",
    dataId = "sub_123",
    attributes = {},
    eventId = "evt_123"
} = {}) {
    const meta = {
        event_name: eventName,
        event_id: eventId,
        custom_data: {}
    };

    if (uid !== undefined) {
        meta.custom_data.firebase_uid = uid;
    }

    return {
        meta,
        data: {
            type: dataType,
            id: dataId,
            attributes: {
                test_mode: true,
                store_id: 363425,
                customer_id: 7022381,
                status: "active",
                renews_at: "2099-01-01T00:00:00.000Z",
                ...attributes
            }
        }
    };
}

function raw(payload) {
    return Buffer.from(JSON.stringify(payload), "utf8");
}

function sign(rawBody, secret = webhookSecret) {
    return createHmac("sha256", secret).update(rawBody).digest("hex");
}

function makeReq({ method = "POST", payload, rawBody, signature, eventName } = {}) {
    const body = rawBody || raw(payload || makePayload());
    const headers = {};
    if (signature !== undefined) headers["x-signature"] = signature;
    if (eventName) headers["x-event-name"] = eventName;

    return {
        method,
        rawBody: body,
        headers,
        get(name) {
            return headers[name.toLowerCase()];
        }
    };
}

function makeRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
        send(body) {
            this.body = body;
            return this;
        }
    };
}

function makeFirestore({ entitlement = null, exists = true } = {}) {
    const state = {
        reads: 0,
        writes: [],
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
                                data: () => ({ entitlement })
                            };
                        },
                        async set(data, options) {
                            state.writes.push({ docId, data, options });
                        }
                    };
                }
            };
        }
    };
}

async function invoke({ req, firestore = makeFirestore(), nowMs = Date.parse("2026-01-01T00:00:00.000Z") } = {}) {
    const res = makeRes();
    await handleLemonSqueezyWebhook(req, res, {
        webhookSecret,
        firestore,
        nowMs,
        serverTimestamp: () => serverTimestampValue
    });
    return { res, firestore };
}

function signedReq(payload) {
    const rawBody = raw(payload);
    return makeReq({ payload, rawBody, signature: sign(rawBody) });
}

describe("Lemon Squeezy webhook HTTP and signature verification", () => {
    it("rejects non-POST requests", async () => {
        const { res, firestore } = await invoke({
            req: makeReq({ method: "GET", signature: "unused" })
        });

        assert.equal(res.statusCode, 405);
        assert.equal(firestore.state.reads, 0);
        assert.equal(firestore.state.writes.length, 0);
    });

    it("rejects missing raw bodies", async () => {
        const req = makeReq({ signature: "unused" });
        delete req.rawBody;

        const { res, firestore } = await invoke({ req });

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.error, "missing_raw_body");
        assert.equal(firestore.state.reads, 0);
        assert.equal(firestore.state.writes.length, 0);
    });

    it("rejects missing signatures", async () => {
        const { res, firestore } = await invoke({
            req: makeReq({ payload: makePayload() })
        });

        assert.equal(res.statusCode, 401);
        assert.equal(res.body.error, "missing_signature");
        assert.equal(firestore.state.reads, 0);
        assert.equal(firestore.state.writes.length, 0);
    });

    it("rejects invalid signatures before writing", async () => {
        const { res, firestore } = await invoke({
            req: makeReq({ payload: makePayload(), signature: "not-valid" })
        });

        assert.equal(res.statusCode, 401);
        assert.equal(res.body.error, "invalid_signature");
        assert.equal(firestore.state.reads, 0);
        assert.equal(firestore.state.writes.length, 0);
    });

    it("rejects malformed signature lengths safely", async () => {
        const { res, firestore } = await invoke({
            req: makeReq({ payload: makePayload(), signature: "sha256=abc" })
        });

        assert.equal(res.statusCode, 401);
        assert.equal(res.body.error, "invalid_signature");
        assert.equal(firestore.state.reads, 0);
        assert.equal(firestore.state.writes.length, 0);
    });

    it("rejects malformed signature encodings safely", async () => {
        const { res, firestore } = await invoke({
            req: makeReq({ payload: makePayload(), signature: "z".repeat(64) })
        });

        assert.equal(res.statusCode, 401);
        assert.equal(res.body.error, "invalid_signature");
        assert.equal(firestore.state.reads, 0);
        assert.equal(firestore.state.writes.length, 0);
    });

    it("does not parse JSON before signature verification", async () => {
        const invalidJson = Buffer.from("{not-json", "utf8");
        const { res, firestore } = await invoke({
            req: makeReq({ rawBody: invalidJson, signature: "not-valid" })
        });

        assert.equal(res.statusCode, 401);
        assert.equal(res.body.error, "invalid_signature");
        assert.equal(firestore.state.reads, 0);
        assert.equal(firestore.state.writes.length, 0);
    });

    it("returns a safe error for malformed JSON after valid signature", async () => {
        const invalidJson = Buffer.from("{not-json", "utf8");
        const { res, firestore } = await invoke({
            req: makeReq({ rawBody: invalidJson, signature: sign(invalidJson) })
        });

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.error, "invalid_json");
        assert.equal(firestore.state.reads, 0);
        assert.equal(firestore.state.writes.length, 0);
    });

    it("fails safely when the webhook secret is missing", async () => {
        const payload = makePayload({ eventId: "evt_missing_secret" });
        const rawBody = raw(payload);
        const req = makeReq({ rawBody, signature: sign(rawBody) });
        const res = makeRes();
        const firestore = makeFirestore();

        await handleLemonSqueezyWebhook(req, res, {
            env: {},
            firestore,
            serverTimestamp: () => serverTimestampValue
        });

        assert.equal(res.statusCode, 500);
        assert.equal(res.body.error, "webhook_not_configured");
        assert.equal(firestore.state.reads, 0);
        assert.equal(firestore.state.writes.length, 0);
    });

    it("uses the exact raw body bytes for HMAC verification", async () => {
        const payload = makePayload({
            uid: "raw-body-user",
            eventId: "evt_raw_body"
        });
        const rawBody = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
        const badSignature = sign(raw(payload));
        const rejected = await invoke({
            req: makeReq({ rawBody, signature: badSignature })
        });

        assert.equal(rejected.res.statusCode, 401);
        assert.equal(rejected.firestore.state.writes.length, 0);

        const accepted = await invoke({
            req: makeReq({ rawBody, signature: sign(rawBody) })
        });

        assert.equal(accepted.res.statusCode, 200);
        assert.equal(accepted.firestore.state.writes.length, 1);
        assert.equal(accepted.firestore.state.requestedDoc, "raw-body-user");
    });
});

describe("Lemon Squeezy webhook entitlement mapping", () => {
    it("writes premium active for active subscription_created", async () => {
        const payload = makePayload({
            eventName: "subscription_created",
            uid: "active-user",
            eventId: "evt_active_created",
            attributes: { status: "active" }
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(firestore.state.requestedCollection, "users");
        assert.equal(firestore.state.requestedDoc, "active-user");
        assert.equal(firestore.state.writes.length, 1);
        assert.deepEqual(firestore.state.writes[0].data.entitlement, {
            premium: true,
            status: "active",
            source: "lemon_squeezy",
            providerCustomerId: "7022381",
            providerSubscriptionId: "sub_123",
            providerOrderId: null,
            currentPeriodEnd: "2099-01-01T00:00:00.000Z",
            updatedAt: serverTimestampValue,
            lastProviderEventId: "evt_active_created"
        });
        assert.deepEqual(firestore.state.writes[0].options, { merge: true });
    });

    it("writes premium active for active subscription_updated", async () => {
        const payload = makePayload({
            eventName: "subscription_updated",
            uid: "updated-user",
            eventId: "evt_active_updated",
            attributes: { status: "active" }
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(firestore.state.writes.length, 1);
        assert.equal(firestore.state.writes[0].data.entitlement.premium, true);
        assert.equal(firestore.state.writes[0].data.entitlement.status, "active");
        assert.equal(firestore.state.writes[0].data.entitlement.lastProviderEventId, "evt_active_updated");
    });

    it("writes premium active for subscription_payment_success", async () => {
        const payload = makePayload({
            eventName: "subscription_payment_success",
            uid: "payment-success-user",
            dataType: "subscription-invoices",
            dataId: "invoice_1",
            eventId: "evt_payment_success",
            attributes: {
                status: "paid",
                subscription_id: 12345,
                order_id: 98765
            }
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(firestore.state.writes.length, 1);
        assert.equal(firestore.state.writes[0].data.entitlement.premium, true);
        assert.equal(firestore.state.writes[0].data.entitlement.status, "active");
        assert.equal(firestore.state.writes[0].data.entitlement.providerSubscriptionId, "12345");
        assert.equal(firestore.state.writes[0].data.entitlement.providerOrderId, "98765");
    });

    it("writes premium active for subscription_payment_recovered", async () => {
        const payload = makePayload({
            eventName: "subscription_payment_recovered",
            uid: "payment-recovered-user",
            dataType: "subscription-invoices",
            dataId: "invoice_recovered",
            eventId: "evt_payment_recovered",
            attributes: {
                status: "paid",
                subscription_id: "sub_recovered"
            }
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(firestore.state.writes.length, 1);
        assert.equal(firestore.state.writes[0].data.entitlement.premium, true);
        assert.equal(firestore.state.writes[0].data.entitlement.status, "active");
    });

    it("writes premium active for subscription_resumed active", async () => {
        const payload = makePayload({
            eventName: "subscription_resumed",
            uid: "resumed-user",
            eventId: "evt_subscription_resumed",
            attributes: { status: "active" }
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(firestore.state.writes.length, 1);
        assert.equal(firestore.state.writes[0].data.entitlement.premium, true);
        assert.equal(firestore.state.writes[0].data.entitlement.status, "active");
    });

    it("writes non-premium expired for subscription_expired", async () => {
        const payload = makePayload({
            eventName: "subscription_expired",
            uid: "expired-user",
            eventId: "evt_expired",
            attributes: { status: "expired", ends_at: "2025-01-01T00:00:00.000Z" }
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(firestore.state.writes.length, 1);
        assert.equal(firestore.state.writes[0].data.entitlement.premium, false);
        assert.equal(firestore.state.writes[0].data.entitlement.status, "expired");
    });

    it("writes non-premium expired for subscription_updated expired", async () => {
        const payload = makePayload({
            eventName: "subscription_updated",
            uid: "updated-expired-user",
            eventId: "evt_updated_expired",
            attributes: { status: "expired", ends_at: "2025-01-01T00:00:00.000Z" }
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(firestore.state.writes.length, 1);
        assert.equal(firestore.state.writes[0].data.entitlement.premium, false);
        assert.equal(firestore.state.writes[0].data.entitlement.status, "expired");
    });

    it("writes non-premium past_due for subscription_payment_failed", async () => {
        const payload = makePayload({
            eventName: "subscription_payment_failed",
            uid: "past-due-user",
            eventId: "evt_payment_failed",
            dataType: "subscription-invoices",
            dataId: "invoice_2",
            attributes: { status: "failed", subscription_id: "sub_failed" }
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(firestore.state.writes.length, 1);
        assert.equal(firestore.state.writes[0].data.entitlement.premium, false);
        assert.equal(firestore.state.writes[0].data.entitlement.status, "past_due");
    });

    it("writes non-premium past_due for subscription_updated past_due", async () => {
        const payload = makePayload({
            eventName: "subscription_updated",
            uid: "updated-past-due-user",
            eventId: "evt_updated_past_due",
            attributes: { status: "past_due" }
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(firestore.state.writes.length, 1);
        assert.equal(firestore.state.writes[0].data.entitlement.premium, false);
        assert.equal(firestore.state.writes[0].data.entitlement.status, "past_due");
    });

    it("writes non-premium past_due for subscription_updated unpaid", async () => {
        const payload = makePayload({
            eventName: "subscription_updated",
            uid: "updated-unpaid-user",
            eventId: "evt_updated_unpaid",
            attributes: { status: "unpaid" }
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(firestore.state.writes.length, 1);
        assert.equal(firestore.state.writes[0].data.entitlement.premium, false);
        assert.equal(firestore.state.writes[0].data.entitlement.status, "past_due");
    });

    it("keeps canceled subscriptions active until future ends_at", async () => {
        const payload = makePayload({
            eventName: "subscription_cancelled",
            uid: "cancelled-user",
            eventId: "evt_cancelled_future",
            attributes: {
                status: "cancelled",
                ends_at: "2099-02-01T00:00:00.000Z",
                renews_at: null
            }
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(firestore.state.writes.length, 1);
        assert.equal(firestore.state.writes[0].data.entitlement.premium, true);
        assert.equal(firestore.state.writes[0].data.entitlement.status, "active");
        assert.equal(firestore.state.writes[0].data.entitlement.currentPeriodEnd, "2099-02-01T00:00:00.000Z");
    });

    it("maps canceled subscriptions without a future period to non-premium canceled", async () => {
        const payload = makePayload({
            eventName: "subscription_cancelled",
            uid: "cancelled-ended-user",
            eventId: "evt_cancelled_ended",
            attributes: {
                status: "cancelled",
                ends_at: "2025-02-01T00:00:00.000Z",
                renews_at: null
            }
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(firestore.state.writes.length, 1);
        assert.equal(firestore.state.writes[0].data.entitlement.premium, false);
        assert.equal(firestore.state.writes[0].data.entitlement.status, "canceled");
    });

    it("maps refunded subscription payments to an existing non-premium status", async () => {
        const payload = makePayload({
            eventName: "subscription_payment_refunded",
            uid: "refunded-user",
            eventId: "evt_refunded",
            dataType: "subscription-invoices",
            dataId: "invoice_3",
            attributes: { status: "refunded", subscription_id: "sub_refunded" }
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(firestore.state.writes.length, 1);
        assert.equal(firestore.state.writes[0].data.entitlement.premium, false);
        assert.equal(firestore.state.writes[0].data.entitlement.status, "canceled");
    });

    it("maps refunded orders to an existing non-premium status", async () => {
        const payload = makePayload({
            eventName: "order_refunded",
            uid: "order-refunded-user",
            eventId: "evt_order_refunded",
            dataType: "orders",
            dataId: "order_1",
            attributes: { status: "refunded" }
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(firestore.state.writes.length, 1);
        assert.equal(firestore.state.writes[0].data.entitlement.premium, false);
        assert.equal(firestore.state.writes[0].data.entitlement.status, "canceled");
        assert.equal(firestore.state.writes[0].data.entitlement.providerOrderId, "order_1");
    });
});

describe("Lemon Squeezy webhook ignored and idempotent paths", () => {
    it("writes nothing when firebase_uid is missing", async () => {
        const payload = makePayload({
            uid: null,
            eventId: "evt_missing_uid"
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ignored, true);
        assert.equal(firestore.state.reads, 0);
        assert.equal(firestore.state.writes.length, 0);
    });

    it("writes nothing when firebase_uid is empty", async () => {
        const payload = makePayload({
            uid: "",
            eventId: "evt_empty_uid"
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.reason, "missing_uid");
        assert.equal(firestore.state.reads, 0);
        assert.equal(firestore.state.writes.length, 0);
    });

    it("writes nothing when firebase_uid is not a string", async () => {
        const payload = makePayload({
            uid: 12345,
            eventId: "evt_numeric_uid"
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.reason, "missing_uid");
        assert.equal(firestore.state.reads, 0);
        assert.equal(firestore.state.writes.length, 0);
    });

    it("writes nothing when firebase_uid contains a path separator", async () => {
        const payload = makePayload({
            uid: "users/victim",
            eventId: "evt_path_uid"
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.reason, "missing_uid");
        assert.equal(firestore.state.reads, 0);
        assert.equal(firestore.state.writes.length, 0);
    });

    it("uses X-Event-Name only when meta.event_name is absent", async () => {
        const payload = makePayload({
            eventName: "subscription_created",
            uid: "header-event-user",
            eventId: "evt_header_event"
        });
        delete payload.meta.event_name;
        const rawBody = raw(payload);
        const req = makeReq({
            rawBody,
            signature: sign(rawBody),
            eventName: "subscription_created"
        });
        const { res, firestore } = await invoke({ req });

        assert.equal(res.statusCode, 200);
        assert.equal(firestore.state.writes.length, 1);
        assert.equal(firestore.state.requestedDoc, "header-event-user");
        assert.equal(firestore.state.writes[0].data.entitlement.status, "active");
    });

    it("prefers meta.event_name over X-Event-Name when both are present", async () => {
        const payload = makePayload({
            eventName: "customer_updated",
            uid: "meta-priority-user",
            eventId: "evt_meta_priority"
        });
        const rawBody = raw(payload);
        const req = makeReq({
            rawBody,
            signature: sign(rawBody),
            eventName: "subscription_created"
        });
        const { res, firestore } = await invoke({ req });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.reason, "unsupported_event");
        assert.equal(firestore.state.reads, 0);
        assert.equal(firestore.state.writes.length, 0);
    });

    it("does not trust email or relationship identifiers as Firebase UID", async () => {
        const payload = makePayload({
            uid: "custom-data-user",
            eventId: "evt_uid_authority",
            attributes: {
                user_email: "victim@example.test",
                customer_email: "victim@example.test",
                subscription_id: "sub_uid_authority"
            }
        });
        payload.data.relationships = {
            user: {
                data: {
                    id: "relationship-user"
                }
            }
        };
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(firestore.state.requestedDoc, "custom-data-user");
        assert.equal(firestore.state.writes.length, 1);
    });

    it("ignores signed events for a different store", async () => {
        const payload = makePayload({
            uid: "wrong-store-user",
            eventId: "evt_wrong_store",
            attributes: {
                store_id: 1,
                status: "active"
            }
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.reason, "store_mismatch");
        assert.equal(firestore.state.reads, 0);
        assert.equal(firestore.state.writes.length, 0);
    });

    it("ignores signed live-mode payloads during test-mode phase", async () => {
        const payload = makePayload({
            uid: "live-mode-user",
            eventId: "evt_live_mode",
            attributes: {
                test_mode: false,
                status: "active"
            }
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.reason, "non_test_mode");
        assert.equal(firestore.state.reads, 0);
        assert.equal(firestore.state.writes.length, 0);
    });

    it("writes nothing for unknown signed events", async () => {
        const payload = makePayload({
            eventName: "customer_updated",
            uid: "known-user",
            eventId: "evt_unknown"
        });
        const { res, firestore } = await invoke({ req: signedReq(payload) });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ignored, true);
        assert.equal(firestore.state.reads, 0);
        assert.equal(firestore.state.writes.length, 0);
    });

    it("ignores duplicate event IDs", async () => {
        const payload = makePayload({
            uid: "duplicate-user",
            eventId: "evt_duplicate"
        });
        const existing = {
            premium: true,
            status: "active",
            source: "lemon_squeezy",
            lastProviderEventId: "evt_duplicate"
        };
        const { res, firestore } = await invoke({
            req: signedReq(payload),
            firestore: makeFirestore({ entitlement: existing })
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.duplicate, true);
        assert.equal(firestore.state.writes.length, 0);
    });

    it("ignores repeated expired events with the same event ID", async () => {
        const payload = makePayload({
            eventName: "subscription_expired",
            uid: "duplicate-expired-user",
            eventId: "evt_duplicate_expired",
            attributes: { status: "expired" }
        });
        const existing = {
            premium: false,
            status: "expired",
            source: "lemon_squeezy",
            lastProviderEventId: "evt_duplicate_expired"
        };
        const { res, firestore } = await invoke({
            req: signedReq(payload),
            firestore: makeFirestore({ entitlement: existing })
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.duplicate, true);
        assert.equal(firestore.state.writes.length, 0);
    });

    it("ignores repeated past_due events with the same event ID", async () => {
        const payload = makePayload({
            eventName: "subscription_payment_failed",
            uid: "duplicate-past-due-user",
            eventId: "evt_duplicate_past_due",
            attributes: { status: "failed" }
        });
        const existing = {
            premium: false,
            status: "past_due",
            source: "lemon_squeezy",
            lastProviderEventId: "evt_duplicate_past_due"
        };
        const { res, firestore } = await invoke({
            req: signedReq(payload),
            firestore: makeFirestore({ entitlement: existing })
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.duplicate, true);
        assert.equal(firestore.state.writes.length, 0);
    });

    it("derives a stable event ID when provider event ID is absent", async () => {
        const payload = makePayload({
            uid: "derived-event-user",
            eventId: undefined
        });
        delete payload.meta.event_id;

        const firstRawBody = raw(payload);
        const firstReq = makeReq({ rawBody: firstRawBody, signature: sign(firstRawBody) });
        const firstResult = await invoke({ req: firstReq });
        const writtenId = firstResult.firestore.state.writes[0].data.entitlement.lastProviderEventId;

        const secondRawBody = raw(payload);
        const secondReq = makeReq({ rawBody: secondRawBody, signature: sign(secondRawBody) });
        const secondResult = await invoke({
            req: secondReq,
            firestore: makeFirestore({
                entitlement: {
                    premium: true,
                    status: "active",
                    source: "lemon_squeezy",
                    lastProviderEventId: writtenId
                }
            })
        });

        assert.match(writtenId, /^derived_[0-9a-f]{64}$/);
        assert.equal(secondResult.res.body.duplicate, true);
        assert.equal(secondResult.firestore.state.writes.length, 0);
    });

    it("does not downgrade manual_active admin overrides", async () => {
        const payload = makePayload({
            eventName: "subscription_payment_failed",
            uid: "manual-user",
            eventId: "evt_manual_override",
            attributes: { status: "failed" }
        });
        const { res, firestore } = await invoke({
            req: signedReq(payload),
            firestore: makeFirestore({
                entitlement: {
                    premium: true,
                    status: "manual_active",
                    source: "admin_override",
                    manualOverride: true
                }
            })
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.reason, "manual_override");
        assert.equal(firestore.state.writes.length, 0);
    });

    it("does not downgrade manual_active admin overrides with expired events", async () => {
        const payload = makePayload({
            eventName: "subscription_expired",
            uid: "manual-expired-user",
            eventId: "evt_manual_expired",
            attributes: { status: "expired" }
        });
        const { res, firestore } = await invoke({
            req: signedReq(payload),
            firestore: makeFirestore({
                entitlement: {
                    premium: true,
                    status: "manual_active",
                    source: "admin_override",
                    manualOverride: true
                }
            })
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.reason, "manual_override");
        assert.equal(firestore.state.writes.length, 0);
    });

    it("does not downgrade manual_active admin overrides with refunded events", async () => {
        const payload = makePayload({
            eventName: "subscription_payment_refunded",
            uid: "manual-refunded-user",
            eventId: "evt_manual_refunded",
            attributes: { status: "refunded" }
        });
        const { res, firestore } = await invoke({
            req: signedReq(payload),
            firestore: makeFirestore({
                entitlement: {
                    premium: true,
                    status: "manual_active",
                    source: "admin_override",
                    manualOverride: true
                }
            })
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.reason, "manual_override");
        assert.equal(firestore.state.writes.length, 0);
    });

    it("does not erase manual_active admin override metadata with active events", async () => {
        const payload = makePayload({
            eventName: "subscription_updated",
            uid: "manual-active-user",
            eventId: "evt_manual_active",
            attributes: { status: "active" }
        });
        const { res, firestore } = await invoke({
            req: signedReq(payload),
            firestore: makeFirestore({
                entitlement: {
                    premium: true,
                    status: "manual_active",
                    source: "admin_override",
                    manualOverride: true,
                    note: "comped"
                }
            })
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.reason, "manual_override");
        assert.equal(firestore.state.writes.length, 0);
    });
});
