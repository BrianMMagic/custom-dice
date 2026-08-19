/* ============================================================
   app.js — screens, editor and interactions
   ============================================================ */
(function (global) {
  'use strict';

  var M = global.DiceModel;
  var R = global.DiceRender;
  var el = R.el;
  var $ = function (id) { return document.getElementById(id); };

  var APP_VERSION = '1.5.0';

  var lastResults = [];
  var draft = null;          // die being edited in the sheet
  var editingExisting = false;
  var trayExpanded = true;   // collapse the tray once dice are on the stage
  var rollTimers = [];       // pending timeouts for the rolling animation
  var isRolling = false;

  /* ============================================================
     Navigation
     ============================================================ */
  var VIEWS = ['roll', 'dice', 'history'];

  function showView(name) {
    VIEWS.forEach(function (v) {
      $('view-' + v).hidden = v !== name;
    });
    document.querySelectorAll('.tab').forEach(function (tab) {
      var on = tab.dataset.view === name;
      tab.classList.toggle('is-active', on);
      if (on) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
    });
    if (name === 'history') renderHistory();
    if (name === 'dice') renderLibrary();
    window.scrollTo({ top: 0 });
  }

  /* ============================================================
     Toast
     ============================================================ */
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 1800);
  }

  function buzz(pattern) {
    if (!M.state().settings.haptics) return;
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
  }

  /* ============================================================
     Tray + rolling
     ============================================================ */
  function renderTray() {
    var s = M.state();
    var list = $('tray-list');
    var summary = $('tray-summary');
    var count = M.totalDiceInTray();
    var collapsed = count > 0 && !trayExpanded;

    $('tray-empty').hidden = count > 0;
    list.hidden = count === 0 || collapsed;
    summary.hidden = !collapsed;
    $('roll-dock').hidden = count === 0;
    list.innerHTML = '';

    if (collapsed) {
      renderTraySummary();
    } else {
      s.tray.forEach(function (entry) {
        var die = M.getDie(entry.dieId);
        if (!die) return;
        list.appendChild(R.trayItem(die, entry.count, {
          onCount: function (d, n) {
            M.setTrayCount(d.id, n);
            renderTray();
            buzz(8);
          }
        }));
      });
    }

    $('roll-count').textContent = count ? '· ' + count + (count === 1 ? ' die' : ' dice') : '';
    $('btn-roll').disabled = count === 0;
    $('shake-hint').hidden = !(s.settings.shake && count > 0);
    updateTabBadge(count);
    syncStageInsets();
  }

  /* One-line stand-in for the tray so the dice own the screen. */
  function renderTraySummary() {
    var faces = $('tray-summary-faces');
    var text = $('tray-summary-text');
    faces.innerHTML = '';

    var names = [];
    M.state().tray.slice(0, 4).forEach(function (entry) {
      var die = M.getDie(entry.dieId);
      if (!die) return;
      faces.appendChild(R.faceEl(die, R.showcaseFace(die)));
      names.push(die.name + (entry.count > 1 ? ' ×' + entry.count : ''));
    });
    if (M.state().tray.length > 4) names.push('+' + (M.state().tray.length - 4) + ' more');
    text.textContent = names.join(', ');
  }

  /* The dock and tab bar are fixed, so measure them and keep the stage clear
     of both — otherwise the dice centre themselves underneath the buttons. */
  function syncStageInsets() {
    var dock = $('roll-dock');
    var tabbar = document.querySelector('.tabbar');
    var space = (dock.hidden ? 0 : dock.offsetHeight) + tabbar.offsetHeight + 10;
    document.documentElement.style.setProperty('--dock-space', space + 'px');
  }

  function updateTabBadge(count) {
    var tab = document.querySelector('.tab[data-view="roll"] span');
    tab.textContent = count ? 'Roll (' + count + ')' : 'Roll';
  }

  function doRoll() {
    if (M.totalDiceInTray() === 0) { showView('dice'); return; }
    clearRollTimers();
    lastResults = M.rollTray();
    trayExpanded = false;          // give the stage the room
    renderTray();
    animateRoll();
  }

  function clearRollTimers() {
    rollTimers.forEach(clearTimeout);
    rollTimers = [];
    isRolling = false;
  }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* Tiles tumble through random faces, then land one by one. */
  function animateRoll() {
    var tiles = renderResults('rolling');
    if (!tiles.length) return;

    if (reducedMotion()) {
      tiles.forEach(function (t, i) { t.settle(lastResults[i]); });
      showTotal();
      buzz([12, 40, 22]);
      return;
    }

    isRolling = true;
    $('total-pill').hidden = true;
    $('btn-roll').disabled = true;
    buzz(14);

    var spin = setInterval(function () {
      tiles.forEach(function (t) { if (!t.landed) t.showRandomFace(); });
    }, 70);
    rollTimers.push(spin);

    tiles.forEach(function (tile, i) {
      var delay = 520 + Math.min(i, 8) * 90;
      rollTimers.push(setTimeout(function () {
        tile.settle(lastResults[i]);
        buzz(10);
      }, delay));
    });

    var last = 520 + Math.min(tiles.length - 1, 8) * 90;
    rollTimers.push(setTimeout(function () {
      clearInterval(spin);
      isRolling = false;
      $('btn-roll').disabled = M.totalDiceInTray() === 0;
      showTotal();
      buzz([0, 26]);
    }, last + 60));
  }

  function showTotal() {
    var total = M.totalOf(lastResults);
    var pill = $('total-pill');
    if (total !== null && M.state().settings.total) {
      pill.innerHTML = '';
      pill.appendChild(document.createTextNode('Total '));
      pill.appendChild(el('b', null, String(total)));
      pill.hidden = false;
    } else {
      pill.hidden = true;
    }
    syncStageInsets();
  }

  /* Dice grow when there are only a few of them. */
  function tileSize(count) {
    if (count <= 1) return 'min(64vw, 250px)';
    if (count === 2) return 'min(43vw, 175px)';
    if (count <= 4) return 'min(38vw, 145px)';
    if (count <= 6) return 'min(29vw, 120px)';
    if (count <= 9) return 'min(25vw, 102px)';
    if (count <= 16) return 'min(21vw, 88px)';
    return 'min(18vw, 74px)';
  }

  /* True when a die landed on its own highest number — a "max roll". */
  var topFaceCache = {};
  function isTopFace(result) {
    var die = M.getDie(result.dieId);
    if (!die || die.faces.length < 2) return false;
    if (!(die.id in topFaceCache)) {
      var best = null;
      die.faces.forEach(function (f) {
        var n = M.faceNumber(f);
        if (n !== null && (best === null || n > best)) best = n;
      });
      topFaceCache[die.id] = best;
    }
    var top = topFaceCache[die.id];
    return top !== null && M.faceNumber(result.face) === top;
  }

  /* Tap a landed die to reroll just that one. */
  function rerollOne(index) {
    if (isRolling) return;
    var prev = lastResults[index];
    var die = M.getDie(prev.dieId);
    if (!die) return;

    var result = M.rollDie(die);
    lastResults[index] = result;
    var s = M.state();
    if (s.history.length) {
      s.history[0].results = lastResults.slice();
      s.history[0].total = M.totalOf(lastResults);
      M.save();
    }

    var slot = $('results').children[index];
    var tile = slot && slot.querySelector('.result');
    if (!tile) { renderResults('settled'); showTotal(); return; }
    var handle = makeTileHandle(tile, result, index);

    if (reducedMotion()) {
      handle.settle(result);
      showTotal();
      buzz([10, 30]);
      return;
    }

    $('total-pill').hidden = true;
    tile.classList.add('is-rolling');
    buzz(10);
    var spin = setInterval(function () { handle.showRandomFace(); }, 70);
    rollTimers.push(spin);
    rollTimers.push(setTimeout(function () {
      clearInterval(spin);
      handle.settle(result);
      showTotal();
      buzz([0, 22]);
    }, 420));
  }

  /* mode 'rolling' builds tiles mid-tumble; 'settled' shows final faces.
     Returns tile handles the animation drives. */
  function renderResults(mode) {
    var box = $('results');
    topFaceCache = {};
    box.innerHTML = '';
    if (!lastResults.length) { $('total-pill').hidden = true; return []; }

    box.style.setProperty('--tile', tileSize(lastResults.length));

    var showNames = !!M.state().settings.labels;

    return lastResults.map(function (r, i) {
      var slot = R.resultTile(r, i, false, rerollOne, mode === 'settled', showNames);
      box.appendChild(slot);
      var tile = slot.querySelector('.result');
      var handle = makeTileHandle(tile, r, i);
      if (mode === 'rolling') {
        tile.classList.add('is-rolling');
      } else {
        handle.settle(r);
      }
      return handle;
    });
  }

  /* Lets the animation swap faces on a tile without rebuilding the stage. */
  function makeTileHandle(tile, result, index) {
    var die = M.getDie(result.dieId);
    var handle = {
      landed: false,
      showRandomFace: function () {
        if (!die || die.faces.length < 2) return;
        setTileFace(tile, die, die.faces[M.randomInt(die.faces.length)]);
      },
      settle: function (final) {
        handle.landed = true;
        tile.classList.remove('is-rolling');
        setTileFace(tile, final, final.face);
        tile.classList.toggle('is-max', M.state().settings.highlight && isTopFace(final));
        tile.setAttribute('aria-label', final.name + ' rolled ' + final.face + '. Tap to reroll.');
        if (!reducedMotion()) {
          tile.classList.remove('is-landing');
          void tile.offsetWidth;              // restart the landing bounce
          tile.classList.add('is-landing');
        }
      },
      index: index
    };
    return handle;
  }

  function setTileFace(tile, die, face) {
    var old = tile.querySelector('.die-face');
    var fresh = R.faceEl(die, face);
    if (old) old.replaceWith(fresh); else tile.insertBefore(fresh, tile.firstChild);
  }

  /* ============================================================
     Library
     ============================================================ */
  function renderLibrary() {
    var grid = $('dice-grid');
    grid.innerHTML = '';
    var dice = M.state().dice;
    if (!dice.length) {
      grid.appendChild(el('p', 'empty-note', 'No dice yet. Tap “New die” to make your first one.'));
      return;
    }
    dice.forEach(function (die) {
      grid.appendChild(R.dieCard(die, M.trayCount(die.id), {
        onAdd: function (d) {
          trayExpanded = true;
          M.setTrayCount(d.id, M.trayCount(d.id) + 1);
          renderLibrary();
          renderTray();
          buzz(10);
          toast(d.name + ' added to tray');
        },
        onEdit: function (d) { openEditor(d); }
      }));
    });
  }

  /* ============================================================
     History
     ============================================================ */
  function renderHistory() {
    var box = $('history-list');
    box.innerHTML = '';
    var h = M.state().history;
    if (!h.length) {
      box.appendChild(el('p', 'empty-note', 'No rolls yet. Your results will show up here.'));
      return;
    }
    h.forEach(function (entry) { box.appendChild(R.historyItem(entry)); });
  }

  /* ============================================================
     Editor
     ============================================================ */
  function openEditor(die) {
    editingExisting = !!die;
    draft = die
      ? M.makeDie(JSON.parse(JSON.stringify(die)))
      : M.makeDie({ name: '', color: M.COLORS[M.randomInt(M.COLORS.length)], faceType: 'number', faces: M.numberRange(1, 6) });

    draft.rangeFrom = 1;
    draft.rangeTo = draft.faces.length || 6;

    $('editor-title').textContent = editingExisting ? 'Edit die' : 'New die';
    $('editor-name').value = draft.name;
    $('editor-name').placeholder = editingExisting ? 'Die name' : 'e.g. Chore picker';
    $('btn-delete-die').hidden = !editingExisting;

    renderColors();
    renderSize();
    renderTypeSelector();
    renderBuilders();
    renderFacesEditor();
    $('editor').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeEditor() {
    $('editor').hidden = true;
    document.body.style.overflow = '';
    draft = null;
    if (pendingWorker) applyUpdate(pendingWorker);
  }

  function renderColors() {
    var box = $('editor-colors');
    box.innerHTML = '';
    M.COLORS.forEach(function (c) {
      var sw = el('button', 'swatch');
      sw.type = 'button';
      sw.style.background = c;
      sw.setAttribute('role', 'radio');
      sw.setAttribute('aria-label', 'Colour ' + c);
      sw.setAttribute('aria-checked', String(c === draft.color));
      sw.addEventListener('click', function () {
        draft.color = c;
        renderColors();
        renderPreview();
        renderFacesEditor();
      });
      box.appendChild(sw);
    });
    box.appendChild(customSwatch());
  }

  /* Opens the device's native colour picker for anything off-palette. */
  function customSwatch() {
    var wrap = el('label', 'swatch swatch-custom');
    var isCustom = M.COLORS.indexOf(draft.color) < 0;
    wrap.setAttribute('aria-checked', String(isCustom));
    wrap.title = 'Pick any colour';

    var input = el('input');
    input.type = 'color';
    input.value = draft.color;
    input.setAttribute('aria-label', 'Custom colour');
    // Live-preview while dragging; commit the full re-render when released.
    input.addEventListener('input', function () {
      draft.color = M.normalizeColor(input.value);
      renderPreview();
    });
    input.addEventListener('change', function () {
      draft.color = M.normalizeColor(input.value);
      renderColors();
      renderFacesEditor();
    });
    wrap.appendChild(input);
    wrap.appendChild(el('span', 'pen', '🎨'));
    return wrap;
  }

  /* --- face size --- */
  function renderSize() {
    var slider = $('editor-size');
    slider.min = M.SCALE_MIN;
    slider.max = M.SCALE_MAX;
    slider.value = draft.scale;
    $('size-val').textContent = Math.round(draft.scale * 100) + '%';
  }

  function renderTypeSelector() {
    document.querySelectorAll('#editor-type button').forEach(function (b) {
      b.type = 'button';
      b.setAttribute('aria-checked', String(b.dataset.type === draft.faceType));
    });
  }

  /* Convert existing faces so they suit the newly chosen type. */
  function changeType(type) {
    var count = Math.max(2, draft.faces.length);
    draft.faceType = type;

    if (type === 'number' && !draft.faces.every(isNumeric)) {
      draft.faces = M.numberRange(1, count);
    } else if (type === 'pips') {
      var pipCount = Math.min(9, count);
      if (!draft.faces.every(isPip)) draft.faces = M.numberRange(1, pipCount);
    } else if (type === 'letter' && !draft.faces.every(isLetter)) {
      draft.faces = M.letterRange(Math.min(26, count), 0);
    } else if (type === 'emoji' && !draft.faces.every(isEmoji)) {
      draft.faces = [];
    }
    draft.rangeFrom = 1;
    draft.rangeTo = draft.faces.length || 6;

    renderTypeSelector();
    renderBuilders();
    renderFacesEditor();
  }

  function isNumeric(f) { return M.faceNumber(f) !== null; }
  function isPip(f) { var n = M.faceNumber(f); return n !== null && n >= 1 && n <= 9 && n % 1 === 0; }
  function isLetter(f) { return /^[A-Za-z]$/.test(String(f).trim()); }
  function isEmoji(f) { return /\p{Extended_Pictographic}/u.test(String(f)); }

  function renderBuilders() {
    var t = draft.faceType;
    var useRange = (t === 'number' || t === 'pips' || t === 'letter');
    $('builder-range').hidden = !useRange;
    $('builder-add').hidden = (t !== 'word');
    $('builder-emoji').hidden = (t !== 'emoji');

    if (useRange) renderRangeBuilder();
    if (t === 'word') renderWordBuilder();
    if (t === 'emoji') renderEmojiBuilder();
  }

  function rangeLimits() {
    if (draft.faceType === 'pips') return { min: 1, max: 9 };
    if (draft.faceType === 'letter') return { min: 1, max: 26 };
    return { min: -99, max: 999 };
  }

  function rangeDisplay(v) {
    return draft.faceType === 'letter' ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.max(0, Math.min(25, v - 1))] : String(v);
  }

  function applyRange() {
    var from = draft.rangeFrom, to = draft.rangeTo;
    if (draft.faceType === 'letter') {
      var count = Math.abs(to - from) + 1;
      draft.faces = M.letterRange(count, Math.min(from, to) - 1);
    } else {
      draft.faces = M.numberRange(from, to);
    }
    renderFacesEditor();
  }

  function renderRangeBuilder() {
    $('range-from').textContent = rangeDisplay(draft.rangeFrom);
    $('range-to').textContent = rangeDisplay(draft.rangeTo);

    var presets = $('range-presets');
    presets.innerHTML = '';
    var options;
    if (draft.faceType === 'pips') {
      options = [{ label: '1–6 spots', from: 1, to: 6 }, { label: '1–9 spots', from: 1, to: 9 }];
    } else if (draft.faceType === 'letter') {
      options = [{ label: 'A–F', from: 1, to: 6 }, { label: 'A–M', from: 1, to: 13 }, { label: 'A–Z', from: 1, to: 26 }];
    } else {
      options = M.RANGE_PRESETS.map(function (n) { return { label: 'd' + n, from: 1, to: n }; });
    }
    options.forEach(function (o) {
      var chip = el('button', 'chip', o.label);
      chip.type = 'button';
      chip.addEventListener('click', function () {
        draft.rangeFrom = o.from; draft.rangeTo = o.to;
        renderRangeBuilder();
        applyRange();
      });
      presets.appendChild(chip);
    });
  }

  function renderWordBuilder() {
    $('builder-add-label').textContent = 'Add a word';
    $('add-face-input').placeholder = 'Type a word…';
    var box = $('word-presets');
    box.innerHTML = '';
    M.WORD_PRESETS.forEach(function (p) {
      var chip = el('button', 'chip', p.label);
      chip.type = 'button';
      chip.addEventListener('click', function () {
        draft.faces = p.words.slice();
        renderFacesEditor();
        toast('Filled with ' + p.label);
      });
      box.appendChild(chip);
    });
  }

  function renderEmojiBuilder() {
    var grid = $('emoji-grid');
    if (grid.childElementCount) return;   // build once
    M.EMOJI.forEach(function (e) {
      var b = el('button', null, e);
      b.type = 'button';
      b.setAttribute('aria-label', 'Add ' + e);
      b.addEventListener('click', function () {
        draft.faces.push(e);
        renderFacesEditor();
        buzz(6);
      });
      grid.appendChild(b);
    });
  }

  function renderPreview() {
    var box = $('editor-preview');
    box.innerHTML = '';
    var face = draft.faces.length ? draft.faces[0] : '?';
    var preview = R.faceEl(draft, face);
    preview.classList.add('die-preview');
    box.replaceWith(preview);
    preview.id = 'editor-preview';
    $('editor-facecount').textContent = draft.faces.length + ' ' +
      (draft.faces.length === 1 ? 'face' : 'faces') + ' · ' + R.TYPE_LABEL[draft.faceType];
  }

  function renderFacesEditor() {
    var box = $('faces-editor');
    box.innerHTML = '';
    draft.faces.forEach(function (face, i) {
      var row = el('div', 'face-row');
      row.appendChild(el('span', 'face-num', String(i + 1)));

      var mini = R.faceEl(draft, face || '?');
      mini.classList.add('die-chip', 'face-mini');
      mini.style.width = '34px'; mini.style.height = '34px'; mini.style.fontSize = '14px';
      row.appendChild(mini);

      var input = el('input');
      input.type = 'text';
      input.value = face;
      input.maxLength = 18;
      input.setAttribute('aria-label', 'Face ' + (i + 1));
      input.addEventListener('input', function () {
        draft.faces[i] = input.value;
        var fresh = R.faceEl(draft, input.value || '?');
        fresh.classList.add('die-chip', 'face-mini');
        fresh.style.width = '34px'; fresh.style.height = '34px'; fresh.style.fontSize = '14px';
        mini.replaceWith(fresh);
        mini = fresh;
        if (i === 0) renderPreview();
      });
      row.appendChild(input);

      var del = el('button', 'face-del', '✕');
      del.type = 'button';
      del.setAttribute('aria-label', 'Remove face ' + (i + 1));
      del.addEventListener('click', function () {
        draft.faces.splice(i, 1);
        renderFacesEditor();
        buzz(8);
      });
      row.appendChild(del);
      box.appendChild(row);
    });
    renderPreview();
  }

  function saveDraft() {
    draft.faces = draft.faces
      .map(function (f) { return String(f).trim(); })
      .filter(function (f) { return f.length > 0; });

    if (draft.faces.length < 2) {
      toast('A die needs at least 2 faces');
      return;
    }
    draft.name = ($('editor-name').value || '').trim() ||
      (draft.faceType === 'pips' || draft.faceType === 'number'
        ? 'D' + draft.faces.length
        : R.TYPE_LABEL[draft.faceType].replace(/^./, function (c) { return c.toUpperCase(); }) + ' die');

    var die = M.makeDie({
      id: editingExisting ? draft.id : undefined,
      name: draft.name,
      color: draft.color,
      scale: draft.scale,
      faceType: draft.faceType,
      faces: draft.faces,
      createdAt: draft.createdAt
    });
    M.upsertDie(die);
    closeEditor();
    renderLibrary();
    renderTray();
    toast(editingExisting ? 'Die saved' : '“' + die.name + '” created');
    if (!editingExisting) showView('dice');
  }

  /* ============================================================
     Settings
     ============================================================ */
  function openSettings() {
    var s = M.state().settings;
    $('opt-shake').checked = !!s.shake;
    $('opt-haptics').checked = !!s.haptics;
    $('opt-total').checked = !!s.total;
    $('opt-highlight').checked = !!s.highlight;
    $('opt-labels').checked = !!s.labels;
    $('settings').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeSettings() {
    $('settings').hidden = true;
    document.body.style.overflow = '';
  }

  /* ============================================================
     Shake to roll
     ============================================================ */
  var shakeBound = false, lastShake = 0, lastMag = 0;

  function onMotion(e) {
    var a = e.accelerationIncludingGravity || e.acceleration;
    if (!a) return;
    var mag = Math.sqrt((a.x || 0) * (a.x || 0) + (a.y || 0) * (a.y || 0) + (a.z || 0) * (a.z || 0));
    var delta = Math.abs(mag - lastMag);
    lastMag = mag;
    var now = Date.now();
    if (delta > 14 && now - lastShake > 900) {
      lastShake = now;
      if (!$('view-roll').hidden && $('editor').hidden && $('settings').hidden) doRoll();
    }
  }

  function enableShake() {
    var DME = global.DeviceMotionEvent;
    if (!DME) { toast('This device has no motion sensor'); return Promise.resolve(false); }
    var ask = (typeof DME.requestPermission === 'function')
      ? DME.requestPermission()
      : Promise.resolve('granted');
    return ask.then(function (res) {
      if (res !== 'granted') { toast('Motion access was blocked'); return false; }
      if (!shakeBound) { window.addEventListener('devicemotion', onMotion); shakeBound = true; }
      return true;
    }).catch(function () { toast('Motion access was blocked'); return false; });
  }

  function disableShake() {
    if (shakeBound) { window.removeEventListener('devicemotion', onMotion); shakeBound = false; }
  }

  /* ============================================================
     Wiring
     ============================================================ */
  function bind() {
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () { showView(tab.dataset.view); });
    });
    document.querySelectorAll('[data-goto]').forEach(function (b) {
      b.addEventListener('click', function () { showView(b.dataset.goto); });
    });

    $('btn-roll').addEventListener('click', doRoll);
    $('tray-summary').addEventListener('click', function () {
      trayExpanded = true;
      renderTray();
    });
    $('btn-clear-tray').addEventListener('click', function () {
      clearRollTimers();
      M.clearTray();
      lastResults = [];
      trayExpanded = true;
      renderTray();
      renderResults('settled');
      renderLibrary();
    });

    $('btn-new-die').addEventListener('click', function () { openEditor(null); });

    /* editor */
    $('editor-cancel').addEventListener('click', closeEditor);
    $('editor-save').addEventListener('click', saveDraft);
    $('editor-name').addEventListener('input', function () { draft.name = this.value; });
    document.querySelectorAll('#editor-type button').forEach(function (b) {
      b.addEventListener('click', function () { changeType(b.dataset.type); });
    });
    $('editor-size').addEventListener('input', function () {
      draft.scale = M.clampScale(this.value);
      $('size-val').textContent = Math.round(draft.scale * 100) + '%';
      renderPreview();
    });
    $('editor-size').addEventListener('change', function () {
      renderFacesEditor();
      buzz(6);
    });

    $('btn-add-blank-face').addEventListener('click', function () {
      draft.faces.push('');
      renderFacesEditor();
      var inputs = $('faces-editor').querySelectorAll('input');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    $('btn-shuffle-faces').addEventListener('click', function () {
      draft.faces = M.shuffle(draft.faces);
      renderFacesEditor();
      buzz(8);
    });
    $('btn-delete-die').addEventListener('click', function () {
      if (!confirm('Delete “' + draft.name + '”? This cannot be undone.')) return;
      M.deleteDie(draft.id);
      closeEditor();
      renderLibrary();
      renderTray();
      toast('Die deleted');
    });

    document.querySelectorAll('#builder-range .step-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var which = btn.parentElement.dataset.for;
        var lim = rangeLimits();
        var step = parseInt(btn.dataset.step, 10);
        var key = which === 'from' ? 'rangeFrom' : 'rangeTo';
        draft[key] = Math.max(lim.min, Math.min(lim.max, draft[key] + step));
        if (Math.abs(draft.rangeTo - draft.rangeFrom) + 1 > 100) draft[key] -= step;
        renderRangeBuilder();
        applyRange();
      });
    });

    $('add-face-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('add-face-input');
      var val = input.value.trim();
      if (!val) return;
      draft.faces.push(val);
      input.value = '';
      renderFacesEditor();
      buzz(6);
    });

    /* settings */
    $('btn-settings').addEventListener('click', openSettings);
    $('settings-close').addEventListener('click', closeSettings);
    $('opt-shake').addEventListener('change', function () {
      var on = this.checked;
      var s = M.state().settings;
      if (on) {
        var self = this;
        enableShake().then(function (ok) {
          s.shake = ok;
          self.checked = ok;
          M.save();
          renderTray();
        });
      } else {
        s.shake = false;
        disableShake();
        M.save();
        renderTray();
      }
    });
    $('opt-haptics').addEventListener('change', function () {
      M.state().settings.haptics = this.checked; M.save(); buzz(12);
    });
    $('opt-total').addEventListener('change', function () {
      M.state().settings.total = this.checked; M.save(); showTotal();
    });
    $('opt-labels').addEventListener('change', function () {
      M.state().settings.labels = this.checked;
      M.save();
      if (lastResults.length) { renderResults('settled'); showTotal(); }
    });
    $('opt-highlight').addEventListener('change', function () {
      M.state().settings.highlight = this.checked;
      M.save();
      if (lastResults.length) { renderResults('settled'); showTotal(); }
    });
    $('btn-check-update').addEventListener('click', function () {
      if (!swReg) { toast('Updates need the app opened over the web'); return; }
      checkForUpdate(true);
      toast('Checking for updates…');
    });
    $('btn-clear-history').addEventListener('click', function () {
      M.state().history = [];
      M.save();
      renderHistory();
      toast('History cleared');
    });
    $('btn-reset').addEventListener('click', function () {
      if (!confirm('Reset the app? Your custom dice will be removed and the starter dice restored.')) return;
      var s = M.state();
      s.dice = M.starterDice();
      s.tray = [];
      s.history = [];
      M.save();
      lastResults = [];
      trayExpanded = true;
      closeSettings();
      renderTray();
      renderResults('settled');
      renderLibrary();
      renderHistory();
      showView('dice');
      toast('Starter dice restored');
    });

    /* tap the dimmed backdrop to dismiss a sheet */
    ['editor', 'settings'].forEach(function (id) {
      $(id).addEventListener('click', function (e) {
        if (e.target === this) { id === 'editor' ? closeEditor() : closeSettings(); }
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('editor').hidden) closeEditor();
        else if (!$('settings').hidden) closeSettings();
      }
      if (e.code === 'Space' && !$('view-roll').hidden && $('editor').hidden && $('settings').hidden &&
          document.activeElement === document.body) {
        e.preventDefault();
        doRoll();
      }
    });
  }

  /* ============================================================
     Boot
     ============================================================ */
  /* ============================================================
     Updates — an installed copy should refresh itself
     ============================================================ */
  var swReg = null, pendingWorker = null, reloading = false, lastCheck = 0;

  function setupServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol.indexOf('http') !== 0) return;

    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then(function (reg) {
        swReg = reg;
        if (reg.waiting && navigator.serviceWorker.controller) applyUpdate(reg.waiting);
        reg.addEventListener('updatefound', function () {
          var incoming = reg.installing;
          if (!incoming) return;
          incoming.addEventListener('statechange', function () {
            // A controller already exists, so this really is an update.
            if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
              applyUpdate(incoming);
            }
          });
        });
      })
      .catch(function () { /* offline cache is optional */ });

    // On a first visit the worker claims this page; that is not an update,
    // so only reload when we are swapping one controller for another.
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading || !hadController) { hadController = true; return; }
      reloading = true;
      location.reload();
    });

    // Look for a new build whenever the app comes back to the foreground.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) checkForUpdate();
    });
    window.addEventListener('focus', checkForUpdate);
  }

  function applyUpdate(worker) {
    // Never reload out from under someone editing a die.
    if (!$('editor').hidden) { pendingWorker = worker; return; }
    pendingWorker = null;
    toast('Updating to the latest version…');
    worker.postMessage({ type: 'SKIP_WAITING' });
  }

  function checkForUpdate(force) {
    if (!swReg) return;
    var now = Date.now();
    if (!force && now - lastCheck < 30000) return;
    lastCheck = now;
    swReg.update().catch(function () {});
  }

  /* iOS still zooms on a quick double tap even with touch-action set, so
     swallow the second tap and fire the click ourselves instead. */
  function blockDoubleTapZoom() {
    var lastTap = 0;
    document.addEventListener('touchend', function (e) {
      var target = e.target;
      // leave text fields, sliders and the colour picker to the browser
      if (target.closest && target.closest('input, textarea, select, .slider, .swatch-custom')) {
        lastTap = 0;
        return;
      }
      var now = Date.now();
      if (now - lastTap <= 350) {
        e.preventDefault();
        var btn = target.closest && target.closest('button');
        if (btn) btn.click();      // keep rapid repeat taps working
      }
      lastTap = now;
    }, { passive: false });

    // iOS pinch/zoom gestures inside the app shell
    document.addEventListener('gesturestart', function (e) {
      if (e.target.closest && e.target.closest('.app')) e.preventDefault();
    });
  }

  function init() {
    M.load();
    bind();
    renderTray();
    renderLibrary();
    showView(M.totalDiceInTray() ? 'roll' : 'dice');
    if (M.state().settings.shake) enableShake();
    $('app-version').textContent = 'Dice Lab v' + APP_VERSION;
    blockDoubleTapZoom();
    syncStageInsets();
    window.addEventListener('resize', syncStageInsets);
    window.addEventListener('orientationchange', function () { setTimeout(syncStageInsets, 250); });
    setupServiceWorker();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
