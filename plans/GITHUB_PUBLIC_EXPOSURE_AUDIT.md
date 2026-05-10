# GitHub Public Exposure Audit

Date: 2026-05-10
Scope: GitHub public exposure audit only. No app behavior changed.
Repository audited: `OutSwarming/bark-ranger-map`
Local branch audited: `codex/promo-access-code-premium`
Local commit audited: `9744cf7793bd7aee07bb20adb6b46933122105b9`

## 1. Executive Summary

Result: **FAIL / NEEDS CARTER DECISION** for keeping the repo public as-is.

The GitHub repository is public. That means source files, tracked docs, public branches, public commit history, closed pull requests, and GitHub Actions metadata should be treated as publicly visible.

The current Firebase Hosting/GitHub Pages deployment is safer than the source repository because `firebase.json` ignores `plans/**`, `docs/**`, `*.md`, logs, tests, functions, and private-ish local files. However, **GitHub Hosting exposure and GitHub source exposure are different**. A file can be blocked from the deployed website and still be public on GitHub.

Highest-risk public exposure found:

1. The repo is confirmed **public**.
2. The default branch is `main`.
3. GitHub Pages is enabled/serving at `https://outswarming.github.io/bark-ranger-map/`.
4. The public default branch currently includes `firebase-debug.log`.
5. The public default branch currently includes legal/IP diligence docs and internal QC reports under `plans/`.
6. Public branches contain hardening/payment/legal/QC docs; several older branches also still contain `firebase-debug.log`.
7. Git history contains `firebase-debug.log`, legal diligence docs, generated npm dependency JSON, and other internal reports.
8. Current-branch tracked files do not show service-account JSON, Playwright auth state files, live `.env` files, or private-key files.
9. Secret-pattern scan found public Firebase web config/API-key-looking config and secret names/placeholders, but this audit did **not** find private key blocks in tracked current-branch files.
10. Legal, trademark, payment, pricing, launch-readiness, and internal strategy docs are public source files if the repo remains public.

Recommendation: **make the repo private now**, then clean and decide whether to later publish a sanitized public repo or public release branch. This is the cleanest path before broader launch or legal review.

## 2. Repo Visibility

GitHub API evidence:

| Field | Result |
|---|---|
| Repository | `OutSwarming/bark-ranger-map` |
| URL | `https://github.com/OutSwarming/bark-ranger-map` |
| Visibility | `public` |
| Private? | `false` |
| Default branch | `main` |
| GitHub Pages flag | `has_pages: true` |
| GitHub Pages HTTP check | `https://outswarming.github.io/bark-ranger-map/` returned `HTTP/2 200` |

Local remote:

```bash
origin https://github.com/OutSwarming/bark-ranger-map.git
```

`gh` CLI was not installed, so repository/PR/branch/Actions checks used local git plus public GitHub API calls.

## 3. Branch / PR Exposure Summary

Branches reported by GitHub API:

- `main`
- `codex/e2e-storage-states-qc`
- `codex/fix-bug017-premium-gating-smoke`
- `codex/payment-webhook-hardening-test-mode`
- `codex/promo-access-code-premium`
- `codex/server-free-visit-limit-5`
- `codex/server-route-geocode-rate-limits`
- `codex/stage-0-hardening-kill-switches`
- `phase-1-vaultrepo-refactor`
- `zoom-fix-revisited`

Open PRs:

- No open pull requests were returned.

Closed PRs:

| PR | State | Branch | Exposure note |
|---|---|---|---|
| `#1` | closed | `phase-1-vaultrepo-refactor -> main` | Closed PR metadata/diff remains visible in a public repo. This PR appears architecture/refactor-focused, not the newer legal/payment docs. |

Branch exposure checks:

| Branch | Sensitive/internal items found by branch-path check |
|---|---|
| `main` | `plans/LEGAL_LICENSE_DILIGENCE_PACKET.md`, `plans/FINAL_PRIVATE_BETA_QC_REPORT.md`, `HARDENING_PROGRESS.md`, `firebase-debug.log`, `plans/root-npm-ls-all.json` |
| `codex/promo-access-code-premium` | legal diligence docs, final QC report/tracker, codebase structure audit, hardening progress, generated npm JSON |
| `codex/e2e-storage-states-qc` | `HARDENING_PROGRESS.md`, `firebase-debug.log` |
| `codex/fix-bug017-premium-gating-smoke` | `HARDENING_PROGRESS.md`, `firebase-debug.log` |
| `codex/payment-webhook-hardening-test-mode` | `HARDENING_PROGRESS.md`, `firebase-debug.log` |
| `codex/server-free-visit-limit-5` | `HARDENING_PROGRESS.md`, `firebase-debug.log` |
| `codex/server-route-geocode-rate-limits` | `HARDENING_PROGRESS.md`, `firebase-debug.log` |
| `codex/stage-0-hardening-kill-switches` | `HARDENING_PROGRESS.md`, `firebase-debug.log` |
| `phase-1-vaultrepo-refactor` | `firebase-debug.log` |
| `zoom-fix-revisited` | `firebase-debug.log` |

Actions exposure:

- GitHub API returned `324` Actions workflow runs.
- The latest runs are `pages build and deployment` on `main`.
- GitHub API returned `30` `github-pages` artifacts, with several unexpired.
- Artifact archive contents were not downloaded in this audit. Treat public-repo Actions artifacts/logs as potentially publicly accessible metadata. Because Pages deployment uses hosting ignore rules, the artifact likely contains the hosted app output, not `plans/**`, but that archive should be verified if the repo remains public.

## 4. Public Tracked-File Summary

Generated inventory:

- `plans/github-tracked-files.txt`: current-branch tracked files, 221 paths.
- `plans/github-all-history-filepaths.txt`: all-history file path inventory, 273 unique paths.

Current branch tracked-file top-level distribution:

| Area | Count |
|---|---:|
| `plans/` | 54 |
| `tests/` | 45 |
| `modules/` | 18 |
| `data/` | 14 |
| `scripts/` | 13 |
| `raw_trails/` | 11 |
| `functions/` | 10 |
| `services/` | 7 |
| `assets/` | 5 |
| `docs/` | 4 |

Public default branch `main` currently has 219 tracked files and includes:

- `firebase-debug.log`
- `plans/LEGAL_LICENSE_DILIGENCE_PACKET.md`
- `plans/LEGAL_LICENSE_RED_FLAGS.md`
- `plans/FINAL_PRIVATE_BETA_QC_REPORT.md`
- `plans/FINAL_PRIVATE_BETA_QC_TRACKER.md`
- `plans/root-npm-ls-all.json`
- `plans/functions-npm-ls-all.json`

## 5. RED / YELLOW / GREEN File List

### RED: should not stay public

| Path / Pattern | Why risky |
|---|---|
| `firebase-debug.log` on `main` and in history | Debug/deploy/emulator metadata, project details, private emails, signed upload URL signatures, secret names. No private key blocks found in checked copy, but this should not be public. |
| `plans/LEGAL_LICENSE_DILIGENCE_PACKET.md` | Legal/IP/trademark/payment ownership diligence is internal and should not be public before lawyer review. |
| `plans/LEGAL_LICENSE_RED_FLAGS.md` | Ranked legal/IP/trademark/payment red flags are internal and can create partner/customer confusion if public. |
| `plans/AI_ASSISTED_DEVELOPMENT_DISCLOSURE_DRAFT.md` | Legal disclosure draft is internal lawyer-prep material. |
| `plans/ASSET_DATA_SOURCE_AUDIT.md` | Lists uncertain asset/data provenance; should be lawyer/internal only. |
| `plans/THIRD_PARTY_SERVICE_AUDIT.md` | Privacy/service-risk review and questions for counsel should be internal. |
| `plans/FINAL_PRIVATE_BETA_QC_REPORT.md` / tracker | Internal launch QA, remaining risks, and operational status. |
| `plans/LAUNCH_READINESS_FIREBASE_COST_REPORT.md` | Cost, payment, launch, and risk register details; safe for private planning, not public marketing/source. |
| `plans/FAST_FIX_RELEASE_CANDIDATE_PLAN.md` | Internal launch sequence and payment lock notes. |
| `plans/root-npm-ls-all.json`, `plans/functions-npm-ls-all.json` | Generated dependency trees are not secrets, but are unnecessary public attack surface and diligence clutter. |

### YELLOW: okay in a private repo; not ideal in public

| Path / Pattern | Why watch |
|---|---|
| `HARDENING_PROGRESS.md` | Internal staging/security/payment-hardening notes. |
| `plans/PHASE_4*.md` | Payment, entitlement, webhook, and deploy-gate implementation details. |
| `plans/PREMIUM_*`, `plans/PRODUCTION_AUDIT_REPORT.md` | Internal product/gating/production readiness notes. |
| `plans/CODEBASE_*` | Architecture and cleanup risks; fine privately, noisy publicly. |
| `docs/audits/*.md` | Older audit and refactor analysis may confuse public readers. |
| `tests/**` | Usually okay for open source, but these reveal app internals and test accounts/storage-state paths. |
| `functions/tests/**` | Exposes webhook/checkout fixture structure. Not a secret, but useful to attackers. |
| `firebase.json`, `firestore.rules`, Functions source | Normal for public code, but exposes security rules and callable shape. |
| `.env.example` | Fine if it contains no real values; verify whenever changed. |

### GREEN: generally okay to be public if Carter wants open source

| Path / Pattern | Why okay |
|---|---|
| `index.html`, `styles.css`, `modules/**`, `services/**`, `renderers/**`, `repos/**`, `core/**`, `state/**`, `engines/**` | App source code. Public only if Carter intentionally wants the code open. |
| `assets/data/bark-fallback.csv` | Public fallback data, assuming data rights are cleared. |
| `assets/images/*` | Public app images, assuming brand/asset rights are cleared. |
| `manifest.json`, `pages/TrophyCase.html` | Public app/site assets. |
| Package manifests/lockfiles | Normal public source metadata, though they help dependency analysis. |

## 6. Secret Scan Summary

Raw match output was kept in `/tmp` and not written into the repo.

Current-branch tracked-file scan found many matches for broad terms such as `apiKey`, `secret`, `webhook`, `token`, `customer_portal`, `password`, `@`, and payment provider names. Manual classification:

| Finding type | Files / Areas | Assessment |
|---|---|---|
| Firebase web config API-key-looking value | `modules/barkConfig.js` | This appears to be normal Firebase client config, not a server secret. Still public if repo is public. |
| Secret names / env var names | `functions/index.js`, `functions/tests/*`, docs | Names such as Lemon/ORS/Gemini secret identifiers are present; values were not found in current tracked files. |
| Lemon webhook/payment terms and fixtures | `functions/index.js`, function tests, Phase 4 docs, QC docs | Not secrets, but public implementation/payment-hardening detail. |
| Private/local paths and emails | Legal and QC docs contain local paths and contact-style strings; CSV/package files contain many `@` strings | Not necessarily secrets, but public privacy/professionalism risk. |
| Private key blocks | Current tracked files | No `BEGIN PRIVATE KEY` match found in this audit. |
| Service account JSON / Playwright auth states / live `.env` | Current tracked files | Not tracked on current branch. |

`firebase-debug.log` on `origin/main` scan:

- No `BEGIN PRIVATE KEY`, Google API-key-shaped value, access-token-shaped value, `client_email`, or `private_key` pattern was found in the checked copy.
- It does contain many debug/deploy metadata lines and matches for secret names and email-like strings.
- It is currently public on default branch and historically committed.

## 7. Docs / Plans Exposure Summary

Current branch tracks:

- 52 `plans/*.md` files.
- 2 `plans/*.json` generated npm tree files.
- 4 `docs/audits/*.md` files.
- 62 tracked Markdown files total.

Classification:

| Category | Examples | Exposure status |
|---|---|---|
| Legal/IP diligence | `LEGAL_LICENSE_DILIGENCE_PACKET`, `LEGAL_LICENSE_RED_FLAGS`, `ASSET_DATA_SOURCE_AUDIT`, `THIRD_PARTY_SERVICE_AUDIT`, `AI_ASSISTED_DEVELOPMENT_DISCLOSURE_DRAFT` | RED |
| Private beta and production QC | `FINAL_PRIVATE_BETA_QC_*`, `PRODUCTION_AUDIT_REPORT`, `PREMIUM_BETA_GATE_REPORT` | RED/YELLOW |
| Payment/provider hardening | `PHASE_4*`, `LEMONSQUEEZY_TEST_MODE_CANCELLATION_QA`, `PROMO_ACCESS_CODE_RUNBOOK` | YELLOW/RED |
| Architecture/refactor docs | `PHASE_1*`, `POST_PHASE_2_ARCHITECTURE_REPORT`, `CODEBASE_STRUCTURE_AUDIT`, `CODEBASE_CLEANUP_ROADMAP` | YELLOW |
| Public technical docs | A cleaned README/license/attribution doc would be GREEN | Not currently separated cleanly |

Recommendation: keep these docs in a private repo or private branch. If the app repo must stay public, create a sanitized public docs set and remove internal `plans/**` from public branches/history as a separate approved cleanup.

## 8. Data / Asset Exposure Summary

| Path | Type | Public risk |
|---|---|---|
| `BARK Master List.csv` | CSV dataset | RED/YELLOW until data source/permission is confirmed. |
| `assets/data/bark-fallback.csv` | Public fallback CSV | YELLOW; likely intended for app, but provenance/attribution needs lawyer/owner review. |
| `data/data.csv`, `data/data.json`, `data/sheet_data_fetched.csv` | Data snapshots | YELLOW/RED; internal snapshots may not need public exposure. |
| `data/*.geojson`, `raw_trails/*.geojson`, `trails.json` | Trail route data | YELLOW; verify source/terms/attribution. |
| `assets/images/USBarkRangerLogoWatermark.jpeg`, `WatermarkBARK.PNG`, `bark-logo.jpeg`, `bark-tag.jpeg` | Brand/logo imagery | RED/YELLOW until brand ownership/permission is resolved. |
| `pages/admin.html`, `pages/admin.js` | Admin UI code | YELLOW; verify not deployed/usable publicly without server-side auth. |

## 9. Git History Risk Summary

Historical path inventory found these sensitive/internal paths:

- `.env.example`
- `firebase-debug.log`
- `plans/LEGAL_LICENSE_DILIGENCE_PACKET.md`
- `plans/LEGAL_LICENSE_RED_FLAGS.md`
- `plans/functions-npm-ls-all.json`
- `plans/root-npm-ls-all.json`

Specific history checks:

| Path | Currently tracked on current branch? | Present on public `main`? | Historically committed? | Action |
|---|---:|---:|---:|---|
| `firebase-debug.log` | No | Yes | Yes | Remove from `main`; decide whether history rewrite and conservative rotation are needed. |
| `plans/LEGAL_LICENSE_DILIGENCE_PACKET.md` | Yes | Yes | Yes | Move to private repo or make repo private. |
| `plans/LEGAL_LICENSE_RED_FLAGS.md` | Yes | Yes | Yes | Move to private repo or make repo private. |
| `plans/root-npm-ls-all.json` | Yes | Yes | Yes | Remove from public source; regenerate locally when needed. |
| `plans/functions-npm-ls-all.json` | Yes | Yes | Yes | Remove from public source; regenerate locally when needed. |

Do not rewrite history automatically. If Carter chooses to keep the repo public, history cleanup must be a separate explicit decision because it rewrites public branch history and may affect clones.

## 10. .gitignore / Firebase Hosting Ignore Status

Current branch `.gitignore` is good and includes:

- `firebase-debug.log`
- `firestore-debug.log`
- `*.log`
- `test-results/`
- `.env`
- `.env.*`
- `!.env.example`
- service-account JSON patterns
- `playwright/.auth/`
- storage-state patterns

Default `main` `.gitignore` is weaker:

- It ignores logs and service-account/auth state patterns.
- It does **not** include the newer `test-results/`, `.env`, `.env.*`, or `!.env.example` lines in the checked `origin/main` copy.

`firebase.json` hosting ignores are strong:

- `plans/**`
- `docs/**`
- `**/*.md`
- `functions/**`
- `tests/**`
- `playwright/**`
- `test-results/**`
- `data/**`
- `raw_trails/**`
- logs and service-account patterns

Conclusion: Firebase Hosting/GitHub Pages deployment is likely not serving the internal docs, but GitHub source still exposes them.

## 11. Recommended Immediate Cleanup

Before broader beta:

1. Make the GitHub repo private until legal, brand, data, and cleanup decisions are complete.
2. Remove `firebase-debug.log` from `main` tracking immediately.
3. Merge the stronger `.gitignore` to `main`.
4. Remove generated npm tree JSON files from public tracking.
5. Move legal/IP diligence docs out of the public repo or keep them only in a private repo.
6. Decide whether `plans/**` should exist in any public branch.
7. Confirm no raw access codes, test auth states, service-account JSON, or `.env` files are tracked.
8. Consider rotating any values referenced by historical debug logs if counsel/security wants conservative cleanup.

## 12. Recommended GitHub Visibility Decision

Best recommendation now: **B. Make repo private until launch/legal issues are resolved.**

Reason:

- The repo currently exposes internal legal strategy, trademark questions, data provenance concerns, payment hardening notes, cost assumptions, beta QC, and a debug log on default branch.
- Public source exposes much more than public users/admins need.
- If Carter later wants an open-source/public repo, create a sanitized public release repo/branch with app code, public README, license/notice/attribution, and no internal plans.

Alternative later: **C. Split into private internal repo + public sanitized repo.**

Not recommended today: **A. Keep repo public after small cleanup only**, unless Carter accepts that internal planning/legal/payment docs and history have already been public.

## 13. Exact Commands Run

```bash
git remote -v
git branch -a
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
command -v gh
curl -sS https://api.github.com/repos/OutSwarming/bark-ranger-map
curl -sS "https://api.github.com/repos/OutSwarming/bark-ranger-map/branches?per_page=100"
curl -sS "https://api.github.com/repos/OutSwarming/bark-ranger-map/pulls?state=all&per_page=50"
curl -sS https://api.github.com/repos/OutSwarming/bark-ranger-map/pages
curl -sS "https://api.github.com/repos/OutSwarming/bark-ranger-map/actions/runs?per_page=20"
curl -sS "https://api.github.com/repos/OutSwarming/bark-ranger-map/actions/artifacts?per_page=20"
curl -sS -I https://outswarming.github.io/bark-ranger-map/
git fetch --all --prune
git ls-files > plans/github-tracked-files.txt
git log --all --name-only --pretty=format: | sort -u > plans/github-all-history-filepaths.txt
git ls-files | rg -n "(^|/)(firebase-debug|firestore-debug|.*\\.log$|\\.env$|\\.env\\.|serviceAccount|service-account|private|secret|key.*\\.json|playwright/\\.auth|storageState|test-results|playwright-report|node_modules|root-npm-ls-all|functions-npm-ls-all|LEGAL_LICENSE|FINAL_PRIVATE_BETA|DILIGENCE|RED_FLAGS|QC|AUDIT|REPORT)"
find . -maxdepth 4 -type f \( -name "*.md" -o -name "*.txt" -o -name "*.json" -o -name "*.csv" \) -not -path "./node_modules/*" -not -path "./functions/node_modules/*"
find assets data raw_trails pages docs -maxdepth 4 -type f
rg -n "firebase-debug|firestore-debug|\\.env|serviceAccount|service-account|private|secret|key|playwright/\\.auth|storageState|test-results|LEGAL_LICENSE|DILIGENCE|root-npm-ls-all|functions-npm-ls-all" plans/github-all-history-filepaths.txt
git log --all --oneline -- firebase-debug.log
git log --all --oneline -- plans/LEGAL_LICENSE_DILIGENCE_PACKET.md plans/LEGAL_LICENSE_RED_FLAGS.md plans/root-npm-ls-all.json plans/functions-npm-ls-all.json
sed -n '1,220p' .gitignore
sed -n '1,240p' firebase.json
git show origin/main:.gitignore
git show origin/main:firebase.json
git ls-tree -r --name-only origin/main
git ls-files -z | xargs -0 rg -n "AIza|LEMON|LEMONSQUEEZY|ORS_API_KEY|GEMINI_API_KEY|GOOGLE_MAPS_API_KEY|PRIVATE KEY|BEGIN PRIVATE KEY|api[_-]?key|secret|webhook|token|password|bearer|authorization|customer_portal|subscription_id|firebase-debug|serviceAccount|client_email|private_key"
git ls-files -z | xargs -0 rg -n "/Users/|carterswarm|privaterelay|gmail.com|@|phone|address|refund|chargeback|lawyer|trademark|USBARKRANGERS|legal|diligence|merchant|tax|EIN|bank|routing|payout"
```

Raw secret/private scan outputs were kept under `/tmp` and not added to the repository.
