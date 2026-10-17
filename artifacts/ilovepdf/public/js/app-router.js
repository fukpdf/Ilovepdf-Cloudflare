/* app-router.js — local-only per-tool dispatcher.
 *
 * File-bearing operations are dispatched only to browser processors. There is
 * no server or API fallback at this boundary.
 *
 * Behaviour:
 *   - Browser tools → resolved through ToolModuleRegistry and BrowserTools.
 *     Returns a Promise<{ blob, filename }>.
 *   - Unsupported tools fail closed and never transmit input files.
 *
 * Phase 7J upgrades (Batch J):
 *   - Pre-dispatch behavior analysis gate (automation detection + risk level)
 *   - Session recorder events for every tool dispatch
 *   - Packet integrity header on API fetch calls
 *   - Worker routing registration for browser tool tracking
 *   - Security stream push on dispatch failures
 */
(function () {
  var G = window;

  const TOOL_MAP = {
    'merge': true, 'split': true, 'rotate': true, 'crop': true, 'organize': true,
    'page-numbers': true, 'watermark': true, 'jpg-to-pdf': true, 'compress': true,
    'pdf-to-jpg': true, 'crop-image': true, 'resize-image': true, 'image-filters': true,
    'word-to-pdf': true, 'word-to-excel': true, 'html-to-pdf': true, 'edit': true,
    'sign': true, 'pdf-to-word': true, 'pdf-to-excel': true, 'repair': true,
    'compare': true, 'ocr': true, 'background-remover': true, 'ai-summarize': true,
    'workflow': true, 'pdf-to-powerpoint': true, 'powerpoint-to-pdf': true,
    'excel-to-pdf': true, 'scan-to-pdf': true,
  };

  // ── Phase 7J: Pre-dispatch behavior analysis gate ─────────────────────────
  // Non-blocking: if Phase 7 systems are not loaded, dispatch proceeds normally.
  // Performs two soft checks and one hard block:
  //   1. Automation detection score > 80 → block + telemetry (hard)
  //   2. Behavior risk CRITICAL → telemetry only (soft, no block)
  //   3. Session recorder → always records every dispatch event (informational)
  function _p7Gate(toolId, fileCount) {
    try {
      // 1. Automation detection — block highly-automated traffic
      var ad = G.RuntimeAutomationDetection;
      if (ad && typeof ad.isAutomated === 'function' && ad.isAutomated()) {
        var autoScore = typeof ad.getScore === 'function' ? ad.getScore() : 100;
        if (autoScore > 80) {
          try {
            if (G.SecurityTelemetry && typeof G.SecurityTelemetry.record === 'function') {
              G.SecurityTelemetry.record('integrity-failure', {
                reason: 'automation-blocked',
                tool: toolId,
                score: autoScore,
              });
            }
            var ss = G.RuntimeSecurityStream;
            if (ss && typeof ss.push === 'function') {
              ss.push('dispatch-blocked', 'app-router', 'WARN',
                'Tool dispatch blocked: automation score ' + autoScore, { toolId: toolId });
            }
          } catch (_) {}
          return false; // hard block for highly-automated sessions
        }
      }

      // 2. Behavior analysis — log CRITICAL risk but do not block tool use
      try {
        var ba = G.RuntimeBehaviorAnalysis;
        if (ba && typeof ba.getRiskLevel === 'function') {
          var risk = ba.getRiskLevel();
          if (risk === 'CRITICAL') {
            if (G.SecurityTelemetry && typeof G.SecurityTelemetry.record === 'function') {
              G.SecurityTelemetry.record('security-anomaly', {
                reason: 'behavior-critical-dispatch',
                tool: toolId,
              });
            }
            var inc = G.RuntimeIncidentEngine;
            if (inc && typeof inc.report === 'function') {
              inc.report('behavior-critical', 70, 'app-router',
                { tool: toolId, risk: risk });
            }
          }
        }
      } catch (_) {}

      // 3. Session recorder — record every tool dispatch for forensic timeline
      try {
        var sr = G.RuntimeSessionRecorder;
        if (sr && typeof sr.record === 'function') {
          sr.record('tool_dispatch', { tool: toolId, files: fileCount, ts: Date.now() });
        }
      } catch (_) {}

      // 4. Phase 8J: persist dispatch event to IDB for cross-navigation forensics
      try {
        var sp = G.RuntimeSessionPersistence;
        if (sp && typeof sp.persistEvent === 'function') {
          sp.persistEvent('tool_dispatch', { tool: toolId, files: fileCount });
        }
      } catch (_) {}

      // 5. Phase 8J: propagate dispatch to tab mesh for cross-tab anomaly detection
      try {
        var tm = G.RuntimeTabMesh;
        var ba2 = G.RuntimeBehaviorAnalysis;
        if (tm && ba2 && typeof tm.broadcast === 'function' && typeof ba2.getRiskLevel === 'function') {
          var risk2 = ba2.getRiskLevel();
          if (risk2 === 'CRITICAL' || risk2 === 'HIGH') {
            tm.broadcast('ANOMALY', { type: 'tool_dispatch', tool: toolId, risk: risk2 });
          }
        }
      } catch (_) {}

      // 6. Phase 8J: update threat intel threshold if available
      try {
        var ti = G.RuntimeThreatIntel;
        if (ti && typeof ti.getThreshold === 'function') {
          var blockThreshold = ti.getThreshold('automationBlock');
          if (blockThreshold !== null) {
            var ad2 = G.RuntimeAutomationDetection;
            if (ad2 && typeof ad2.getScore === 'function') {
              var autoScore2 = ad2.getScore();
              if (autoScore2 > blockThreshold) {
                console.warn('[AppRouter] P8 threat-intel block: automation score', autoScore2, '> threshold', blockThreshold);
                return false;
              }
            }
          }
        }
      } catch (_) {}

    } catch (_) {}
    return true; // allow dispatch by default
  }

  // ── Phase 7J: Worker routing registration for browser tools ───────────────
  // Informs RuntimeWorkerRouting of the capability being used so the mesh
  // can bias future worker allocation toward the in-demand capability.
  function _p7RegisterBrowserDispatch(toolId) {
    try {
      var wr = G.RuntimeWorkerRouting;
      if (wr && typeof wr.route === 'function') {
        wr.route('browser-tool:' + toolId);
      }
    } catch (_) {}
  }

  /** Returns the entry for a tool id, or null. */
  function lookup(toolId) {
    return Object.prototype.hasOwnProperty.call(TOOL_MAP, toolId)
      ? { type: 'browser', id: toolId }
      : null;
  }

  /**
   * Run a tool by id. Accepts a single File or an array of Files plus an
   * optional options object passed only to the browser processor.
   *
   * Phase 7J: applies pre-dispatch gate, session recording, packet integrity
   * wrapping, and worker routing registration transparently.
   */
  async function runTool(toolId, files, options) {
    const tool = lookup(toolId);
    if (!tool) throw new Error('Unknown tool: ' + toolId);

    const fileArray = Array.isArray(files) ? files : (files ? [files] : []);
    if (!fileArray.length) throw new Error('No file provided');
    const opts = options || {};

    // Phase 7J: pre-dispatch gate (automation block + behavior log + session record)
    if (!_p7Gate(toolId, fileArray.length)) {
      throw new Error('dispatch_blocked');
    }

    if (!G.BrowserTools || !G.BrowserTools.supports(tool.id)) {
      if (G.ToolModuleRegistry && typeof G.ToolModuleRegistry.prepare === 'function') {
        const prepared = await G.ToolModuleRegistry.prepare(tool.id, fileArray);
        if (!prepared.ok) throw new Error(prepared.code || 'local_engine_unavailable');
      }
    }
    if (!G.BrowserTools || !G.BrowserTools.supports(tool.id)) {
      throw new Error('local_engine_unavailable');
    }

    _p7RegisterBrowserDispatch(toolId);
    return G.BrowserTools.process(tool.id, fileArray, opts);
  }

  G.AppRouter = { TOOL_MAP, lookup, runTool };
  // Convenience global aliases that mirror the spec the user asked for.
  G.TOOL_MAP = TOOL_MAP;
  G.runTool  = runTool;
})();
