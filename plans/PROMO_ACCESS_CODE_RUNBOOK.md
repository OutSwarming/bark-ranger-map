# BARK Ranger Promo / Access Code Runbook

Date: 2026-05-09

Status: implemented for private-beta hardening. Lemon Squeezy remains locked in test mode until Carter explicitly approves the final RC live-mode switch.

## Model

There is one user-facing field: **Promo / Access Code**. The server decides what the code means.

Server-only collections:

- `accessCodes/{codeHash}`: Carter-controlled code definitions. Clients cannot read or write this collection.
- `accessCodeRedemptions/{redemptionId}`: redemption receipts. Clients cannot read or write this collection.

Codes are normalized by trimming, uppercasing, and accepting only `A-Z`, `0-9`, `_`, and `-`. Raw codes are not stored in Firestore; the document id is a SHA-256 hash of the normalized code with the BARK access-code namespace prefix.

## Free Access Codes

Free BARK access codes grant Premium directly on `users/{uid}.entitlement`.

They do not:

- create a Lemon Squeezy subscription,
- require a card,
- attach a payment method,
- auto-renew,
- show Manage Billing.

Free-code entitlement state:

```json
{
  "premium": true,
  "status": "access_code_active",
  "source": "access_code",
  "autoRenew": false,
  "paymentMethodAttached": false,
  "manualOverride": true
}
```

The UI shows the access end date, `Auto-renew: No`, and `No payment method attached`. When the grant expires, Premium evaluates false and the UI tells the user to enter a new access code or subscribe.

Recommended Carter policy:

- Admins/mods/VIPs: individual one-use codes, usually 365 days.
- Support/troubleshooting: short-lived one-use code docs, usually 365 days of access after redemption.
- Renew next year by issuing a new code. Do not auto-renew free access.

## Lemon Coupon Codes

Lemon coupon codes use the same field, but they do not grant Premium directly. The server creates a Lemon checkout with `checkout_data.discount_code` prefilled.

Paid coupon behavior:

- Premium starts only after the Lemon Squeezy test-mode webhook confirms entitlement.
- Paid subscription lifecycle remains controlled by Lemon webhooks.
- Manage Billing is shown after a Lemon subscription/customer exists.
- Auto-renew language remains visible for paid subscriptions.

## Create A Free One-Year Code

1. Choose a high-entropy code, for example `ADMIN-2026-RANDOMTEXT`.
2. Compute its document id:

```bash
CODE='ADMIN-2026-RANDOMTEXT' node - <<'NODE'
const { createHash } = require('crypto');
const code = process.env.CODE.trim().toUpperCase();
console.log(createHash('sha256').update(`bark-ranger-access-code-v1:${code}`).digest('hex'));
NODE
```

3. In Firebase Console, create `accessCodes/{printedHash}`:

```json
{
  "codeHash": "<printedHash>",
  "label": "Admin 2026 access",
  "type": "premium_free_year",
  "active": true,
  "durationDays": 365,
  "maxRedemptions": 1,
  "redemptionCount": 0,
  "oneUsePerUser": true,
  "audience": "admin_mod",
  "reason": "Admin/mod complimentary access",
  "createdByUid": "<carterUid>",
  "createdAt": "<server timestamp>",
  "expiresAt": "<optional code expiration timestamp>",
  "notes": "One-use admin access code"
}
```

Use `audience` values: `admin_mod`, `vip`, `support`, `tester`, or `general`.

## Redeem A Free Code

1. User signs in.
2. User opens Premium and enters the code in **Promo / Access Code**.
3. `redeemAccessOrPromoCode` validates and redeems in a transaction.
4. User sees:
   - `Premium access activated`
   - access end date
   - `Auto-renew: No`
   - `No payment method attached`

## Create A Lemon Coupon Passthrough Code

1. Create the coupon/discount in Lemon Squeezy test mode.
2. Create a matching `accessCodes/{codeHash}` doc:

```json
{
  "codeHash": "<printedHash>",
  "label": "Launch 20 percent coupon",
  "type": "lemon_coupon_passthrough",
  "active": true,
  "durationDays": 0,
  "maxRedemptions": null,
  "redemptionCount": 0,
  "oneUsePerUser": false,
  "audience": "general",
  "reason": "Lemon coupon checkout passthrough",
  "createdByUid": "<carterUid>",
  "createdAt": "<server timestamp>",
  "expiresAt": "<optional coupon end timestamp>",
  "notes": "Must exist as a Lemon discount too"
}
```

When redeemed, the app opens Lemon checkout with the discount code prefilled. The checkout payload still sends `attributes.test_mode: true`.

## Safety Notes

- Clients cannot write `users/{uid}.entitlement`.
- Clients cannot read/write `accessCodes` or `accessCodeRedemptions`.
- Lemon live checkout remains blocked by process: do not remove test mode or the Carter approval lock until final RC approval.
- If a user has an active access-code grant and a Lemon expiration/refund webhook arrives, the webhook does not remove the active free-code Premium grant.
- If a user later starts a paid Lemon subscription while an access-code grant is active, the Lemon entitlement can win the billing display while preserving the access-code fallback.
