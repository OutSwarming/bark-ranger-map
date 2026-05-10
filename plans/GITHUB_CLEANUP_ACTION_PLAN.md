# GitHub Cleanup Action Plan

Date: 2026-05-10
Repository: `OutSwarming/bark-ranger-map`

Goal: reduce public GitHub exposure without changing app behavior.

## Immediate Before Broader Beta

### 1. Decide Visibility

Recommended: make the repository private now.

Why:

- Public `main` currently exposes `firebase-debug.log`.
- Public branches expose internal hardening docs.
- Legal/IP/payment/QC docs are public.
- Data and brand assets are not fully cleared.

Suggested GitHub UI path:

1. Open GitHub repo settings.
2. Go to `Settings -> General -> Danger Zone`.
3. Change visibility to private.
4. Confirm Pages behavior after the visibility change.

If the repo must remain public, do the rest of this plan before any broader beta link is shared.

### 2. Remove Debug Logs From Tracking

Current branch already ignores logs. Public `main` still exposes `firebase-debug.log`.

Recommended cleanup command on a cleanup branch based on `main`:

```bash
git checkout main
git pull --ff-only origin main
git checkout -b cleanup/public-exposure
git rm --cached firebase-debug.log
git status --short
```

Do not delete local copies unless Carter wants them gone. Removing from tracking is enough for the next commit.

### 3. Merge Stronger `.gitignore`

Ensure `main` includes:

```gitignore
firebase-debug.log
firestore-debug.log
*.log
test-results/
.env
.env.*
!.env.example
playwright/.auth/
tests/.auth/
*.storageState.json
storageState*.json
*Service Account*.json
*service-account*.json
*service_account*.json
```

### 4. Remove Internal Legal/QC Docs From Public Tracking Or Make Repo Private

If the repo becomes private, keep the docs.

If the repo remains public, move/remove these from public branches:

```bash
git rm --cached plans/LEGAL_LICENSE_DILIGENCE_PACKET.md
git rm --cached plans/LEGAL_LICENSE_RED_FLAGS.md
git rm --cached plans/AI_ASSISTED_DEVELOPMENT_DISCLOSURE_DRAFT.md
git rm --cached plans/ASSET_DATA_SOURCE_AUDIT.md
git rm --cached plans/THIRD_PARTY_SERVICE_AUDIT.md
git rm --cached plans/FINAL_PRIVATE_BETA_QC_REPORT.md
git rm --cached plans/FINAL_PRIVATE_BETA_QC_TRACKER.md
git rm --cached plans/root-npm-ls-all.json
git rm --cached plans/functions-npm-ls-all.json
```

Do not use this list blindly if Carter still wants a private branch to retain the files. For public cleanup, prefer moving these docs to a separate private repo.

### 5. Confirm Firebase Hosting Ignores Internal Docs

Current `firebase.json` already ignores:

- `plans/**`
- `docs/**`
- `**/*.md`
- `functions/**`
- `tests/**`
- `playwright/**`
- `test-results/**`
- `data/**`
- `raw_trails/**`
- logs

Verify after any merge:

```bash
rg -n '"plans/\\*\\*"|"docs/\\*\\*"|"\\*\\*/\\*\\.md"|"firebase-debug\\.log"|"test-results/\\*\\*"' firebase.json
```

### 6. Confirm No Secrets/Auth States Are Tracked

Run:

```bash
git ls-files | rg '(^|/)(firebase-debug|firestore-debug|.*\.log$|\.env$|\.env\.|serviceAccount|service-account|service_account|private.*key|.*key.*\.json$|playwright/\.auth|storageState|test-results|playwright-report)'
```

Expected after cleanup:

- `.env.example` may remain.
- No debug logs.
- No service-account JSON.
- No Playwright auth state.
- No test-results.

### 7. Decide Whether History Cleanup Is Needed

Do not rewrite history without explicit Carter approval.

Current history contains:

- `firebase-debug.log`
- legal/IP diligence docs
- generated npm dependency JSON

If the repo becomes private, history rewrite may be unnecessary.

If the repo remains public, Carter should decide whether to:

1. accept that history remains public,
2. rotate any values conservatively,
3. rewrite history with `git filter-repo`/BFG, then force-push and coordinate with any clones.

## Before Paid Public Launch

### 1. Create Public-Safe Repo Presentation

Add or update:

- clean `README.md`
- support/contact info
- privacy policy link
- terms/refund/subscription language
- attribution/credits page
- deployment instructions without secrets

### 2. Make License / Notice Decision

Do not invent a license casually.

After lawyer review, decide:

- private proprietary repo,
- public source-available but not open-source,
- open-source license,
- third-party notices file.

### 3. Keep Legal/Private Docs Out Of Public Source

Private-only docs should include:

- legal diligence
- red flags
- internal QC trackers
- payment risk reports
- cost projections
- private beta notes
- lawyer questions
- debug logs
- generated full dependency JSON

### 4. Sanitize Branches

If public:

```bash
git push origin --delete codex/e2e-storage-states-qc
git push origin --delete codex/fix-bug017-premium-gating-smoke
git push origin --delete codex/payment-webhook-hardening-test-mode
git push origin --delete codex/server-free-visit-limit-5
git push origin --delete codex/server-route-geocode-rate-limits
git push origin --delete codex/stage-0-hardening-kill-switches
git push origin --delete phase-1-vaultrepo-refactor
git push origin --delete zoom-fix-revisited
```

Only delete branches after confirming they are merged or no longer needed.

### 5. Verify GitHub Actions Artifacts

Check:

```bash
curl -sS "https://api.github.com/repos/OutSwarming/bark-ranger-map/actions/artifacts?per_page=20"
```

Then either:

- confirm artifacts contain only public site output, or
- reduce retention/delete artifacts through GitHub UI/API.

### 6. Rotate If Needed

This audit did not find private key blocks in current tracked files. Still consider rotation if Carter wants a conservative response to historical debug logs:

- Firebase web/API config: usually public, not secret.
- Secret Manager secret names: not secret values.
- Any upload URL signatures found in historical debug logs: likely expired, but verify.
- Any email addresses in debug logs/docs: privacy/professionalism issue.

## Public-Safe Release Branch Option

If Carter wants public GitHub later:

1. Keep development in a private repo.
2. Create a sanitized public branch or separate repo.
3. Include app source only if intentional.
4. Include public README/license/notice/privacy links.
5. Exclude `plans/**`, `docs/audits/**`, debug logs, generated JSON, private test fixtures, legal docs, and internal reports.

## Minimum Cleanup Gate

Before broader beta, pass these checks:

```bash
git status --short
git ls-files | rg 'firebase-debug|firestore-debug|.*\.log$|playwright/\.auth|storageState|test-results|serviceAccount|service-account|private.*key|\.env$|\.env\.'
git ls-files | rg 'plans/(LEGAL|FINAL_PRIVATE|root-npm-ls-all|functions-npm-ls-all)'
rg -n '"plans/\\*\\*"|"docs/\\*\\*"|"\\*\\*/\\*\\.md"' firebase.json
```

Expected:

- No tracked debug logs/auth states/secrets.
- No public legal/private QC docs if repo remains public.
- Firebase Hosting ignores internal docs.

## Recommended Decision

Best path: **make the repo private now, then clean `main` and branches without panic.**

Second-best path: keep public only after removing internal docs/logs from `main`, deleting stale branches, verifying Actions artifacts, and accepting that public git history already exposed prior content unless rewritten.
