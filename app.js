/* Tradebook – a simple trading journal. All data stays in your browser (localStorage). */
(function () {
  'use strict';

  var KEY = 'tradebook.trades.v1', SKEY = 'tradebook.settings.v1';
  var MARKETS = ['Forex', 'Indian Market', 'Crypto', 'Other'];
  var TFS = ['m1', 'm5', 'm15', 'm30', 'h1', 'h4', 'D'];
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('Could not save. Storage may be full or blocked.'); } }

  var trades = load(KEY, []);
  var settings = Object.assign({ currency: '₹' }, load(SKEY, {}));
  var ui = { view: 'dash', period: 'month', cal: new Date(), f: { market: '', dir: '', q: '' } };
  var UNLOCK_KEY = 'tradebook.unlocked';

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n, sign) {
    var loc = settings.currency === '₹' ? 'en-IN' : 'en-US';
    var s = Math.abs(n).toLocaleString(loc, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return (n < 0 ? '-' : (sign && n > 0 ? '+' : '')) + settings.currency + s;
  }
  function cls(n) { return n > 0 ? 'gain' : n < 0 ? 'loss' : ''; }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dayKey(d) { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function localInput(d) { d = new Date(d); return dayKey(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fmtDate(s) { return new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, 2200); }

  function inPeriod(t) {
    var d = new Date(t.date), n = new Date();
    if (ui.period === 'all') return true;
    if (ui.period === 'year') return d.getFullYear() === n.getFullYear();
    if (ui.period === 'month') return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
    if (ui.period === 'week') {
      var start = new Date(n); start.setHours(0, 0, 0, 0); start.setDate(n.getDate() - ((n.getDay() + 6) % 7));
      return d >= start;
    }
    return true;
  }
  function periodTrades() { return trades.filter(inPeriod); }

  function stats(list) {
    var s = { n: list.length, wins: 0, losses: 0, gw: 0, gl: 0, net: 0, best: null, worst: null, rrSum: 0, rrN: 0 };
    list.forEach(function (t) {
      var p = +t.pl || 0; s.net += p;
      if (p > 0) { s.wins++; s.gw += p; } else if (p < 0) { s.losses++; s.gl += -p; }
      if (s.best === null || p > s.best) s.best = p;
      if (s.worst === null || p < s.worst) s.worst = p;
      if (t.rr !== '' && t.rr != null && !isNaN(+t.rr)) { s.rrSum += +t.rr; s.rrN++; }
    });
    s.wr = s.n ? s.wins / s.n * 100 : 0;
    s.pf = s.gl ? s.gw / s.gl : (s.gw ? Infinity : 0);
    s.avgRR = s.rrN ? s.rrSum / s.rrN : 0;
    return s;
  }
  function pfText(pf) { return pf === Infinity ? '∞' : pf.toFixed(2); }

  /* ---------- app lock (device passcode, not encryption or sync) ---------- */
  function hashPass(s) {
    if (window.crypto && window.crypto.subtle && window.isSecureContext) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      });
    }
    var h = 5381; for (var i = 0; i < s.length; i++) { h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; }
    return Promise.resolve('f' + h.toString(16));
  }
  function isLocked() { return !!(settings.lock && settings.lock.hash) && sessionStorage.getItem(UNLOCK_KEY) !== '1'; }
  function showLock() {
    $('#lockScreen').hidden = false;
    var inp = $('#lockInput'); inp.value = ''; $('#lockErr').textContent = ''; inp.focus();
  }
  function hideLock() { $('#lockScreen').hidden = true; }
  function tryUnlock() {
    var val = $('#lockInput').value;
    hashPass(val).then(function (h) {
      if (settings.lock && h === settings.lock.hash) { sessionStorage.setItem(UNLOCK_KEY, '1'); hideLock(); render(); }
      else { $('#lockErr').textContent = 'Incorrect passcode'; $('#lockInput').value = ''; $('#lockInput').focus(); }
    });
  }

  /* ---------- views ---------- */
  function render() {
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === ui.view); });
    document.querySelectorAll('#periodChips button').forEach(function (b) { b.classList.toggle('on', b.dataset.p === ui.period); });
    $('#periodChips').style.visibility = (ui.view === 'more' || ui.view === 'tools') ? 'hidden' : 'visible';
    $('#addBtn').style.display = (ui.view === 'more' || ui.view === 'tools') ? 'none' : '';
    var v = $('#view');
    v.innerHTML = ui.view === 'dash' ? dashHTML() : ui.view === 'journal' ? journalHTML() : ui.view === 'tools' ? toolsHTML() : moreHTML();
    if (ui.view === 'journal') bindJournal();
    if (ui.view === 'tools') bindTools();
    window.scrollTo(0, 0);
  }

  function dashHTML() {
    var list = periodTrades(), s = stats(list);
    var label = { all: 'All time', week: 'This week', month: 'This month', year: 'This year' }[ui.period];
    var h = '<div class="hero"><small>' + label + ' net P&amp;L</small><div class="big num ' + cls(s.net) + '">' + money(s.net, true) + '</div>' +
      '<div class="sub">' + s.n + ' trade' + (s.n === 1 ? '' : 's') + ' · ' + s.wins + ' won · ' + s.losses + ' lost</div></div>';
    h += '<div class="grid">' +
      stat('Win rate', s.wr.toFixed(1) + '%') +
      stat('Profit factor', pfText(s.pf)) +
      stat('Average R:R', s.avgRR ? s.avgRR.toFixed(2) : '–') +
      stat('Gross profit / loss', '<span class="gain">' + money(s.gw) + '</span> / <span class="loss">' + money(s.gl) + '</span>') +
      stat('Best trade', s.best === null ? '–' : money(s.best, true)) +
      stat('Worst trade', s.worst === null ? '–' : money(s.worst, true)) + '</div>';
    h += '<section class="card"><h2>Equity curve</h2>' + curve(list) + '</section>';
    h += calendarHTML();
    h += strategyHTML(list);
    return h;
  }
  function stat(l, v) { return '<div class="stat"><small>' + l + '</small><b class="num">' + v + '</b></div>'; }

  function curve(list) {
    if (!list.length) return '<div class="empty">No trades yet. Tap + to log your first one.</div>';
    var sorted = list.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    var acc = 0, pts = [0];
    sorted.forEach(function (t) { acc += +t.pl || 0; pts.push(acc); });
    var W = 320, H = 130, P = 6, min = Math.min.apply(null, pts), max = Math.max.apply(null, pts);
    if (min === max) { min -= 1; max += 1; }
    var x = function (i) { return P + i * (W - 2 * P) / (pts.length - 1 || 1); };
    var y = function (v) { return H - P - (v - min) / (max - min) * (H - 2 * P); };
    var d = pts.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
    var color = acc >= 0 ? 'var(--gain)' : 'var(--loss)';
    var area = d + ' L' + x(pts.length - 1).toFixed(1) + ' ' + (H - P) + ' L' + x(0).toFixed(1) + ' ' + (H - P) + ' Z';
    return '<svg class="curve" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Equity curve">' +
      '<line x1="' + P + '" x2="' + (W - P) + '" y1="' + y(0).toFixed(1) + '" y2="' + y(0).toFixed(1) + '" stroke="var(--line)" stroke-dasharray="3 3"/>' +
      '<path d="' + area + '" fill="' + color + '" opacity=".12"/>' +
      '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }

  function calendarHTML() {
    var c = ui.cal, y = c.getFullYear(), m = c.getMonth();
    var first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate(), offset = (first.getDay() + 6) % 7;
    var byDay = {}, maxAbs = 0;
    trades.forEach(function (t) { var k = dayKey(t.date); byDay[k] = (byDay[k] || 0) + (+t.pl || 0); });
    for (var i = 1; i <= days; i++) { var kk = y + '-' + pad(m + 1) + '-' + pad(i); if (byDay[kk] != null) maxAbs = Math.max(maxAbs, Math.abs(byDay[kk])); }
    var h = '<section class="card"><div class="row-h"><h2>' + first.toLocaleString('en-IN', { month: 'long', year: 'numeric' }) + '</h2>' +
      '<div><button id="prevM" aria-label="Previous month">‹</button> <button id="nextM" aria-label="Next month">›</button></div></div><div class="cal">';
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach(function (d) { h += '<div class="dow">' + d + '</div>'; });
    for (var b = 0; b < offset; b++) h += '<button class="blank" tabindex="-1" aria-hidden="true"></button>';
    for (var d2 = 1; d2 <= days; d2++) {
      var key = y + '-' + pad(m + 1) + '-' + pad(d2), v = byDay[key];
      var c2 = v == null ? '' : v > 0 ? 'g' : v < 0 ? 'l' : '';
      var short = v == null ? '' : (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v));
      h += '<button data-day="' + key + '" class="' + c2 + '"><span>' + d2 + '</span>' + (v == null ? '' : '<b class="num ' + cls(v) + '">' + short + '</b>') + '</button>';
    }
    return h + '</div><p class="hint">Tap a day to log a trade on it.</p></section>';
  }

  function strategyHTML(list) {
    var g = {};
    list.forEach(function (t) { var k = t.strategy || 'No strategy'; (g[k] = g[k] || []).push(t); });
    var keys = Object.keys(g);
    if (!keys.length) return '';
    var rows = keys.map(function (k) { return { k: k, s: stats(g[k]) }; }).sort(function (a, b) { return b.s.net - a.s.net; });
    var h = '<section class="card"><h2>Strategy performance</h2><div class="scroll"><table><tr><th>Strategy</th><th>Trades</th><th>Win %</th><th>PF</th><th>Net</th></tr>';
    rows.forEach(function (r) {
      h += '<tr><td>' + esc(r.k) + '</td><td class="num">' + r.s.n + '</td><td class="num">' + r.s.wr.toFixed(0) + '%</td><td class="num">' + pfText(r.s.pf) +
        '</td><td class="num ' + cls(r.s.net) + '">' + money(r.s.net, true) + '</td></tr>';
    });
    return h + '</table></div></section>';
  }

  function filtered() {
    var f = ui.f, q = f.q.toLowerCase();
    return periodTrades().filter(function (t) {
      if (f.market && t.market !== f.market) return false;
      if (f.dir && t.direction !== f.dir) return false;
      if (q && (t.symbol + ' ' + t.strategy + ' ' + t.notes + ' ' + t.review).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  }

  function journalHTML() {
    var f = ui.f;
    var h = '<div class="filters"><input class="search" id="fq" type="search" placeholder="Search symbol, strategy or notes" value="' + esc(f.q) + '">' +
      '<select id="fm"><option value="">All markets</option>' + MARKETS.map(function (m) { return '<option' + (f.market === m ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select>' +
      '<select id="fd"><option value="">Long &amp; Short</option><option value="LONG"' + (f.dir === 'LONG' ? ' selected' : '') + '>Long</option><option value="SHORT"' + (f.dir === 'SHORT' ? ' selected' : '') + '>Short</option></select>' +
      '<span></span></div>';
    var list = filtered();
    if (!list.length) return h + '<div class="empty">No trades here. Tap + to add one.</div>';
    var s = stats(list);
    h += '<p class="hint" style="margin:0 0 10px">' + list.length + ' trades · <span class="' + cls(s.net) + '">' + money(s.net, true) + '</span> · win rate ' + s.wr.toFixed(0) + '%</p>';
    list.forEach(function (t) {
      h += '<button class="trade" data-id="' + t.id + '"><span class="sym">' + esc(t.symbol || '–') + '</span><span class="pl num ' + cls(+t.pl) + '">' + money(+t.pl || 0, true) + '</span>' +
        '<span class="meta"><span class="tag ' + (t.direction === 'LONG' ? 'long' : 'short') + '">' + esc(t.direction) + '</span>' +
        (t.tf ? '<span class="tag">' + esc(t.tf) + '</span>' : '') + (t.photo ? '<span class="tag">📷</span>' : '') + esc(t.market) + (t.strategy ? ' · ' + esc(t.strategy) : '') + '</span>' +
        '<span class="rr num">' + (t.rr !== '' && t.rr != null ? 'R:R ' + t.rr : '') + '<br>' + fmtDate(t.date) + '</span>' +
        (t.notes ? '<span class="note">' + esc(t.notes.slice(0, 110)) + (t.notes.length > 110 ? '…' : '') + '</span>' : '') + '</button>';
    });
    return h;
  }
  function bindJournal() {
    $('#fq').addEventListener('input', function (e) { ui.f.q = e.target.value; var pos = e.target.selectionStart; render(); var el = $('#fq'); el.focus(); el.setSelectionRange(pos, pos); });
    $('#fm').addEventListener('change', function (e) { ui.f.market = e.target.value; render(); });
    $('#fd').addEventListener('change', function (e) { ui.f.dir = e.target.value; render(); });
  }

  function kv(l, v) { return '<div class="kv"><span>' + l + '</span><b class="num">' + v + '</b></div>'; }

  function toolsHTML() {
    var r = settings.risk || {};
    return '<section class="card"><h2>Position size calculator</h2>' +
      '<div class="f">' +
      '<label class="full">Account balance (' + settings.currency + ')<input id="rBal" type="number" inputmode="decimal" step="any" placeholder="e.g. 100000" value="' + esc(r.balance == null ? '' : r.balance) + '"></label>' +
      '<label>Risk %<input id="rPct" type="number" inputmode="decimal" step="any" value="' + esc(r.pct == null ? 1 : r.pct) + '"></label>' +
      '<label>Or fixed risk (' + settings.currency + ')<input id="rFix" type="number" inputmode="decimal" step="any" placeholder="optional"></label>' +
      '<label>Entry price<input id="rEntry" type="number" inputmode="decimal" step="any"></label>' +
      '<label>Stop-loss price<input id="rStop" type="number" inputmode="decimal" step="any"></label>' +
      '<label>Take-profit price<input id="rTP" type="number" inputmode="decimal" step="any" placeholder="optional"></label>' +
      '</div><div id="rOut" style="margin-top:10px"></div>' +
      '<p class="hint">Position size = risk amount ÷ |entry − stop|. Works for anything quoted in price-per-unit (stocks, crypto, indices). For forex, size the position using your pip value in ' + settings.currency + ' per lot.</p></section>';
  }
  function bindTools() {
    ['rBal', 'rPct', 'rFix', 'rEntry', 'rStop', 'rTP'].forEach(function (id) {
      $('#' + id).addEventListener('input', calcRisk);
    });
    calcRisk();
  }
  function calcRisk() {
    var balV = $('#rBal').value, bal = +balV || 0, pct = +$('#rPct').value || 0;
    var fixV = $('#rFix').value, fix = fixV === '' ? null : +fixV;
    var entry = +$('#rEntry').value || 0, stop = +$('#rStop').value || 0;
    var tpV = $('#rTP').value, tp = tpV === '' ? null : +tpV;
    settings.risk = { balance: balV === '' ? null : bal, pct: pct };
    save(SKEY, settings);
    var riskAmt = fix != null ? fix : bal * pct / 100;
    var perUnit = Math.abs(entry - stop);
    var out = $('#rOut');
    if (!perUnit || !riskAmt) { out.innerHTML = '<p class="hint">Enter entry, stop-loss and a risk amount (risk % of balance, or a fixed amount) to see position size.</p>'; return; }
    var size = riskAmt / perUnit, value = size * entry;
    var html = kv('Risk amount', money(riskAmt)) + kv('Risk per unit', money(perUnit)) +
      kv('Position size', size.toLocaleString('en-IN', { maximumFractionDigits: 4 }) + ' units') +
      kv('Position value', money(value));
    if (tp != null) {
      var reward = Math.abs(tp - entry) * size, rr = riskAmt ? reward / riskAmt : 0;
      html += kv('Potential reward', money(reward)) + kv('Reward : risk', rr.toFixed(2) + ' : 1');
    }
    out.innerHTML = html;
  }

  function moreHTML() {
    return '<section class="card"><h2>Currency</h2><div class="f"><label class="full"><select id="cur">' +
      ['₹', '$', '€', '£'].map(function (c) { return '<option' + (settings.currency === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></label></div></section>' +
      '<section class="card"><h2>App lock</h2>' +
      (settings.lock && settings.lock.hash ?
        '<p class="hint">A passcode is set on this device. Enter it below to remove it.</p>' +
        '<div class="f"><label class="full">Current passcode<input type="password" id="curPass" inputmode="numeric" autocomplete="off"></label></div>' +
        '<div class="actions"><button class="btn danger" id="remLock" type="button">Remove passcode</button></div>'
        :
        '<p class="hint">Locks this app with a passcode on this device. It does not create an account or sync your data anywhere — it just keeps someone else from opening the app on your phone.</p>' +
        '<div class="f"><label>New passcode<input type="password" id="newPass" inputmode="numeric" autocomplete="off"></label>' +
        '<label>Confirm<input type="password" id="newPass2" inputmode="numeric" autocomplete="off"></label></div>' +
        '<div class="actions"><button class="btn primary" id="setLock" type="button">Set passcode</button></div>'
      ) + '</section>' +
      '<section class="card list"><h2>Your data</h2>' +
      '<button class="btn" id="expCsv">Export trades (CSV)</button>' +
      '<button class="btn" id="expJson">Backup everything (JSON)</button>' +
      '<button class="btn" id="impJson">Restore from backup (JSON)</button>' +
      '<input type="file" id="file" accept="application/json,.json" hidden>' +
      '<button class="btn" id="impNotion">Import from Notion (CSV)</button>' +
      '<input type="file" id="notionFile" accept=".csv,text/csv" hidden>' +
      '<p class="hint">In Notion, open your trades database → <b>···</b> menu → Export → CSV, then import that file here. Columns like Date, Symbol, Direction, P&amp;L, R:R, Notes and Review are matched automatically; anything unrecognized is skipped. Imported trades are added to what you already have.</p>' +
      '<p class="hint">Trades are saved only in this browser. Back up regularly, and before clearing browser data.</p></section>' +
      '<section class="card list"><h2>Danger zone</h2><button class="btn danger" id="wipe">Delete all trades</button></section>';
  }

  /* ---------- trade form ---------- */
  function openForm(t, presetDay) {
    var isNew = !t;
    t = t || { id: uid(), date: presetDay ? presetDay + 'T' + localInput(new Date()).slice(11) : localInput(new Date()), market: 'Forex', symbol: '', direction: 'LONG', tf: 'm5', strategy: '', pl: '', rr: '', notes: '', review: '', photo: '' };
    var photoData = t.photo || '';
    var strategies = uniq('strategy'), symbols = uniq('symbol');
    var sh = $('#sheet');
    sh.innerHTML = '<div class="sheet"><h2>' + (isNew ? 'Add trade' : 'Edit trade') + '</h2><div class="f">' +
      '<label class="full">Date and time<input type="datetime-local" id="d" value="' + esc(localInput(t.date)) + '"></label>' +
      '<label>Market<select id="m">' + MARKETS.map(function (m) { return '<option' + (t.market === m ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select></label>' +
      '<label>Symbol<input id="s" list="symL" placeholder="EURUSD, NIFTY…" value="' + esc(t.symbol) + '" autocapitalize="characters"></label>' +
      '<datalist id="symL">' + symbols.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' +
      '<div class="full"><div style="font-size:13px;color:var(--muted)">Direction</div><div class="seg" id="dir">' +
      '<button type="button" class="long' + (t.direction === 'LONG' ? ' on' : '') + '" data-v="LONG">Long</button>' +
      '<button type="button" class="short' + (t.direction === 'SHORT' ? ' on' : '') + '" data-v="SHORT">Short</button></div></div>' +
      '<label>Timeframe<select id="tf">' + TFS.map(function (x) { return '<option' + (t.tf === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label>' +
      '<label>Strategy<input id="st" list="stL" placeholder="e.g. Breakout" value="' + esc(t.strategy) + '"></label>' +
      '<datalist id="stL">' + strategies.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' +
      '<label>P&amp;L (' + settings.currency + ')<input id="pl" type="number" inputmode="decimal" step="any" placeholder="-100 or 250" value="' + esc(t.pl) + '"></label>' +
      '<label>R:R achieved<input id="rr" type="number" inputmode="decimal" step="any" placeholder="-1 or 2.5" value="' + esc(t.rr) + '"></label>' +
      '<label class="full">Trade notes<textarea id="n" placeholder="Why did you take this trade?">' + esc(t.notes) + '</textarea></label>' +
      '<label class="full">Review<textarea id="rv" placeholder="What went well? What will you change?">' + esc(t.review) + '</textarea></label>' +
      '<div class="full"><div style="font-size:13px;color:var(--muted)">Screenshot</div><div class="thumbs" id="photoWrap"></div>' +
      '<input type="file" accept="image/*" id="photoFile" hidden></div></div>' +
      '<div class="actions">' + (isNew ? '' : '<button class="btn danger" id="del" type="button">Delete</button>') +
      '<button class="btn" id="cancel" type="button">Cancel</button><button class="btn primary" id="saveT" type="button">Save</button></div></div>';
    function renderPhotoWrap() {
      var w = $('#photoWrap', sh);
      w.innerHTML = (photoData ? '<button type="button" class="th" id="photoThumb"><img src="' + photoData + '" alt="Trade screenshot"></button>' : '') +
        '<button type="button" class="th" id="addPhoto">' + (photoData ? 'Change' : '+ Add') + '</button>' +
        (photoData ? '<button type="button" class="th" id="remPhoto">Remove</button>' : '');
      $('#addPhoto', w).onclick = function () { $('#photoFile', sh).click(); };
      if (photoData) {
        $('#photoThumb', w).onclick = function () { openViewer(photoData, function () { photoData = ''; renderPhotoWrap(); }); };
        $('#remPhoto', w).onclick = function () { photoData = ''; renderPhotoWrap(); };
      }
    }
    renderPhotoWrap();
    $('#photoFile', sh).addEventListener('change', function (e) {
      var file = e.target.files[0]; if (!file) return;
      shrinkImage(file, function (dataUrl) { photoData = dataUrl; renderPhotoWrap(); });
      e.target.value = '';
    });
    var dir = t.direction;
    sh.querySelectorAll('#dir button').forEach(function (b) {
      b.addEventListener('click', function () { dir = b.dataset.v; sh.querySelectorAll('#dir button').forEach(function (x) { x.classList.toggle('on', x === b); }); });
    });
    $('#cancel', sh).onclick = function () { sh.close(); };
    if (!isNew) $('#del', sh).onclick = function () {
      if (confirm('Delete this trade?')) { trades = trades.filter(function (x) { return x.id !== t.id; }); save(KEY, trades); sh.close(); render(); toast('Trade deleted'); }
    };
    $('#saveT', sh).onclick = function () {
      var pl = $('#pl', sh).value;
      if (pl === '' || isNaN(+pl)) { toast('Enter the P&L for this trade'); $('#pl', sh).focus(); return; }
      var rec = { id: t.id, date: new Date($('#d', sh).value || Date.now()).toISOString(), market: $('#m', sh).value, symbol: $('#s', sh).value.trim().toUpperCase(),
        direction: dir, tf: $('#tf', sh).value, strategy: $('#st', sh).value.trim(), pl: +pl, rr: $('#rr', sh).value === '' ? '' : +$('#rr', sh).value,
        notes: $('#n', sh).value.trim(), review: $('#rv', sh).value.trim(), photo: photoData };
      var i = trades.findIndex(function (x) { return x.id === t.id; });
      if (i >= 0) trades[i] = rec; else trades.push(rec);
      save(KEY, trades); sh.close(); render(); toast('Trade saved');
    };
    sh.showModal();
  }
  function uniq(k) { var o = {}; trades.forEach(function (t) { if (t[k]) o[t[k]] = 1; }); return Object.keys(o).sort(); }

  /* ---------- screenshots ---------- */
  function shrinkImage(file, cb) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var maxW = 1000, scale = Math.min(1, maxW / img.width);
        var w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        try { cb(c.toDataURL('image/jpeg', 0.72)); } catch (err) { toast('Could not process that image'); }
      };
      img.onerror = function () { toast('Could not read that image'); };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
  function openViewer(src, onRemove) {
    var vw = $('#viewer');
    $('#vimg', vw).src = src;
    $('#vrem', vw).onclick = function () { onRemove(); vw.close(); };
    $('#vclose', vw).onclick = function () { vw.close(); };
    vw.showModal();
  }

  /* ---------- export / import ---------- */
  function download(name, text, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function csvCell(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function exportCsv() {
    var cols = ['date', 'market', 'symbol', 'direction', 'tf', 'strategy', 'pl', 'rr', 'notes', 'review'];
    var rows = [cols.join(',')].concat(trades.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); })
      .map(function (t) { return cols.map(function (c) { return csvCell(t[c]); }).join(','); }));
    download('tradebook-trades.csv', rows.join('\n'), 'text/csv');
  }

  /* ---------- Notion CSV import ---------- */
  function parseCSV(text) {
    var rows = [], row = [], field = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.length > 1 || r[0] !== ''; });
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  var NOTION_ALIASES = {
    date: ['date', 'tradedate', 'entrydate', 'datetime', 'time', 'created'],
    market: ['market', 'category', 'assetclass', 'instrumenttype'],
    symbol: ['symbol', 'ticker', 'pair', 'asset', 'instrument'],
    direction: ['direction', 'side', 'longshort', 'position'],
    tf: ['timeframe', 'tf', 'chart'],
    strategy: ['strategy', 'setup', 'system'],
    pl: ['pl', 'pnl', 'p l', 'profitloss', 'result', 'profit', 'netpl', 'plamount'],
    rr: ['rr', 'riskreward', 'rmultiple', 'rratio'],
    notes: ['notes', 'note', 'reason', 'entryreason', 'thesis'],
    review: ['review', 'lessons', 'lessonlearned', 'postmortem', 'journal']
  };
  function mapHeaders(headers) {
    var map = {};
    headers.forEach(function (h, i) {
      var n = norm(h);
      Object.keys(NOTION_ALIASES).forEach(function (key) { if (map[key] == null && NOTION_ALIASES[key].indexOf(n) >= 0) map[key] = i; });
    });
    return map;
  }
  function importNotionCsv(text) {
    var rows = parseCSV(text);
    if (!rows.length) { toast('That file looks empty'); return; }
    var map = mapHeaders(rows[0]);
    if (map.pl == null) { toast('Could not find a P&L column in that CSV'); return; }
    var added = 0, skipped = 0;
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i]; if (!r.length || (r.length === 1 && r[0] === '')) continue;
      var get = function (k) { return map[k] != null ? (r[map[k]] || '').trim() : ''; };
      var plRaw = get('pl').replace(/[^0-9.\-]/g, ''), pl = plRaw === '' ? NaN : +plRaw;
      if (isNaN(pl)) { skipped++; continue; }
      var d = get('date') ? new Date(get('date')) : new Date();
      if (isNaN(d.getTime())) d = new Date();
      var marketRaw = norm(get('market'));
      var market = MARKETS.filter(function (m) { return norm(m) === marketRaw; })[0] || 'Other';
      var direction = /^(short|sell)/.test(norm(get('direction'))) ? 'SHORT' : 'LONG';
      var rrRaw = get('rr').replace(/[^0-9.\-]/g, '');
      trades.push({ id: uid(), date: d.toISOString(), market: market, symbol: get('symbol').toUpperCase(), direction: direction,
        tf: get('tf'), strategy: get('strategy'), pl: pl, rr: rrRaw === '' ? '' : +rrRaw, notes: get('notes'), review: get('review'), photo: '' });
      added++;
    }
    save(KEY, trades); render();
    toast(added + ' trade' + (added === 1 ? '' : 's') + ' imported' + (skipped ? ', ' + skipped + ' skipped' : ''));
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('button'); if (!el) return;
    if (el.dataset.p) { ui.period = el.dataset.p; render(); }
    else if (el.dataset.v && el.closest('#tabs')) { ui.view = el.dataset.v; render(); }
    else if (el.id === 'addBtn') openForm();
    else if (el.dataset.day) openForm(null, el.dataset.day);
    else if (el.dataset.id && el.classList.contains('trade')) openForm(trades.find(function (t) { return t.id === el.dataset.id; }));
    else if (el.id === 'prevM') { ui.cal = new Date(ui.cal.getFullYear(), ui.cal.getMonth() - 1, 1); render(); }
    else if (el.id === 'nextM') { ui.cal = new Date(ui.cal.getFullYear(), ui.cal.getMonth() + 1, 1); render(); }
    else if (el.id === 'expCsv') exportCsv();
    else if (el.id === 'expJson') download('tradebook-backup.json', JSON.stringify({ trades: trades, settings: settings }, null, 2), 'application/json');
    else if (el.id === 'impJson') $('#file').click();
    else if (el.id === 'impNotion') $('#notionFile').click();
    else if (el.id === 'wipe') { if (confirm('Delete ALL trades? This cannot be undone.')) { trades = []; save(KEY, trades); render(); toast('All trades deleted'); } }
    else if (el.id === 'lockBtn') tryUnlock();
    else if (el.id === 'setLock') {
      var p1 = $('#newPass').value, p2 = $('#newPass2').value;
      if (!p1 || p1.length < 4) { toast('Use at least 4 characters'); return; }
      if (p1 !== p2) { toast('Passcodes do not match'); return; }
      hashPass(p1).then(function (h) { settings.lock = { hash: h }; save(SKEY, settings); sessionStorage.setItem(UNLOCK_KEY, '1'); render(); toast('Passcode set'); });
    }
    else if (el.id === 'remLock') {
      var cur = $('#curPass').value;
      hashPass(cur).then(function (h) {
        if (settings.lock && h === settings.lock.hash) { settings.lock = null; save(SKEY, settings); render(); toast('Passcode removed'); }
        else toast('That passcode is incorrect');
      });
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'lockInput') tryUnlock(); });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'cur') { settings.currency = e.target.value; save(SKEY, settings); toast('Currency updated'); }
    if (e.target.id === 'file' && e.target.files[0]) {
      var r = new FileReader();
      r.onload = function () {
        try {
          var d = JSON.parse(r.result); if (!d || !Array.isArray(d.trades)) throw 0;
          if (!confirm('Restore ' + d.trades.length + ' trades? This replaces your current trades.')) return;
          trades = d.trades; if (d.settings) settings = Object.assign(settings, d.settings);
          save(KEY, trades); save(SKEY, settings); render(); toast('Backup restored');
        } catch (x) { toast('That file is not a Tradebook backup'); }
      };
      r.readAsText(e.target.files[0]);
    }
    if (e.target.id === 'notionFile' && e.target.files[0]) {
      var r2 = new FileReader();
      r2.onload = function () { importNotionCsv(r2.result); e.target.value = ''; };
      r2.readAsText(e.target.files[0]);
    }
  });
  $('#sheet').addEventListener('click', function (e) { if (e.target === this) this.close(); });
  $('#viewer').addEventListener('click', function (e) { if (e.target === this) this.close(); });

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) { /* offline support can be added later */ }
  if (isLocked()) showLock(); else render();
})();
