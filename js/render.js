/* ============================================================
   render.js — turning dice data into DOM
   ============================================================ */
(function (global) {
  'use strict';

  var M = global.DiceModel;

  /* Dot positions on a 3x3 grid for each spot count. */
  var PIP_MAP = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
    7: [0, 2, 3, 4, 5, 6, 8],
    8: [0, 1, 2, 3, 5, 6, 7, 8],
    9: [0, 1, 2, 3, 4, 5, 6, 7, 8]
  };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  /* Dark text on pale faces so words stay readable. */
  function readableInk(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16) / 255,
        g = parseInt(h.slice(2, 4), 16) / 255,
        b = parseInt(h.slice(4, 6), 16) / 255;
    var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum > 0.62 ? '#1a1a24' : '#ffffff';
  }

  function graphemes(str) {
    return Array.from(String(str));
  }

  /* Shrink the label as it gets longer so it always fits the face. */
  function textScale(face) {
    var n = graphemes(face).length;
    if (n <= 1) return 1;
    if (n === 2) return 0.78;
    if (n === 3) return 0.6;
    if (n === 4) return 0.5;
    if (n <= 6) return 0.38;
    if (n <= 9) return 0.3;
    return 0.24;
  }

  /* Builds the coloured square that shows one face. */
  function faceEl(die, face, extraClass) {
    var node = el('div', 'die-face' + (extraClass ? ' ' + extraClass : ''));
    var ink = readableInk(die.color);
    node.style.background = 'linear-gradient(150deg,' + die.color + ',' +
      shade(die.color, -18) + ')';
    node.style.color = ink;

    var spots = die.faceType === 'pips' ? PIP_MAP[parseInt(face, 10)] : null;
    if (spots) {
      var grid = el('div', 'pips');
      for (var i = 0; i < 9; i++) {
        var dot = el('i', spots.indexOf(i) >= 0 ? '' : 'blank');
        dot.style.background = spots.indexOf(i) >= 0 ? ink : 'transparent';
        grid.appendChild(dot);
      }
      node.appendChild(grid);
    } else {
      var t = el('span', 'face-text', face);
      t.style.fontSize = textScale(face) + 'em';
      node.appendChild(t);
    }
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', die.name + ': ' + face);
    return node;
  }

  /* Darken/lighten a hex colour for the face gradient. */
  function shade(hex, amount) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var out = '#';
    for (var i = 0; i < 3; i++) {
      var v = parseInt(h.substr(i * 2, 2), 16) + Math.round(255 * (amount / 100));
      v = Math.max(0, Math.min(255, v));
      out += ('0' + v.toString(16)).slice(-2);
    }
    return out;
  }

  var TYPE_LABEL = {
    number: 'numbers', letter: 'letters', pips: 'spots', word: 'words', emoji: 'emoji'
  };

  function dieSummary(die) {
    return die.faces.length + ' faces · ' + TYPE_LABEL[die.faceType];
  }

  /* The face shown on cards and previews: the top number, else the first face. */
  function showcaseFace(die) {
    if (!die.faces.length) return '?';
    if (die.faceType === 'number' || die.faceType === 'pips') {
      var best = null;
      die.faces.forEach(function (f) {
        var n = M.faceNumber(f);
        if (n !== null && (best === null || n > best.n)) best = { n: n, f: f };
      });
      if (best) return best.f;
    }
    return die.faces[0];
  }

  /* ---------- library card ---------- */
  function dieCard(die, count, handlers) {
    var card = el('div', 'die-card' + (count ? ' in-tray' : ''));
    card.appendChild(faceEl(die, showcaseFace(die)));
    card.appendChild(el('div', 'die-card-name', die.name));
    card.appendChild(el('div', 'die-card-sub', dieSummary(die)));

    if (count) {
      var badge = el('span', 'badge', '×' + count);
      card.appendChild(badge);
    }

    var actions = el('div', 'die-card-actions');
    var add = el('button', 'act-add', count ? 'Add another' : 'Add');
    add.addEventListener('click', function (e) { e.stopPropagation(); handlers.onAdd(die); });
    var edit = el('button', 'act-edit', 'Edit');
    edit.addEventListener('click', function (e) { e.stopPropagation(); handlers.onEdit(die); });
    actions.appendChild(add);
    actions.appendChild(edit);
    card.appendChild(actions);

    card.addEventListener('click', function () { handlers.onAdd(die); });
    return card;
  }

  /* ---------- tray row ---------- */
  function trayItem(die, count, handlers) {
    var row = el('div', 'tray-item');
    row.appendChild(faceEl(die, showcaseFace(die), 'die-chip'));

    var meta = el('div', 'tray-item-meta');
    meta.appendChild(el('div', 'tray-item-name', die.name));
    meta.appendChild(el('div', 'tray-item-sub', dieSummary(die)));
    row.appendChild(meta);

    var qty = el('div', 'qty');
    var minus = el('button', null, '−');
    minus.setAttribute('aria-label', 'One fewer ' + die.name);
    minus.addEventListener('click', function () { handlers.onCount(die, count - 1); });
    var n = el('span', 'qty-n', String(count));
    var plus = el('button', null, '+');
    plus.setAttribute('aria-label', 'One more ' + die.name);
    plus.addEventListener('click', function () { handlers.onCount(die, count + 1); });
    qty.appendChild(minus); qty.appendChild(n); qty.appendChild(plus);
    row.appendChild(qty);
    return row;
  }

  /* ---------- result tile ---------- */
  function resultTile(result, index, isBest, onReroll, animate) {
    var wrap = el('button', 'result' + (isBest ? ' is-max' : '') + (animate ? ' anim' : ''));
    wrap.type = 'button';
    if (animate) wrap.style.animationDelay = Math.min(index * 45, 360) + 'ms';
    wrap.title = 'Tap to reroll this die';
    wrap.setAttribute('aria-label', result.name + ' rolled ' + result.face + '. Tap to reroll.');
    wrap.appendChild(faceEl(result, result.face));
    wrap.appendChild(el('div', 'result-name', result.name));
    if (onReroll) wrap.addEventListener('click', function () { onReroll(index); });
    return wrap;
  }

  /* ---------- history ---------- */
  function timeAgo(ts) {
    var s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' hr ago';
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function historyItem(entry) {
    var item = el('div', 'history-item');
    var top = el('div', 'history-top');
    top.appendChild(el('div', 'history-when', timeAgo(entry.at)));
    if (entry.total !== null && entry.total !== undefined) {
      top.appendChild(el('div', 'history-total', 'Total ' + entry.total));
    } else {
      top.appendChild(el('div', 'history-total', entry.results.length + ' dice'));
    }
    item.appendChild(top);

    var faces = el('div', 'history-faces');
    entry.results.forEach(function (r) { faces.appendChild(faceEl(r, r.face)); });
    item.appendChild(faces);
    return item;
  }

  global.DiceRender = {
    el: el,
    faceEl: faceEl,
    showcaseFace: showcaseFace,
    dieCard: dieCard,
    trayItem: trayItem,
    resultTile: resultTile,
    historyItem: historyItem,
    dieSummary: dieSummary,
    readableInk: readableInk,
    graphemes: graphemes,
    TYPE_LABEL: TYPE_LABEL
  };
})(window);
