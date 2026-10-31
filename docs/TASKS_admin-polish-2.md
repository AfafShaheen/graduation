# TASKS — fix/admin-polish-2

| ID | task | status | commit | evidence |
|----|------|--------|--------|----------|
| A1.1 | `verify_email_service` in `admin_graduate_service.py` (404/400, mark confirmed, consume OTPs, reset Redis attempts, audit, cache invalidation) | ✅ | b940273 (+this commit) | code in `admin_graduate_service.py::verify_email_service`; targeted pytest green |
| A1.2 | Route `POST /api/admin/graduates/{id}/verify-email` + D4 messages + `AUDIT_ACTION_LABELS` + `_EXCEPTIONAL_ACTIONS` | ✅ | b940273 (+this commit) | `admin_graduates.py`, `messages.py:37-38,147`, `audit_viewer_service.py:31`; tests 401/400/404 pass |
| A1.3 | Roster `actions.verify_email` (schema + `_item`) + OpenAPI baseline refresh (additive) | ✅ | this commit | `roster.py:49`, `roster_service.py:377`; `check_openapi_additive` → OK additive; baseline regenerated |
| A1.4 | New tests `tests/test_admin_verify_email.py` (full matrix of A1.4) | ✅ | b940273+9add7e3 | `pytest tests/test_admin_verify_email.py` → 9 passed |
| A1.5 | Full backend suite (two halves) + `check_openapi_additive` + Arabic note in `docs/BACKEND_CHANGES.md` + Part A report + delivery gate | ⏳ | this commit | targeted suites 52 passed 1 skipped; full suite running; doc note added |
| B1.1 | Remove file filter/column/drawer line per D1 (+ `fileId` from filters utils, drop `listUniversityFiles` usage, fix `colSpan`) | ⬜ | — | — |
| B1.2 | Update `tests/roster.test.mjs` + static guard test (no fileId/file_name/الملف المرفوع; college filter/column stay) | ⬜ | — | — |
| B2.1 | `verifyGraduateEmail(id)` hook + drawer action `تأكيد الإيميل` per D3 | ⬜ | — | — |
| B2.2 | Tests: SSR render of RosterDrawer (3 cases) + static ACTIONS-keys ⊆ RosterActions check | ⬜ | — | — |
| B3.1 | `refreshPendingPayments` reads `/api/admin/stats/v2` → `attention.processing`, 30 s polling while visible + on focus | ⬜ | — | — |
| B3.2 | Payments page header shows the same total (`بانتظار التدقيق في كل الحفلات: N`), cards labelled with ceremony name | ⬜ | — | — |
| B3.3 | Tests: counter reads stats/v2 not old stats; header uses context number; polling >= 20 s | ⬜ | — | — |
| B4.1 | Arabic note in `docs/FRONTEND_WIRING.md` + final checks (npm ci/test/build/oxlint/git diff --stat) + Part B report + delivery gate | ⬜ | — | — |

Status legend: ⬜ pending / ⏳ in progress / ✅ done / ⛔ blocked

## Baseline (recorded before edits)
- Backend targeted suites green at HEAD 360d4ce (per prior session notes); known skip: `tests/test_admin_stats_v2.py` 1 skipped by design.
- Frontend: `npm test` 166 pass; `npx oxlint src` 44 warnings / 0 errors; build green.
- Environment note: OpenAPI contract script may differ from reference env; will re-verify and report honestly (S4).
