/* 문강금은 — 인터랙션(카운터·스크롤 리빌·돈/g 전환·매입가 계산기·90일 추이 모달·제품 필터·FAQ·폼·유튜브) */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s); const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const DON = 3.75; const fmt = (n) => Math.round(n).toLocaleString('ko-KR');

  // 헤더·모바일 메뉴·맨 위로
  const header = $('#header'); const burger = $('#burger'); const mnav = $('#mobileNav'); const toTop = $('#toTop');
  const onScroll = () => { header && header.classList.toggle('scrolled', window.scrollY > 8); toTop && toTop.classList.toggle('show', window.scrollY > 500); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  burger && burger.addEventListener('click', () => { const open = !mnav.classList.contains('open'); mnav.classList.toggle('open', open); burger.setAttribute('aria-expanded', String(open)); });
  toTop && toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  // 스크롤 리빌
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 }) : null;
  $$('.reveal').forEach((el, i) => { el.style.transitionDelay = `${Math.min(i % 6, 5) * 60}ms`; io ? io.observe(el) : el.classList.add('in'); });

  // 카운터(히어로 시세 등)
  const cio = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach(e => { if (!e.isIntersecting) return; const el = e.target; const to = Number(el.dataset.count) || 0; const t0 = performance.now(); const dur = 1300; const step = (t) => { const p = Math.min(1, (t - t0) / dur); const v = Math.round(to * (1 - Math.pow(1 - p, 3))); el.textContent = v.toLocaleString('ko-KR'); if (p < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); cio.unobserve(el); })) : null;
  $$('[data-count]').forEach(el => cio ? cio.observe(el) : (el.textContent = Number(el.dataset.count).toLocaleString('ko-KR')));

  // 돈/g 단위 전환(시세표·히어로 보드)
  $$('.unit-toggle [data-unit]').forEach(btn => btn.addEventListener('click', () => {
    const unit = btn.dataset.unit; $$('.unit-toggle [data-unit]').forEach(b => b.classList.toggle('active', b.dataset.unit === unit));
    $$('.pv[data-don]').forEach(el => { const don = Number(el.dataset.don); if (!don) return; el.textContent = fmt(unit === 'g' ? don / DON : don); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 800); });
    $$('.unit-lbl').forEach(el => el.textContent = unit === 'g' ? '원/g' : '원/돈');
    $$('.hb-table td.num').forEach(td => { if (td.dataset.don === undefined) { const v = Number(String(td.textContent).replace(/[^\d]/g, '')); if (v) td.dataset.don = v; } const don = Number(td.dataset.don); if (don && !td.querySelector('.chg')) td.textContent = fmt(unit === 'g' ? don / DON : don); });
    try { localStorage.setItem('mk_unit', unit); } catch (_) { /* no-op */ }
  }));

  // 매입가 계산기
  const cw = $('#calc-widget'); if (cw) {
    let quotes = []; try { quotes = JSON.parse(cw.dataset.quotes || '[]'); } catch (_) { /* no-op */ }
    let code = (quotes[0] || {}).code; let unit = 'g';
    const w = $('#calcW'); const range = $('#calcRange'); const total = $('#calcTotal'); const sub = $('#calcSub'); const apply = $('#calcApply'); const table = $('#calcTable');
    const grams = () => { const v = Number(w.value) || 0; return unit === 'don' ? v * DON : v; };
    const render = () => {
      const q = quotes.find(x => x.code === code) || quotes[0]; if (!q) return;
      const g = grams(); const perG = q.buy / DON; const t = Math.round(perG * g);
      total.textContent = fmt(t) + '원';
      sub.textContent = `${q.name}(${q.purity}) · ${(Math.round(g * 100) / 100).toLocaleString()}g = ${(Math.round(g / DON * 100) / 100).toLocaleString()}돈 · 1g ${fmt(perG)}원 · 1돈 ${fmt(q.buy)}원`;
      if (apply) apply.href = `/apply?kind=sell&item=${encodeURIComponent(q.name + ' ' + (Math.round(g * 100) / 100) + 'g')}&amt=${encodeURIComponent('예상 ' + fmt(t) + '원')}`;
      if (table) $$('tbody tr', table).forEach(tr => { const qq = quotes.find(x => x.code === tr.dataset.code); tr.classList.toggle('active', tr.dataset.code === code); const c = $('.ct-total', tr); if (qq && c) c.textContent = g ? fmt(qq.buy / DON * g) + '원' : '-'; });
    };
    $$('#calcPurity .chip').forEach(c => c.addEventListener('click', () => { code = c.dataset.code; $$('#calcPurity .chip').forEach(x => x.classList.toggle('active', x === c)); render(); }));
    $$('.calc-input .ut').forEach(b => b.addEventListener('click', () => { const nu = b.dataset.u; if (nu === unit) return; const g = grams(); unit = nu; w.value = Math.round((unit === 'don' ? g / DON : g) * 100) / 100; range.max = unit === 'don' ? 50 : range.dataset.max || 200; range.value = w.value; $$('.calc-input .ut').forEach(x => x.classList.toggle('active', x === b)); render(); }));
    if (range) { range.dataset.max = range.max; range.addEventListener('input', () => { w.value = range.value; render(); }); }
    w.addEventListener('input', () => { if (range) range.value = w.value; render(); });
    $$('#calcPresets .chip').forEach(c => c.addEventListener('click', () => { const g = Number(c.dataset.g); w.value = unit === 'don' ? Math.round(g / DON * 100) / 100 : g; if (range) range.value = w.value; render(); }));
    if (table) $$('tbody tr', table).forEach(tr => tr.addEventListener('click', () => { code = tr.dataset.code; $$('#calcPurity .chip').forEach(x => x.classList.toggle('active', x.dataset.code === code)); render(); }));
    const copy = $('#calcCopy'); copy && copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(`문강금은 예상 매입가 ${total.textContent} (${sub.textContent}) ${location.origin}/calculator`); copy.textContent = '복사됨'; setTimeout(() => copy.textContent = '결과 복사', 1500); } catch (_) { /* no-op */ } });
    render();
  }

  // 시세표: 90일 추이 모달
  const mk = $('#mkTable'); if (mk) {
    const modal = $('#histModal'); const chart = $('#histChart'); const title = $('#histTitle'); const note = $('#histNote');
    const close = () => { modal.hidden = true; }; $('.modal-close', modal).addEventListener('click', close); modal.addEventListener('click', (e) => { if (e.target === modal) close(); }); document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    const draw = (hist, name) => {
      const rows = hist.filter(h => h.buy != null); const vals = rows.map(h => h.buy); const W = 640, H = 240, P = 44;
      if (vals.length < 2) { chart.innerHTML = '<p class="note">추이 데이터가 아직 2개 미만입니다. 매일 갱신되며 누적됩니다.</p>'; return; }
      const min = Math.min(...vals), max = Math.max(...vals); const span = max - min || 1; const x = (i) => P + i / (vals.length - 1) * (W - P * 2); const y = (v) => H - P + 6 - (v - min) / span * (H - P * 2);
      const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(' '); const up = vals[vals.length - 1] >= vals[0]; const col = up ? '#c0392b' : '#1f5fbf';
      const grid = [0, .25, .5, .75, 1].map(f => { const v = Math.round(min + span * f); return `<line x1="${P}" x2="${W - P}" y1="${y(v)}" y2="${y(v)}" stroke="#eee6d6"/><text x="${P - 6}" y="${y(v) + 4}" font-size="11" fill="#7a7468" text-anchor="end">${v.toLocaleString()}</text>`; }).join('');
      const dots = rows.map((h, i) => `<circle cx="${x(i)}" cy="${y(h.buy)}" r="3" fill="${col}"><title>${h.date}: 매입 ${h.buy.toLocaleString()}원${h.sell ? ' · 판매 ' + h.sell.toLocaleString() + '원' : ''}</title></circle>`).join('');
      const labels = [0, Math.floor((rows.length - 1) / 2), rows.length - 1].map(i => `<text x="${x(i)}" y="${H - 8}" font-size="11" fill="#7a7468" text-anchor="middle">${rows[i].date.slice(5)}</text>`).join('');
      chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${name} 매입가 추이">${grid}<polyline fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" points="${pts}"/>${dots}${labels}</svg>`;
      note.textContent = `${rows[0].date} ~ ${rows[rows.length - 1].date} · 최저 ${min.toLocaleString()} · 최고 ${max.toLocaleString()} · 단위 원/돈(매입가)`;
    };
    mk.addEventListener('click', async (e) => { const b = e.target.closest('[data-hist]') || e.target.closest('tr[data-code]'); if (!b) return; const tr = b.closest('tr'); const code = tr.dataset.code; title.textContent = `${tr.dataset.name} 최근 90일 매입가 추이`; chart.innerHTML = '<p class="note">불러오는 중…</p>'; modal.hidden = false; try { const r = await fetch(`/api/prices/${code}/history?days=90`); const j = await r.json(); draw(j.history, tr.dataset.name); } catch (_) { chart.innerHTML = '<p class="note">추이를 불러오지 못했습니다.</p>'; } });
  }

  // 제품 목록 필터·정렬
  const pg = $('#pGrid'); if (pg) {
    const f = $('#pFilter'); const s = $('#pSort'); const cards = $$('.pcard', pg);
    const apply = () => { const q = (f.value || '').trim().toLowerCase(); cards.forEach(c => c.style.display = !q || c.dataset.name.toLowerCase().includes(q) ? '' : 'none'); const mode = s.value; const sorted = cards.slice().sort((a, b) => mode === 'price-asc' ? a.dataset.price - b.dataset.price : mode === 'price-desc' ? b.dataset.price - a.dataset.price : mode === 'weight' ? a.dataset.weight - b.dataset.weight : 0); if (mode !== 'featured') sorted.forEach(c => pg.appendChild(c)); };
    f.addEventListener('input', apply); s.addEventListener('change', apply);
  }

  // FAQ: 하나 열면 같은 목록의 다른 항목 닫기
  $$('.faq-list').forEach(list => list.addEventListener('toggle', (e) => { if (e.target.open) $$('details[open]', list).forEach(d => { if (d !== e.target) d.open = false; }); }, true));

  // 문의 폼 AJAX
  $$('form[data-ajax]').forEach(form => form.addEventListener('submit', async (e) => {
    e.preventDefault(); const msg = $('.form-msg', form); const btn = $('button[type=submit]', form);
    const data = Object.fromEntries(new FormData(form).entries()); if (!data.agree) { msg.className = 'form-msg err'; msg.textContent = '개인정보 수집·이용에 동의해 주세요.'; return; }
    btn.disabled = true; msg.className = 'form-msg'; msg.textContent = '접수 중…';
    try { const r = await fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || '오류'); msg.className = 'form-msg ok'; msg.textContent = j.message || '접수되었습니다.'; form.reset(); if (window.gtag) gtag('event', 'generate_lead', { kind: data.kind }); } catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; } finally { btn.disabled = false; }
  }));

  // 유튜브 지연 로드
  $$('.yt').forEach(box => box.addEventListener('click', () => { const id = box.dataset.id; box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" title="YouTube" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`; }));

  // 카카오톡 ID 복사(우측 버튼·모바일 바)
  $$('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    const v = b.dataset.copy; let ok = false; try { await navigator.clipboard.writeText(v); ok = true; } catch (_) { const t = document.createElement('textarea'); t.value = v; document.body.appendChild(t); t.select(); try { ok = document.execCommand('copy'); } catch (_) { /* no-op */ } t.remove(); }
    const small = b.querySelector('small'); if (small) { const o = small.textContent; small.textContent = ok ? '복사됨. 카카오톡 친구추가에서 ID로 검색하세요' : 'ID: ' + v; b.classList.add('copied'); setTimeout(() => { small.textContent = o; b.classList.remove('copied'); }, 3500); } else if (!ok) alert('카카오톡 ID: ' + v);
  }));

  // 실시간 시세 반영(홈 시세판·티커·상단 시세 바·시세표) — 60초마다, 탭이 보일 때만
  const tickerTrack = $('#tickerTrack'); const mkTable = $('#mkTable');
  if ($('#board') || tickerTrack || mkTable || $('.qb-item[data-code]')) {
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const chgHtml = (d, p) => d > 0 ? `<span class="chg up">▲ ${fmt(d)} <small>(+${p}%)</small></span>` : d < 0 ? `<span class="chg down">▼ ${fmt(Math.abs(d))} <small>(${p}%)</small></span>` : '<span class="chg flat">보합</span>';
    const unitNow = () => { const b = $('.unit-toggle [data-unit].active'); return b ? b.dataset.unit : 'don'; };
    const flash = (el) => { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); };
    const setDon = (el, v) => { if (!el || !v) return; const prev = Number(el.dataset.don || String(el.textContent).replace(/[^\d]/g, '') * (unitNow() === 'g' ? DON : 1)); el.dataset.don = v; el.textContent = fmt(unitNow() === 'g' ? v / DON : v); if (Math.abs(prev - v) > DON) flash(el); };
    const pull = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch('/api/live', { cache: 'no-store' }); if (!r.ok) return;
        const j = await r.json(); const by = Object.fromEntries(j.items.map(x => [x.code, x]));
        const t = $('#liveTime'); if (t) t.textContent = j.updatedText;
        const g = by.au999; const hp = $('.hb-price');
        if (g && hp && Number(hp.dataset.count) !== g.buy) { hp.dataset.count = g.buy; hp.textContent = fmt(g.buy); flash(hp); }
        const hc = $('#hbChg'); if (g && hc) hc.innerHTML = chgHtml(g.diff, g.pct);
        $$('.hb-table tr[data-code]').forEach(tr => { const q = by[tr.dataset.code]; if (!q) return; const tds = $$('td', tr); setDon(tds[0], q.buy); setDon(tds[1], q.sell); if (tds[2]) tds[2].innerHTML = chgHtml(q.diff, q.pct); });
        if (mkTable) $$('tbody tr[data-code]', mkTable).forEach(tr => { const q = by[tr.dataset.code]; if (!q) return; const pv = $$('.pv', tr); setDon(pv[0], q.buy); setDon(pv[1], q.sell); const c = $('.chg', tr); if (c) c.outerHTML = chgHtml(q.diff, q.pct); });
        $$('.qb-item[data-code]').forEach(a => { const q = by[a.dataset.code]; if (!q) return; const sp = $('span', a); if (sp && sp.textContent !== fmt(q.buy)) { sp.textContent = fmt(q.buy); flash(sp); } const c = $('.chg', a); if (c) c.outerHTML = chgHtml(q.diff, q.pct); });
        if (tickerTrack) { const html = j.items.map(q => `<span class="tk"><b>${esc(q.name)}</b> 매입 ${fmt(q.buy)}${q.sell ? ` · 판매 ${fmt(q.sell)}` : ''} ${chgHtml(q.diff, q.pct)}</span>`).join('') + (j.intl ? `<span class="tk"><b>국제 금시세</b> $${fmt(j.intl.xau)}/oz · 환율 ${fmt(j.intl.usdkrw)}원</span>` : ''); tickerTrack.innerHTML = html + html; }
      } catch (_) { /* 다음 주기에 재시도 */ }
    };
    setInterval(pull, 60000); setTimeout(pull, 1500);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
  }

  // 모바일 히어로 시퀀스 — 간판을 먼저 보여주고, 스크롤하면 문구가 차례로 올라온다
  const heroSec = $('.hero'); const heroVisual = $('.hero-visual'); const heroCopy = $('.hero-copy');
  if (heroSec && heroVisual && heroCopy) {
    const mq = window.matchMedia('(max-width:900px)');
    const items = $$(':scope > *', heroCopy);
    let ticking = false;
    const paint = () => {
      if (!mq.matches) return;
      const h = heroVisual.offsetHeight || 1;
      heroSec.style.setProperty('--hero-p', Math.min(1, Math.max(0, window.scrollY / h)).toFixed(3));
      const trigger = window.innerHeight * 0.78;
      items.forEach(el => { if (el.getBoundingClientRect().top < trigger) el.classList.add('in'); });
    };
    const setup = () => {
      if (mq.matches) {
        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        items.forEach((el, i) => { el.classList.add('seq'); el.style.transitionDelay = `${i * 90}ms`; if (still) el.classList.add('in'); });
        if (!still) paint();
      }
      else { items.forEach(el => { el.classList.remove('seq', 'in'); el.style.transitionDelay = ''; }); heroSec.style.removeProperty('--hero-p'); }
    };
    window.addEventListener('scroll', () => { if (ticking) return; ticking = true; requestAnimationFrame(() => { paint(); ticking = false; }); }, { passive: true });
    window.addEventListener('resize', setup, { passive: true });
    setup();
  }

  // 유튜브 롤링(홈 계산기 옆) — 3.5초마다 한 칸, 마우스를 올리면 멈춤, 누르면 팝업 재생
  const roll = $('#ytRoll'); const ytModal = $('#ytModal');
  if (roll && ytModal) {
    const track = $('.yr-track', roll); const view = $('.yr-view', roll); const items = $$('.yr-item', roll); let idx = 0; let timer = null;
    $$('img', roll).forEach(img => { const fb = () => { if (img.dataset.fb) return; img.dataset.fb = '1'; img.src = img.src.replace('oardefault', 'hqdefault'); }; img.addEventListener('error', fb); if (img.complete && !img.naturalWidth) fb(); });
    const move = () => { if (!items.length) return; const gap = parseFloat(getComputedStyle(track).columnGap) || 0; const w = items[0].getBoundingClientRect().width + gap; const per = Math.max(1, Math.round((view.clientWidth + gap) / w)); const max = Math.max(0, items.length - per); if (idx < 0) idx = max; if (idx > max) idx = 0; track.style.transform = `translateX(${-idx * w}px)`; };
    const stop = () => { clearInterval(timer); timer = null; };
    const play = () => { stop(); if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => { if (!document.hidden && ytModal.hidden) { idx++; move(); } }, 3500); };
    $('.yr-next', roll).addEventListener('click', () => { idx++; move(); play(); });
    $('.yr-prev', roll).addEventListener('click', () => { idx--; move(); play(); });
    view.addEventListener('mouseenter', stop); view.addEventListener('mouseleave', play);
    window.addEventListener('resize', move);
    const frame = $('.yt-frame', ytModal);
    const close = () => { ytModal.hidden = true; frame.replaceChildren(); play(); };
    items.forEach(b => b.addEventListener('click', () => {
      stop(); const f = document.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(b.dataset.id)}?autoplay=1&rel=0&playsinline=1`; f.title = b.getAttribute('aria-label') || 'YouTube'; f.allow = 'autoplay; encrypted-media; picture-in-picture'; f.allowFullscreen = true;
      frame.replaceChildren(f); ytModal.hidden = false;
    }));
    $('.yt-close', ytModal).addEventListener('click', close);
    ytModal.addEventListener('click', (e) => { if (e.target === ytModal) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ytModal.hidden) close(); });
    move(); play();
  }

  // 제품 옵션(순도 14K·18K, 스톤) — 고르면 가격·중량이 바로 바뀐다
  const optBox = $('#pOpts');
  if (optBox) {
    let combo = {}; try { combo = JSON.parse(optBox.dataset.combo || '{}'); } catch (_) { /* no-op */ }
    let karat = '14k'; let stone = '0';
    const priceEl = $('#pPrice'); const weightEl = $('#pWeight'); const applyBtn = $('.spec-card .btn-gold');
    const render = () => {
      const c = combo[`${karat}|${stone}`]; if (!c) return;
      if (priceEl && c.price) { priceEl.textContent = fmt(c.price) + '원'; priceEl.classList.remove('flash'); void priceEl.offsetWidth; priceEl.classList.add('flash'); }
      if (weightEl && c.weight) weightEl.textContent = `${c.weight}g (${c.don}돈)`;
      const pureEl = $('#pPure'); if (pureEl && c.pure) pureEl.textContent = `${c.pure}돈`;
      if (applyBtn) { const u = new URL(applyBtn.href, location.origin); u.searchParams.set('opt', `${karat === '18k' ? '18K' : '14K'}${stone !== '0' ? ' / ' + ($(`[data-stone="${stone}"]`, optBox) || {}).textContent.trim() : ''}`); applyBtn.href = u.pathname + u.search; }
    };
    $$('[data-karat]', optBox).forEach(b => b.addEventListener('click', () => { karat = b.dataset.karat; $$('[data-karat]', optBox).forEach(x => x.classList.toggle('active', x === b)); render(); }));
    $$('[data-stone]', optBox).forEach(b => b.addEventListener('click', () => { stone = b.dataset.stone; $$('[data-stone]', optBox).forEach(x => x.classList.toggle('active', x === b)); render(); }));
  }

  // 예약 폼 URL 파라미터 프리필
  const params = new URLSearchParams(location.search);
  if (params.get('item')) { const i = $('input[name=item]'); if (i && !i.value) i.value = params.get('item'); }
})();

// 전체 카테고리 드롭다운
(function () {
  var btn = document.getElementById('catAll'); var panel = document.getElementById('catPanel');
  if (!btn || !panel) return;
  var open = function (v) { panel.hidden = !v; btn.setAttribute('aria-expanded', v ? 'true' : 'false'); };
  btn.addEventListener('click', function (e) { e.stopPropagation(); open(panel.hidden); });
  document.addEventListener('click', function (e) { if (!panel.hidden && !panel.contains(e.target)) open(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') open(false); });
})();

// 주문서: 옵션·수량에 따라 금액과 품목 표시를 갱신
(function () {
  var price = document.getElementById('oPrice'); var item = document.getElementById('oItem');
  if (!price || !item) return;
  var opt = document.getElementById('oOpt'); var qty = document.getElementById('oQty');
  var base = item.value;
  var render = function () {
    var o = opt ? opt.options[opt.selectedIndex] : null;
    var unit = o ? Number(o.dataset.price || 0) : 0;
    var n = qty ? Math.max(1, Number(qty.value) || 1) : 1;
    if (unit) price.textContent = (unit * n).toLocaleString('ko-KR') + '원';
    item.value = base + (o && o.value ? ' (' + o.value + ')' : '') + (n > 1 ? ' ' + n + '개' : '');
  };
  if (opt) opt.addEventListener('change', render);
  if (qty) qty.addEventListener('input', render);
  render();
})();

// ===== 온라인몰 메인 (10-06) =====
(function () {
  // 제품군 슬라이드 배너 — 5초 자동, 화살표·점·스와이프
  var box = document.getElementById('mainBanner');
  if (box) {
    var slides = [].slice.call(box.querySelectorAll('.mb-slide'));
    var dots = [].slice.call(box.querySelectorAll('.mb-dot'));
    var i = 0, timer = null;
    var show = function (n) {
      i = (n + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle('on', k === i); });
      dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
    };
    var play = function () { stop(); if (slides.length > 1) timer = setInterval(function () { show(i + 1); }, 5000); };
    var stop = function () { if (timer) clearInterval(timer); timer = null; };
    var prev = box.querySelector('.mb-arrow.prev'), next = box.querySelector('.mb-arrow.next');
    if (prev) prev.addEventListener('click', function () { show(i - 1); play(); });
    if (next) next.addEventListener('click', function () { show(i + 1); play(); });
    dots.forEach(function (d) { d.addEventListener('click', function () { show(Number(d.dataset.go)); play(); }); });
    var x0 = null;
    box.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; stop(); }, { passive: true });
    box.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1));
      x0 = null; play();
    });
    box.addEventListener('mouseenter', stop); box.addEventListener('mouseleave', play);
    play();
  }

  // 국제 시세 차트 (TradingView 위젯)
  var tv = document.getElementById('tvChart');
  if (tv) {
    var draw = function () {
      var sym = tv.dataset.sym, range = tv.dataset.range;
      var cfg = { symbol: sym, interval: range === '1D' ? '15' : range === '5D' ? '60' : 'D', range: range, timezone: 'Asia/Seoul', theme: 'light', style: '2', locale: 'kr', hide_side_toolbar: true, allow_symbol_change: false, save_image: false, calendar: false, support_host: 'https://www.tradingview.com' };
      tv.innerHTML = '<iframe title="국제 시세 차트" scrolling="no" allowtransparency="true" frameborder="0" src="https://s.tradingview.com/widgetembed/?' +
        'symbol=' + encodeURIComponent(sym) + '&interval=' + cfg.interval + '&range=' + range + '&timezone=Asia%2FSeoul&theme=light&style=2&locale=kr&hide_side_toolbar=1&allow_symbol_change=0&save_image=0&calendar=0' + '"></iframe>';
    };
    [].forEach.call(document.querySelectorAll('.intl-tab'), function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.intl-tab').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on'); tv.dataset.range = b.dataset.range; draw();
      });
    });
    [].forEach.call(document.querySelectorAll('.intl-card'), function (c) {
      c.addEventListener('click', function () {
        document.querySelectorAll('.intl-card').forEach(function (x) { x.classList.remove('on'); });
        c.classList.add('on'); tv.dataset.sym = c.dataset.sym; draw();
      });
    });
    draw();
  }

  // 탭형 진열(BEST/PICKS, 인기 키워드)
  var tabSwitch = function (btnSel, paneAttr, keyAttr) {
    [].forEach.call(document.querySelectorAll(btnSel), function (b) {
      b.addEventListener('click', function () {
        var key = b.dataset[keyAttr];
        document.querySelectorAll(btnSel).forEach(function (x) { x.classList.remove('on'); x.setAttribute('aria-selected', 'false'); });
        b.classList.add('on'); b.setAttribute('aria-selected', 'true');
        document.querySelectorAll('[' + paneAttr + ']').forEach(function (p) { p.classList.toggle('on', p.getAttribute(paneAttr) === key); });
      });
    });
  };
  tabSwitch('.pick-tab', 'data-pane', 'pick');
  tabSwitch('.kw-tab', 'data-kwpane', 'kw');


})();

// ===== 쇼핑 (상세·장바구니·주문서·회원) =====
(function () {
  var api = function (url, body, method) {
    return fetch('/api/shop' + url, {
      method: method || (body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok || j.ok === false) throw new Error(j.error || '처리하지 못했습니다.'); return j; }); });
  };
  var won = function (n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; };
  var msg = function (el, text, bad) { if (el) { el.textContent = text; el.className = 'form-msg' + (bad ? ' bad' : ' good'); } };
  var badge = function (n) {
    [].forEach.call(document.querySelectorAll('.hic-n'), function (b) { b.textContent = n; b.hidden = !n; });
    var sc = document.querySelector('.sc-cart small'); if (sc) sc.textContent = n + '개 담김';
  };

  // 상품 상세
  var pd = document.getElementById('pdetail');
  if (pd) {
    var pid = Number(pd.dataset.id);
    var selects = [].slice.call(pd.querySelectorAll('[data-opt]'));
    var qty = document.getElementById('pdQty');
    var priceEl = document.getElementById('pdPrice'), totalEl = document.getElementById('pdTotal');
    var pdMsg = document.getElementById('pdMsg');
    var unit = 0;
    var ids = function () { return selects.map(function (s) { return Number(s.value); }).filter(Boolean); };
    var refresh = function () {
      api('/price', { product_id: pid, option_ids: ids() }).then(function (r) {
        unit = r.price || 0;
        if (priceEl && r.price) priceEl.textContent = won(r.price);
        if (totalEl) totalEl.textContent = won(unit * Math.max(1, Number(qty && qty.value) || 1));
      }).catch(function () {});
    };
    selects.forEach(function (s) { s.addEventListener('change', refresh); });
    if (qty) qty.addEventListener('input', function () { if (totalEl) totalEl.textContent = won(unit * Math.max(1, Number(qty.value) || 1)); });
    refresh();
    var addCart = function (then) {
      return api('/cart', { product_id: pid, option_ids: ids(), qty: Math.max(1, Number(qty && qty.value) || 1) })
        .then(function (r) { badge(r.count); if (then) then(); else msg(pdMsg, '장바구니에 담았습니다.'); })
        .catch(function (e) { msg(pdMsg, e.message, true); });
    };
    var cb = document.getElementById('pdCart'); if (cb) cb.addEventListener('click', function () { addCart(); });
    var bb = document.getElementById('pdBuy'); if (bb) bb.addEventListener('click', function () { addCart(function () { location.href = '/checkout'; }); });
    var like = document.getElementById('pdLike');
    if (like) like.addEventListener('click', function () {
      api('/wish/' + pid, {}).then(function (r) { like.classList.toggle('on', r.liked); msg(pdMsg, r.liked ? '찜 목록에 담았습니다.' : '찜을 해제했습니다.'); })
        .catch(function (e) { msg(pdMsg, e.message, true); });
    });
  }

  // 장바구니
  [].forEach.call(document.querySelectorAll('.cart-row'), function (row) {
    var id = row.dataset.id;
    var input = row.querySelector('input');
    var send = function (q) { api('/cart/' + id, { qty: q }).then(function () { location.reload(); }).catch(function () {}); };
    [].forEach.call(row.querySelectorAll('[data-qty]'), function (b) {
      b.addEventListener('click', function () { send(Math.max(1, (Number(input.value) || 1) + Number(b.dataset.qty))); });
    });
    input.addEventListener('change', function () { send(Math.max(1, Number(input.value) || 1)); });
    var del = row.querySelector('.cr-del');
    if (del) del.addEventListener('click', function () { api('/cart/' + id, null, 'DELETE').then(function () { location.reload(); }); });
  });

  // 주문서
  var co = document.getElementById('checkoutForm');
  if (co) {
    var sumBox = document.getElementById('coSum'), totalBox = document.getElementById('coTotal');
    var addrBox = document.getElementById('addrBox');
    var quote = function () {
      var f = new FormData(co);
      api('/checkout/quote', { coupon_code: f.get('coupon_code'), point_use: f.get('point_use'), receive_method: f.get('receive_method') })
        .then(function (r) {
          var t = r.totals;
          sumBox.innerHTML = '<dt>상품 금액</dt><dd>' + won(t.itemsTotal) + '</dd>' +
            '<dt>배송비</dt><dd>' + (t.shipping ? won(t.shipping) : '무료') + '</dd>' +
            (t.discount ? '<dt>쿠폰 할인</dt><dd>-' + won(t.discount) + '</dd>' : '') +
            (t.point ? '<dt>적립금 사용</dt><dd>-' + won(t.point) + '</dd>' : '') +
            (t.earn ? '<dt>적립 예정</dt><dd>' + won(t.earn) + '</dd>' : '');
          totalBox.textContent = won(t.total);
          if (t.couponMsg && f.get('coupon_code')) msg(co.querySelector('.form-msg'), t.couponMsg, true);
        }).catch(function () {});
    };
    co.addEventListener('change', function (e) {
      if (e.target.name === 'receive_method') addrBox.style.display = e.target.value === 'pickup' ? 'none' : '';
      quote();
    });
    co.addEventListener('input', function (e) { if (e.target.name === 'point_use' || e.target.name === 'coupon_code') quote(); });
    quote();
    co.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = co.querySelector('button[type=submit]'); btn.disabled = true;
      var o = {}; new FormData(co).forEach(function (v, k) { o[k] = v; }); o.agree = !!co.agree.checked;
      api('/checkout', o).then(function (r) { location.href = r.redirect; })
        .catch(function (err) { msg(co.querySelector('.form-msg'), err.message, true); btn.disabled = false; });
    });
  }

  // 회원·문의 폼
  var bind = function (id, url) {
    var f = document.getElementById(id); if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var o = {}; new FormData(f).forEach(function (v, k) { o[k] = v; });
      if (f.agree) o.agree = f.agree.checked;
      if (f.marketing) o.marketing = f.marketing.checked;
      var btn = f.querySelector('button[type=submit]'); btn.disabled = true;
      api(url, o).then(function (r) {
        if (r.redirect) location.href = r.redirect;
        else { msg(f.querySelector('.form-msg'), '저장했습니다.'); btn.disabled = false; if (id === 'qnaForm') f.reset(); }
      }).catch(function (err) { msg(f.querySelector('.form-msg'), err.message, true); btn.disabled = false; });
    });
  };
  bind('loginForm', '/login'); bind('signupForm', '/signup'); bind('profileForm', '/profile'); bind('qnaForm', '/qna');
})();

// 후기 슬라이드 — 자동 넘김·화살표·스와이프 (10-07)
(function () {
  var box = document.getElementById('rvSlider');
  if (!box) return;
  var strip = box.querySelector('.rv-strip');
  if (!strip || !strip.children.length) return;
  var pos = 0, timer = null;
  var step = function () { var c = strip.firstElementChild; return (c ? c.offsetWidth : 288) + 16; };
  var max = function () { return Math.max(0, strip.scrollWidth - box.offsetWidth); };
  var move = function (n) {
    var m = max();
    pos = n > m ? 0 : n < 0 ? m : n;
    strip.style.transform = 'translateX(' + -pos + 'px)';
  };
  var page = function (dir) { move(pos + dir * step() * Math.max(1, Math.floor(box.offsetWidth / step()) - 1)); };
  var play = function () { stop(); timer = setInterval(function () { move(pos + step()); }, 3500); };
  var stop = function () { if (timer) clearInterval(timer); timer = null; };
  var pv = document.querySelector('.rv-prev'), nx = document.querySelector('.rv-next');
  if (pv) pv.addEventListener('click', function () { page(-1); play(); });
  if (nx) nx.addEventListener('click', function () { page(1); play(); });
  box.addEventListener('mouseenter', stop);
  box.addEventListener('mouseleave', play);
  var x0 = null, p0 = 0;
  box.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; p0 = pos; stop(); }, { passive: true });
  box.addEventListener('touchmove', function (e) {
    if (x0 === null) return;
    strip.style.transition = 'none';
    move(p0 - (e.touches[0].clientX - x0));
  }, { passive: true });
  box.addEventListener('touchend', function () { strip.style.transition = ''; x0 = null; play(); });
  window.addEventListener('resize', function () { move(Math.min(pos, max())); });
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) play();
})();
