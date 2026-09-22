# Known Issues

This file records issues identified during the code review of the changes merged from PRs 393-397. These items are intentionally documented here and are not fixed by the current release.

## 1. Task and log API routes are not authenticated

- **Severity:** High
- **Location:** `render-backend/server.js:294`
- **Status:** Open
- **Impact:** `/api/tasks`, `/api/logs`, `/api/logs/db`, and `/api/task-definitions` are reachable without the `requireApiKey` middleware. In particular, an unauthenticated caller can create, modify, delete, or manually run scheduled tasks. Manual execution can use the game tokens stored in Supabase.
- **Planned direction:** Protect all `/api/*` routes with the existing API-key middleware, leaving only `/health` intentionally public.

## 2. Batch Apex guessing processes only the first open round

- **Severity:** High
- **Location:** `src/utils/batch/tasksApex.js:57`
- **Status:** Open
- **Impact:** `resolveOpenGuesses()` returns as soon as it finds one round with open stages. When multiple rounds overlap, an earlier or later round with open guesses can be skipped silently.
- **Planned direction:** Return every round with open stages and process each round in the batch task.

## 3. Apex pagination can mark a rate-limited stage as exhausted

- **Severity:** High
- **Location:** `src/components/Apex/ApexChallenge.vue:1269`
- **Status:** Open
- **Impact:** A 200400 rate-limit response produces no new rows. `ensureBetRows()` treats that as a definitive end-of-data condition and sets `grp.exhausted = true`, which can prevent later retries for that stage.
- **Planned direction:** Distinguish a rate-limit interruption from a confirmed empty page and only mark a stage exhausted for the latter.

## 4. Apex vote board can be replaced by a partial rate-limited result

- **Severity:** Medium
- **Location:** `src/components/Apex/ApexChallenge.vue:1534`
- **Status:** Open
- **Impact:** `fetchPagedList()` can return partial rows after a rate-limit interruption, but `fetchVoteBoard()` assigns those rows to `currentVoteBoard` without checking whether the result is complete. The visible board can therefore shrink to an incomplete list during polling.
- **Planned direction:** Return an explicit interruption/completeness flag and replace the visible board only after a complete fetch; otherwise retain the last complete result.

## Verification context

- `pnpm build` completed successfully on 2026-09-21.
- The repository currently has no GitHub Actions workflow configured, so no workflow run can be started until one is added under `.github/workflows/`.
