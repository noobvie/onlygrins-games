/*
 * edu-sdk.js — a thin, optional helper over ArcadeSDK for the educational
 * lesson/quiz flow every OnlyGrins game shares. Pure convenience: it just
 * sequences the raw ArcadeSDK calls. A game can ignore this and call
 * ArcadeSDK directly.
 *
 * Load AFTER /sdk/arcade-sdk.js:
 *   <script src="/sdk/arcade-sdk.js"></script>
 *   <script src="/shared/edu-sdk.js"></script>
 *
 * Outside the platform iframe (e.g. opened as a bare file) ArcadeSDK rejects,
 * so every call here is wrapped to no-op gracefully — the game stays playable.
 */
(function (global) {
  'use strict';

  function sdk() { return global.ArcadeSDK || null; }
  function safe(fn) { try { var r = fn(); return r && r.then ? r : Promise.resolve(r); } catch (e) { return Promise.resolve({ success: false, error: String(e) }); } }

  var EduSDK = {
    /** Call once when the lesson UI is ready. */
    begin: function (meta) { return safe(function () { var s = sdk(); return s ? s.startSession(meta) : null; }); },

    /** Start lesson/question N (1-based). */
    startLesson: function (n, meta) { return safe(function () { var s = sdk(); return s ? s.startLevel(n, meta) : null; }); },

    /** Player retried the current lesson/question. */
    retryLesson: function (n, meta) { return safe(function () { var s = sdk(); return s ? s.restartLevel(n, meta) : null; }); },

    /** Finished lesson/question N. */
    finishLesson: function (n, meta) { return safe(function () { var s = sdk(); return s ? s.endLevel(n, meta) : null; }); },

    /** Optional ad break between lessons. Resolves even if skipped. */
    adBreak: function (placement) { return safe(function () { var s = sdk(); return s ? s.showInterlevelAd(placement || 'interlevel') : null; }); },

    /** Submit the final score → leaderboard + GP. Resolves { isPersonalBest, ... }. */
    submitScore: function (score, extra) { return safe(function () { var s = sdk(); return s ? s.saveScore(score, extra) : { success: false, offline: true }; }); },

    /** End the session when the player leaves. */
    end: function (meta) { return safe(function () { var s = sdk(); return s ? s.endSession(meta) : null; }); },

    /** True when running inside the platform (or the dev host). */
    isHosted: function () { return !!(global.parent && global.parent !== global); },
    /** Fail penalty — the ONE place the OnlyGrins wrong-answer penalty lives.
     * A wrong answer costs a flat FAIL_PENALTY, but ONLY for Grade 3+ (the
     * Grade 1-2 band is exempt), and the score never drops below 0. Retune the
     * whole platform by editing this file. `bandLowGrade` = the lowest grade the
     * player's chosen band covers (a "Grade 1-2" band -> 1; a "Grade 3" band -> 3).
     * Returns { score, delta } where delta is the change applied (0 or negative). */
    FAIL_PENALTY: 20,
    applyPenalty: function (score, bandLowGrade) {
      var pen = bandLowGrade >= 3 ? EduSDK.FAIL_PENALTY : 0;
      var take = Math.min(pen, Math.max(0, score)); // floor at 0
      return { score: score - take, delta: -take };
    },
  };

  global.EduSDK = EduSDK;
})(typeof window !== 'undefined' ? window : globalThis);
