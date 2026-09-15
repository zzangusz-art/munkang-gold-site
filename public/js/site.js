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
    const copy = $('#calcCopy'); copy && copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(`문강금은 예상 매입가 ${total.textContent} (${sub.textContent}) ${location.origin}/calculator`); copy.textContent = '복사됨 ✓'; setTimeout(() => copy.textContent = '결과 복사', 1500); } catch (_) { /* no-op */ } });
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
    const small = b.querySelector('small'); if (small) { const o = small.textContent; small.textContent = ok ? '복사됨 ✓ 카카오톡 → 친구추가 → ID 검색' : 'ID: ' + v; b.classList.add('copied'); setTimeout(() => { small.textContent = o; b.classList.remove('copied'); }, 3500); } else if (!ok) alert('카카오톡 ID: ' + v);
  }));

  // 예약 폼 URL 파라미터 프리필
  const params = new URLSearchParams(location.search);
  if (params.get('item')) { const i = $('input[name=item]'); if (i && !i.value) i.value = params.get('item'); }
})();
