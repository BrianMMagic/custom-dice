/* ============================================================
   model.js — data, storage and rolling
   ============================================================ */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'dicelab.v1';
  var HISTORY_MAX = 50;

  var COLORS = [
    '#7c5cff', '#ff6b9d', '#ff8b3d', '#ffc93c',
    '#3ddc97', '#2fb8ff', '#ff5c6c', '#a06bff',
    '#00c2a8', '#6b7a99'
  ];

  var FACE_TYPES = ['number', 'letter', 'pips', 'word', 'emoji'];

  var EMOJI = (
    '🎲🍀🔥💧⭐️🌙☀️⚡️🌈❄️🍎🍕🍔🍩🍪🍭🐶🐱🐵🦊🐼🐸🦄🐙' +
    '❤️💛💚💙💜🖤🤍🧡👍👎👏🙌🤝✌️🤞👀🧠💪🎉🎁🎈🏆🥇🎯' +
    '⚽️🏀🎸🎧🎬📚✏️🚀🚗✈️⛵️🏠🌳🌵🍄🎃👻🤖👽😀😂😍😎🤔' +
    '😴🤯😭😡🥳🤪😇🙃'
  ).match(/\p{Extended_Pictographic}(️)?/gu) || [];

  var WORD_PRESETS = [
    { label: 'Yes / No', words: ['Yes', 'No'] },
    { label: 'Yes / No / Maybe', words: ['Yes', 'No', 'Maybe'] },
    { label: 'Heads / Tails', words: ['Heads', 'Tails'] },
    { label: 'Chores', words: ['Dishes', 'Laundry', 'Vacuum', 'Trash', 'Tidy up', 'Free pass'] },
    { label: 'Actions', words: ['Attack', 'Defend', 'Dodge', 'Heal', 'Sneak', 'Talk'] },
    { label: 'Directions', words: ['North', 'South', 'East', 'West', 'Up', 'Down'] }
  ];

  var RANGE_PRESETS = [4, 6, 8, 10, 12, 20, 100];

  /* ---------- starter dice ---------- */
  function starterDice() {
    return [
      makeDie({ name: 'Classic D6', color: '#7c5cff', faceType: 'pips', faces: ['1', '2', '3', '4', '5', '6'] }),
      makeDie({ name: 'D20', color: '#2fb8ff', faceType: 'number', faces: numberRange(1, 20) }),
      makeDie({ name: 'Coin flip', color: '#ffc93c', faceType: 'word', faces: ['Heads', 'Tails'] }),
      makeDie({ name: 'Mood', color: '#ff6b9d', faceType: 'emoji', faces: ['😀', '😎', '🤔', '😴', '🥳', '😭'] }),
      makeDie({ name: 'Letters', color: '#3ddc97', faceType: 'letter', faces: ['A', 'B', 'C', 'D', 'E', 'F'] }),
      makeDie({ name: 'Decide it', color: '#ff8b3d', faceType: 'word', faces: ['Yes', 'No', 'Maybe', 'Ask again', 'Definitely', 'No way'] })
    ];
  }

  /* ---------- helpers ---------- */
  function uid() {
    return 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  }

  function numberRange(from, to) {
    var out = [], step = from <= to ? 1 : -1;
    for (var v = from; step > 0 ? v <= to : v >= to; v += step) out.push(String(v));
    return out;
  }

  function letterRange(count, startIndex) {
    var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', out = [];
    for (var i = 0; i < count; i++) out.push(A[(startIndex + i) % 26]);
    return out;
  }

  /* Face size multiplier: 0.5x to 1.8x of the auto-fitted size. */
  var SCALE_MIN = 0.5, SCALE_MAX = 1.8;

  function clampScale(v) {
    var n = parseFloat(v);
    if (!isFinite(n)) return 1;
    return Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.round(n * 20) / 20));
  }

  function normalizeColor(c) {
    var v = String(c || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(v)) {
      return ('#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toLowerCase();
    }
    return COLORS[0];
  }

  function makeDie(props) {
    return {
      id: props.id || uid(),
      name: props.name || 'New die',
      color: normalizeColor(props.color),
      scale: clampScale(props.scale === undefined ? 1 : props.scale),
      faceType: FACE_TYPES.indexOf(props.faceType) >= 0 ? props.faceType : 'number',
      faces: (props.faces && props.faces.length ? props.faces.slice() : ['1', '2', '3', '4', '5', '6']),
      createdAt: props.createdAt || Date.now()
    };
  }

  /* Cryptographically-seeded, unbiased pick. */
  function randomInt(max) {
    if (max <= 0) return 0;
    var crypto = global.crypto || global.msCrypto;
    if (crypto && crypto.getRandomValues) {
      var limit = Math.floor(0xffffffff / max) * max;
      var buf = new Uint32Array(1);
      do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
      return buf[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  function rollDie(die) {
    var i = randomInt(die.faces.length);
    return {
      dieId: die.id, name: die.name, color: die.color, scale: die.scale,
      faceType: die.faceType, face: die.faces[i], index: i
    };
  }

  function faceNumber(face) {
    var n = parseFloat(String(face).trim());
    return isFinite(n) && /^-?\d+(\.\d+)?$/.test(String(face).trim()) ? n : null;
  }

  /* Sum of every face that reads as a plain number; null when none do. */
  function totalOf(results) {
    var sum = 0, any = false;
    results.forEach(function (r) {
      var n = faceNumber(r.face);
      if (n !== null) { sum += n; any = true; }
    });
    return any ? sum : null;
  }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = randomInt(i + 1);
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- state ---------- */
  var defaults = {
    dice: [],
    tray: [],          // [{dieId, count}]
    history: [],       // [{at, results, total}]
    settings: { shake: false, haptics: true, total: true }
  };

  var state = null;

  function load() {
    var raw = null;
    try { raw = global.localStorage.getItem(STORAGE_KEY); } catch (e) { /* private mode */ }
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        state = {
          dice: (parsed.dice || []).map(makeDie),
          tray: (parsed.tray || []).filter(function (t) { return t && t.dieId; }),
          history: parsed.history || [],
          settings: Object.assign({}, defaults.settings, parsed.settings || {})
        };
      } catch (e) { state = null; }
    }
    if (!state) state = { dice: starterDice(), tray: [], history: [], settings: Object.assign({}, defaults.settings) };
    pruneTray();
    return state;
  }

  function save() {
    try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* quota / private mode */ }
  }

  function pruneTray() {
    state.tray = state.tray.filter(function (entry) { return !!getDie(entry.dieId); });
  }

  function getDie(id) {
    for (var i = 0; i < state.dice.length; i++) if (state.dice[i].id === id) return state.dice[i];
    return null;
  }

  function upsertDie(die) {
    var existing = getDie(die.id);
    if (existing) {
      Object.assign(existing, die);
    } else {
      state.dice.unshift(die);
    }
    save();
    return die;
  }

  function deleteDie(id) {
    state.dice = state.dice.filter(function (d) { return d.id !== id; });
    state.tray = state.tray.filter(function (t) { return t.dieId !== id; });
    save();
  }

  function trayCount(dieId) {
    for (var i = 0; i < state.tray.length; i++) if (state.tray[i].dieId === dieId) return state.tray[i].count;
    return 0;
  }

  function setTrayCount(dieId, count) {
    count = Math.max(0, Math.min(20, count));
    var entry = null;
    state.tray.forEach(function (t) { if (t.dieId === dieId) entry = t; });
    if (count === 0) {
      state.tray = state.tray.filter(function (t) { return t.dieId !== dieId; });
    } else if (entry) {
      entry.count = count;
    } else {
      state.tray.push({ dieId: dieId, count: count });
    }
    save();
  }

  function totalDiceInTray() {
    return state.tray.reduce(function (n, t) { return n + t.count; }, 0);
  }

  function clearTray() { state.tray = []; save(); }

  function rollTray() {
    var results = [];
    state.tray.forEach(function (entry) {
      var die = getDie(entry.dieId);
      if (!die) return;
      for (var i = 0; i < entry.count; i++) results.push(rollDie(die));
    });
    if (results.length) {
      state.history.unshift({ at: Date.now(), results: results, total: totalOf(results) });
      state.history = state.history.slice(0, HISTORY_MAX);
      save();
    }
    return results;
  }

  global.DiceModel = {
    COLORS: COLORS,
    SCALE_MIN: SCALE_MIN,
    SCALE_MAX: SCALE_MAX,
    clampScale: clampScale,
    normalizeColor: normalizeColor,
    FACE_TYPES: FACE_TYPES,
    EMOJI: EMOJI,
    WORD_PRESETS: WORD_PRESETS,
    RANGE_PRESETS: RANGE_PRESETS,
    state: function () { return state; },
    load: load,
    save: save,
    makeDie: makeDie,
    uid: uid,
    numberRange: numberRange,
    letterRange: letterRange,
    getDie: getDie,
    upsertDie: upsertDie,
    deleteDie: deleteDie,
    trayCount: trayCount,
    setTrayCount: setTrayCount,
    totalDiceInTray: totalDiceInTray,
    clearTray: clearTray,
    rollTray: rollTray,
    rollDie: rollDie,
    totalOf: totalOf,
    faceNumber: faceNumber,
    shuffle: shuffle,
    starterDice: starterDice,
    randomInt: randomInt
  };
})(window);
