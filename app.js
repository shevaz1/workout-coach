/* 화면과 저장. 규칙 계산은 logic.js, 종목 데이터는 data.js */
(function () {
  'use strict';
  var D = window.WC_DATA, L = window.WC_LOGIC, KEY = 'workout-coach.v1';
  var WD = ['월', '화', '수', '목', '금', '토', '일'];
  var app = document.getElementById('app');

  // ---------- 저장 ----------
  var S = { v: 1, profile: null, sessions: [], bw: [], active: null, opt: { theme: 'auto', sound: true } };
  var storageOk = true;
  function blank() { return { v: 1, profile: null, sessions: [], bw: [], active: null, opt: { theme: 'auto', sound: true } }; }
  // 저장된 내용이나 불러온 파일이 이 앱 형식인지 하나하나 확인한다
  function validState(o) {
    var num = function (v, a, b) { return typeof v === 'number' && isFinite(v) && v >= a && v <= b; };
    var isArr = Array.isArray, dateOk = function (d) { return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d); };
    if (!o || typeof o !== 'object' || !o.profile || typeof o.profile !== 'object' || !isArr(o.sessions)) return false;
    var p = o.profile;
    if ((p.sex !== 'm' && p.sex !== 'f') || !D.GOAL.hasOwnProperty(p.goal) || !num(p.age, 14, 90) || !num(p.height, 120, 220) || !num(p.weight, 30, 200) || !num(+p.minutes, 1, 300)) return false;
    if (!isArr(p.days) || !p.days.length || !p.days.every(function (d) { return num(d, 0, 6) && d % 1 === 0; })) return false;
    if (!isArr(p.injuries) || !p.injuries.every(function (i) { return D.INJ.hasOwnProperty(i); })) return false;
    var setOk = function (t) { return t && num(t.w, 0, 1000) && num(t.r, 0, 1000); };
    var itemOk = function (x) { return x && D.EX.hasOwnProperty(x.id) && isArr(x.sets) && x.sets.every(setOk); };
    if (!o.sessions.every(function (s) { return s && dateOk(s.d) && (s.type === 'A' || s.type === 'B') && isArr(s.items) && s.items.every(itemOk); })) return false;
    if (o.bw != null && !(isArr(o.bw) && o.bw.every(function (b) { return b && dateOk(b.d) && num(b.v, 1, 1000); }))) return false;
    return true;
  }
  function fromValid(o) {
    var n = blank(); n.profile = o.profile; n.sessions = o.sessions; n.bw = o.bw || [];
    if (o.opt && typeof o.opt === 'object') { if (['auto', 'light', 'dark'].indexOf(o.opt.theme) >= 0) n.opt.theme = o.opt.theme; if (typeof o.opt.sound === 'boolean') n.opt.sound = o.opt.sound; }
    if (o.active && typeof o.active === 'object' && isArrayOk(o.active)) n.active = o.active;
    return n;
  }
  function isArrayOk(a) { return Array.isArray(a.list) && Array.isArray(a.order) && a.plan && a.log && a.list.every(function (id) { return D.EX[id] && a.plan[id]; }) && typeof a.idx === 'number'; }
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) {
      var o0 = JSON.parse(raw);
      if (o0 && o0.profile == null && !(o0.sessions || []).length) S = Object.assign(S, { opt: o0.opt && typeof o0.opt === 'object' ? Object.assign(S.opt, o0.opt) : S.opt });
      else if (validState(o0)) S = fromValid(o0);
      else localStorage.setItem(KEY + '.broken', raw); // 알아볼 수 없는 내용은 따로 남겨 두고 새로 시작
    }
  } catch (e) { storageOk = false; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { storageOk = false; } }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});

  var ui = { draft: null, pick: {}, chartEx: null, done: null, inWorkout: false, msg: '' };

  // ---------- 도우미 ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function kg(v) { return L.fmtKg(v) + 'kg'; }
  function route() { return (location.hash || '#home').slice(1); }
  function go(r) { if (route() === r) render(); else location.hash = r; }
  function applyTheme() {
    var t = S.opt.theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  }

  // ---------- 자세 그림 ----------
  function shape(s, cls) {
    if (s[0] === 'l') return '<line class="' + cls + '" x1="' + s[1] + '" y1="' + s[2] + '" x2="' + s[3] + '" y2="' + s[4] + '" stroke-width="' + (s[5] || 3) + '"/>';
    if (s[0] === 'r') return '<rect class="' + cls + ' fill" x="' + s[1] + '" y="' + s[2] + '" width="' + s[3] + '" height="' + s[4] + '" rx="' + (s[5] || 0) + '"/>';
    return '<circle class="' + cls + ' fill" cx="' + s[1] + '" cy="' + s[2] + '" r="' + s[3] + '"/>';
  }
  function pl(pts, w, halo) { var q = pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' '); return (halo ? '<polyline class="halo" stroke-width="' + (w + 3.5) + '" points="' + q + '"/>' : '') + '<polyline class="body" stroke-width="' + w + '" points="' + q + '"/>'; }
  function body(v, j) {
    var o = '';
    if (v === 's') {
      o += j.B ? '<path class="body" stroke-width="8" d="M' + j.P + ' Q' + j.B + ' ' + j.S + '"/>' : pl([j.P, j.S], 8);
      o += pl([j.P, j.K, j.A, j.T], 6) + pl([j.S, j.E, j.W], 5, 1);
      o += '<circle class="body fill" cx="' + j.H[0] + '" cy="' + j.H[1] + '" r="7"/>';
    } else {
      var R = function (p) { return [60 + p[0], p[1]]; }, Lf = function (p) { return [60 - p[0], p[1]]; };
      o += '<polygon class="body fill" stroke-width="6" points="' + [Lf(j.S), R(j.S), R(j.P), Lf(j.P)].map(function (p) { return p.join(','); }).join(' ') + '"/>';
      [R, Lf].forEach(function (f) { o += pl([f(j.P), f(j.K), f(j.A)], 6, 1) + pl([f(j.S), f(j.E), f(j.W)], 5, 1); });
      o += '<circle class="body fill" cx="60" cy="' + j.H[1] + '" r="7"/>';
    }
    return o;
  }
  function arrow(a) {
    var dx = a[2] - a[0], dy = a[3] - a[1], n = Math.sqrt(dx * dx + dy * dy), ux = dx / n, uy = dy / n, h = 6;
    var bx = a[2] - ux * h, by = a[3] - uy * h;
    return '<line class="arr" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + bx + '" y2="' + by + '"/><polygon class="arr fill" points="' + a[2] + ',' + a[3] + ' ' + (bx - uy * 4) + ',' + (by + ux * 4) + ' ' + (bx + uy * 4) + ',' + (by - ux * 4) + '"/>';
  }
  function figOne(ex, k) {
    var f = ex.fig, p = f[k];
    return '<svg viewBox="0 0 120 120" role="img" aria-label="' + esc(ex.name) + (k === 'a' ? ' 시작 자세' : ' 끝 자세') + '">' +
      f.m.map(function (s) { return shape(s, 'mach'); }).join('') +
      (p.un || []).map(function (s) { return shape(s, 'move'); }).join('') +
      body(f.v, p.j) + (f.top || []).map(function (s) { return shape(s, 'mach'); }).join('') +
      p.mv.map(function (s) { return shape(s, 'move'); }).join('') +
      (p.ar || []).map(arrow).join('') + '</svg>';
  }
  function figs(ex) {
    return '<div class="figs"><figure>' + figOne(ex, 'a') + '<figcaption>① 시작 자세</figcaption></figure>' +
      '<figure>' + figOne(ex, 'b') + '<figcaption>② 끝 자세</figcaption></figure></div>' +
      '<p class="legend"><i class="sw move"></i>움직이는 부분 <i class="sw mach"></i>고정된 기구 · ' + (ex.fig.v === 's' ? '옆에서 본 모습' : '앞에서 본 모습') + '</p>';
  }
  function exText(ex, inj) {
    var c = '';
    (inj || []).forEach(function (i) { if (ex.caution && ex.caution[i]) c += '<p class="warn">⚠ ' + esc(ex.caution[i]) + '</p>'; });
    return '<p class="setup"><b>기구 맞추기</b> ' + esc(ex.setup) + '</p><ol class="how">' + ex.how.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ol>' +
      '<p class="mistake"><b>흔한 실수</b> ' + esc(ex.mistake) + '</p>' + c;
  }

  // ---------- 그림표 ----------
  function barChart(id, data, unit) {
    var W = 320, H = 150, x0 = 26, y0 = 122, top = 16, max = Math.max(4, Math.max.apply(null, data.map(function (d) { return d.v; })));
    var cw = (W - x0 - 6) / data.length, sel = ui.pick[id], o = '';
    for (var g = 0; g <= max; g += max > 4 ? 2 : 1) { var gy = y0 - (y0 - top) * g / max; o += '<line class="grid" x1="' + x0 + '" x2="' + W + '" y1="' + gy + '" y2="' + gy + '"/><text class="tick" x="' + (x0 - 6) + '" y="' + (gy + 4) + '" text-anchor="end">' + g + '</text>'; }
    data.forEach(function (d, i) {
      var cx = x0 + cw * i + cw / 2, bh = (y0 - top) * d.v / max, on = sel === i || (sel == null && i === data.length - 1);
      if (d.v) o += '<path class="bar' + (on ? ' on' : '') + '" d="M' + (cx - 9) + ',' + y0 + 'v' + (-(bh - 4)) + 'a4,4 0 0 1 4,-4h10a4,4 0 0 1 4,4v' + (bh - 4) + 'z"/>';
      if (on) o += '<text class="val" x="' + cx + '" y="' + (y0 - bh - 5) + '" text-anchor="middle">' + d.v + unit + '</text>';
      o += '<text class="tick" x="' + cx + '" y="' + (y0 + 16) + '" text-anchor="middle">' + d.label + '</text>';
      o += '<rect class="hit" data-act="pick" data-chart="' + id + '" data-i="' + i + '" x="' + (x0 + cw * i) + '" y="0" width="' + cw + '" height="' + H + '"/>';
    });
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '">' + o + '<line class="axis" x1="' + x0 + '" x2="' + W + '" y1="' + y0 + '" y2="' + y0 + '"/></svg>';
  }
  function lineChart(id, pts, unit) {
    if (!pts.length) return '<p class="muted">아직 기록이 없어요.</p>';
    var W = 320, H = 160, x0 = 38, x1 = W - 34, y0 = 126, top = 22;
    var vs = pts.map(function (p) { return p.v; }), mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs);
    var padv = Math.max((mx - mn) * 0.2, unit === 'kg' && mx - mn < 2 ? 2.5 : 1); mn = Math.max(0, mn - padv); mx += padv;
    var X = function (i) { return pts.length === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * i / (pts.length - 1); };
    var Y = function (v) { return y0 - (y0 - top) * (v - mn) / (mx - mn); };
    var o = '', sel = ui.pick[id]; if (sel == null || sel >= pts.length) sel = pts.length - 1;
    [mn, (mn + mx) / 2, mx].forEach(function (g) { o += '<line class="grid" x1="' + x0 + '" x2="' + (W - 4) + '" y1="' + Y(g) + '" y2="' + Y(g) + '"/><text class="tick" x="' + (x0 - 6) + '" y="' + (Y(g) + 4) + '" text-anchor="end">' + Math.round(g) + '</text>'; });
    o += '<polyline class="line" points="' + pts.map(function (p, i) { return X(i) + ',' + Y(p.v); }).join(' ') + '"/>';
    var cw = pts.length === 1 ? W : (x1 - x0) / (pts.length - 1);
    pts.forEach(function (p, i) {
      if (pts.length <= 16 || i === sel) o += '<circle class="dot' + (i === sel ? ' on' : '') + '" cx="' + X(i) + '" cy="' + Y(p.v) + '" r="' + (i === sel ? 5 : 4) + '"/>';
      o += '<rect class="hit" data-act="pick" data-chart="' + id + '" data-i="' + i + '" x="' + (X(i) - cw / 2) + '" y="0" width="' + cw + '" height="' + H + '"/>';
    });
    var sx = Math.min(Math.max(X(sel), x0 + 30), W - 54);
    o += '<text class="val" x="' + sx + '" y="' + (Y(pts[sel].v) - 10) + '" text-anchor="middle">' + L.fmtKg(pts[sel].v) + unit + ' · ' + md(pts[sel].d) + '</text>';
    o += '<text class="tick" x="' + x0 + '" y="' + (y0 + 18) + '">' + md(pts[0].d) + '</text>';
    if (pts.length > 1) o += '<text class="tick" x="' + x1 + '" y="' + (y0 + 18) + '" text-anchor="end">' + md(pts[pts.length - 1].d) + '</text>';
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '">' + o + '</svg>';
  }
  function md(k) { var p = k.split('-'); return +p[1] + '/' + +p[2]; }

  // ---------- 소리·진동·화면 켜짐 ----------
  var ac = null, wake = null;
  function unlockAudio() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state !== 'running') ac.resume(); } catch (e) {} }
  function beep() {
    if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
    if (!S.opt.sound || !ac) return;
    try {
      [0, 0.28, 0.56].forEach(function (t, i) {
        var o = ac.createOscillator(), g = ac.createGain(), at = ac.currentTime + t;
        o.frequency.value = i === 2 ? 1175 : 880; o.connect(g); g.connect(ac.destination);
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.6, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
        o.start(at); o.stop(at + 0.25);
      });
    } catch (e) {}
  }
  function keepAwake() { if (navigator.wakeLock && ui.inWorkout && !wake) navigator.wakeLock.request('screen').then(function (w) { wake = w; w.addEventListener('release', function () { wake = null; }); }).catch(function () {}); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { if (closeStale()) { go('home'); return; } keepAwake(); tick(); } });

  // ---------- 오늘 계획 ----------
  function todayPlan() {
    var p = S.profile, type = L.nextType(S.sessions), day = L.buildDay(p, type), v = L.volume(p), today = L.dkey();
    return {
      type: type, v: v, swaps: day.swaps, today: today,
      items: day.list.map(function (id) { return { id: id, rec: L.recommend(id, p, S.sessions, today) }; }),
      doneToday: S.sessions.some(function (s) { return s.d === today; }),
      isDay: p.days.indexOf(L.dow()) >= 0
    };
  }
  function nextDayText() {
    var t = L.dow();
    for (var i = 1; i <= 7; i++) { var d = (t + i) % 7; if (S.profile.days.indexOf(d) >= 0) return (i === 1 ? '내일(' + WD[d] + '요일)' : WD[d] + '요일'); }
    return '';
  }
  function weekStrip() {
    var ws = L.weekStart(new Date()), t = L.dow(), o = '';
    for (var i = 0; i < 7; i++) {
      var d = new Date(ws); d.setDate(ws.getDate() + i); var k = L.dkey(d);
      var done = S.sessions.some(function (s) { return s.d === k; }), plan = S.profile.days.indexOf(i) >= 0;
      o += '<div class="wd' + (i === t ? ' today' : '') + (done ? ' done' : plan ? ' plan' : '') + '"><span>' + WD[i] + '</span><b>' + (done ? '✓' : plan ? '●' : '') + '</b></div>';
    }
    return '<div class="week" aria-label="이번 주">' + o + '</div><p class="legend">✓ 운동한 날 · ● 운동하기로 한 날</p>';
  }

  // ---------- 화면: 오늘 ----------
  function vHome() {
    var p = todayPlan(), o = '<h1>오늘</h1>' + weekStrip();
    if (ui.notice) o += '<p class="note">' + esc(ui.notice) + '</p>';
    if (S.active) {
      o += '<section class="card hero"><h2>하던 운동이 있어요</h2><p>' + S.active.list.length + '가지 중 ' + Math.min(S.active.idx + 1, S.active.list.length) + '번째까지 왔어요.</p><button class="btn big" data-act="resume">이어서 하기</button><button class="btn ghost" data-act="abandon">그만두고 지금까지만 저장</button></section>';
    } else if (p.doneToday) {
      o += '<section class="card hero"><h2>오늘 운동 끝! 👏</h2><p>잘 쉬어야 근육이 붙어요. 다음 운동은 <b>' + nextDayText() + '</b>입니다.</p><button class="btn ghost" data-act="start">한 번 더 하기</button></section>';
    } else if (!p.isDay) {
      o += '<section class="card hero"><h2>오늘은 쉬는 날이에요</h2><p>다음 운동은 <b>' + nextDayText() + '</b>입니다. 가볍게 걷는 것은 좋아요.</p><button class="btn ghost" data-act="start">그래도 오늘 운동하기</button></section>';
    }
    o += '<section class="card"><h2>' + (p.isDay && !p.doneToday ? '오늘 할 운동' : '다음에 할 운동') + ' <span class="tag">온몸 ' + p.type + '</span></h2>' +
      '<p class="muted">약 ' + L.estMinutes(S.profile, p.items.length) + '분 · ' + p.items.length + '가지 · 종목마다 ' + p.v.sets + '세트 × ' + p.v.reps + '번 · 세트 사이 ' + p.v.rest + '초 쉬기</p><ul class="list">';
    p.items.forEach(function (it, i) {
      var ex = D.EX[it.id];
      o += '<li><a href="#guide" data-act="guide" data-id="' + it.id + '"><span class="n">' + (i + 1) + '</span><span class="g"><b>' + esc(ex.name) + '</b><small>' + esc(ex.part) + (it.rec.first ? ' · 처음' : '') + '</small></span><span class="w">' + kg(it.rec.w) + '</span></a></li>';
    });
    o += '</ul>';
    p.swaps.forEach(function (s) { o += '<p class="swap">' + esc(D.EX[s[0]].name) + ' → ' + (s[1] ? esc(D.EX[s[1]].name) : '뺌') + ' (아픈 부위 때문에 바꿨어요)</p>'; });
    if (!S.active && p.isDay && !p.doneToday) o += '<button class="btn big" data-act="start">운동 시작</button>';
    o += '</section>';
    if (!S.sessions.length) o += '<section class="card"><h2>첫날 안내</h2><p>적힌 무게는 몸무게로 어림한 <b>시작 숫자</b>예요. 첫 세트를 해 보고 <b>12번을 하고도 2~3번 더 할 수 있을 정도</b>가 되게 올리거나 내립니다. 앱이 첫 세트 뒤에 물어보고 맞춰 줍니다.</p></section>';
    o += '<p class="safe">찌르듯 날카로운 통증이 오면 바로 멈추세요. 지병이 있거나 약을 드시면 운동 전에 의사와 먼저 상의하세요.</p>';
    if (!storageOk) o += '<p class="warn">⚠ 이 창에서는 기록이 저장되지 않아요. 개인정보 보호 모드를 끄고 다시 열어 주세요.</p>';
    return o;
  }

  // ---------- 화면: 처음 질문 / 내 정보 ----------
  function chips(k, opts, multi) {
    var d = ui.draft;
    return '<div class="chips">' + opts.map(function (o) {
      var on = multi ? d[k].indexOf(o[0]) >= 0 : d[k] === o[0];
      return '<button type="button" class="chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-act="' + (multi ? 'tog' : 'set') + '" data-k="' + k + '" data-v="' + o[0] + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  var NUMS = { age: ['나이', 14, 90, '세'], height: ['키', 120, 220, 'cm'], weight: ['몸무게', 30, 200, 'kg'] };
  // 칸마다: '' = 괜찮음, 'empty' = 비었음, 'range' = 범위 밖
  function numState(d, k) { var v = d[k], r = NUMS[k]; return v === '' || v == null ? 'empty' : (v >= r[1] && v <= r[2]) ? '' : 'range'; }
  function profileCheck(d) {
    var n = d.days.length, ks = Object.keys(NUMS);
    var out = ks.filter(function (k) { return numState(d, k) === 'range'; });
    if (out.length) return out.map(function (k) { var r = NUMS[k]; return r[0] + '는 ' + r[1] + '~' + r[2] + r[3]; }).join(', ') + ' 사이로 적어 주세요. (지금 ' + out.map(function (k) { return NUMS[k][0] + ' ' + d[k] + NUMS[k][3]; }).join(', ') + ')';
    if (!d.sex) return '성별을 골라 주세요.';
    if (n < 2 || n > 4) return '요일을 2~4일 골라 주세요.';
    if (!d.goal) return '목표를 골라 주세요.';
    var empty = ks.filter(function (k) { return numState(d, k) === 'empty'; });
    if (empty.length) return empty.map(function (k) { return NUMS[k][0]; }).join('·') + '를 적어 주세요.';
    return '';
  }
  // 숫자를 칠 때는 화면을 다시 그리지 않고 안내 문구와 버튼만 바꾼다(다시 그리면 다음에 누른 칸·버튼이 사라진다)
  function refreshProfileCheck() {
    var w = document.getElementById('pfWarn'), b = document.getElementById('pfSave'); if (!w || !b) return;
    var chk = profileCheck(ui.draft); w.textContent = chk; w.hidden = !chk; b.disabled = !!chk;
    Object.keys(NUMS).forEach(function (k) { var el = document.querySelector('input[data-k="' + k + '"]'), bad = numState(ui.draft, k) === 'range'; if (el) { el.classList.toggle('bad', bad); el.setAttribute('aria-invalid', bad); } });
  }
  function vProfile(first) {
    if (!ui.draft) ui.draft = JSON.parse(JSON.stringify(S.profile || { sex: null, age: '', height: '', weight: '', goal: null, days: [0, 2, 4], minutes: 45, injuries: [] }));
    var d = ui.draft, chk = profileCheck(d), ok = !chk;
    var num = function (k, label, unit) { var bad = numState(d, k) === 'range'; return '<label class="num"><span>' + label + '</span><input type="number" inputmode="decimal" data-k="' + k + '" value="' + d[k] + '"' + (bad ? ' class="bad" aria-invalid="true"' : '') + '><em>' + unit + '</em></label>'; };
    return '<h1>' + (first ? '나에게 맞추기' : '내 정보 바꾸기') + '</h1>' + (first ? '<p class="muted">1분이면 끝나요. 나중에 언제든 바꿀 수 있습니다.</p>' : '') +
      '<section class="card form"><h3>성별</h3>' + chips('sex', [['m', '남'], ['f', '여']]) +
      '<div class="nums">' + num('age', '나이', '세') + num('height', '키', 'cm') + num('weight', '몸무게', 'kg') + '</div>' +
      '<h3>목표</h3>' + chips('goal', [['lose', '살 빼기'], ['muscle', '근육 늘리기'], ['fit', '체력 기르기']]) +
      '<h3>헬스장 가는 요일 <small>(2~4일, 하루씩 띄우면 좋아요)</small></h3>' + chips('days', WD.map(function (w, i) { return [i, w]; }), true) +
      '<h3>한 번에 쓸 수 있는 시간</h3>' + chips('minutes', [[30, '30분'], [45, '45분'], [60, '60분']]) +
      '<h3>아픈 부위 <small>(있으면 고르세요)</small></h3>' + chips('injuries', [['knee', '무릎'], ['lowback', '허리'], ['shoulder', '어깨']], true) +
      '<p class="muted">고른 부위에 무리가 가는 기구는 다른 기구로 바꿔 드려요.</p></section>' +
      '<p class="warn" id="pfWarn"' + (ok ? ' hidden' : '') + '>' + chk + '</p>' +
      '<button class="btn big" id="pfSave" data-act="saveProfile"' + (ok ? '' : ' disabled') + '>' + (first ? '내 운동 계획 만들기' : '저장') + '</button>' +
      (first ? '<p class="safe">지병이 있거나 약을 드시면 운동 전에 의사와 먼저 상의하세요.</p><button class="btn ghost" data-act="import">전에 내보낸 기록 불러오기</button>' : '<button class="btn ghost" data-act="nav" data-r="set">취소</button>');
  }

  // ---------- 화면: 운동 중 ----------
  function stepper(k, val, unit) {
    return '<div class="stepper"><button data-act="dec" data-k="' + k + '" aria-label="' + unit + ' 줄이기">−</button><div><b>' + val + '</b><small>' + unit + '</small></div><button data-act="inc" data-k="' + k + '" aria-label="' + unit + ' 늘리기">＋</button></div>';
  }
  function vWorkout() {
    var a = S.active, n = a.list.length, o = '<header class="wtop"><button class="link" data-act="leave">← 나가기</button><span>' + (a.phase === 'warm' ? '준비 운동' : a.phase === 'cool' ? '마무리' : (a.idx + 1) + ' / ' + n + ' 종목') + '</span></header>';
    o += '<div class="prog"><i style="width:' + Math.round(100 * (a.phase === 'warm' ? 0 : a.phase === 'cool' ? 1 : (a.idx + a.setIdx / a.sets) / n)) + '%"></i></div>';
    if (a.phase === 'warm') {
      return o + '<h1>준비 운동 5분</h1><section class="card"><ol class="how">' + D.WARM.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ol><p class="muted">몸이 따뜻해져야 다치지 않아요.</p></section><div class="dock"><button class="btn big" data-act="warmDone">준비 운동 끝 → 첫 종목</button></div>';
    }
    if (a.phase === 'cool') {
      return o + '<h1>마무리 스트레칭</h1><section class="card"><ul class="cool">' + D.COOL.map(function (c) { return '<li><b>' + c[0] + '</b>' + esc(c[1]) + '</li>'; }).join('') + '</ul><p class="muted">반동 없이, 시원하게 당기는 정도까지만.</p></section><div class="dock"><button class="btn big" data-act="finish">오늘 운동 끝내기</button></div>';
    }
    var id = a.list[a.idx], ex = D.EX[id], pl = a.plan[id];
    o += '<h1 class="exname">' + esc(ex.name) + '</h1><p class="muted center">' + esc(ex.part) + '</p>';
    if (a.phase !== 'feel') o += '<div class="wbody">'; // 세로가 짧은 화면에서는 무게·횟수 칸을 그림보다 위로 올린다(아래 고정 버튼에 가리지 않게)
    o += figs(ex);
    if (a.phase === 'feel') {
      return o + '<section class="card center"><h2>' + a.sets + '세트 끝! 어땠나요?</h2><p class="muted">다음 무게를 정하는 데 씁니다.</p><div class="feel"><button class="btn" data-act="feel" data-v="easy">가벼웠다</button><button class="btn" data-act="feel" data-v="ok">적당했다</button><button class="btn" data-act="feel" data-v="hard">힘들었다</button></div></section>';
    }
    o += '<p class="note">' + esc(pl.note) + '</p>';
    o += '<section class="card setbox"><h2>세트 ' + (a.setIdx + 1) + ' <small>/ ' + a.sets + '</small></h2>' + stepper('w', L.fmtKg(a.cur.w), 'kg') + stepper('r', a.cur.r, '번') +
      '<p class="muted center">목표 ' + L.TARGET + '번. 실제로 한 횟수로 고친 뒤 누르세요.</p></section></div>';
    o += '<section class="card">' + exText(ex, S.profile.injuries) + '</section>';
    if (pl.first) o += '<section class="card"><h3>시작 무게 맞추는 법</h3><p>' + kg(pl.w) + '은 어림한 시작 숫자예요. 첫 세트 12번을 해 보고,</p><ul class="rule"><li>5번 넘게 더 할 수 있었다 → <b>' + kg(ex.step) + ' 올리기</b></li><li>2~3번 더 할 수 있었다 → <b>그대로</b></li><li>12번을 못 채웠다 → <b>' + kg(ex.step) + ' 내리기</b></li></ul><p class="muted">기구에 같은 숫자가 없으면 바로 아래 숫자에 핀을 꽂으세요.</p></section>';
    o += '<div class="row2"><button class="btn ghost" data-act="defer">기구가 차 있어요<br><small>뒤로 미루기</small></button><button class="btn ghost" data-act="skip">이 운동<br><small>건너뛰기</small></button></div>';
    o += '<div class="dock"><button class="btn big" data-act="setDone">세트 끝 ✓</button></div>';
    if (a.restEnd) o += vRest(a, ex);
    return o;
  }
  function vRest(a, ex) {
    var o = '<div class="rest" role="dialog" aria-label="쉬는 시간"><p class="rl">쉬는 시간</p><div id="restNum" class="rnum">' + restLeft() + '</div>';
    if (a.calib) {
      o += '<h2>방금 첫 세트, 무게가 어땠나요?</h2><div class="calib"><button class="btn" data-act="calib" data-v="1">가벼웠다<small>5번 넘게 더 할 수 있었다 → ' + kg(ex.step) + ' 올림</small></button><button class="btn" data-act="calib" data-v="0">딱 좋다<small>2~3번 더 할 수 있었다 → 그대로</small></button><button class="btn" data-act="calib" data-v="-1">무거웠다<small>12번을 못 채웠다 → ' + kg(ex.step) + ' 내림</small></button></div>';
    } else {
      o += '<p class="next">다음: 세트 ' + (a.setIdx + 1) + ' / ' + a.sets + '<br><b>' + kg(a.cur.w) + ' × ' + L.TARGET + '번</b></p>';
    }
    return o + '<div class="row2"><button class="btn ghost" data-act="more">＋30초</button><button class="btn ghost" data-act="restSkip">쉬기 끝내기</button></div></div>';
  }
  function restLeft() { return S.active && S.active.restEnd ? Math.max(0, Math.ceil((S.active.restEnd - Date.now()) / 1000)) : 0; }
  function tick() {
    var a = S.active; if (!a || !a.restEnd) return;
    var el = document.getElementById('restNum'), left = restLeft();
    if (el) el.textContent = left;
    if (left <= 0) { a.restEnd = null; a.calib = false; save(); beep(); render(); }
  }
  setInterval(tick, 250);

  function enterEx() {
    var a = S.active;
    if (a.idx >= a.list.length) { a.phase = 'cool'; return; }
    var id = a.list[a.idx], lg = a.log[id];
    a.phase = 'ex'; a.setIdx = lg ? lg.sets.length : 0;
    a.cur = { w: lg && lg.sets.length ? lg.sets[lg.sets.length - 1].w : a.plan[id].w, r: L.TARGET };
    if (a.setIdx >= a.sets) a.phase = 'feel';
  }
  // 하던 운동을 기록으로 옮긴다. 날짜는 시작한 날, 걸린 시간은 마지막으로 누른 때(+마무리 몇 분)까지만 센다.
  function closeActive() {
    var a = S.active; if (!a) return null;
    var items = a.order.filter(function (id) { return a.log[id] && a.log[id].sets.length; }).map(function (id) { return { id: id, sets: a.log[id].sets, feel: a.log[id].feel || 'ok' }; });
    S.active = null; ui.inWorkout = false; if (wake) { wake.release().catch(function () {}); }
    if (!items.length) return null;
    var t0 = a.t0 || Date.now(), end = Math.min(Date.now(), a.tLast ? a.tLast + 15 * 60000 : t0 + 90 * 60000);
    var s = { d: L.dkey(new Date(t0)), type: a.type, min: Math.max(1, Math.round((end - t0) / 60000)), items: items };
    S.sessions.push(s); S.sessions.sort(function (x, y) { return x.d < y.d ? -1 : x.d > y.d ? 1 : 0; });
    return s;
  }
  function finish() {
    var s = closeActive(); ui.done = s;
    save(); go(s ? 'done' : 'home');
  }
  // 지난날 시작해 놓고 끝내기를 안 누른 운동은, 다음에 열 때 그날 기록으로 저장하고 오늘 할 운동을 보여준다
  function closeStale() {
    var a = S.active; if (!a || !a.t0) return false;
    var last = a.tLast || a.t0;
    if (L.dkey(new Date(a.t0)) === L.dkey() || Date.now() - last < 3 * 3600000) return false;
    var s = closeActive(); save();
    ui.notice = s ? '지난 ' + md(s.d) + ' (' + WD[L.dow(L.parseKey(s.d))] + ') 운동을 끝내기 전에 닫아서, 그날 한 ' + s.items.length + '가지를 그날 기록으로 저장했어요.' : '';
    return true;
  }
  function vDone() {
    var s = ui.done; if (!s) return vHome();
    var sets = 0, vol = 0; s.items.forEach(function (it) { it.sets.forEach(function (x) { sets++; vol += x.w * x.r; }); });
    var wk = L.weekStart(new Date()), cnt = S.sessions.filter(function (x) { return L.parseKey(x.d) >= wk; }).length;
    return '<h1>수고했어요! 🎉</h1><section class="card hero"><div class="stats"><div><b>' + s.items.length + '</b><small>종목</small></div><div><b>' + sets + '</b><small>세트</small></div><div><b>' + s.min + '</b><small>분</small></div></div>' +
      '<p>오늘 든 무게를 모두 더하면 <b>' + Math.round(vol).toLocaleString() + 'kg</b>. 이번 주 ' + cnt + '번째 운동이에요.</p><p class="muted">다음 운동은 ' + nextDayText() + '. 다음 무게는 오늘 기록을 보고 앱이 정해 둡니다.</p></section>' +
      '<button class="btn big" data-act="nav" data-r="home">처음 화면으로</button><button class="btn ghost" data-act="nav" data-r="diet">운동 뒤 먹는 요령 보기</button>';
  }

  // ---------- 화면: 변화 ----------
  function vRec() {
    var o = '<h1>변화</h1>';
    var ws = L.weekStart(new Date()), weeks = [];
    for (var i = 7; i >= 0; i--) {
      var a = new Date(ws); a.setDate(a.getDate() - 7 * i); var b = new Date(a); b.setDate(b.getDate() + 7);
      weeks.push({ label: i === 0 ? '이번 주' : md(L.dkey(a)), v: S.sessions.filter(function (s) { var d = L.parseKey(s.d); return d >= a && d < b; }).map(function (s) { return s.d; }).filter(function (d, j, arr) { return arr.indexOf(d) === j; }).length });
    }
    o += '<section class="card"><h2>일주일에 간 횟수</h2><p class="muted">목표: 일주일에 ' + S.profile.days.length + '번 · 최근 8주 (막대를 누르면 숫자가 보여요)</p>' + barChart('wk', weeks, '번') + '</section>';
    var used = Object.keys(D.EX).filter(function (id) { return S.sessions.some(function (s) { return s.items.some(function (x) { return x.id === id; }); }); });
    o += '<section class="card"><h2>운동별 무게</h2>';
    if (!used.length) o += '<p class="muted">첫 운동을 마치면 여기에 무게 변화가 그려져요.</p>';
    else {
      if (used.indexOf(ui.chartEx) < 0) ui.chartEx = used[0];
      o += '<select class="sel" data-act="chartEx" aria-label="운동 고르기">' + used.map(function (id) { return '<option value="' + id + '"' + (id === ui.chartEx ? ' selected' : '') + '>' + esc(D.EX[id].name) + '</option>'; }).join('') + '</select>';
      var pts = []; S.sessions.forEach(function (s) { s.items.forEach(function (x) { if (x.id === ui.chartEx) pts.push({ d: s.d, v: Math.max.apply(null, x.sets.map(function (t) { return t.w; })) }); }); });
      o += '<p class="muted">그날 가장 무겁게 든 세트의 무게(kg)</p>' + lineChart('ex', pts.slice(-24), 'kg');
    }
    o += '</section><section class="card"><h2>몸무게</h2><div class="bwrow"><label class="num"><span>오늘 몸무게</span><input id="bwIn" type="number" inputmode="decimal" step="0.1" value="' + esc(ui.bwVal != null ? ui.bwVal : (S.bw.length ? S.bw[S.bw.length - 1].v : S.profile.weight)) + '"' + (ui.bwMsg && ui.bwVal != null ? ' class="bad" aria-invalid="true"' : '') + '><em>kg</em></label><button class="btn" data-act="bwSave">기록</button></div>' +
      (ui.bwMsg ? '<p class="' + (ui.bwVal != null ? 'warn' : 'muted') + '" role="status">' + esc(ui.bwMsg) + '</p>' : '') +
      (S.bw.length ? lineChart('bw', S.bw.slice(-24), 'kg') : '<p class="muted">같은 시간(아침 화장실 다녀온 뒤)에 일주일에 한 번만 재도 충분해요.</p>') + '</section>';
    o += '<section class="card"><h2>지난 운동</h2>';
    if (!S.sessions.length) o += '<p class="muted">아직 없어요.</p>';
    S.sessions.slice(-10).reverse().forEach(function (s) {
      o += '<details class="sess"><summary>' + md(s.d) + ' (' + WD[L.dow(L.parseKey(s.d))] + ') · 온몸 ' + s.type + ' · ' + s.items.length + '종목</summary><ul>' + s.items.map(function (x) { return '<li>' + esc(D.EX[x.id] ? D.EX[x.id].name : x.id) + ' — ' + x.sets.map(function (t) { return L.fmtKg(t.w) + '×' + t.r; }).join(', ') + '</li>'; }).join('') + '</ul></details>';
    });
    return o + '</section>';
  }

  // ---------- 화면: 식사 ----------
  function vDiet() {
    var p = S.profile, d = L.diet(p), o = '<h1>식사</h1><section class="card hero"><p class="muted">목표: ' + D.GOAL[p.goal] + ' · ' + p.weight + 'kg 기준</p><div class="stats"><div><b>' + d.kcal.toLocaleString() + '</b><small>하루 열량 kcal</small></div><div><b>' + d.protein + '</b><small>하루 단백질 g</small></div></div>' +
      '<p class="muted">' + (p.goal === 'lose' ? '쓰는 양보다 400kcal쯤 적게' : p.goal === 'muscle' ? '쓰는 양보다 250kcal쯤 많게' : '쓰는 양만큼') + ' 잡은 어림값이에요. 2주 동안 몸무게가 생각과 다르게 움직이면 밥 양을 반 공기씩 조절하세요.</p></section>';
    o += '<section class="card"><h2>이렇게 먹으면 채워져요 <small>하루 예시</small></h2>';
    Object.keys(d.meals).forEach(function (m) { if (d.meals[m].length) o += '<h3>' + m + '</h3><ul class="meal">' + d.meals[m].map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; });
    o += '<p class="total">합계 약 ' + d.sumK.toLocaleString() + 'kcal · 단백질 약 ' + d.sumP + 'g</p><p class="muted">밥 한 공기 = 즉석밥 1개(210g). 닭가슴살 대신 생선·두부·계란 등 좋아하는 단백질 반찬으로 바꿔도 됩니다. 음식마다 실제 열량은 조금씩 달라요.</p></section>';
    o += '<section class="card"><h2>먹는 요령</h2><ul class="meal">' + D.TIPS[p.goal].map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></section>';
    return o + '<p class="safe">당뇨·신장 질환 등 식사 조절이 필요한 병이 있으면 의사와 먼저 상의하세요.</p>';
  }

  // ---------- 화면: 동작 그림 모음 ----------
  function vGuide() {
    var o = '<h1>동작 그림</h1><p class="muted">내 계획에 나올 수 있는 기구 운동 전부입니다.</p>';
    Object.keys(D.EX).forEach(function (id) { var ex = D.EX[id]; o += '<section class="card" id="g-' + id + '"><h2>' + esc(ex.name) + ' <span class="tag">' + esc(ex.part) + '</span></h2>' + figs(ex) + exText(ex, S.profile.injuries) + '</section>'; });
    return o;
  }

  // ---------- 화면: 설정 ----------
  function vSet() {
    var p = S.profile, standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
    return '<h1>설정</h1><section class="card"><h2>내 정보</h2><p>' + (p.sex === 'f' ? '여' : '남') + ' · ' + p.age + '세 · ' + p.height + 'cm · ' + p.weight + 'kg<br>' + D.GOAL[p.goal] + ' · ' + p.days.map(function (d) { return WD[d]; }).join('·') + ' · ' + p.minutes + '분' + (p.injuries.length ? '<br>아픈 부위: ' + p.injuries.map(function (i) { return D.INJ[i]; }).join(', ') : '') + '</p><button class="btn" data-act="editProfile">바꾸기</button></section>' +
      '<section class="card"><h2>화면</h2><div class="chips">' + [['auto', '자동'], ['light', '밝게'], ['dark', '어둡게']].map(function (t) { return '<button class="chip' + (S.opt.theme === t[0] ? ' on' : '') + '" data-act="theme" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<h2>쉬는 시간 끝 알림 소리</h2><div class="chips"><button class="chip' + (S.opt.sound ? ' on' : '') + '" data-act="sound" data-v="1">켜기</button><button class="chip' + (!S.opt.sound ? ' on' : '') + '" data-act="sound" data-v="0">끄기</button><button class="chip" data-act="testBeep">소리 들어보기</button></div><p class="muted">아이폰은 옆면 무음 스위치가 켜져 있으면 소리가 나지 않고, 진동은 지원하지 않습니다. 운동 중에는 화면이 꺼지지 않게 해 둡니다.</p></section>' +
      '<section class="card"><h2>동작 그림 모음</h2><button class="btn" data-act="nav" data-r="guide">모든 기구 그림 보기</button></section>' +
      '<section class="card"><h2>기록 보관</h2><p class="muted">기록은 이 휴대폰 안에만 있어요. 휴대폰을 바꾸거나 인터넷 기록을 지우기 전에 파일로 내보내 두세요.</p><button class="btn" data-act="export">기록 파일로 내보내기</button><button class="btn" data-act="import">기록 파일 불러오기</button><button class="btn danger" data-act="reset">모든 기록 지우기</button>' + (ui.msg ? '<p class="note">' + esc(ui.msg) + '</p>' : '') + '</section>' +
      (standalone ? '' : '<section class="card"><h2>홈 화면에 추가하기</h2><p>Safari 아래쪽 <b>공유 버튼(□↑)</b> → <b>홈 화면에 추가</b>를 누르면 앱처럼 열리고 인터넷 없이도 됩니다.</p><p class="warn">⚠ Safari에서 쓰던 기록은 홈 화면 앱으로 넘어가지 않아요. 먼저 홈 화면에 추가한 뒤 거기서 시작하세요.</p></section>') +
      '<p class="safe">이 앱은 일반적인 운동 안내이며 진료를 대신하지 않습니다.</p>';
  }

  // ---------- 그리기 ----------
  var TABS = [['home', '오늘', '🏋️'], ['rec', '변화', '📈'], ['diet', '식사', '🍚'], ['set', '설정', '⚙️']];
  function render() {
    var r = route(), html, nav = true;
    if (!S.profile) { html = vProfile(true); nav = false; }
    else if (ui.inWorkout && S.active) { html = vWorkout(); nav = false; }
    else if (r === 'profile') { html = vProfile(false); nav = false; }
    else html = r === 'rec' ? vRec() : r === 'diet' ? vDiet() : r === 'set' ? vSet() : r === 'guide' ? vGuide() : r === 'done' ? vDone() : vHome();
    var keepScroll = app.dataset.view === (ui.inWorkout ? 'w' + (S.active && S.active.idx) + (S.active && S.active.phase) : r) ? window.scrollY : 0;
    app.dataset.view = ui.inWorkout ? 'w' + (S.active && S.active.idx) + (S.active && S.active.phase) : r;
    app.innerHTML = '<main class="' + (nav ? '' : 'nonav') + '">' + html + '</main>' + (nav ? '<nav class="tabs">' + TABS.map(function (t) { return '<a href="#' + t[0] + '" class="' + ((r === t[0]) || (t[0] === 'home' && TABS.every(function (x) { return x[0] !== r; })) || (t[0] === 'set' && r === 'guide') ? 'on' : '') + '"><i>' + t[2] + '</i>' + t[1] + '</a>'; }).join('') + '</nav>' : '');
    window.scrollTo(0, keepScroll);
    if (ui.scrollTo) { var el = document.getElementById(ui.scrollTo); ui.scrollTo = null; if (el) el.scrollIntoView(); }
  }
  window.addEventListener('hashchange', function () { ui.msg = ''; ui.bwMsg = ''; ui.bwVal = null; if (route() !== 'profile') ui.draft = null; render(); });

  // ---------- 누르기 ----------
  var ACT = {
    nav: function (d) { go(d.r); },
    set: function (d) { ui.draft[d.k] = isNaN(+d.v) ? d.v : +d.v; render(); },
    tog: function (d) { var v = isNaN(+d.v) ? d.v : +d.v, arr = ui.draft[d.k], i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); arr.sort(); render(); },
    saveProfile: function () {
      var first = !S.profile, d = ui.draft;
      if (profileCheck(d)) { refreshProfileCheck(); return; }
      if (first || !S.bw.length || S.profile.weight !== d.weight) { var t = L.dkey(); S.bw = S.bw.filter(function (x) { return x.d !== t; }); S.bw.push({ d: t, v: d.weight }); }
      S.profile = d; ui.draft = null; save(); go(first ? 'home' : 'set');
    },
    editProfile: function () { ui.draft = null; go('profile'); },
    guide: function (d) { ui.scrollTo = 'g-' + d.id; go('guide'); },
    start: function () {
      unlockAudio();
      var p = todayPlan(), plan = {}; p.items.forEach(function (it) { plan[it.id] = { w: it.rec.w, first: it.rec.first, note: it.rec.note }; });
      var list = p.items.map(function (it) { return it.id; });
      S.active = { t0: Date.now(), type: p.type, list: list, order: list.slice(), plan: plan, sets: p.v.sets, rest: p.v.rest, idx: 0, setIdx: 0, phase: 'warm', log: {}, cur: null, restEnd: null, calib: false, tLast: Date.now() };
      ui.notice = ''; ui.inWorkout = true; save(); keepAwake(); render();
    },
    resume: function () { unlockAudio(); ui.inWorkout = true; keepAwake(); render(); },
    abandon: function () { if (confirm('여기서 그만둘까요? 지금까지 한 세트는 저장됩니다.')) finish(); },
    leave: function () { ui.inWorkout = false; go('home'); },
    warmDone: function () { unlockAudio(); enterEx(); save(); render(); },
    inc: function (d) { var a = S.active, ex = D.EX[a.list[a.idx]]; if (d.k === 'w') a.cur.w = Math.min(500, a.cur.w + ex.step); else a.cur.r = Math.min(50, a.cur.r + 1); save(); render(); },
    dec: function (d) { var a = S.active, ex = D.EX[a.list[a.idx]]; if (d.k === 'w') a.cur.w = Math.max(ex.step, a.cur.w - ex.step); else a.cur.r = Math.max(1, a.cur.r - 1); save(); render(); },
    setDone: function () {
      unlockAudio();
      var a = S.active, id = a.list[a.idx], lg = a.log[id] || (a.log[id] = { sets: [] });
      if (a.cur.r < 1) return;
      lg.sets.push({ w: a.cur.w, r: a.cur.r }); a.setIdx++; a.tLast = Date.now();
      if (a.setIdx >= a.sets) { a.phase = 'feel'; a.restEnd = null; }
      else { a.calib = a.plan[id].first && a.setIdx === 1; a.cur.r = L.TARGET; a.restEnd = Date.now() + a.rest * 1000; }
      save(); render();
    },
    calib: function (d) {
      var a = S.active, id = a.list[a.idx], ex = D.EX[id];
      if (+d.v && a.log[id] && a.log[id].sets[0]) a.log[id].sets[0].c = 1; // 무게를 바꿨으면 첫 세트는 무게 맞추기용으로 표시
      a.cur.w = Math.max(ex.step, a.cur.w + (+d.v) * ex.step); a.calib = false; save(); render(); },
    more: function () { S.active.restEnd += 30000; save(); tick(); },
    restSkip: function () { S.active.restEnd = null; S.active.calib = false; save(); render(); },
    feel: function (d) { var a = S.active; a.log[a.list[a.idx]].feel = d.v; a.tLast = Date.now(); a.idx++; enterEx(); save(); render(); },
    defer: function () { var a = S.active; if (a.idx >= a.list.length - 1) { alert('마지막 종목이라 미룰 수 없어요. 기다리거나 건너뛰세요.'); return; } a.list.push(a.list.splice(a.idx, 1)[0]); enterEx(); save(); render(); },
    skip: function () { var a = S.active; if (!confirm('이 운동을 건너뛸까요?')) return; a.list.splice(a.idx, 1); enterEx(); save(); render(); },
    finish: function () { finish(); },
    pick: function (d) { ui.pick[d.chart] = +d.i; render(); },
    bwSave: function () {
      var inp = document.getElementById('bwIn'), raw = inp.value.trim(), v = parseFloat(raw);
      if (!(v >= 30 && v <= 200)) { ui.bwMsg = raw === '' ? '몸무게를 적고 눌러 주세요.' : '몸무게는 30~200kg 사이로 적어 주세요. (지금 ' + raw + 'kg) 저장하지 않았어요.'; ui.bwVal = raw; render(); var el = document.getElementById('bwIn'); if (el) el.focus(); return; }
      var t = L.dkey(); S.bw = S.bw.filter(function (x) { return x.d !== t; }); S.bw.push({ d: t, v: Math.round(v * 10) / 10 }); S.profile.weight = Math.round(v * 10) / 10; ui.pick.bw = null; ui.bwVal = null; ui.bwMsg = '오늘 몸무게를 ' + L.fmtKg(v) + 'kg으로 기록했어요.'; save(); render(); },
    theme: function (d) { S.opt.theme = d.v; applyTheme(); save(); render(); },
    sound: function (d) { S.opt.sound = d.v === '1'; save(); render(); },
    testBeep: function () { unlockAudio(); setTimeout(beep, 50); },
    export: function () {
      var name = 'workout-coach-' + L.dkey() + '.json', txt = JSON.stringify(S, null, 1);
      try {
        var file = new File([txt], name, { type: 'application/json' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file] }).catch(function () {}); return; }
      } catch (e) {}
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      ui.msg = '파일로 내보냈어요: ' + name; render();
    },
    import: function () { document.getElementById('file').click(); },
    reset: function () { if (confirm('모든 기록과 내 정보를 지울까요? 되돌릴 수 없습니다.') && confirm('정말 지울까요?')) { localStorage.removeItem(KEY); location.hash = ''; location.reload(); } }
  };
  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t || t.tagName === 'SELECT' || t.disabled) return;
    if (t.tagName === 'A') e.preventDefault();
    var f = ACT[t.dataset.act]; if (f) f(t.dataset);
  });
  app.addEventListener('input', function (e) { var t = e.target; if (ui.draft && t.dataset.k) { ui.draft[t.dataset.k] = parseFloat(t.value) || ''; refreshProfileCheck(); } });
  app.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.act === 'chartEx') { ui.chartEx = t.value; ui.pick.ex = null; render(); }
  });
  document.getElementById('file').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var o = JSON.parse(rd.result);
        if (!validState(o)) throw 0;
        if (S.sessions.length && !confirm('지금 기록을 파일 내용으로 바꿀까요?')) return;
        S = fromValid(o); S.active = null; ui.inWorkout = false;
        save(); applyTheme(); ui.draft = null; ui.msg = '기록을 불러왔어요.'; go('home');
      } catch (err) { alert('이 앱에서 내보낸 파일이 아니에요.'); }
    };
    rd.readAsText(f); e.target.value = '';
  });

  applyTheme();
  closeStale();
  if (S.active) ui.inWorkout = true; // 운동 중에 창이 닫혔다 다시 열리면 하던 곳으로
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(function () {});
})();
