# Shared local-only tool pipeline

## Standard tool route

1. A tool card navigates through `SharedNavigation`. It keeps the current
   header/footer mounted and replaces only `<main>`.
2. The shared tool page loads its common upload/preview/download UI without
   loading the processor bundle, worker pool, or preview engines at first paint.
3. Selecting a file starts the shared preparation state. `ToolModuleRegistry`
   loads the browser runtime, shared processor bundle, selected preview module,
   and only the selected tool's declared dependencies.
4. Processing runs through `BrowserToolRuntime` and `BrowserTools`; worker-only
   operations stay in local Web Workers. There is no queue/API fallback.
5. Success changes the main content to the shared download step without a full
   page reload.
6. The download click begins a browser download. The app then releases references,
   preview/output object URLs, and workers; route changes and `pagehide` also
   trigger cleanup.

Some `SLUG_MAP.special` entries still redirect to standalone HTML tools instead
of the shared three-step route. Their page scripts and UI are separate; see the
standalone-route item in `docs/TODO_MASTER.md`.

## Data boundary

- Source files and result blobs are not persisted for refresh recovery.
- Processing endpoint metadata was removed from tool configuration. The former
  queue client is a fail-closed stub and is not loaded by tool routes.
- The separate API service may still support non-file site features. The local
  file-processing route does not submit document bytes to that service.
- Old app-owned tool blobs, advanced-engine IndexedDB temporary data, streaming
  checkpoints, and prefixed OPFS temporary files are purged best-effort at tool
  startup and cleanup boundaries.
- Cached CDN library bytes are code, not user documents, and remain cached to
  avoid redownloading large dependencies.
- Translation requests to MyMemory were removed. Translation is unavailable
  until an on-device model is implemented.
- Existing Protect and Unlock worker code did not provide real encryption or
  decryption. Those tools fail closed. The app must not present visual overlays
  or `ignoreEncryption` re-serialization as password security.
- Redaction is routed only to `redact-worker.js`, which rasterizes targeted
  pages and burns in the redaction. Text on targeted pages is no longer
  searchable/selectable; non-targeted pages remain copied PDF pages.

## Cleanup limits

The app drops JavaScript references, revokes its object URLs, terminates worker
pools, and removes app-owned browser temporary storage. Web browsers do not
provide a reliable download-completion event or a way for JavaScript to force
physical RAM zeroization, control garbage collection/swap, or erase the browser's
download manager copy. The UI and privacy claims must describe this as
best-effort app cleanup, not guaranteed physical erasure.

## Verification

Run:

```sh
pnpm --filter @workspace/ilovepdf run audit:local-only-flow
pnpm --filter @workspace/ilovepdf test
```

The local-only audit is a static contract check. It verifies the curated startup
script list, on-demand preparation, absence of file queue/translation requests,
shared main-only navigation, local redaction routing, and cleanup hooks. It is
not a substitute for browser end-to-end tests with a network request sentinel.

## Remaining work

`docs/TODO_MASTER.md` tracks the incomplete engines and tests:

- Implement real browser-local PDF password protection and unlocking.
- Add an on-device translation model before re-enabling translation.
- Split the shared processor bundle into per-tool chunks.
- Add browser end-to-end privacy and lifecycle tests covering cancellation,
  route changes, download, and `pagehide`.
