// Local-only product mode: never submit user files to a server queue.
(function (G) {
  'use strict';
  if (G.QueueClient) return;

  G.QueueClient = Object.freeze({
    tryProcess: async function () { return false; },
    isQueued: function () { return false; },
    QUEUED_TOOL_IDS: Object.freeze([]),
  });
}(window));
