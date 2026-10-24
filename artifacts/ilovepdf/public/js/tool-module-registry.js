// ToolModuleRegistry v1 — Phase 1 / independent tool boundary
// Derives one logical module contract per configured tool without loading
// processors eagerly. A module owns its tool id, accepted input contract,
// execution manifest, and lifecycle hooks; processor code remains lazy.
(function (G) {
  'use strict';
  if (G.ToolModuleRegistry) return;

  var _modules = Object.create(null);
  var _scriptPromises = Object.create(null);
  var _unavailableLocalEngines = Object.freeze({
    protect: 'PDF password protection is unavailable until a verified browser-only encryption engine is ready.',
    unlock: 'PDF password removal is unavailable until a verified browser-only decryption engine is ready.',
    translate: 'PDF translation is unavailable until an on-device translation model is ready.',
  });

  function getUnavailableMessage(toolId) {
    return _unavailableLocalEngines[toolId] || '';
  }

  function _loadScript(path) {
    if (_scriptPromises[path]) return _scriptPromises[path];
    _scriptPromises[path] = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = path;
      script.async = false;
      script.dataset.toolRuntime = '1';
      script.onload = function () {
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = function () {
        delete _scriptPromises[path];
        script.remove();
        reject(new Error('Unable to load local tool runtime.'));
      };
      document.head.appendChild(script);
    });
    return _scriptPromises[path];
  }

  function _copyAccepted(tool) {
    return String(tool && tool.acceptedFiles || '')
      .split(',').map(function (v) { return v.trim().toLowerCase(); }).filter(Boolean);
  }

  function _build(tool) {
    if (!tool || !tool.id) return null;
    var browser = G.BrowserTools;
    var execution = browser && typeof browser.getToolExecutionManifest === 'function'
      ? browser.getToolExecutionManifest(tool.id) : null;
    var special = !!(G.SLUG_MAP && Object.keys(G.SLUG_MAP).some(function (slug) {
      var m = G.SLUG_MAP[slug];
      return m && m.id === tool.id && m.special;
    }));
    return Object.freeze({
      version: 1,
      moduleId: 'tool:' + tool.id,
      toolId: tool.id,
      category: tool.category || null,
      group: tool.group || null,
      entry: special ? 'special-route' : 'tool-page',
      capability: special ? 'special-route' : (execution && execution.processor ? 'browser-processor' : (browser ? 'unavailable' : 'pending')),
      processor: execution ? execution.processor : null,
      execution: execution ? execution.execution : (browser ? 'unavailable' : 'pending'),
      lazyLoad: true,
      independent: true,
      acceptedFiles: _copyAccepted(tool),
      multipleFiles: tool.multipleFiles !== false,
      working: tool.working !== false,
      validationVersion: execution && execution.validation ? execution.validation.version : null,
    });
  }

  function register(tool) {
    var m = _build(tool);
    if (!m) return null;
    _modules[m.toolId] = m;
    return m;
  }

  function get(toolId) {
    return _modules[toolId] || null;
  }

  function registerAll(tools) {
    var list = Array.isArray(tools) ? tools : [];
    list.forEach(register);
    return Object.keys(_modules).length;
  }

  function activate(toolId) {
    var m = get(toolId);
    if (!m) return { ok: false, code: 'UNKNOWN_TOOL_MODULE' };
    try {
      G.dispatchEvent(new CustomEvent('tool:module-activated', { detail: { module: m } }));
    } catch (_) {}
    return { ok: true, module: m };
  }

  async function prepare(toolId, files) {
    var tool = (Array.isArray(G.TOOLS) ? G.TOOLS : []).find(function (entry) {
      return entry && entry.id === toolId;
    });
    if (!tool) return { ok: false, code: 'UNKNOWN_TOOL_MODULE' };
    var unavailableMessage = getUnavailableMessage(toolId);
    if (unavailableMessage) {
      return {
        ok: false,
        code: 'LOCAL_ENGINE_UNAVAILABLE',
        message: unavailableMessage + ' Your file was not sent anywhere.',
      };
    }

    try {
      if (!G.BrowserTools) {
        await _loadScript('/js/browser-tools.js');
      }
      if (!G.BrowserTools || typeof G.BrowserTools.supports !== 'function') {
        return { ok: false, code: 'LOCAL_ENGINE_UNAVAILABLE' };
      }

      register(tool);
      if (!G.BrowserTools.supports(toolId)) {
        return { ok: false, code: 'LOCAL_ENGINE_UNAVAILABLE' };
      }

      // Keep the canonical scheduler and execution boundary out of the
      // homepage bundle. They are prepared while the selected file is shown.
      if (!G.TaskScheduler) await _loadScript('/js/task-scheduler.js');
      if (!G.RuntimeScheduler) await _loadScript('/js/runtime-task-scheduler.js');
      if (!G.BrowserToolRuntime) await _loadScript('/js/browser-tool-runtime.js');
      if (!G.RuntimeScheduler || typeof G.RuntimeScheduler.run !== 'function' ||
          !G.BrowserToolRuntime || typeof G.BrowserToolRuntime.execute !== 'function') {
        return { ok: false, code: 'LOCAL_RUNTIME_UNAVAILABLE' };
      }

      // Preview code is loaded only after the user selects a file. Image files
      // use native browser decoding; PDF tools share these preview modules.
      if (tool.group !== 'image') {
        await Promise.all([
          _loadScript('/js/live-preview.js'),
          _loadScript('/js/page-organizer.js'),
        ]);
      }

      // These optional editor/model bundles are scoped to the selected tool.
      if (toolId === 'background-remover') {
        await _loadScript('/js/bg-ai-engine.js');
        await _loadScript('/js/bg-remover-pro.js');
      } else if (toolId === 'edit') {
        await _loadScript('/js/edit-pdf-pro.js');
      }

      var warmed = typeof G.BrowserTools.prewarm === 'function'
        ? await G.BrowserTools.prewarm(toolId, files || [])
        : { warmed: false };
      register(tool);
      return { ok: true, module: get(toolId), warmed: warmed };
    } catch (error) {
      return {
        ok: false,
        code: 'LOCAL_ENGINE_PREPARATION_FAILED',
        message: error && error.message ? error.message : 'The local tool could not be prepared.',
      };
    }
  }

  function getAll() {
    return Object.keys(_modules).map(function (id) { return _modules[id]; });
  }

  function audit() {
    var cfg = Array.isArray(G.TOOLS) ? G.TOOLS : [];
    var report = { configured: cfg.length, registered: Object.keys(_modules).length, browser: 0, special: 0, unavailable: 0, missing: [] };
    cfg.forEach(function (tool) {
      if (!tool || !tool.id) return;
      var m = _modules[tool.id];
      if (!m) { report.missing.push(tool.id); return; }
      if (m.capability === 'browser-processor') report.browser++;
      else if (m.capability === 'special-route') report.special++;
      else report.unavailable++;
    });
    return report;
  }

  G.ToolModuleRegistry = Object.freeze({
    VERSION: '1.0',
    register: register,
    registerAll: registerAll,
    get: get,
    getAll: getAll,
    audit: audit,
    activate: activate,
    prepare: prepare,
    getUnavailableMessage: getUnavailableMessage,
  });

  // Register only metadata. No processor/engine is loaded here.
  setTimeout(function () {
    try { registerAll(G.TOOLS || []); } catch (_) {}
  }, 0);
}(window));
