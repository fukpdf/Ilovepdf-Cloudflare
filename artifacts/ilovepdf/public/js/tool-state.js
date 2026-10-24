/* tool-state.js — compatibility surface for the memory-only tool flow.
 * File bytes and outputs are never stored for refresh recovery. Legacy
 * persistence APIs fail closed; clearAllFiles removes data left by older
 * releases. Browser JavaScript cannot promise physical RAM zeroization.
 */
(function () {
  const SS_PREFIX = 'ilovepdf:toolState:';
  const DB_NAME   = 'ilovepdf-tools';
  const DB_STORE  = 'blobs';
  const DB_VER    = 1;

  // Lazily open / upgrade the IndexedDB. Wrapped in a single shared
  // promise so concurrent callers don't trigger multiple opens.
  let dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(DB_STORE)) {
            db.createObjectStore(DB_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
      } catch (e) {
        // Private mode / disabled storage → fall back gracefully.
        reject(e);
      }
    });
    return dbPromise;
  }

  // File bytes are deliberately never persisted. These compatibility methods
  // remain so older callers fail closed instead of restoring a prior file.
  async function putBlob() { return false; }

  async function getBlob() { return null; }

  // Wipe every key for this slug. The transaction itself is awaited so
  // callers can rely on cleanup having completed before a lifecycle boundary.
  async function clearBlobs(slug) {
    try {
      const db = await openDB();
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      const prefix = slug + '::';
      await new Promise((res, rej) => {
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = e => {
          const c = e.target.result;
          if (!c) return;
          if (typeof c.key === 'string' && c.key.startsWith(prefix)) c.delete();
          c.continue();
        };
        cursorReq.onerror = () => rej(cursorReq.error);
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error || new Error('IndexedDB cleanup aborted'));
      });
    } catch (e) { /* ignore */ }
  }

  // Explicit delivery boundary: once a result has been delivered/download
  // initiated, remove source files and generated results from all app-owned
  // file/temp stores. The separate CDN code cache is intentionally retained.
  async function clearAfterDelivery(slug) {
    if (!slug) return false;
    try {
      sessionStorage.removeItem(SS_PREFIX + slug);
    } catch (_) {}
    try {
      if (window.SessionPersist) window.SessionPersist.clear(slug);
    } catch (_) {}
    await clearAllFiles();
    return true;
  }

  // Purge blobs and metadata left by older releases, then leave persistence
  // disabled for every tool rather than only clearing the current slug.
  async function clearAllFiles() {
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key && key.indexOf(SS_PREFIX) === 0) sessionStorage.removeItem(key);
      }
    } catch (_) {}
    try {
      const prefixes = ['ilpdf:sp:', 'ilpdf:dl', 'ilpdf:res'];
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && prefixes.some(prefix => key.indexOf(prefix) === 0)) localStorage.removeItem(key);
      }
    } catch (_) {}
    let toolStoreCleared = false;
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Tool file cleanup aborted'));
      });
      toolStoreCleared = true;
    } catch (_) {
      // Continue best-effort cleanup of legacy temporary stores below.
    }

    function deleteDatabase(name) {
      return new Promise(resolve => {
        let settled = false;
        const finish = value => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        };
        const timer = setTimeout(() => finish(false), 2000);
        try {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => finish(true);
          request.onerror = () => finish(false);
          request.onblocked = () => finish(false);
        } catch (_) {
          finish(false);
        }
      });
    }

    async function clearPrivateTempFiles() {
      try {
        if (!navigator.storage || typeof navigator.storage.getDirectory !== 'function') return true;
        const root = await navigator.storage.getDirectory();
        const entries = root.entries();
        while (true) {
          const next = await entries.next();
          if (next.done) break;
          const name = next.value && next.value[0];
          if (typeof name === 'string' &&
              (name.indexOf('ilovepdf_') === 0 || name.indexOf('ae_stage_') === 0)) {
            try { await root.removeEntry(name, { recursive: true }); } catch (_) {}
          }
        }
        return true;
      } catch (_) {
        return false;
      }
    }

    const legacyStores = await Promise.all([
      deleteDatabase('ilovepdf-adv-temp'),
      deleteDatabase('ilovepdf-lfs-cp'),
      clearPrivateTempFiles(),
    ]);
    return toolStoreCleared && legacyStores.every(Boolean);
  }

  function save() { return false; }
  function load() { return null; }

  function clear(slug) {
    if (!slug) return;
    try { sessionStorage.removeItem(SS_PREFIX + slug); } catch (_) {}
    // Phase 3: also wipe the cross-session mirror so cleared tools don't reappear.
    try { if (window.SessionPersist) window.SessionPersist.clear(slug); } catch (_) {}
    clearBlobs(slug);
  }

  // Helper: detect blob: URLs in a result HTML snippet so we know whether
  // we need to re-issue a fresh URL.createObjectURL after hydration.
  function rewriteBlobHrefs(html, freshUrl) {
    if (!html || !freshUrl) return html;
    return html.replace(
      /href=(["'])blob:[^"']+\1/g,
      `href="${freshUrl}"`
    );
  }

  window.ToolState = {
    save, load, clear,
    putBlob, getBlob, clearBlobs, clearAfterDelivery, clearAllFiles,
    rewriteBlobHrefs,
  };
})();
