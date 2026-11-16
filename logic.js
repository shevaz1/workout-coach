/* 코칭 규칙: 화면과 무관한 계산만 모아 둔다. */
(function (root) {
  var D = root.WC_DATA || require('./data.js');
  var TARGET = 12, MIN_OK = 8;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dkey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dow(d) { return ((d || new Date()).getDay() + 6) % 7; } // 월=0 … 일=6
  function weekStart(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - dow(x)); return x; }
  function fmtKg(v) { return (Math.round(v * 10) / 10).toString(); }

  function roundStep(v, step) { return Math.round(v / step) * step; }

  // 처음 시작 무게: 몸무게 × 종목별 비율(성별) × 나이 보정, 기구 한 칸 단위로 맞춤
  function startWeight(ex, p) {
    var bw = Math.min(p.weight, p.sex === 'f' ? 75 : 90);
    var f = p.sex === 'f' ? ex.f[1] : ex.f[0];
    var a = p.age >= 60 ? 0.7 : p.age >= 50 ? 0.85 : 1;
    return Math.max(5, roundStep(bw * f * a, ex.step));
  }

  function est(n, sets, rest) { return (5 * 60 + n * sets * (45 + rest) + n * 60 + 4 * 60) / 60; } // 준비 5분 + 세트 + 기구 옮기기 + 마무리 4분

  // 고른 시간 안에 끝나는 가장 많은 양을 고른다. 모자라면 쉬는 시간을 15초씩 줄인다(최소 60초).
  function volume(p) {
    var t = +p.minutes || 45, def = p.goal === 'muscle' ? 90 : 60;
    var cand = [[6, 3], [5, 3], [5, 2], [4, 2]];
    for (var i = 0; i < cand.length; i++) {
      for (var r = def; r >= 60; r -= 15) if (est(cand[i][0], cand[i][1], r) <= t) return { n: cand[i][0], sets: cand[i][1], rest: r, reps: TARGET };
    }
    return { n: 4, sets: 2, rest: 60, reps: TARGET };
  }

  function estMinutes(p, n) {
    var v = volume(p);
    return Math.round(est(n || v.n, v.sets, v.rest));
  }

  // 오늘 종목 목록: 시간에 맞춰 줄이고, 아픈 부위에 걸리는 종목은 바꾼다
  function buildDay(p, type) {
    var day = D.DAYS[type], v = volume(p), inj = p.injuries || [];
    var bad = function (id) { return D.EX[id].avoid.some(function (a) { return inj.indexOf(a) >= 0; }); };
    var cut = day.drop.slice(0, Math.max(0, day.list.length - v.n));
    var base = day.list.filter(function (id) { return cut.indexOf(id) < 0; });
    var out = [], swaps = [];
    base.forEach(function (id) {
      if (!bad(id)) { out.push(id); return; }
      var alt = D.EX[id].alt.filter(function (a) { return !bad(a) && out.indexOf(a) < 0 && base.indexOf(a) < 0; })[0];
      if (alt) { out.push(alt); swaps.push([id, alt]); } else swaps.push([id, null]);
    });
    D.FILL.forEach(function (id) { if (out.length < v.n && !bad(id) && out.indexOf(id) < 0) out.push(id); });
    return { list: out, swaps: swaps };
  }

  function nextType(sessions) {
    var last = sessions[sessions.length - 1];
    return last && last.type === 'A' ? 'B' : 'A';
  }

  function lastOf(sessions, id) {
    for (var i = sessions.length - 1; i >= 0; i--) {
      var it = sessions[i].items.filter(function (x) { return x.id === id && x.sets.length; })[0];
      if (it) return { item: it, d: sessions[i].d };
    }
    return null;
  }

  // 다음 무게 정하기
  function recommend(id, profile, sessions, today) {
    var ex = D.EX[id], last = lastOf(sessions, id);
    if (!last) return { w: startWeight(ex, profile), first: true, note: '처음 하는 기구예요. 가볍게 시작하고 첫 세트 뒤에 무게를 맞춥니다.' };
    var sets = last.item.sets, base = sets[sets.length - 1].w;
    // 첫날 무게 맞추기용 세트(앱 안내로 무게를 바꾼 첫 세트)는 판단에서 뺀다
    var real = sets.filter(function (s) { return !s.c; });
    var calibDown = real.length < sets.length && sets.some(function (s) { return s.c && s.w > base; });
    if (real.length) sets = real;
    var minR = Math.min.apply(null, sets.map(function (s) { return s.r; }));
    var gap = Math.round((parseKey(today || dkey()) - parseKey(last.d)) / 864e5);
    var w = base, note;
    if (gap > 21) { w = base - ex.step; note = '3주 넘게 쉬어서 한 칸 낮춰 다시 시작해요.'; }
    else if (minR < MIN_OK) { w = base - ex.step; note = '지난번에 ' + MIN_OK + '번을 못 채운 세트가 있어 ' + fmtKg(ex.step) + 'kg 내렸어요.'; }
    else if (minR >= TARGET && calibDown) note = '첫날 무거워서 낮춘 무게예요. 이 무게로 한 번 더 해 보고 올려요.';
    else if (minR >= TARGET && last.item.feel !== 'hard') { w = base + ex.step; note = '지난번에 모든 세트 ' + TARGET + '번 성공! ' + fmtKg(ex.step) + 'kg 올렸어요.'; }
    else if (minR >= TARGET) note = '지난번에 힘들었다고 해서 같은 무게로 한 번 더 해요.';
    else note = '모든 세트 ' + TARGET + '번을 채우면 다음에 올려요. 지난번과 같은 무게.';
    return { w: Math.max(ex.step, w), first: false, note: note, last: last };
  }

  // 식사 목표와 하루 식단 예시
  function diet(p) {
    var bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'f' ? -161 : 5);
    var days = (p.days || []).length || 3;
    var tdee = bmr * (1.25 + 0.05 * days);
    var kcal = tdee + (p.goal === 'lose' ? -400 : p.goal === 'muscle' ? 250 : 0);
    kcal = Math.max(kcal, p.sex === 'f' ? 1200 : 1500);
    kcal = Math.round(kcal / 50) * 50;
    var h = p.height / 100, refW = Math.min(p.weight, 25 * h * h);
    var protein = Math.round(refW * (p.goal === 'fit' ? 1.2 : 1.6) / 5) * 5;

    // 밥·간식에도 단백질이 조금 들어 있으므로, 합계가 목표를 넘으면 단백질 반찬 기준을 낮춰 다시 짠다
    // 단백질 반찬 기준을 여러 값으로 짜 보고, 합계가 목표에 가장 가깝게(모자라는 쪽은 더 나쁘게) 맞는 식단을 고른다
    var plan = null, best = Infinity;
    for (var t = protein - 30; t <= protein + 15; t++) {
      var c = mealPlan(kcal, t), dp = c.sumP - protein;
      var score = (dp < 0 ? -dp * 3 : dp) + Math.abs(c.sumK - kcal) / 40 + (c.meals['저녁'].length < 3 ? 4 : 0);
      if (score < best) { best = score; plan = c; }
    }
    plan.kcal = kcal; plan.protein = protein;
    return plan;
  }

  function mealPlan(kcal, protein) {
    var meals = { '아침': [], '점심': [], '저녁': [], '간식': [] }, sum = { k: 0, p: 0 };
    var rice = { '아침': 0, '점심': 1, '저녁': 1 };
    var add = function (meal, name, k, pr) { meals[meal].push(name); sum.k += k; sum.p += pr; };
    add('아침', '삶은 계란 1개', 75, 6); add('아침', '바나나 1개', 100, 1);
    add('점심', '채소 반찬·김치 넉넉히', 50, 3); add('저녁', '채소 반찬·쌈채소 넉넉히', 50, 3);
    sum.k += 310; sum.p += 6; // 밥 반 공기 × 2
    // 단백질 반찬은 목표 숫자에 닿을 때까지만 넣는다(목표를 8g 넘게 넘기는 것은 건너뜀)
    var prot = [['점심', '닭가슴살 100g (시판 1팩)', 120, 23], ['저녁', '돼지 안심·소고기 살코기·생선 중 하나 100g', 160, 22], ['아침', '삶은 계란 1개 더', 75, 6], ['아침', '무가당 그릭요거트 100g', 100, 8], ['간식', '단백질 쉐이크 1잔 (물에 타서)', 120, 22], ['저녁', '두부 반 모(150g)', 125, 13], ['간식', '우유 200ml', 130, 6], ['간식', '삶은 계란 2개', 150, 12], ['점심', '닭가슴살 100g 추가', 120, 23]];
    prot.forEach(function (x) { if (sum.p < protein - 5 && sum.p + x[3] <= protein + 8 && sum.k + x[2] <= kcal + 60) add.apply(null, x); });
    var carb = [['r', '점심'], ['r', '저녁'], ['간식', '고구마 중간 크기 1개', 170, 2], ['r', '아침'], ['간식', '견과류 한 줌(25g)', 150, 5], ['r', '점심'], ['r', '저녁'], ['간식', '바나나 1개', 100, 1], ['r', '아침'], ['간식', '우유 200ml 한 잔 더', 130, 6], ['간식', '고구마 1개 더', 170, 2], ['간식', '견과류 한 줌 더', 150, 5]];
    carb.forEach(function (c) {
      var k = c[0] === 'r' ? 155 : c[2];
      if (kcal - sum.k < k * 0.6) return;
      if (c[0] === 'r') { rice[c[1]]++; sum.k += 155; sum.p += 3; } else add.apply(null, c);
    });
    var riceTxt = { 1: '밥 반 공기', 2: '밥 한 공기', 3: '밥 한 공기 반' };
    ['아침', '점심', '저녁'].forEach(function (m) { if (rice[m]) meals[m].unshift(riceTxt[rice[m]]); });
    return { meals: meals, sumK: Math.round(sum.k / 10) * 10, sumP: Math.round(sum.p) };
  }

  var L = { TARGET: TARGET, dkey: dkey, parseKey: parseKey, dow: dow, weekStart: weekStart, fmtKg: fmtKg, startWeight: startWeight, volume: volume, estMinutes: estMinutes, buildDay: buildDay, nextType: nextType, recommend: recommend, diet: diet };
  root.WC_LOGIC = L;
  if (typeof module !== 'undefined') module.exports = L;
})(typeof window !== 'undefined' ? window : globalThis);
