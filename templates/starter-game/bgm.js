/*
 * bgm.js — generative background music for OnlyGrins educational games.
 *
 * Zero assets, zero licensing: every note is synthesized live with the Web
 * Audio API, so nothing here is a recording anyone can own. A small library of
 * ~40 "mood" presets (scale + tempo + chord progression + instrument palette)
 * is combined with a per-game seed, so two games that share a mood still play
 * different, never-quite-repeating loops.
 *
 * Load it LAST, after the game script, telling it the game's category + slug:
 *   <script src="bgm.js" data-cat="math" data-seed="angle-alligator"></script>
 *
 * The category picks a fitting family of moods; the seed picks one
 * deterministically (same game → same theme every visit) and drives the melody.
 * Override explicitly with data-mood="math-sunrise" if you want a specific one.
 *
 * DO NOT load this in the music games (melody-mimic, note-name-ninja,
 * pitch-patrol, rhythm-raccoon) — their gameplay IS the audio; they use SFX only.
 *
 * It adds a small 🔊/🔇 toggle (bottom-left), remembers the choice in
 * localStorage, waits for the first tap to satisfy autoplay policies, and
 * pauses itself when the tab is hidden. Failures are swallowed — a browser with
 * no Web Audio just stays silent and the game plays on.
 */
(function () {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return; // no Web Audio → silent, game still works

  // ---- scales (semitones from root, one octave) -------------------------------
  var SCALES = {
    major:      [0, 2, 4, 5, 7, 9, 11],
    minor:      [0, 2, 3, 5, 7, 8, 10],
    dorian:     [0, 2, 3, 5, 7, 9, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    lydian:     [0, 2, 4, 6, 7, 9, 11],
    phrygian:   [0, 1, 3, 5, 7, 8, 10],
    pentMajor:  [0, 2, 4, 7, 9],
    pentMinor:  [0, 3, 5, 7, 10],
    blues:      [0, 3, 5, 6, 7, 10],
    wholeTone:  [0, 2, 4, 6, 8, 10]
  };

  // ---- ~40 mood presets, grouped by subject so each game gets a fitting vibe ---
  // Fields: s=scale r=rootMidi t=tempo(bpm) p=chord-progression(scale degrees)
  //         lead='arp'|'pluck'|'bell'|'none'  bass='root'|'root5'|'walk'|'none'
  //         perc='none'|'soft'|'tick'  pad=bool  w={pad,bass,lead} oscillator types
  var MOODS = {
    // MATH — bright, clean, curious
    'math-sunrise':   { s: 'major',     r: 60, t: 96,  p: [0, 3, 4, 3], lead: 'bell',  bass: 'root5', perc: 'soft', pad: true,  w: { pad: 'triangle', bass: 'sine',     lead: 'triangle' } },
    'math-skip':      { s: 'pentMajor', r: 58, t: 108, p: [0, 3, 2, 3], lead: 'pluck', bass: 'root',  perc: 'tick', pad: true,  w: { pad: 'triangle', bass: 'triangle', lead: 'square' } },
    'math-puzzlebox': { s: 'lydian',    r: 57, t: 92,  p: [0, 3, 1, 4], lead: 'arp',   bass: 'root',  perc: 'none', pad: true,  w: { pad: 'sine',     bass: 'sine',     lead: 'triangle' } },
    'math-march':     { s: 'major',     r: 55, t: 112, p: [0, 4, 3, 4], lead: 'pluck', bass: 'walk',  perc: 'soft', pad: true,  w: { pad: 'triangle', bass: 'triangle', lead: 'triangle' } },
    'math-daydream':  { s: 'pentMajor', r: 60, t: 80,  p: [0, 4, 2, 3], lead: 'bell',  bass: 'root',  perc: 'none', pad: true,  w: { pad: 'sine',     bass: 'sine',     lead: 'sine' } },

    // HISTORY — stately, ancient, a little mysterious
    'hist-stately':   { s: 'dorian',    r: 55, t: 82,  p: [0, 5, 3, 4], lead: 'bell',  bass: 'root5', perc: 'none', pad: true,  w: { pad: 'triangle', bass: 'sine',     lead: 'sine' } },
    'hist-ancient':   { s: 'phrygian',  r: 52, t: 76,  p: [0, 3, 1, 0], lead: 'pluck', bass: 'root',  perc: 'tick', pad: true,  w: { pad: 'sawtooth', bass: 'triangle', lead: 'triangle' } },
    'hist-mystery':   { s: 'minor',     r: 57, t: 88,  p: [0, 5, 4, 5], lead: 'arp',   bass: 'root',  perc: 'none', pad: true,  w: { pad: 'sine',     bass: 'sine',     lead: 'triangle' } },
    'hist-chronicle': { s: 'dorian',    r: 53, t: 90,  p: [0, 4, 5, 3], lead: 'pluck', bass: 'walk',  perc: 'soft', pad: true,  w: { pad: 'triangle', bass: 'triangle', lead: 'triangle' } },

    // LOGIC — puzzle, ticking, thoughtful
    'logic-clockwork':{ s: 'dorian',    r: 57, t: 100, p: [0, 4, 3, 4], lead: 'pluck', bass: 'root',  perc: 'tick', pad: true,  w: { pad: 'sine',     bass: 'triangle', lead: 'square' } },
    'logic-riddle':   { s: 'minor',     r: 55, t: 94,  p: [0, 3, 5, 4], lead: 'arp',   bass: 'root',  perc: 'tick', pad: true,  w: { pad: 'triangle', bass: 'sine',     lead: 'triangle' } },
    'logic-cipher':   { s: 'wholeTone', r: 58, t: 88,  p: [0, 2, 4, 2], lead: 'bell',  bass: 'root',  perc: 'none', pad: true,  w: { pad: 'sine',     bass: 'sine',     lead: 'sine' } },
    'logic-focus':    { s: 'lydian',    r: 55, t: 96,  p: [0, 4, 1, 4], lead: 'pluck', bass: 'root5', perc: 'tick', pad: true,  w: { pad: 'triangle', bass: 'triangle', lead: 'triangle' } },

    // MONEY — jaunty, marketplace, upbeat
    'money-market':   { s: 'mixolydian',r: 57, t: 116, p: [0, 3, 4, 3], lead: 'pluck', bass: 'walk',  perc: 'soft', pad: true,  w: { pad: 'triangle', bass: 'triangle', lead: 'square' } },
    'money-jaunty':   { s: 'major',     r: 60, t: 120, p: [0, 4, 5, 4], lead: 'pluck', bass: 'root5', perc: 'soft', pad: true,  w: { pad: 'triangle', bass: 'triangle', lead: 'triangle' } },
    'money-swing':    { s: 'blues',     r: 55, t: 104, p: [0, 3, 4, 0], lead: 'bell',  bass: 'walk',  perc: 'tick', pad: true,  w: { pad: 'sine',     bass: 'triangle', lead: 'triangle' } },
    'money-thrift':   { s: 'pentMajor', r: 58, t: 100, p: [0, 2, 3, 4], lead: 'pluck', bass: 'root',  perc: 'soft', pad: true,  w: { pad: 'triangle', bass: 'sine',     lead: 'square' } },

    // CODING — chiptune, robotic, techy
    'code-chiptune':  { s: 'major',     r: 60, t: 124, p: [0, 4, 5, 3], lead: 'arp',   bass: 'root',  perc: 'tick', pad: true,  w: { pad: 'square',   bass: 'square',   lead: 'square' } },
    'code-robot':     { s: 'minor',     r: 55, t: 112, p: [0, 5, 3, 4], lead: 'pluck', bass: 'root',  perc: 'tick', pad: true,  w: { pad: 'square',   bass: 'triangle', lead: 'square' } },
    'code-loop':      { s: 'dorian',    r: 57, t: 118, p: [0, 3, 0, 4], lead: 'arp',   bass: 'root5', perc: 'soft', pad: true,  w: { pad: 'triangle', bass: 'square',   lead: 'square' } },
    'code-neon':      { s: 'lydian',    r: 58, t: 120, p: [0, 4, 3, 4], lead: 'bell',  bass: 'root',  perc: 'tick', pad: true,  w: { pad: 'sawtooth', bass: 'triangle', lead: 'square' } },
    'code-binary':    { s: 'pentMinor', r: 55, t: 128, p: [0, 3, 4, 2], lead: 'pluck', bass: 'root',  perc: 'tick', pad: true,  w: { pad: 'square',   bass: 'square',   lead: 'square' } },

    // LANGUAGE — playful, folk, warm
    'lang-folk':      { s: 'major',     r: 57, t: 104, p: [0, 4, 5, 4], lead: 'pluck', bass: 'root5', perc: 'soft', pad: true,  w: { pad: 'triangle', bass: 'triangle', lead: 'triangle' } },
    'lang-playful':   { s: 'pentMajor', r: 60, t: 112, p: [0, 3, 2, 4], lead: 'bell',  bass: 'root',  perc: 'tick', pad: true,  w: { pad: 'triangle', bass: 'sine',     lead: 'square' } },
    'lang-cozy':      { s: 'mixolydian',r: 55, t: 90,  p: [0, 3, 4, 3], lead: 'arp',   bass: 'walk',  perc: 'none', pad: true,  w: { pad: 'sine',     bass: 'triangle', lead: 'triangle' } },
    'lang-parade':    { s: 'major',     r: 58, t: 116, p: [0, 5, 4, 5], lead: 'pluck', bass: 'walk',  perc: 'soft', pad: true,  w: { pad: 'triangle', bass: 'triangle', lead: 'triangle' } },

    // GEOGRAPHY — adventurous, worldly, breezy
    'geo-voyage':     { s: 'mixolydian',r: 55, t: 108, p: [0, 4, 3, 4], lead: 'bell',  bass: 'walk',  perc: 'soft', pad: true,  w: { pad: 'triangle', bass: 'triangle', lead: 'triangle' } },
    'geo-breeze':     { s: 'lydian',    r: 60, t: 92,  p: [0, 3, 4, 1], lead: 'arp',   bass: 'root',  perc: 'none', pad: true,  w: { pad: 'sine',     bass: 'sine',     lead: 'sine' } },
    'geo-safari':     { s: 'dorian',    r: 54, t: 110, p: [0, 3, 4, 3], lead: 'pluck', bass: 'root',  perc: 'tick', pad: true,  w: { pad: 'triangle', bass: 'triangle', lead: 'square' } },
    'geo-summit':     { s: 'major',     r: 57, t: 100, p: [0, 5, 3, 4], lead: 'bell',  bass: 'root5', perc: 'soft', pad: true,  w: { pad: 'triangle', bass: 'sine',     lead: 'triangle' } },
    'geo-tide':       { s: 'pentMajor', r: 55, t: 84,  p: [0, 2, 4, 3], lead: 'arp',   bass: 'root',  perc: 'none', pad: true,  w: { pad: 'sine',     bass: 'sine',     lead: 'sine' } },

    // SCIENCE — spacey, bubbly, full of wonder
    'sci-cosmos':     { s: 'lydian',    r: 57, t: 86,  p: [0, 4, 1, 4], lead: 'bell',  bass: 'root',  perc: 'none', pad: true,  w: { pad: 'sine',     bass: 'sine',     lead: 'sine' } },
    'sci-bubbles':    { s: 'pentMajor', r: 60, t: 100, p: [0, 3, 4, 2], lead: 'pluck', bass: 'root',  perc: 'tick', pad: true,  w: { pad: 'triangle', bass: 'sine',     lead: 'triangle' } },
    'sci-lab':        { s: 'wholeTone', r: 56, t: 94,  p: [0, 2, 4, 2], lead: 'arp',   bass: 'root',  perc: 'tick', pad: true,  w: { pad: 'sine',     bass: 'triangle', lead: 'square' } },
    'sci-aurora':     { s: 'major',     r: 58, t: 80,  p: [0, 5, 3, 4], lead: 'bell',  bass: 'root5', perc: 'none', pad: true,  w: { pad: 'triangle', bass: 'sine',     lead: 'sine' } },
    'sci-spark':      { s: 'mixolydian',r: 57, t: 112, p: [0, 4, 3, 4], lead: 'pluck', bass: 'walk',  perc: 'soft', pad: true,  w: { pad: 'triangle', bass: 'triangle', lead: 'square' } },

    // MEMORY — dreamy, gentle, twinkly
    'mem-lullaby':    { s: 'major',     r: 60, t: 76,  p: [0, 3, 4, 3], lead: 'bell',  bass: 'root',  perc: 'none', pad: true,  w: { pad: 'sine',     bass: 'sine',     lead: 'sine' } },
    'mem-twinkle':    { s: 'pentMajor', r: 62, t: 84,  p: [0, 2, 3, 4], lead: 'bell',  bass: 'root',  perc: 'none', pad: true,  w: { pad: 'triangle', bass: 'sine',     lead: 'triangle' } },
    'mem-drift':      { s: 'lydian',    r: 57, t: 72,  p: [0, 4, 1, 4], lead: 'arp',   bass: 'root',  perc: 'none', pad: true,  w: { pad: 'sine',     bass: 'sine',     lead: 'sine' } },
    'mem-music-box':  { s: 'major',     r: 64, t: 88,  p: [0, 5, 3, 4], lead: 'bell',  bass: 'none',  perc: 'none', pad: true,  w: { pad: 'sine',     bass: 'sine',     lead: 'triangle' } }
  };

  // category → fitting moods (a game's slug picks one deterministically)
  var CATS = {
    math:      ['math-sunrise', 'math-skip', 'math-puzzlebox', 'math-march', 'math-daydream'],
    history:   ['hist-stately', 'hist-ancient', 'hist-mystery', 'hist-chronicle'],
    logic:     ['logic-clockwork', 'logic-riddle', 'logic-cipher', 'logic-focus'],
    money:     ['money-market', 'money-jaunty', 'money-swing', 'money-thrift'],
    coding:    ['code-chiptune', 'code-robot', 'code-loop', 'code-neon', 'code-binary'],
    language:  ['lang-folk', 'lang-playful', 'lang-cozy', 'lang-parade'],
    geography: ['geo-voyage', 'geo-breeze', 'geo-safari', 'geo-summit', 'geo-tide'],
    science:   ['sci-cosmos', 'sci-bubbles', 'sci-lab', 'sci-aurora', 'sci-spark'],
    memory:    ['mem-lullaby', 'mem-twinkle', 'mem-drift', 'mem-music-box']
  };

  // ---- seeded PRNG (mulberry32) + string hash -------------------------------
  function hash(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- resolve which mood this game gets ------------------------------------
  var script = document.currentScript || (function () {
    var s = document.getElementsByTagName('script'); return s[s.length - 1];
  })();
  var ds = (script && script.dataset) || {};
  var cat = ds.cat || window.BGM_CAT || 'math';
  var seedStr = ds.seed || window.BGM_SEED || location.pathname || 'onlygrins';
  var seed = hash(seedStr);

  var moodName = ds.mood || window.BGM_MOOD;
  if (!moodName || !MOODS[moodName]) {
    var list = CATS[cat] || CATS.math;
    moodName = list[seed % list.length];
  }
  var M = MOODS[moodName];
  var scale = SCALES[M.s];

  // ---- audio graph ----------------------------------------------------------
  var ac = null, master = null, running = false, muted = false;
  var timer = null, step = 0, nextTime = 0;
  var LOOKAHEAD = 0.12, TICK = 30;
  var rnd = mulberry32(seed);

  var STEPS_PER_CHORD = 4;          // 2 beats per chord (steps are 8th notes)
  var LEAD_POOL = [0, 2, 4, 6, 7, 9];
  var leadPattern = buildLeadPattern();

  function buildLeadPattern() {
    var out = [];
    var density = M.lead === 'arp' ? 1 : M.lead === 'pluck' ? 0.5 : M.lead === 'bell' ? 0.3 : 0;
    for (var i = 0; i < 16; i++) {
      if (M.lead === 'arp') out.push(LEAD_POOL[i % 4]);          // steady ascending arpeggio
      else out.push(rnd() < density ? LEAD_POOL[(rnd() * LEAD_POOL.length) | 0] : -1);
    }
    return out;
  }

  function degMidi(deg) {
    var len = scale.length;
    var oct = Math.floor(deg / len);
    return M.r + 12 * oct + scale[((deg % len) + len) % len];
  }
  function freq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  function ensureContext() {
    if (ac) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.0;
    var lp = ac.createBiquadFilter();       // gentle warmth, tames square/saw fizz
    lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.3;
    var comp = ac.createDynamicsCompressor(); // glue + safety against clipping
    comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25;
    master.connect(lp); lp.connect(comp); comp.connect(ac.destination);
  }

  // soft noise buffer for hats/ticks
  var noiseBuf = null;
  function noise() {
    if (noiseBuf) return noiseBuf;
    var n = ac.sampleRate * 0.2, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = b; return b;
  }

  function voice(f, t, dur, type, peak, attack) {
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    var a = attack || 0.01;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function hat(t, peak, dur) {
    var s = ac.createBufferSource(); s.buffer = noise();
    var hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
    var g = ac.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.05));
    s.connect(hp); hp.connect(g); g.connect(master);
    s.start(t); s.stop(t + 0.08);
  }

  function scheduleStep(s, t) {
    var spb = 60 / M.t, stepDur = spb / 2;
    var chordPos = Math.floor(s / STEPS_PER_CHORD);
    var pr = M.p[chordPos % M.p.length];      // chord root degree
    var isChordStart = (s % STEPS_PER_CHORD) === 0;
    var onBeat = (s % 2) === 0;

    // pad + bass on each chord change
    if (isChordStart && M.pad) {
      var chordDur = STEPS_PER_CHORD * stepDur;
      [pr, pr + 2, pr + 4].forEach(function (d) {
        voice(freq(degMidi(d)), t, chordDur * 0.98, M.w.pad, 0.05, chordDur * 0.35);
      });
    }
    if (isChordStart && M.bass !== 'none') {
      voice(freq(degMidi(pr) - 24), t, spb * 1.6, M.w.bass, 0.10, 0.02);
      if (M.bass === 'root5') voice(freq(degMidi(pr + 4) - 24), t + spb, spb * 0.7, M.w.bass, 0.08, 0.02);
    }
    if (M.bass === 'walk' && onBeat && !isChordStart) {
      var wd = [pr + 2, pr + 4, pr + 1][(chordPos + s) % 3];
      voice(freq(degMidi(wd) - 24), t, spb * 0.5, M.w.bass, 0.07, 0.02);
    }

    // lead
    if (M.lead !== 'none') {
      var v = leadPattern[s % 16];
      if (v >= 0) {
        var oct = M.lead === 'bell' ? 12 : 0;
        var ldur = M.lead === 'bell' ? stepDur * 3.2 : M.lead === 'arp' ? stepDur * 0.9 : stepDur * 1.6;
        var pk = M.lead === 'bell' ? 0.055 : M.lead === 'arp' ? 0.04 : 0.05;
        voice(freq(degMidi(pr + v) + oct), t, ldur, M.w.lead, pk, 0.008);
      }
    }

    // percussion
    if (M.perc === 'soft') {
      if (s % STEPS_PER_CHORD === 0 || s % STEPS_PER_CHORD === 2) voice(70, t, 0.14, 'sine', 0.11, 0.005); // kick
      if (!onBeat) hat(t, 0.02, 0.04);
    } else if (M.perc === 'tick') {
      if (onBeat) hat(t, 0.018, 0.03);
    }
  }

  function loop() {
    if (!running) return;
    while (nextTime < ac.currentTime + LOOKAHEAD) {
      scheduleStep(step, nextTime);
      nextTime += (60 / M.t) / 2;
      step++;
    }
  }

  function start() {
    if (running || muted) return;
    ensureContext();
    if (ac.state === 'suspended') ac.resume();
    running = true;
    step = 0; nextTime = ac.currentTime + 0.08;
    master.gain.cancelScheduledValues(ac.currentTime);
    master.gain.setValueAtTime(0.0001, ac.currentTime);
    master.gain.exponentialRampToValueAtTime(0.16, ac.currentTime + 1.2); // gentle fade-in
    timer = setInterval(loop, TICK);
  }

  function stop(fade) {
    if (!running) return;
    running = false;
    clearInterval(timer); timer = null;
    if (ac && master) {
      var now = ac.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + (fade || 0.4));
    }
  }

  // ---- mute toggle + persistence + autoplay unlock --------------------------
  var KEY = 'onlygrins-bgm-muted';
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) {}

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Toggle music');
  btn.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483647;' +
    'width:42px;height:42px;border-radius:50%;border:none;cursor:pointer;' +
    'font-size:20px;line-height:42px;text-align:center;padding:0;' +
    'background:rgba(0,0,0,.45);color:#fff;box-shadow:0 3px 10px rgba(0,0,0,.4);' +
    '-webkit-user-select:none;user-select:none;opacity:.75;transition:opacity .2s;';
  btn.onmouseenter = function () { btn.style.opacity = '1'; };
  btn.onmouseleave = function () { btn.style.opacity = '.75'; };
  function paint() { btn.textContent = muted ? '🔇' : '🔊'; btn.title = muted ? 'Music off' : 'Music on — ' + moodName; }
  paint();

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    muted = !muted;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (err) {}
    paint();
    if (muted) stop(0.3); else start();
  });

  function mount() {
    document.body.appendChild(btn);
    // start on the first user gesture anywhere (autoplay policy needs one)
    var kick = function () {
      document.removeEventListener('pointerdown', kick);
      document.removeEventListener('keydown', kick);
      if (!muted) start();
    };
    document.addEventListener('pointerdown', kick);
    document.addEventListener('keydown', kick);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  // pause when the tab is hidden; resume when it returns
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(0.2);
    else if (!muted) start();
  });

  // expose a tiny API in case a game wants manual control
  window.BGM = { start: start, stop: stop, mute: function (m) { muted = !!m; paint(); if (muted) stop(); }, mood: moodName };
})();
