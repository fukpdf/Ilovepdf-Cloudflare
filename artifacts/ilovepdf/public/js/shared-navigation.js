/* Shared-shell client navigation.
 * Reuses the current header/footer and swaps only <main>. Tool processors are
 * loaded when a visitor selects a file, not when the homepage first opens.
 */
(function (G, D) {
  'use strict';
  if (G.SharedNavigation) return;

  var routeCache = new Map();
  var activeRequest = null;
  var navigationId = 0;
  var currentKey = routeKey(new URL(G.location.href));
  var currentMain = D.querySelector('main');
  if (currentMain) routeCache.set(currentKey, { main: currentMain, meta: captureMeta() });

  var toolCoreScripts = [
    '/js/tools-config.js',
    '/js/tool-registry-runtime.js',
    '/js/tool-module-registry.js',
    '/js/tool-content.js',
    '/js/tool-state.js',
    '/js/session-persist.js',
    '/js/i18n-ext.js',
    '/js/queue-client.js',
    '/js/usage-limit.js',
    '/js/shared.js',
    '/js/chrome-shim.js',
    '/js/tool-page.js',
  ];
  var scriptLoads = new Map();
  var sharedScriptPaths = new Set([
    '/js/chrome.js',
    '/js/shared-navigation.js',
    '/js/app-router.js',
    '/js/mobile-nav.js',
  ]);

  function routeKey(url) {
    return url.pathname + url.search;
  }

  function isToolRoute(url) {
    var slug = url.pathname.replace(/^\/+|\/+$/g, '').toLowerCase()
      .replace(/\/(preview|download)$/i, '');
    var meta = G.SLUG_MAP && G.SLUG_MAP[slug];
    return !!(meta && !meta.special);
  }

  function scriptPath(src) {
    try { return new URL(src, G.location.origin).pathname; } catch (_) { return ''; }
  }

  function hasLoadedScript(path) {
    return Array.from(D.scripts).some(function (script) {
      return script.src && scriptPath(script.src) === path &&
        (script.dataset.loaded === 'true' ||
          (G.performance && G.performance.getEntriesByName(script.src).length > 0));
    });
  }

  function loadScript(path) {
    if (scriptLoads.has(path)) return scriptLoads.get(path);
    if (hasLoadedScript(path)) return Promise.resolve();

    var promise = new Promise(function (resolve, reject) {
      var script = D.createElement('script');
      script.src = path;
      script.async = false;
      script.dataset.sharedRouteScript = '1';
      script.onload = function () {
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = function () {
        scriptLoads.delete(path);
        script.remove();
        reject(new Error('A page component could not be loaded.'));
      };
      D.head.appendChild(script);
    });
    scriptLoads.set(path, promise);
    return promise;
  }

  function captureMeta() {
    var meta = { title: D.title, values: {} };
    ['description', 'keywords', 'robots', 'og:title', 'og:description', 'og:url',
      'twitter:title', 'twitter:description'].forEach(function (name) {
      var selector = name.indexOf(':') === -1
        ? 'meta[name="' + name + '"]'
        : 'meta[property="' + name + '"]';
      var node = D.head.querySelector(selector);
      if (node) meta.values[name] = node.content;
    });
    var canonical = D.head.querySelector('link[rel="canonical"]');
    if (canonical) meta.canonical = canonical.href;
    return meta;
  }

  function applyMeta(meta) {
    if (!meta) return;
    if (meta.title) D.title = meta.title;
    ['description', 'keywords', 'robots', 'og:title', 'og:description', 'og:url',
      'twitter:title', 'twitter:description'].forEach(function (name) {
      var selector = name.indexOf(':') === -1
        ? 'meta[name="' + name + '"]'
        : 'meta[property="' + name + '"]';
      var node = D.head.querySelector(selector);
      if (!Object.prototype.hasOwnProperty.call(meta.values || {}, name)) {
        if (node) node.remove();
        return;
      }
      if (!node) {
        node = D.createElement('meta');
        if (name.indexOf(':') === -1) node.name = name;
        else node.setAttribute('property', name);
        D.head.appendChild(node);
      }
      node.content = meta.values[name];
    });
    if (meta.canonical) {
      var canonical = D.head.querySelector('link[rel="canonical"]');
      if (!canonical) {
        canonical = D.createElement('link');
        canonical.rel = 'canonical';
        D.head.appendChild(canonical);
      }
      canonical.href = meta.canonical;
    }
  }

  function metaFromDocument(doc) {
    var result = { title: doc.title, values: {} };
    ['description', 'keywords', 'robots', 'og:title', 'og:description', 'og:url',
      'twitter:title', 'twitter:description'].forEach(function (name) {
      var selector = name.indexOf(':') === -1
        ? 'meta[name="' + name + '"]'
        : 'meta[property="' + name + '"]';
      var node = doc.head.querySelector(selector);
      if (node) result.values[name] = node.content;
    });
    var canonical = doc.head.querySelector('link[rel="canonical"]');
    if (canonical) result.canonical = canonical.href;
    return result;
  }

  function dispatchRoute(url, isTool) {
    try {
      G.dispatchEvent(new CustomEvent('app:route-changed', {
        detail: { url: url.href, tool: !!isTool },
      }));
    } catch (_) {}
    if (G.lucide && typeof G.lucide.createIcons === 'function') G.lucide.createIcons();
  }

  function setMain(nextMain) {
    var oldMain = D.querySelector('main');
    if (oldMain && oldMain.parentNode) oldMain.parentNode.replaceChild(nextMain, oldMain);
    else D.body.insertBefore(nextMain, D.querySelector('footer') || null);
    currentMain = nextMain;
  }

  function saveCurrentPage() {
    var main = D.querySelector('main');
    if (!main || main.id === 'tool-content') return;
    routeCache.set(currentKey, { main: main, meta: captureMeta() });
  }

  function clearToolFiles() {
    try {
      if (typeof G.releaseToolMemory === 'function') G.releaseToolMemory('route-change');
    } catch (_) {}
  }

  async function loadToolPage(url, doc, targetMain, targetMeta, id) {
    if (id !== navigationId) return;
    var existingMain = D.querySelector('#tool-content');
    if (existingMain && targetMain) {
      clearToolFiles();
      applyMeta(targetMeta);
      if (G.history.state == null || routeKey(new URL(G.location.href)) !== routeKey(url)) {
        G.history.pushState({ spa: true }, '', url.href);
      }
      currentKey = routeKey(url);
      G.loadToolPage(url.pathname + url.search);
      dispatchRoute(url, true);
      return;
    }

    if (!targetMain) throw new Error('Tool page content was not found.');
    saveCurrentPage();
    var inserted = targetMain.cloneNode(true);
    setMain(inserted);
    applyMeta(targetMeta);
    for (var i = 0; i < toolCoreScripts.length; i++) {
      await loadScript(toolCoreScripts[i]);
      if (id !== navigationId) return;
    }
    if (id !== navigationId) return;
    if (G.history.state == null || routeKey(new URL(G.location.href)) !== routeKey(url)) {
      G.history.pushState({ spa: true }, '', url.href);
    }
    currentKey = routeKey(url);
    if (typeof G.loadToolPage !== 'function') throw new Error('Tool page runtime did not start.');
    G.loadToolPage(url.pathname + url.search);
    dispatchRoute(url, true);
  }

  async function loadStaticRoute(url, doc, targetMain, targetMeta, id) {
    if (!targetMain) throw new Error('Page content was not found.');
    clearToolFiles();
    saveCurrentPage();

    var key = routeKey(url);
    var cached = routeCache.get(key);
    var nextMain = cached ? cached.main : targetMain.cloneNode(true);
    setMain(nextMain);
    applyMeta(cached ? cached.meta : targetMeta);

    if (!cached) {
      var scripts = Array.from(doc.querySelectorAll('script[src]'))
        .map(function (script) { return scriptPath(script.src); })
        .filter(function (path) {
          return path && path.indexOf('/js/') === 0 && !sharedScriptPaths.has(path) &&
            path.indexOf('/js/runtime-') !== 0 && path !== '/js/browser-tools.js';
        });
      for (var i = 0; i < scripts.length; i++) {
        await loadScript(scripts[i]);
        if (id !== navigationId) return;
      }
      routeCache.set(key, { main: nextMain, meta: targetMeta });
    }

    if (id !== navigationId) return;
    currentKey = key;
    if (G.history.state == null || routeKey(new URL(G.location.href)) !== key) {
      G.history.pushState({ spa: true }, '', url.href);
    }
    dispatchRoute(url, false);
  }

  async function navigate(input, options) {
    options = options || {};
    var url = input instanceof URL ? input : new URL(input, G.location.href);
    if (url.origin !== G.location.origin) return false;
    var id = ++navigationId;
    if (activeRequest) activeRequest.abort();
    activeRequest = new AbortController();

    var currentToolMain = D.querySelector('#tool-content');
    if (currentToolMain && isToolRoute(url) && typeof G.loadToolPage === 'function') {
      clearToolFiles();
      if (options.push !== false) G.history.pushState({ spa: true }, '', url.href);
      currentKey = routeKey(url);
      G.loadToolPage(url.pathname + url.search);
      dispatchRoute(url, true);
      return true;
    }

    var key = routeKey(url);
    var cached = routeCache.get(key);
    if (cached && !(cached.main && cached.main.id === 'tool-content')) {
      if (currentToolMain) clearToolFiles();
      saveCurrentPage();
      setMain(cached.main);
      applyMeta(cached.meta);
      if (options.push !== false) G.history.pushState({ spa: true }, '', url.href);
      currentKey = key;
      dispatchRoute(url, false);
      return true;
    }

    var response = await fetch(url.href, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'ILovePDF-Shared-Navigation' },
      signal: activeRequest.signal,
    });
    if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '')) {
      throw new Error('This page requires a full navigation.');
    }
    var html = await response.text();
    if (id !== navigationId) return true;
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var targetMain = doc.querySelector('main');
    if (!targetMain) throw new Error('Page content was not found.');
    var targetMeta = metaFromDocument(doc);

    if (targetMain.id === 'tool-content') {
      await loadToolPage(url, doc, targetMain, targetMeta, id);
    } else {
      await loadStaticRoute(url, doc, targetMain, targetMeta, id);
      if (options.push === false && routeKey(new URL(G.location.href)) !== key) {
        G.history.replaceState({ spa: true }, '', url.href);
      }
    }

    if (url.hash) {
      var anchor = D.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (anchor) anchor.scrollIntoView();
    } else {
      G.scrollTo(0, 0);
    }
    return true;
  }

  function onDocumentClick(event) {
    if (event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = event.target && event.target.closest && event.target.closest('a[href]');
    if (!link || link.target || link.hasAttribute('download') ||
        link.getAttribute('rel') === 'external' || link.dataset.noSpa !== undefined) return;
    var href = link.getAttribute('href');
    if (!href || href.charAt(0) === '#' || href.indexOf('mailto:') === 0 ||
        href.indexOf('tel:') === 0 || href.indexOf('javascript:') === 0) return;

    var url;
    try { url = new URL(href, G.location.href); } catch (_) { return; }
    if (url.origin !== G.location.origin || url.pathname.indexOf('/api/') === 0) return;
    if (url.pathname === G.location.pathname && url.search === G.location.search && url.hash) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    navigate(url, { push: true }).catch(function () {
      if (activeRequest) activeRequest.abort();
      G.location.assign(url.href);
    });
  }

  D.addEventListener('click', onDocumentClick, true);
  G.addEventListener('popstate', function (event) {
    var url = new URL(G.location.href);
    var currentTool = D.querySelector('#tool-content');
    if (currentTool && isToolRoute(url) && G.Flow) {
      var routeBase = url.pathname.replace(/^\/+|\/+$/g, '')
        .replace(/\/(preview|download)$/i, '');
      if (routeBase === G.Flow.baseSlug()) {
        event.stopImmediatePropagation();
        G.Flow.step = /\/download\/?$/i.test(url.pathname) ? 'download'
          : (/\/preview\/?$/i.test(url.pathname) ? 'preview' : 'upload');
        if (typeof G.renderStep === 'function') G.renderStep();
        return;
      }
    }
    event.stopImmediatePropagation();
    navigate(url, { push: false, state: event.state }).catch(function () {
      G.location.reload();
    });
  }, true);

  G.SharedNavigation = Object.freeze({
    navigate: navigate,
    currentRoute: function () { return currentKey; },
    cachedRoutes: function () { return routeCache.size; },
  });
}(window, document));
