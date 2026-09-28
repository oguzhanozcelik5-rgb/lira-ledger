/* Lira Ledger: spending in lira, seen in pounds. Everything is stored on the phone. */
(function () {
  'use strict';

  const KEY = 'ledger.v1';
  // Bank of England monthly average GBP/TRY. Used for entries imported without a rate.
  const MONTH_RATES = {
    '2026-01': 58.41, '2026-02': 59.29, '2026-03': 58.93, '2026-04': 60.41, '2026-05': 61.39,
    '2026-06': 61.73, '2026-07': 63.09, '2026-08': 64.78, '2026-09': 65.22,
  };
  const DEFAULT_CATS = [
    ['Kahve', '☕', '#8CC8F0', 'e'], ['Dışarıda Yemek', '🍔', '#F4A283', 'e'], ['Groceries', '🛒', '#F2C94C', 'e'],
    ['Ev', '🏡', '#6FA3C7', 'e'], ['Gifts', '🎁', '#B28DFF', 'e'], ['Ulaşım', '🚕', '#F28B5B', 'e'],
    ['Subscriptions', '🔄', '#F4A7C8', 'e'], ['Seyahat', '✈️', '#A9C8F5', 'e'], ['Fashion', '👕', '#D39BF0', 'e'],
    ['Healthcare', '💊', '#7FD6B4', 'e'], ['Eğlence', '🎉', '#9BA2F5', 'e'], ['Şeyma', '💝', '#FF8FA5', 'e'],
    ['Family', '👨‍👩‍👧', '#B8C2FF', 'e'], ['Diğer Gider', '📦', '#B5BAC1', 'e'],
    ['Maaş', '💷', '#6FD3A0', 'i'], ['Diğer Gelir', '💰', '#A8E3C3', 'i'],
  ].map(([name, emoji, color, type]) => ({ id: name, name, emoji, color, type }));
  const SWATCHES = ['#8CC8F0', '#6FA3C7', '#A9C8F5', '#9BA2F5', '#B8C2FF', '#B28DFF', '#D39BF0', '#F4A7C8', '#FF8FA5', '#F28B5B', '#F4A283', '#F2C94C', '#7FD6B4', '#6FD3A0', '#B5BAC1'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  let S = {
    items: [], cats: DEFAULT_CATS,
    settings: { rate: 64.86, rateAt: Date.parse('2026-09-25T12:00:00Z'), rateSource: 'Bank of England', autoRate: true, budget: null, gbpFirst: false },
  };
  const UI = { view: 'home', range: 'month', offset: 0, kind: 'e', cat: null, slot: null, q: '', hcat: null, days: 20 };

  /* ---------- storage ---------- */
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && Array.isArray(d.items)) {
        S.items = d.items;
        if (Array.isArray(d.cats) && d.cats.length) S.cats = d.cats;
        S.settings = Object.assign({}, S.settings, d.settings || {});
      }
      const u = JSON.parse(localStorage.getItem(KEY + '.ui') || '{}');
      if (u.view) UI.view = u.view;
      if (u.range) UI.range = u.range;
    } catch (e) { /* start fresh */ }
    S.items.sort((a, b) => b.ts - a.ts);
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save. Is the phone out of space?'); }
  }
  function saveUI() { try { localStorage.setItem(KEY + '.ui', JSON.stringify({ view: UI.view, range: UI.range })); } catch (e) { } }

  /* ---------- helpers ---------- */
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = {};
  const fmt = (loc, n, d) => (nf[loc + d] || (nf[loc + d] = new Intl.NumberFormat(loc, { minimumFractionDigits: d, maximumFractionDigits: d }))).format(n);
  const TL = (n, d = 0) => '₺' + fmt('tr-TR', n, d);
  const GBP = (n, d = 0) => '£' + fmt('en-GB', n, d);
  const tl = (it) => (it.cur === 'GBP' ? it.amt * it.rate : it.amt);
  const gb = (it) => (it.cur === 'GBP' ? it.amt : it.amt / (it.rate || S.settings.rate));
  const sumT = (a) => a.reduce((s, i) => s + tl(i), 0);
  const sumG = (a) => a.reduce((s, i) => s + gb(i), 0);
  // main + secondary text for a lira/pound pair, following the "pounds first" setting
  const pair = (t, g, d = 0) => (S.settings.gbpFirst ? [GBP(g, d), TL(t, d)] : [TL(t, d), GBP(g, d)]);
  const mkey = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const cat = (id) => S.cats.find((c) => c.id === id) || { id, name: id, emoji: '•', color: '#B5BAC1', type: 'e' };
  const uid = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const sod = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d; };
  const hhmm = (ts) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const lower = (s) => String(s || '').toLocaleLowerCase('tr');
  function dayName(d) {
    const diff = Math.round((sod(Date.now()) - sod(d)) / 864e5);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: new Date(d).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
  }
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 2300);
  }
  function bounds(range, off) {
    const now = new Date(); let a, b;
    if (range === 'week') { a = sod(now); a.setDate(a.getDate() - ((a.getDay() + 6) % 7) + 7 * off); b = new Date(a); b.setDate(a.getDate() + 7); }
    else if (range === 'month') { a = new Date(now.getFullYear(), now.getMonth() + off, 1); b = new Date(a.getFullYear(), a.getMonth() + 1, 1); }
    else { a = new Date(now.getFullYear() + off, 0, 1); b = new Date(a.getFullYear() + 1, 0, 1); }
    return [a, b];
  }
  const between = (a, b) => S.items.filter((i) => i.ts >= +a && i.ts < +b);
  // what the previous period had spent by the same point, so a half-finished month is compared fairly
  function samePointBefore(range, off, kind) {
    const [a, b] = bounds(range, off), [pa, pb] = bounds(range, off - 1), now = Date.now();
    let prev = between(pa, pb).filter((i) => i.type === kind);
    if (now >= +a && now < +b) { const cut = +pa + (pb - pa) * ((now - a) / (b - a)); prev = prev.filter((i) => i.ts < cut); }
    return prev;
  }
  const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

  /* ---------- live rate ---------- */
  async function refreshRate(force) {
    if (!S.settings.autoRate && !force) return;
    const sources = [
      ['https://open.er-api.com/v6/latest/GBP', (j) => j && j.rates && j.rates.TRY, 'open.er-api.com'],
      ['https://api.frankfurter.app/latest?from=GBP&to=TRY', (j) => j && j.rates && j.rates.TRY, 'ECB via Frankfurter'],
    ];
    for (const [url, pick, name] of sources) {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) continue;
        const v = pick(await r.json());
        if (v > 0) {
          S.settings.rate = Math.round(v * 100) / 100; S.settings.rateAt = Date.now(); S.settings.rateSource = name;
          save(); renderRate(); if (UI.view === 'settings') renderSettings();
          return true;
        }
      } catch (e) { /* offline: keep the last rate */ }
    }
    return false;
  }
  function renderRate() {
    const fresh = Date.now() - (S.settings.rateAt || 0) < 36 * 36e5;
    const c = $('#rateChip');
    c.className = 'rate' + (fresh ? ' live' : '');
    c.innerHTML = `<i></i><span class="num">£1 = ${TL(S.settings.rate, 2)}</span>`;
  }

  /* ---------- views ---------- */
  function go(v) {
    UI.view = v; UI.days = 20; saveUI();
    document.querySelectorAll('.view').forEach((s) => (s.hidden = s.id !== 'v-' + v));
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-current', t.dataset.v === v ? 'page' : 'false'));
    $('#main').scrollTop = 0;
    render();
  }
  function render() {
    renderRate();
    ({ home: renderHome, stats: renderStats, history: renderHistory, settings: renderSettings })[UI.view]();
  }

  function row(it) {
    const c = cat(it.cat), inc = it.type === 'i';
    const main = it.cur === 'GBP' ? GBP(it.amt, 2) : TL(it.amt, 2);
    const alt = it.cur === 'GBP' ? TL(tl(it)) : GBP(gb(it), 2);
    const sub = hhmm(it.ts) + (it.note && it.note !== c.name ? ' · ' + c.name : '');
    return `<button class="tx" data-id="${esc(it.id)}"><span class="ico" style="background:${esc(c.color)}">${esc(c.emoji)}</span>` +
      `<div><div class="n">${esc(it.note || c.name)}</div><div class="m">${esc(sub)}</div></div>` +
      `<div class="a num${inc ? ' in' : ''}">${inc ? '+' : '−'}${main}<small>${alt}</small></div></button>`;
  }
  function days(items, limit) {
    if (!items.length) return '<p class="empty">Nothing here yet.</p>';
    const groups = []; let g = null;
    for (const it of items) { const d = +sod(it.ts); if (!g || g.d !== d) { g = { d, items: [] }; groups.push(g); } g.items.push(it); }
    const shown = limit ? groups.slice(0, limit) : groups;
    let h = shown.map((gr) => {
      const out = sumT(gr.items.filter((i) => i.type === 'e'));
      return `<div class="day"><div class="dayhead"><b>${esc(dayName(gr.d))}</b><span class="num">${out ? '−' + TL(out) + ' · ' + GBP(sumG(gr.items.filter((i) => i.type === 'e'))) : ''}</span></div>` +
        `<div class="group">${gr.items.map(row).join('')}</div></div>`;
    }).join('');
    if (limit && groups.length > limit) h += `<button class="more" data-more>Show more</button>`;
    return h;
  }

  /* home */
  function renderHome() {
    const [a, b] = bounds('month', 0), now = new Date();
    const items = between(a, b), exp = items.filter((i) => i.type === 'e'), inc = items.filter((i) => i.type === 'i');
    const eT = sumT(exp), eG = sumG(exp);
    const [m1, m2] = pair(eT, eG);
    const c1 = m1[0], c2 = m1.slice(1);
    $('#heroLabel').textContent = 'Spent in ' + MONTHS_LONG[now.getMonth()];
    $('#heroMain').innerHTML = `<span class="c">${c1}</span>${esc(c2)}`;
    $('#heroAlt').textContent = m2;
    const dayN = now.getDate();
    const perDay = pair(eT / dayN, eG / dayN);
    const tags = [`<span class="tag"><b>${perDay[0]}</b> a day</span>`];
    const prev = samePointBefore('month', 0, 'e'), p = pct(eT, sumT(prev));
    if (p !== null) tags.push(`<span class="tag ${p > 0 ? 'up' : 'down'}"><b>${p > 0 ? '+' : ''}${p}%</b> vs ${MONTHS[(now.getMonth() + 11) % 12]} so far</span>`);
    if (inc.length) tags.push(`<span class="tag">Earned <b>${pair(sumT(inc), sumG(inc))[0]}</b></span>`);
    $('#heroMeta').innerHTML = tags.join('');
    const bud = +S.settings.budget;
    if (bud > 0) {
      const left = bud - eG, daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - dayN + 1;
      $('#heroBudget').innerHTML = `<div class="budget${left < 0 ? ' over' : ''}"><div class="track"><div class="fill" style="width:${Math.min(100, (eG / bud) * 100)}%"></div></div>` +
        `<div class="lbl"><span>${left >= 0 ? GBP(left) + ' left of ' + GBP(bud) : GBP(-left) + ' over budget'}</span><span>${left > 0 ? GBP(left / daysLeft) + '/day to stay on track' : ''}</span></div></div>`;
    } else $('#heroBudget').innerHTML = '';

    // regulars: what you add most often lately, one tap to add again
    const since = Date.now() - 120 * 864e5, m = new Map();
    for (const i of S.items) {
      if (i.ts < since || i.type !== 'e') continue;
      const k = lower(i.note) + '|' + i.cat;
      const v = m.get(k) || { n: 0, note: i.note, cat: i.cat, last: i }; v.n++; m.set(k, v);
    }
    const regs = [...m.values()].sort((x, y) => y.n - x.n).slice(0, 8);
    $('#regulars').innerHTML = regs.length ? regs.map((r, ix) => {
      const c = cat(r.cat);
      return `<button class="reg" data-reg="${ix}"><span class="ico" style="background:${esc(c.color)}">${esc(c.emoji)}</span><span class="n">${esc(r.note || c.name)}</span><span class="a num">last ${r.last.cur === 'GBP' ? GBP(r.last.amt, 2) : TL(r.last.amt)}</span></button>`;
    }).join('') : '';
    $('#regulars').previousElementSibling.hidden = !regs.length;
    $('#regulars')._regs = regs;

    const recent = S.items.slice(0, 60);
    $('#recent').innerHTML = S.items.length ? days(recent, 4) :
      `<div class="welcome empty"><p>No entries yet. Tap the red + to add your first one, or bring in your history from Dime.</p><label class="btn primary" for="importIn">Import history</label></div>`;
  }

  /* stats */
  function renderStats() {
    document.querySelectorAll('#rangeSeg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.r === UI.range));
    const [a, b] = bounds(UI.range, UI.offset), now = new Date(), running = now >= a && now < b;
    const last = new Date(+b - 864e5);
    $('#pLabel').textContent = UI.range === 'year' ? a.getFullYear() : UI.range === 'month' ? MONTHS_LONG[a.getMonth()] + ' ' + a.getFullYear() :
      `${a.getDate()} ${MONTHS[a.getMonth()]} – ${last.getDate()} ${MONTHS[last.getMonth()]}`;
    $('#nextP').disabled = UI.offset >= 0;
    const items = between(a, b), exp = items.filter((i) => i.type === 'e'), inc = items.filter((i) => i.type === 'i');
    const pe = pair(sumT(exp), sumG(exp)), pi = pair(sumT(inc), sumG(inc));
    $('#tEv').textContent = pe[0]; $('#tEs').textContent = pe[1];
    $('#tIv').textContent = pi[0]; $('#tIs').textContent = pi[1];
    $('#tE').setAttribute('aria-pressed', UI.kind === 'e'); $('#tI').setAttribute('aria-pressed', UI.kind === 'i');

    const sel = UI.kind === 'e' ? exp : inc, selT = sumT(sel), selG = sumG(sel);
    const units = UI.range === 'year' ? (running ? now.getMonth() + 1 : 12) : running ? Math.round((sod(now) - a) / 864e5) + 1 : Math.round((b - a) / 864e5);
    const unit = UI.range === 'year' ? 'month' : 'day';
    const p = pct(selT, sumT(samePointBefore(UI.range, UI.offset, UI.kind)));
    const avg = pair(selT / units, selG / units);
    $('#pace').innerHTML = `<b class="num">${avg[0]}</b> (${avg[1]}) a ${unit} on average` +
      (p !== null ? ` · <b>${p > 0 ? '+' : ''}${p}%</b> vs last ${UI.range}${running ? ' at this point' : ''}` : '');

    // chart
    const slots = [];
    if (UI.range === 'year') for (let m = 0; m < 12; m++) slots.push({ s: new Date(a.getFullYear(), m, 1), e: new Date(a.getFullYear(), m + 1, 1), lab: MONTHS[m][0], full: MONTHS_LONG[m] });
    else for (let d = new Date(a); d < b; d.setDate(d.getDate() + 1)) {
      const s = new Date(d), e = new Date(d); e.setDate(e.getDate() + 1);
      slots.push({ s, e, lab: UI.range === 'week' ? DOW[(s.getDay() + 6) % 7] : (s.getDate() === 1 || s.getDate() % 5 === 0 ? String(s.getDate()) : ''), full: s.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) });
    }
    for (const sl of slots) { const x = sel.filter((i) => i.ts >= +sl.s && i.ts < +sl.e); sl.t = sumT(x); sl.g = sumG(x); sl.future = sl.s > now; }
    const mean = selT / units, top = Math.max(1, mean, ...slots.map((s) => s.t)) * 1.08;
    const chosen = UI.slot && slots.find((s) => +s.s === UI.slot[0]);
    const read = chosen ? (() => { const r = pair(chosen.t, chosen.g); return `<b>${esc(chosen.full)}</b> · ${r[0]} · ${r[1]}`; })() : 'Tap a bar to see that ' + (UI.range === 'year' ? 'month' : 'day');
    $('#chart').innerHTML = `<div class="readout num">${read}</div><div class="plot${UI.kind === 'i' ? ' inc' : ''}">` +
      slots.map((s, i) => `<div class="col${s.future ? ' future' : ''}${!s.future && !s.t ? ' zero' : ''}${chosen === s ? ' sel' : ''}" data-slot="${i}"><div class="b" style="height:${(s.t / top) * 100}%"></div></div>`).join('') +
      (mean > 0 ? `<div class="avg" style="bottom:${(mean / top) * 100}%"><span>avg ${S.settings.gbpFirst ? GBP(selG / units) : TL(mean)}</span></div>` : '') +
      `</div><div class="axis">${slots.map((s) => `<span>${s.lab}</span>`).join('')}</div>`;
    $('#chart')._slots = slots;

    // categories with change vs the previous period
    const prevAll = between(...bounds(UI.range, UI.offset - 1)).filter((i) => i.type === UI.kind);
    const by = {};
    for (const i of sel) (by[i.cat] = by[i.cat] || []).push(i);
    const ids = Object.keys(by).sort((x, y) => sumT(by[y]) - sumT(by[x]));
    $('#catHint').textContent = ids.length ? 'change vs last ' + UI.range : '';
    const maxT = ids.length ? sumT(by[ids[0]]) : 1;
    $('#catRank').innerHTML = ids.length ? ids.map((id) => {
      const c = cat(id), t = sumT(by[id]), g = sumG(by[id]), share = selT ? Math.round((t / selT) * 100) : 0;
      const d = pct(t, sumT(prevAll.filter((i) => i.cat === id)));
      const bad = UI.kind === 'e' ? d > 0 : d < 0;
      const pr = pair(t, g);
      return `<button class="rank" data-cat="${esc(id)}" aria-pressed="${UI.cat === id}"><span class="ico" style="background:${esc(c.color)}">${esc(c.emoji)}</span>` +
        `<div><div class="n"><span>${esc(c.name)}</span><span>${share}%${d !== null && Math.abs(d) >= 1 ? ` · <span class="delta ${bad ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}%</span>` : ''}</span></div>` +
        `<div class="meter"><i style="width:${(t / maxT) * 100}%;background:${esc(c.color)}"></i></div></div>` +
        `<div class="a num">${pr[0]}<small>${pr[1]}</small></div></button>`;
    }).join('') : '<p class="empty">Nothing in this period.</p>';

    const big = sel.slice().sort((x, y) => tl(y) - tl(x)).slice(0, 3);
    $('#biggest').innerHTML = big.length ? `<div class="group">${big.map(row).join('')}</div>` : '';
    $('#biggest').previousElementSibling.hidden = !big.length;

    let list = sel;
    const filters = [];
    if (UI.cat) { list = list.filter((i) => i.cat === UI.cat); filters.push(`<button class="filter" data-clear="cat">${esc(cat(UI.cat).name)} ✕</button>`); }
    if (chosen) { list = list.filter((i) => i.ts >= +chosen.s && i.ts < +chosen.e); filters.push(`<button class="filter" data-clear="slot">${esc(chosen.full)} ✕</button>`); }
    $('#statList').innerHTML = filters.length ? filters.join(' ') + days(list, 0) : '';
  }

  /* history */
  function renderHistory() {
    const used = new Set(S.items.map((i) => i.cat));
    $('#catChips').innerHTML = `<button class="chip" data-hcat="" aria-pressed="${!UI.hcat}">All</button>` +
      S.cats.filter((c) => used.has(c.id)).map((c) => `<button class="chip" data-hcat="${esc(c.id)}" aria-pressed="${UI.hcat === c.id}">${esc(c.emoji)} ${esc(c.name)}</button>`).join('');
    let list = S.items;
    const q = lower(UI.q.trim());
    if (UI.hcat) list = list.filter((i) => i.cat === UI.hcat);
    if (q) list = list.filter((i) => lower(i.note).includes(q) || lower(cat(i.cat).name).includes(q));
    const e = list.filter((i) => i.type === 'e');
    $('#histSum').textContent = (q || UI.hcat) ? `${list.length} entries · ${TL(sumT(e))} · ${GBP(sumG(e))} spent` : `${S.items.length} entries`;
    $('#histList').innerHTML = days(list, UI.days);
  }

  /* settings */
  function renderSettings() {
    const st = S.settings, ri = $('#rateIn');
    if (document.activeElement !== ri) ri.value = fmt('tr-TR', st.rate, 2);
    $('#rateInfo').textContent = `£1 in lira · ${st.rateSource || 'set by you'}, ${new Date(st.rateAt || Date.now()).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
    $('#autoRate').checked = !!st.autoRate;
    $('#gbpFirst').checked = !!st.gbpFirst;
    const bi = $('#budgetIn'); if (document.activeElement !== bi) bi.value = st.budget ? String(st.budget) : '';
    $('#catEdit').innerHTML = S.cats.map((c) => `<button data-edit="${esc(c.id)}"><span class="ico" style="background:${esc(c.color)}">${esc(c.emoji)}</span><span>${esc(c.name)}</span></button>`).join('') +
      `<button class="addc" data-edit="">+ New</button>`;
    const first = S.items.length ? new Date(S.items[S.items.length - 1].ts) : null;
    $('#about').textContent = `${S.items.length} entries${first ? ' since ' + first.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}`;
  }

  /* ---------- add / edit ---------- */
  function openAdd(existing, preset) {
    const E = existing ? Object.assign({}, existing) : Object.assign({ id: uid(), type: 'e', cur: 'TRY', amt: 0, note: '', cat: null, ts: Date.now(), rate: S.settings.rate }, preset || {});
    let str = existing || (preset && preset.amt) ? String(E.amt).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1') : '';
    let replaceNext = !!(preset && preset.amt); // a regular's amount is a suggestion: typing replaces it
    const layer = $('#layer');
    let armed = false;

    const ordered = () => {
      const n = {}; for (const i of S.items.slice(0, 500)) if (i.type === E.type) n[i.cat] = (n[i.cat] || 0) + 1;
      return S.cats.filter((c) => c.type === E.type).sort((x, y) => (n[y.id] || 0) - (n[x.id] || 0));
    };
    const shown = (s) => { const [i, d] = s.split('.'); return fmt('tr-TR', +i || 0, 0) + (d !== undefined ? ',' + d : ''); };
    const X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

    // The sheet is built once; taps only update the parts that change, so nothing flickers or jumps.
    layer.innerHTML = `<div class="sheet" role="dialog" aria-label="${existing ? 'Edit entry' : 'New entry'}">
      <div class="hd">
        <button class="round" id="x" aria-label="Close">${X}</button>
        <div class="seg" id="types"><button data-type="e">Expense</button><button data-type="i">Income</button></div>
        ${existing ? `<button class="round danger" id="del" aria-label="Delete"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button>` : '<span class="round ghost"></span>'}
      </div>
      <div class="amt">
        <div class="cur" id="curs"><button data-cur="TRY">₺ Lira</button><button data-cur="GBP">£ Pound</button></div>
        <div class="v num" id="amtV"></div>
        <div class="conv num" id="conv"></div>
      </div>
      <div class="line">
        <input class="note" id="note" placeholder="Note" value="${esc(E.note)}" autocomplete="off" autocorrect="off" enterkeyhint="done">
        <label class="when" id="when"><span id="whenT"></span><input type="datetime-local" id="dt" aria-label="Date and time"></label>
      </div>
      <div class="pick" id="pick"></div>
      <div class="keys">
        ${['1', '2', '3'].map((k) => `<button data-k="${k}">${k}</button>`).join('')}<button data-k="⌫" class="fn" aria-label="Delete digit">⌫</button>
        ${['4', '5', '6'].map((k) => `<button data-k="${k}">${k}</button>`).join('')}<button class="ok" id="ok" aria-label="Save"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
        ${['7', '8', '9'].map((k) => `<button data-k="${k}">${k}</button>`).join('')}
        <button data-k="." aria-label="Decimal comma">,</button><button data-k="0">0</button><button data-k="00">00</button>
      </div>
    </div>`;
    const L = (s) => layer.querySelector(s);

    function drawAmount() {
      const v = parseFloat(str || '0') || 0, rate = existing ? E.rate : S.settings.rate;
      L('#amtV').className = 'v num' + (v ? '' : ' zero');
      L('#amtV').innerHTML = `<span class="c">${E.cur === 'GBP' ? '£' : '₺'}</span>${str ? esc(shown(str)) : '0'}`;
      L('#conv').textContent = v ? (E.cur === 'GBP' ? '≈ ' + TL(v * rate, 2) : '≈ ' + GBP(v / rate, 2)) : `£1 = ${TL(rate, 2)}`;
      L('#ok').disabled = !(v > 0);
      L('#ok').classList.toggle('inc', E.type === 'i');
    }
    function drawToggles() {
      layer.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.type === E.type));
      layer.querySelectorAll('[data-cur]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.cur === E.cur));
    }
    function drawCats() {
      L('#pick').innerHTML = ordered().map((c) => `<button data-cat="${esc(c.id)}" aria-pressed="${E.cat === c.id}"><span class="ico" style="background:${esc(c.color)}">${esc(c.emoji)}</span><span>${esc(c.name)}</span></button>`).join('');
    }
    function markCat() { layer.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.cat === E.cat)); L('#pick').classList.remove('need'); }
    function drawWhen() {
      const d = new Date(E.ts), diff = Math.round((sod(Date.now()) - sod(d)) / 864e5);
      L('#whenT').textContent = (diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })) + ' ' + hhmm(E.ts);
      L('#dt').value = new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    }

    function key(k) {
      if (k === '⌫') { str = replaceNext ? '' : str.slice(0, -1); replaceNext = false; return drawAmount(); }
      if (replaceNext) { str = ''; replaceNext = false; }
      for (const ch of k) {
        if (ch === '.') { if (str.includes('.')) continue; str = (str || '0') + '.'; continue; }
        if (str.includes('.') && str.split('.')[1].length >= 2) break;
        if (str === '0') str = '';
        if (!str && ch === '0' && k === '00') break;
        if (str.replace('.', '').length >= 9) break;
        str += ch;
      }
      drawAmount();
    }
    function commit() {
      const v = parseFloat(str || '0');
      if (!(v > 0)) return;
      if (!E.cat) { L('#pick').classList.add('need'); toast('Pick a category'); return; }
      E.amt = Math.round(v * 100) / 100;
      E.note = (E.note || '').trim() || cat(E.cat).name;
      if (!existing) E.rate = S.settings.rate;
      const i = S.items.findIndex((x) => x.id === E.id);
      if (i >= 0) S.items[i] = E; else S.items.push(E);
      S.items.sort((a, b) => b.ts - a.ts); save(); close(); render();
      toast(existing ? 'Saved' : `${E.type === 'i' ? 'Added' : 'Spent'} ${E.cur === 'GBP' ? GBP(E.amt, 2) : TL(E.amt, 2)} · ${cat(E.cat).name}`);
    }
    function onKey(e) {
      if (e.target.tagName === 'INPUT') return;
      if (/^[0-9]$/.test(e.key)) key(e.key); else if (e.key === '.' || e.key === ',') key('.');
      else if (e.key === 'Backspace') key('⌫'); else if (e.key === 'Enter') commit(); else if (e.key === 'Escape') close();
    }
    function close() { layer.innerHTML = ''; document.removeEventListener('keydown', onKey); }

    L('#x').onclick = close;
    L('#types').onclick = (e) => {
      const b = e.target.closest('[data-type]'); if (!b || b.dataset.type === E.type) return;
      E.type = b.dataset.type; E.cat = null; if (!existing) E.cur = E.type === 'i' ? 'GBP' : 'TRY';
      drawToggles(); drawCats(); drawAmount();
    };
    L('#curs').onclick = (e) => { const b = e.target.closest('[data-cur]'); if (b) { E.cur = b.dataset.cur; drawToggles(); drawAmount(); } };
    L('#pick').onclick = (e) => { const b = e.target.closest('[data-cat]'); if (b) { E.cat = b.dataset.cat; markCat(); } };
    L('#dt').onchange = (e) => { const t = Date.parse(e.target.value); if (!isNaN(t)) { E.ts = t; drawWhen(); } };
    layer.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => key(b.dataset.k)));
    const note = L('#note');
    note.oninput = () => { E.note = note.value; const g = guess(note.value, E.type); if (g && g !== E.cat) { E.cat = g; markCat(); } };
    note.onkeydown = (e) => { if (e.key === 'Enter') note.blur(); };
    L('#ok').onclick = commit;
    const del = L('#del');
    if (del) del.onclick = () => {
      if (!armed) { armed = true; del.style.background = 'var(--lira-soft)'; toast('Tap again to delete'); return; }
      S.items = S.items.filter((i) => i.id !== E.id); save(); close(); render(); toast('Deleted');
    };
    document.addEventListener('keydown', onKey);
    drawToggles(); drawCats(); drawAmount(); drawWhen();
    if (E.cat) { const s = L(`[data-cat="${CSS.escape(E.cat)}"]`); if (s) L('#pick').scrollLeft = Math.max(0, s.offsetLeft - 16); }
  }

  function guess(note, type) {
    const n = lower(note.trim()); if (n.length < 2) return null;
    const c = S.cats.find((x) => x.type === type && lower(x.name).startsWith(n)); if (c) return c.id;
    const m = {}; for (const i of S.items) if (i.type === type && lower(i.note).startsWith(n)) m[i.cat] = (m[i.cat] || 0) + 1;
    return Object.keys(m).sort((a, b) => m[b] - m[a])[0] || null;
  }

  /* ---------- categories ---------- */
  function editCat(id) {
    const ex = id ? S.cats.find((c) => c.id === id) : null;
    const C = ex ? Object.assign({}, ex) : { id: null, name: '', emoji: '🏷️', color: SWATCHES[S.cats.length % SWATCHES.length], type: 'e' };
    const used = ex ? S.items.filter((i) => i.cat === ex.id).length : 0, layer = $('#layer');
    function draw() {
      layer.innerHTML = `<div class="modal"><div class="box" role="dialog" aria-label="Category">
        <div class="row"><h1 style="font-size:22px;margin:0">${ex ? 'Edit category' : 'New category'}</h1><button class="round" id="cx" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
        ${ex ? '' : `<label class="l">Type</label><div class="seg"><button data-t="e" aria-pressed="${C.type === 'e'}">Expense</button><button data-t="i" aria-pressed="${C.type === 'i'}">Income</button></div>`}
        <label class="l" for="cn">Name</label><input type="text" id="cn" value="${esc(C.name)}" maxlength="30" autocomplete="off">
        <label class="l" for="ce">Emoji</label><input type="text" id="ce" value="${esc(C.emoji)}" maxlength="8" style="width:84px;text-align:center;font-size:22px">
        <label class="l">Colour</label><div class="swatches">${SWATCHES.map((s) => `<button data-s="${s}" style="background:${s}" aria-label="Colour" aria-pressed="${C.color === s}"></button>`).join('')}</div>
        <div class="btnrow" style="margin-top:20px"><button class="btn primary" id="cs">Save</button>${ex ? `<button class="btn danger" id="cd">Delete</button>` : ''}</div>
        ${ex && used ? `<p class="hint">${used} entries use this category, so it can be renamed but not deleted.</p>` : ''}
      </div></div>`;
      const L = (s) => layer.querySelector(s);
      L('#cx').onclick = () => (layer.innerHTML = '');
      L('.modal').onclick = (e) => { if (e.target.classList.contains('modal')) layer.innerHTML = ''; };
      L('#cn').oninput = (e) => (C.name = e.target.value);
      L('#ce').oninput = (e) => (C.emoji = e.target.value);
      layer.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { C.color = b.dataset.s; draw(); }));
      layer.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { C.type = b.dataset.t; draw(); }));
      L('#cs').onclick = () => {
        const name = C.name.trim(); if (!name) return toast('Give it a name');
        if (S.cats.some((c) => c !== ex && lower(c.name) === lower(name))) return toast('That name is already used');
        C.name = name; C.emoji = C.emoji.trim() || '🏷️';
        if (ex) Object.assign(ex, C); else { C.id = name + (S.cats.some((c) => c.id === name) ? '-' + uid() : ''); S.cats.push(C); }
        save(); layer.innerHTML = ''; render(); toast('Saved');
      };
      const d = L('#cd');
      if (d) d.onclick = () => { if (used) return toast('Still used by ' + used + ' entries'); S.cats = S.cats.filter((c) => c !== ex); save(); layer.innerHTML = ''; render(); toast('Deleted'); };
    }
    draw();
  }

  /* ---------- backup ---------- */
  async function exportBackup() {
    const data = JSON.stringify({ app: 'lira-ledger', version: 1, exportedAt: new Date().toISOString(), items: S.items, cats: S.cats, settings: S.settings });
    const name = 'ledger-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    const file = new File([data], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function parseCSV(line) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === ',') { out.push(cur); cur = ''; } else if (ch === '"') q = true; else cur += ch;
    }
    out.push(cur); return out;
  }
  function importText(text) {
    let incoming = [], cats = null;
    const t = text.replace(/^\uFEFF/, '').trim();
    if (t.startsWith('{')) { const d = JSON.parse(t); incoming = d.items || []; cats = d.cats; }
    else {
      const lines = t.split(/\r?\n/); lines.shift(); // Dime: Date,Note,Amount,Category,Type
      lines.forEach((ln, ix) => {
        const f = parseCSV(ln); if (f.length < 5) return;
        const m = f[0].match(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) ([+-]\d\d)(\d\d)$/);
        const ts = m ? Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`) : Date.parse(f[0]); if (isNaN(ts)) return;
        incoming.push({ id: 'd' + ts.toString(36) + ix, ts, note: f[1], amt: Math.abs(parseFloat(f[2])), cur: 'TRY', cat: f[3], type: /income/i.test(f[4]) ? 'i' : 'e', rate: MONTH_RATES[mkey(ts)] || S.settings.rate });
      });
    }
    const sig = (i) => i.ts + '|' + i.amt + '|' + i.cat;
    const have = new Set(S.items.map(sig)), ids = new Set(S.items.map((i) => i.id));
    const fresh = incoming.filter((i) => i && i.ts && i.amt > 0 && !have.has(sig(i)) && !ids.has(i.id));
    if (Array.isArray(cats)) for (const c of cats) if (!S.cats.some((x) => x.id === c.id)) S.cats.push(c);
    for (const i of fresh) if (!S.cats.some((c) => c.id === i.cat)) S.cats.push({ id: i.cat, name: i.cat, emoji: '🏷️', color: SWATCHES[S.cats.length % SWATCHES.length], type: i.type });
    S.items = S.items.concat(fresh).sort((a, b) => b.ts - a.ts);
    save(); render();
    toast(fresh.length ? `Imported ${fresh.length} entries` : 'Nothing new in that file');
  }

  /* ---------- wiring ---------- */
  document.querySelectorAll('.tab').forEach((t) => (t.onclick = () => go(t.dataset.v)));
  $('#addBtn').onclick = () => openAdd(null);
  $('#rateChip').onclick = () => go('settings');
  $('#hero').onclick = () => { S.settings.gbpFirst = !S.settings.gbpFirst; save(); render(); };
  document.querySelectorAll('#rangeSeg button').forEach((b) => (b.onclick = () => { UI.range = b.dataset.r; UI.offset = 0; UI.slot = null; saveUI(); renderStats(); }));
  $('#prevP').onclick = () => { UI.offset--; UI.slot = null; renderStats(); };
  $('#nextP').onclick = () => { if (UI.offset < 0) { UI.offset++; UI.slot = null; renderStats(); } };
  $('#tE').onclick = () => { UI.kind = 'e'; UI.cat = null; renderStats(); };
  $('#tI').onclick = () => { UI.kind = 'i'; UI.cat = null; renderStats(); };
  $('#q').oninput = (e) => { UI.q = e.target.value; UI.days = 20; renderHistory(); };
  $('#main').addEventListener('click', (e) => {
    const el = (s) => e.target.closest(s);
    let x;
    if ((x = el('.tx'))) { const it = S.items.find((i) => i.id === x.dataset.id); if (it) openAdd(it); return; }
    if ((x = el('[data-reg]'))) { const r = $('#regulars')._regs[+x.dataset.reg]; openAdd(null, { cat: r.cat, note: r.note, cur: r.last.cur, amt: r.last.amt }); return; }
    if (el('[data-more]')) { UI.days += 30; render(); return; }
    if ((x = el('[data-go]'))) { go(x.dataset.go); return; }
    if ((x = el('.rank'))) { UI.cat = UI.cat === x.dataset.cat ? null : x.dataset.cat; renderStats(); return; }
    if ((x = el('[data-slot]'))) { const s = $('#chart')._slots[+x.dataset.slot]; UI.slot = UI.slot && UI.slot[0] === +s.s ? null : [+s.s]; renderStats(); return; }
    if ((x = el('[data-clear]'))) { if (x.dataset.clear === 'cat') UI.cat = null; else UI.slot = null; renderStats(); return; }
    if ((x = el('[data-hcat]'))) { UI.hcat = x.dataset.hcat || null; UI.days = 20; renderHistory(); return; }
    if ((x = el('[data-edit]'))) { editCat(x.dataset.edit || null); return; }
  });
  $('#rateIn').onchange = (e) => {
    const v = parseFloat(e.target.value.replace(/\./g, '').replace(',', '.'));
    if (v > 0) { S.settings.rate = v; S.settings.rateAt = Date.now(); S.settings.rateSource = 'set by you'; S.settings.autoRate = false; save(); render(); toast('Rate saved. Automatic updates are off.'); }
    else { toast('Type the rate like 64,86'); renderSettings(); }
  };
  $('#autoRate').onchange = (e) => { S.settings.autoRate = e.target.checked; save(); if (e.target.checked) refreshRate(true).then((ok) => toast(ok ? 'Rate updated' : 'No connection. Will try again later.')); };
  $('#gbpFirst').onchange = (e) => { S.settings.gbpFirst = e.target.checked; save(); render(); };
  $('#budgetIn').onchange = (e) => { const v = parseFloat(e.target.value.replace(',', '.')); S.settings.budget = v > 0 ? v : null; save(); toast(v > 0 ? 'Budget set' : 'Budget removed'); };
  $('#exportBtn').onclick = exportBackup;
  $('#importIn').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { importText(String(r.result)); } catch (err) { toast('That file could not be read. Use a backup or a Dime CSV.'); } e.target.value = ''; };
    r.readAsText(f);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { if (Date.now() - (S.settings.rateAt || 0) > 6 * 36e5) refreshRate(); render(); }
  });

  load();
  go(UI.view);
  if (Date.now() - (S.settings.rateAt || 0) > 36e5) refreshRate();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
})();
