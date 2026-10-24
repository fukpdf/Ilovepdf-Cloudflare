# 10 — TOOL ENGINE

## Tool Configuration

All tools are defined in `public/js/tools-config.js` as the `TOOLS` array and `SLUG_MAP` object.

### Tool Object Shape

```javascript
{
  id: 'rotate',                    // internal tool ID
  name: 'Rotate PDF',              // display name
  icon: 'rotate-cw',              // Lucide icon name
  description: '...',             // short description (meta desc)
  category: 'Organize PDFs',      // display category
  group: 'pdf' | 'image',         // processing group
  badge: 'PDF' | 'NEW' | null,    // optional badge
  acceptedFiles: '.pdf',          // file input accept attr
  multipleFiles: false,           // allow multiple file uploads
  working: true,                  // is tool enabled?
  clientSide: true,               // browser execution capability
  options: [                      // tool-specific option controls
    {
      id: 'degrees',              // → creates #opt-degrees element
      label: 'Rotation Angle',
      type: 'select',             // 'select' | 'text' | 'number'
      options: [
        { value: '0', label: '— No rotation —' },
        { value: '90', label: '90° Clockwise' },
        ...
      ]
    }
  ]
}
```

### All 43 Tool Slugs

| Slug | Tool ID | Client-side | Group |
|------|---------|-------------|-------|
| `merge-pdf` | `merge` | ✓ | pdf |
| `split-pdf` | `split` | ✓ | pdf |
| `rotate-pdf` | `rotate` | ✓ | pdf |
| `crop-pdf` | `crop` | ✓ | pdf |
| `organize-pdf` | `organize` | ✓ | pdf |
| `compress-pdf` | `compress` | ✓ | pdf |
| `pdf-to-word` | `pdf-to-word` | ✓ | pdf |
| `pdf-to-powerpoint` | `pdf-to-powerpoint` | ✓ | pdf |
| `pdf-to-excel` | `pdf-to-excel` | ✓ | pdf |
| `pdf-to-jpg` | `pdf-to-jpg` | ✓ | pdf |
| `word-to-pdf` | `word-to-pdf` | ✓ | pdf |
| `powerpoint-to-pdf` | `powerpoint-to-pdf` | ✓ | pdf |
| `excel-to-pdf` | `excel-to-pdf` | ✓ | pdf |
| `word-to-excel` | `word-to-excel` | ✓ | pdf |
| `jpg-to-pdf` | `jpg-to-pdf` | ✓ | pdf |
| `html-to-pdf` | `html-to-pdf` | ✓ | pdf |
| `edit-pdf` | `edit` | ✓ | pdf |
| `watermark-pdf` | `watermark` | ✓ | pdf |
| `sign-pdf` | `sign` | ✓ | pdf |
| `add-page-numbers` | `page-numbers` | ✓ | pdf |
| `redact-pdf` | `redact` | ✓ (dedicated local worker) | pdf |
| `protect-pdf` | `protect` | Blocked: no real local encryption engine | pdf |
| `unlock-pdf` | `unlock` | Blocked: no real local decryption engine | pdf |
| `repair-pdf` | `repair` | ✓ | pdf |
| `scan-pdf` | `scan-to-pdf` | ✓ | pdf |
| `ocr-pdf` | `ocr` | ✓ | pdf |
| `compare-pdf` | `compare` | ✓ | pdf |
| `ai-summarizer` | `ai-summarize` | ✓ | pdf |
| `translate-pdf` | `translate` | Blocked: on-device model not available | pdf |
| `workflow-builder` | `workflow` | ✗ | pdf |
| `numbers-to-words` | `numbers-to-words` | — (standalone) | pdf |
| `currency-converter` | `currency-converter` | — (standalone) | pdf |
| `background-remover` | `background-remover` | ✓ | image |
| `crop-image` | `crop-image` | ✓ | image |
| `resize-image` | `resize-image` | ✓ | image |
| `image-filters` | `image-filters` | ✓ | image |
| `image-compressor` | `image-compressor` | — (standalone) | image |
| `image-converter` | `image-converter` | — (standalone) | image |
| `qr-code-generator` | `qr-code-generator` | — (standalone) | — |
| `barcode-generator` | `barcode-generator` | — (standalone) | — |
| `zip-builder` | `zip-builder` | — (standalone) | — |

---

## Processing Flow

### Shared shell and on-demand preparation

```
User opens a tool card
  ↓
SharedNavigation fetches/caches route HTML and replaces only <main>
  ↓
Existing header and footer stay mounted; tool upload UI uses the shared template
  ↓
User selects a file
  ↓
The shared preparation bar runs while ToolModuleRegistry.prepare(toolId, files)
loads BrowserTools, the scheduler/runtime, preview UI, and that tool's declared
library dependencies
  ↓
The upload/preview UI is ready; unsupported local engines fail closed
```

### Local processing and download

```
User clicks "Process"
  ↓
processFile() in tool-page.js
  ↓
[1] PageOrganizer integration (if active)
    pageOrganizer.getEditedPdf() → edited PDF replaces selectedFiles[0].file
  ↓
[2] showProcessing() shows an inline, accessible status bar and rotating messages
  ↓
[3] Build opts from DOM (#opt-*)
  ↓
[4] BrowserToolRuntime.execute() → BrowserTools.process()
     → selected tool handler or dedicated local worker
  ↓
[5] OutputValidator.check(toolId, result)
    → validates blob size, PDF magic bytes, etc.
  ↓
[6] Success changes the main content to /<tool>/download without reloading
    the shared header/footer
  ↓
[7] Download click starts the browser download; after a short handoff the app
    drops File/Blob references, revokes object URLs, stops workers, and clears
    legacy app temp storage
```

### Execution Boundary

Browser processing is the only file-processing path. The queue client is a
fail-closed compatibility stub; the shared tool route does not load it, and
the app router has no file-upload fallback. If a local processor is unavailable,
the operation fails with a visible error instead of uploading the document.
Other site services may still handle non-file features such as accounts; this
local-only boundary applies to document processing.

The tool page loads the shared processor bundle only after file selection, then
prewarms only the selected tool's dependencies. The bundle is still a monolith:
its handler definitions are shared even though large libraries and preview code
are selected lazily. Worker-only tools require Web Worker support and do not
silently fall back to the main thread. The dedicated redaction worker uses a
fixed one-message contract and does not use the generic stream bridge.

Three standard file tools intentionally fail closed because their available
implementations are not genuine local processors: Protect does not encrypt PDFs,
Unlock does not decrypt them, and Translate previously sent extracted text to
MyMemory. Translation remains disabled until an on-device model is added. The
two calculators and image/utility generators remain standalone routes; the
image compressor, image converter, and ZIP builder also retain bespoke local
file flows. These `SLUG_MAP.special` pages are not yet unified with the shared
upload/preview/download shell and may do a full navigation. Workflow Builder is
disabled in configuration.

### File lifetime and privacy limits

- New source files and results are not stored in sessionStorage, localStorage,
  IndexedDB, or OPFS for refresh recovery.
- Startup cleanup removes file blobs and temporary stores left by older versions.
- Leaving a tool, switching tools, starting a new file, downloading, and pagehide
  release selected-file references, preview URLs, result URLs, and worker pools.
- The browser does not provide a reliable event indicating that a download has
  finished saving. Cleanup follows the download click after a short handoff and
  also runs on pagehide.
- JavaScript cannot guarantee physical RAM zeroization or control the browser's
  garbage collector, swap, or download manager. The app drops its references and
  best-effort clears app-owned temporary storage; it must not claim stronger
  erasure than browsers can provide.

---

## Browser Tools Library (`browser-tools.js`)

The shared handler bundle is loaded after a file is selected. It exposes:

```javascript
window.BrowserTools = {
  process(toolId, files, opts) → Promise<{ blob, filename }>,
  supports(toolId)             → boolean,
  prewarm(toolId)               → Promise<{ warmed, dependencies }>,
  _loadPdfLib()                → Promise<PDFLib>  // shared loader
};
```

### CDN Libraries Used

| Library | URL | Cached in IDB | Global |
|---------|-----|---------------|--------|
| pdf-lib | cdn.jsdelivr.net | Yes | `window.PDFLib` |
| pdfjs-dist | cdn.jsdelivr.net | Yes (ESM) | — |
| jszip | cdn.jsdelivr.net | Yes | `window.JSZip` |
| mammoth | cdn.jsdelivr.net | Yes | `window.mammoth` |
| html2pdf.js | cdn.jsdelivr.net | Yes | `window.html2pdf` |
| xlsx | cdn.jsdelivr.net | Yes | `window.XLSX` |
| tesseract.js | cdn.jsdelivr.net | No | `window.Tesseract` |
| pptxgenjs | cdn.jsdelivr.net | No | `window.PptxGenJS` |

**IDB caching**: First load fetches from CDN, stores bytes in IndexedDB. Subsequent loads serve from IDB as blob: URL (zero network).
This cache contains third-party library code only; user documents are never
written to that cache.

---

## Web Workers

16 worker files in `public/workers/`:

| Worker | Purpose |
|--------|---------|
| `pdf-worker.js` | Core local PDF operations; legacy protection, unlock, and redaction calls fail closed |
| `pdf-lib-worker.js` | pdf-lib operations; legacy protection, unlock, and redaction calls fail closed |
| `redact-worker.js` | Dedicated raster-flattening redaction; targeted content is not retained beneath the redaction |
| `compress-worker.js` | PDF compression (Ghostscript via OPFS) |
| `advanced-worker.js` | Advanced operations dispatcher |
| `compare-worker.js` | PDF comparison engine |
| `repair-worker.js` | PDF repair with multiple strategies |
| `ocr-preprocessor-worker.js` | Image preprocessing for Tesseract |
| `image-pipeline-worker.js` | Image processing pipeline |
| `image-tools-worker.js` | Crop, resize, filter operations |
| `remove-bg-worker.js` | Background removal |
| `pdf-word-docx-worker.js` | PDF → DOCX conversion |
| `pdf-excel-xlsx-worker.js` | PDF → XLSX conversion |
| `pdf-ppt-pptx-worker.js` | PDF → PPTX conversion |
| `summary-worker.js` | AI summarization (extractive) |
| `translation-worker.js` | Legacy translation worker; not loaded by the shared local-only route |
| `workerPool.js` | Worker pool manager (legacy) |
| `shared-cluster-worker.js` | SharedWorker for cross-tab coordination |
| `p4-heartbeat-mixin.js` | Heartbeat for worker health monitoring |

---

## Per-Tool Runtime Adapters

Legacy tool-specific runtime adapters remain in the repository. The current
shared route uses `BrowserToolRuntime` as its execution boundary and does not
load those adapters eagerly. Do not assume a legacy adapter is active or
verified without tracing its current call path.

The example below documents a legacy adapter contract, not the active shared
route.

| Runtime | Global | Tool |
|---------|--------|------|
| `rotate-runtime.js` | `window.RotateRuntime` | Rotate PDF |
| `compress-runtime.js` | `window.CompressRuntime` | Compress PDF |
| `edit-runtime.js` | `window.EditRuntime` | Edit PDF |
| `compare-runtime.js` | `window.CompareRuntime` | Compare PDF |

Each adapter provides:
- Telemetry span creation
- DedupeKey (prevents identical requests)
- Cancellation token management
- Worker dispatch via `RuntimeWorkers`
- Progress reporting via `RuntimeProgress`

Example (rotate):
```
RotateRuntime.process(file, opts)
  → creates RuntimeCancellation token
  → creates telemetry span
  → calls RotateWorkerAdapter.dispatch(file, opts, token, onProgress)
     → reads file into ArrayBuffer (progress 0→50%)
     → dedupeKey = 'rotate:name:size:degrees:pages'
     → RuntimeWorkers.dispatch(pdf-worker.js, { op:'rotate', buffer, degrees, pages })
     → returns ArrayBuffer (progress 50→100%)
  → wraps result in Blob
  → records telemetry
```

---

## Page Organizer (`page-organizer.js`)

**Page-Level Tools** (only supported tools mount PageOrganizer):
```
'split', 'rotate', 'organize', 'crop', 'page-numbers',
'watermark', 'sign', 'redact', 'ocr',
'ai-summarize', 'repair', 'edit'
```

### Internal State
```javascript
pages = [
  { id: uid(), originalIndex: 0, rotation: 0 },
  { id: uid(), originalIndex: 1, rotation: 90 },
  // ...
]
```

### Public API
```javascript
const ctrl = await PageOrganizer.open(hostEl, file, { onChange: cb });
ctrl.getEditedPdf()      → Promise<{ blob, file }> — bakes state into new PDF
ctrl.getOrderSummary()   → { order: [1,2,3], rotations: [0,90,0] }
ctrl.getPageCount()      → number
ctrl.applyRotationAll(delta) → void — rotates all pages by delta degrees, re-renders
ctrl.destroy()           → void — cleanup, invalidate session
```

### State Identity Detection
`getEditedPdf()` checks if unchanged:
```javascript
const unchanged = pages.length === pdfDoc.pageCount
  && pages.every((p, i) => p.originalIndex === i && p.rotation === 0);
if (unchanged) return { blob: originalBytes, file: originalFile };
```
→ Returns original file without regenerating PDF (performance optimization).

---

## Preview Flow

### Shared Preview (Upload Step)

The upload list, preview host, and step navigation are shared across file tools.
PageOrganizer is mounted only for tools that support page-level editing; other
tools use the common preview host or native browser image decoding.

### Live Preview Engine (`live-preview.js`, v6.0)

Additional real-content preview for select tools (mounted in a separate panel):

| Tool | Preview Content |
|------|----------------|
| word-to-pdf | Rendered HTML via Mammoth, print-style layout |
| excel-to-pdf | Sheet grid via XLSX.js, page-split visualization |
| pdf-to-word | Structure analysis, confidence scores, mini-map |
| pdf-to-excel | Column overlays, numeric coercion indicators |
| background-remover | Before/after swipe compare, alpha-mask |
| ai-summarize | Section preview, key topics, compression ratio |
| edit | PDF canvas with ruler overlay, grid toggle |

---

## Download Flow

After `processFile()` succeeds:

```javascript
showStatus(
  'success',
  'Your file is ready',
  'Click the Download button below to save your file.',
  createStatusUrl(blob),   // → blob: URL registered with ObjectURLRegistry
  filename                 // e.g. 'ilovepdf-rotate.pdf'
)
```

`createStatusUrl(blob)` registers a `blob:` URL with `window.ObjectURLRegistry`.
The result is held in memory for the download step only; it is not restored from
IndexedDB after a refresh. The URL is revoked at cleanup boundaries.

The download link is a standard `<a href="blob:..." download="filename.pdf">` element.
