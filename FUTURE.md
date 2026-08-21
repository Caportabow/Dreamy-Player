# Code Quality Review — Dreamy

Scope: ~11.6k LOC across Nuxt frontend (`app/`), Nitro API (`server/`), and the download worker (`download-service/`). No tests exist anywhere.

---

## 1. Spaghetti code

### 1.1 `app/stores/player.ts` — god object (CRITICAL)
**File:** `app/stores/player.ts` (783 lines, the largest file in the repo)

One Pinia store owns six unrelated concerns: the raw `HTMLAudioElement` lifecycle (`getEl`/`wireEvents`), OS Media Session mirroring (`setupMediaSession`, ~L78–190), listening-history accounting (`trackListening`/`reportHistory`/`ensureSession`), persistence (localStorage + server sync in `persistNow`/`restore`), queue math (`rebuildOrder`/`reorderQueue`), and playback transport (`next`/`prev`/`seek`).

**Why it's a problem:** everything touches everything else via shared mutable module state (`session`, `lastTime`, `suppressPersist`, `persistTimer`); it's the hardest file to test or change safely, and it's the only store with 700+ lines.

**Fix:** split into focused composables/stores — e.g. `useAudioEngine` (element + events), `useMediaSession`, `useListeningHistory`, `usePlayerPersistence` — and have the store coordinate them. At minimum extract history accounting and persistence.

### 1.2 `restore()` — deep nesting + duplicated audio-load block (CRITICAL)
**File:** `app/stores/player.ts:643–716`

`restore()` is 5 levels deep, and the "load audio into the element" block is written twice, nearly identically, once for the localStorage branch (~L670–683) and once for the server branch (~L700–713): set `audio.src`, set `volume`, set `duration`, clamp `currentTime`. They differ only in the source of the parsed values.

**Why it's a problem:** classic copy-paste-with-drift — the two paths will diverge the next time someone changes restore behavior.

**Fix:** extract `hydrateAudio(item, { position, volume, muted })` and call it from both branches.

### 1.3 `processJob()` — one function, six jobs (HIGH)
**File:** `download-service/src/index.ts:126–230`

`processJob` does metadata validation, iTunes enrichment, temp-dir creation, a nested progress-throttling closure (`reportPct`, ~L165–180), parallel artwork download, a five-client retry loop with file cleanup, upload, and completion reporting — plus the comment numbering skips step "3" (goes 1, 2, 4, 5), which shows the flow was reorganized without re-documenting it.

**Why it's a problem:** the retry/cleanup loop and the progress closure make the happy path hard to follow; the function is effectively a script.

**Fix:** extract `downloadAndConvertWithRetry(sourceUrl, meta, dir, reportPct)`, `reportProgressThrottled(...)`, and `finalizeTrack(...)`.

### 1.4 `enrich.ts` — key computation repeated, multi-stage flow (HIGH)
**File:** `download-service/src/enrich.ts:266–390`

In `enrichResults`, the grouping key (`extractVariantTags(video.title).length > 0 ? variant:url : symmetricSongKey(video)`) is computed **twice** (once in the grouping loop, once in the mapping loop), and the dedupe key (`itunesId ?? normalizeKey(...)`) is computed in **two more** loops (`bestByKey` and `emitted`). That's four separate places encoding the same identity rule.

**Why it's a problem:** if the identity rule ever changes, four call sites must stay in sync — the exact defect that produces subtle dedupe bugs.

**Fix:** two small helpers — `groupKey(video)` and `dedupeKey(result)` — used everywhere; compute keys once and carry them on the objects.

### 1.5 Cross-store coupling: library reaches into player (MODERATE)
**File:** `app/stores/library.ts:106–112` (`removeTrack` calls `usePlayerStore().removeFromQueue`)

**Why it's a problem:** the library store instantiates and mutates the player store mid-method — a hidden dependency between two domains. Circular-import risk is real since `player.ts` is large and import-heavy.

**Fix:** invert it — emit an event / call a player method from the component that initiated the removal, or move queue-pruning into a watcher on `tracks`.

---

## 2. Code duplication

### 2.1 Playlist list fetching — 3 near-identical implementations (HIGH)
**Files:**
- `app/components/AppSidebar.vue:25–40` (`loadPlaylists`)
- `app/components/AddToPlaylistDialog.vue:29–42` (`loadPlaylists`)
- `app/pages/playlists/index.vue:11–23` (`fetchPlaylists`)

Same `$fetch<{playlists}>('/api/playlists')` + loading flag + toast-on-error, three times, with three different names (`loadPlaylists` vs `fetchPlaylists`).

**Fix:** a `usePlaylists()` composable (or a tiny Pinia store) returning `{ playlists, loading, refresh }`.

### 2.2 Playlist name/description form — 3 copies (HIGH)
**Files:** `app/components/PlaylistCreateDialog.vue`, `app/components/PlaylistEditDialog.vue`, and the inline rename dialog inside `app/components/PlaylistCard.vue:80–100`

All three render the same `Name` input + `Description` textarea + Save/Cancel footer with the same validation ("Please give your playlist a name.") and 80/300 max-lengths.

**Fix:** one `PlaylistFormDialog` with a `mode: 'create' | 'edit'` prop; `PlaylistCard` should use it instead of its own inline dialog.

### 2.3 Delete-confirmation dialogs — 3 copies (MODERATE)
**Files:** `app/pages/profile/index.vue` (account delete), `app/pages/playlists/[id].vue:245–262` (playlist delete), `app/components/PlaylistCard.vue:102–119`

Identical `Dialog > DialogContent > header + Cancel + destructive "Deleting…" button` scaffolding.

**Fix:** a `ConfirmDeleteDialog` component taking title/description/confirm-label.

### 2.4 Debounced search watchers — hand-rolled 4× despite VueUse (MODERATE)
**Files:** `app/pages/index.vue:34–40`, `app/pages/add.vue:120–123`, `app/pages/favourites.vue:21–25`, `app/components/PlaylistAddTracksDialog.vue:27–30`

Each reimplements `watch(input, () => { clearTimeout; setTimeout(..., 250|300) })`. `@vueuse/core` is **already a dependency** and ships `refDebounced`/`useDebounceFn`.

**Fix:** replace all four with `refDebounced`/`useDebounceFn`, and delete the per-page `searchTimer` boilerplate.

### 2.5 Fisher–Yates shuffle implemented twice (MODERATE)
**Files:** `app/stores/player.ts:470–483` (`rebuildOrder` inline shuffle) and `app/utils/shuffle.ts:8–16` (`shuffleArray`)

**Fix:** `rebuildOrder` should call `shuffleArray(rest)`.

### 2.6 env parsing helpers duplicated across packages (MODERATE)
**Files:** `server/utils/env.ts:1–9` and `download-service/src/env.ts:1–6` — identical `str`/`num`/`bool`.

These are separate deployables, so a shared module needs a real home, but at minimum the duplication should be acknowledged (a comment) or a tiny shared package created.

### 2.7 MinIO client + `ensureBuckets` duplicated (MODERATE)
**Files:** `server/storage/minio.ts:4–22` and `download-service/src/storage.ts:9–28`

Same `new Client({...})` construction and same bucket-exists-or-create loop (with different logging, so they've already drifted).

### 2.8 Catalog dedup query duplicated (MODERATE)
**Files:** `server/api/downloads.post.ts:80–99` and `server/api/internal/jobs/[id]/complete.post.ts:95–135`

Both implement "find live track by `sourceId`, else by `itunesId`, skipping `deletedAt`" — the core "never store a song twice" rule. Two copies of a subtle business rule.

**Fix:** a `findExistingTrack({ sourceId, itunesId })` helper in `server/utils/`.

### 2.9 Spawn-with-progress pattern duplicated (MINOR)
**Files:** `download-service/src/yt.ts:325–372` (`downloadAudio`) and `download-service/src/ffmpeg.ts:170–235` (`runEncode`)

Both hand-roll: `spawn`, line-buffered stdout/stderr parsing, a `killTimer` with `SIGKILL` + `unref`, monotonic progress tracking, and timed-out vs exit-code rejection.

**Fix:** a shared `runChildWithProgress(cmd, args, { onLine, onProgress, timeout })` helper.

### 2.10 Duplicate cache TTL constants (MINOR)
**Files:** `download-service/src/enrich.ts:56` (`SONG_CACHE_TTL_MS = 12h`) and `download-service/src/itunes.ts:16` (`SEARCH_TTL_MS = 12h`); also `index.ts:36` and `yt.ts:23` both define a `10 * 60_000` TTL independently.

These are the *same* concept (how long an iTunes match stays valid) expressed in two modules.

---

## 3. Hardcoded values

### 3.1 The "ten-minute rule" constant duplicated across 4 files (CRITICAL)
**Files/values:**
- `server/api/downloads.post.ts:9` — `const MAX_DURATION = 600`
- `server/api/internal/jobs/[id]/complete.post.ts:8` — `const MAX_DURATION = 600`
- `server/api/downloads/search.post.ts:92` — inline `r.duration <= 600`
- `download-service/src/env.ts:14` — `maxDuration: 600` (also hardcodes it instead of reading an env var)

**Why it's a problem:** a core business rule ("only ≤10min") lives in four places across two packages; it can silently diverge and already has inconsistent framing (search.post uses a raw literal, others a constant).

**Fix:** make it a single env-driven value (`MAX_TRACK_DURATION_SECONDS`, read via each package's `env`) and import it everywhere.

### 3.2 Insecure default secrets in production paths (CRITICAL)
**Files:**
- `server/utils/env.ts:14` — `sessionSecret` defaults to `'dev-session-secret-change-me'`
- `server/utils/env.ts:30` — `downloadServiceSecret` defaults to `'dev-download-secret'`
- `server/utils/env.ts:19–20` — MinIO defaults to `minioadmin/minioadmin`
- `docker-compose.yml` — same defaults via `${...:-dev-download-secret}` / `${...:-minioadmin}`
- `server/db/index.ts:5`, `drizzle.config.ts:9`, `scripts/migrate.mjs:15`, `server/utils/env.ts:10`, `docker-compose.yml`, `.env.example` — `postgres://dreamy:dreamy@localhost:5432/dreamy` as the default `DATABASE_URL` in **six** files.

**Why it's a problem:** a deployment that forgets one env var gets a known session secret (session forgery) and known object-store credentials. The `DATABASE_URL` default is copy-pasted into half the entry points.

**Fix:** no fallback secrets in production (`env.isProduction && !secret → throw`); centralize the `DATABASE_URL` fallback in one place and import it.

### 3.3 Username rules duplicated client/server (HIGH)
**Files:** `server/utils/password.ts:24–42` (`validateUsername`, regex + 3/32 limits) and `app/composables/useUsernameCheck.ts:3–6` (regex + `USERNAME_MIN_LENGTH`/`MAX_LENGTH`, with the comment "Mirrors server/utils/password.ts")

**Fix:** share the regex and bounds via a single source (e.g. a `shared/` constant imported by both, or an auto-generated contract).

### 3.4 iTunes track-id regex duplicated (MODERATE)
**Files:** `server/api/downloads.post.ts:66–69` and `server/api/internal/jobs/[id]/complete.post.ts:25–29` — both `/\d{1,15}$/` for `itunesId`. (Also relevant in `download-service/src/itunes.ts`, which validates differently.)

### 3.5 Magic numbers in playback thresholds (MODERATE)
**File:** `app/stores/player.ts`
- `duration.value - 3` (L276) — the "within 3s of the end = completed" rule
- `audio.currentTime > 4` (L447) — restart-from-zero threshold
- `Math.abs(...) < 0.1` (L402) — no-op seek tolerance
- `delta < 5` (L248) — max listening-delta treated as real playback
- `setTimeout(..., 800)` (persist debounce), and `downloads.ts`'s `4000`-ms "done" flash / `add.vue`'s `2500`-ms added flash

These are the kind of constants that get tuned and should be named at the top of the file (the file already does this well for `HISTORY_THRESHOLD`, so the rest are inconsistent with its own pattern).

### 3.6 Other magic values (MINOR)
- `server/api/history/stats.get.ts:8` and `:63` — hardcoded `29`/`29 * 86_400_000`/`i = 29` for the 30-day window.
- `server/api/media.get.ts:66` — `max-age=86400`.
- `app/app.vue` — seek step `10` (L~95) duplicated from the Media Session default.
- `download-service/src/itunes.ts:166` — `country: 'US'`, `limit: '5'` (should be named constants).

---

## 4. Other code smells

### 4.1 Zero tests (CRITICAL)
**Evidence:** `glob **/*.{test,spec}.*` → 0 files.

This is the highest-leverage gap given how much *pure, testable* logic exists: `yt.ts` progress/regex parsing, `ffmpeg.ts` `parseLoudnormJson`/`parseLastSilenceStart`, `enrich.ts` title/variant normalization, `itunes.ts` `pickBest` scoring, `app/utils/shuffle.ts`, `useUsernameCheck`, and `media.get.ts` `parseRange`. All would unit-test cleanly with no mocking.

**Fix:** add Vitest, start with the pure functions above.

### 4.2 Typecheck is configured but disabled/unused (HIGH)
**Files:** `nuxt.config.ts:27` (`typeCheck: false`), `package.json` (`"typecheck": "nuxt typecheck"` but nothing runs it), `download-service/tsconfig.json` (`noEmit: true`, no `typecheck` script, no CI).

**Fix:** enable `typeCheck: true` (or run `nuxt typecheck` in CI), add `tsc --noEmit` for the worker, and gate commits on it. Also note `err: any` is pervasive — a stricter setup plus a typed error helper would help.

### 4.3 Dead / near-dead code (MODERATE)
- `app/composables/useAudio.ts` — defined, **never imported anywhere**. Delete it.
- `server/utils/auth.ts:112` — `getCurrentUserId` — defined, **never used**. Delete it.
- `app/types/music.ts:44` — `PlaylistStatus` — defined, **never used**. Delete it.
- `download-service/src/index.ts:100–105` — `DownloadRequest.title/artist/duration` declared but never read. Remove.
- `app/stores/library.ts:21` — `sortedTracks = computed(() => tracks.value)` — a misleading no-op alias (sorting happens server-side); either remove it or sort client-side.
- `download-service/src/enrich.ts:394–398` — `resolveEnrichmentForDownload` is a pure passthrough; inline it.

### 4.4 `signin` timing-equality comment is not implemented (MODERATE)
**File:** `server/api/auth/signin.post.ts:25–27`

The comment claims "Verify against a dummy hash when the user is missing, to keep timing uniform," but the code is `const valid = user ? await verifyPassword(password, user.passwordHash) : false` — no dummy hash is computed. The missing-user path returns *much* faster than the found-user path, leaking username existence via timing (the exact thing the comment claims to prevent).

**Fix:** either actually `await verifyPassword(password, DUMMY_HASH)` when the user is missing, or delete the misleading comment.

### 4.5 Inconsistent error handling (MODERATE)
- Some catch blocks use the shared `apiErrorMessage(err, fallback)` helper; others inline `err?.data?.message || fallback` (e.g. `app/components/PlaylistCard.vue:30,44`) — same behavior, two spellings.
- `app/pages/favourites.vue:14–18` (`fetchFavourites`) swallows errors silently (`tracks.value = []`, no toast) while every sibling page toasts.
- `download-service/src/index.ts` catches log inconsistently (`console.error` with the error vs without).

**Fix:** standardize on `apiErrorMessage`; decide and apply one policy for silent-vs-toast.

### 4.6 `navigateTo` called during component setup (MINOR)
**Files:** `app/pages/signin.vue:64`, `app/pages/signup.vue:85` — `if (auth.isSignedIn) navigateTo(nextPath.value)` runs at top-level setup, which executes during SSR.

**Why it's a problem:** navigation belongs in middleware/`onMounted`; calling it in setup can fire on the server and produce redirect churn.

**Fix:** move this to the existing `auth.global.ts` middleware (it already handles the guest case) or into `onMounted`.

### 4.7 Inconsistent naming of "load list" operations (MINOR)
`fetchTracks`, `fetchPlaylists`, `loadPlaylists`, `loadPasskeys`, `load`, `fetchFavourites`, `runRemoteSearch` — five verbs for the same action across pages/stores. Pick `fetch*` (or `load*`) and stick to it.

### 4.8 `vite.server.allowedHosts: true` (MINOR, security)
**File:** `nuxt.config.ts:31–36`

Disables Vite's DNS-rebinding protection for **all** hosts, not just the compose service name. The comment explains why it's needed, but `true` is broader than necessary.

**Fix:** whitelist the specific allowed host (`allowedHosts: ['nuxt']` or the configured host) instead of `true`.

### 4.9 `ensureBuckets` swallows errors in one place, logs in the other (MINOR)
**Files:** `server/storage/minio.ts:13–22` (silent catch) vs `download-service/src/storage.ts:13–21` (logs). Same operation, opposite observability policies.

---

## Suggested priority order

1. Fix **4.2** (typecheck on) and **3.1/3.2** (secrets + ten-minute rule) — cheapest correctness/security wins.
2. Add tests for the pure logic (**4.1**) before touching it.
3. Extract **2.1/2.2/2.4** (playlist + debounce composables) — highest duplication-per-line-removed.
4. Split **1.1/1.2** (player store + `restore`) last, since it's the riskiest refactor.