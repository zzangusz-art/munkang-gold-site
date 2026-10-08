/* 문강금은 관리자 SPA */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s); const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmt = (n) => (n === null || n === undefined || n === '') ? '-' : Number(n).toLocaleString('ko-KR');
  const dt = (ts) => ts ? new Date(ts * 1000).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
  const d8 = (ts) => ts ? new Date(ts * 1000).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-';
  const TL = { report: '금시세 리포트', product: '제품 소개', guide: '금 거래 가이드', trend: '금 시장 동향' };
  const CAT = { goldbar: '골드바', silverbar: '실버바', women: '순금 여성', men: '순금 남성', baby: '순금 아기', gift: '순금 기념품', jewelry: '주얼리(14K·18K)' };
  const IK = { sell: '금·은 팔기', buy: '구매', visit: '출장 매입', consult: '상담' };

  async function api(p, opt = {}) {
    const r = await fetch('/api/admin' + p, { headers: opt.body && !(opt.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}, ...opt, body: opt.body && !(opt.body instanceof FormData) ? JSON.stringify(opt.body) : opt.body });
    if (r.status === 401) { showLogin(); throw new Error('로그인 필요'); }
    const ct = r.headers.get('content-type') || ''; const j = ct.includes('json') ? await r.json() : await r.text();
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  }
  let toastT; function toast(m, err) { const t = $('#toast'); t.textContent = m; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, err ? 6000 : 3000); }
  function modal(html) { $('#modalBody').innerHTML = html; $('#modal').hidden = false; }
  function closeModal() { $('#modal').hidden = true; }
  $('#modalClose').onclick = closeModal; $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  const busy = async (btn, fn) => { btn.disabled = true; const t = btn.textContent; btn.textContent = '처리 중…'; try { await fn(); } catch (e) { toast(e.message, true); } finally { btn.disabled = false; btn.textContent = t; } };

  function showLogin() { $('#login').hidden = false; $('#app').hidden = true; }
  $('#loginForm').onsubmit = async (e) => { e.preventDefault(); const f = new FormData(e.target); try { await api('/login', { method: 'POST', body: { id: f.get('id'), pw: f.get('pw') } }); boot(); } catch (err) { $('#loginMsg').textContent = err.message; } };
  $('#logout').onclick = async () => { await api('/logout', { method: 'POST' }); showLogin(); };

  const views = {};
  const DEV_ONLY = ['posts', 'auto', 'plan', 'reports', 'audit', 'settings'];
  // 업체 운영자(role=shop)는 매장 운영 메뉴만 본다
  function applyRole(admin) {
    const role = (admin && admin.role) || 'dev';
    document.body.dataset.role = role;
    if (role !== 'shop') return;
    DEV_ONLY.forEach(v => { const a = $(`#menu a[data-v=${v}]`); if (a) a.remove(); });
    const cur = location.hash.slice(1);
    if (DEV_ONLY.includes(cur)) location.hash = 'dash';
  }
  async function go(v) {
    if (document.body.dataset.role === 'shop' && DEV_ONLY.includes(v)) v = 'dash'; location.hash = v; $$('#menu a').forEach(a => a.classList.toggle('active', a.dataset.v === v)); $('#view').innerHTML = '<p class="muted">불러오는 중…</p>'; try { await views[v](); } catch (e) { $('#view').innerHTML = `<p class="up">${esc(e.message)}</p>`; } }
  $$('#menu a').forEach(a => a.onclick = () => go(a.dataset.v));
  window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (views[v] && !$(`#menu a[data-v=${v}]`).classList.contains('active')) go(v); });
  async function boot() { try { const me = await api('/me'); applyRole(me.admin); $('#login').hidden = true; $('#app').hidden = false; const v = location.hash.slice(1); go(DEV_ONLY.includes(v) && document.body.dataset.role === 'shop' ? 'dash' : (v || 'dash')); } catch (_) { showLogin(); } }

  // ── 대시보드 ──
  // ===== 대시보드 (시세·주문·회원·유입) 2026-10-08 =====
  const OST2 = { pending: '입금 대기', paid: '결제 완료', ready: '상품 준비', shipping: '배송 중', done: '배송 완료', cancel: '취소', refund: '환불' };
  let trafficDays = 7;

  function trafficCard(tr) {
    const bar = (rows, type) => rows.length ? `<table class="drill"><tbody>${rows.map(r => {
      const pct = tr.total ? Math.round(r.count / Math.max(1, rows[0].count) * 100) : 0;
      return `<tr data-drill="${type}" data-key="${esc(r.key)}"><td class="dk">${esc(r.key)}</td><td class="dbar"><i style="width:${pct}%"></i></td><td class="num">${fmt(r.count)}</td></tr>`;
    }).join('')}</tbody></table>` : '<p class="muted small">아직 기록이 없습니다.</p>';
    const spark = tr.daily.length ? `<div class="spark">${tr.daily.map(d => {
      const max = Math.max(1, ...tr.daily.map(x => x.human));
      return `<i title="${d.date} 사람 ${d.human} · AI ${d.ai} · 검색 ${d.search}" style="height:${Math.round(6 + d.human / max * 30)}px"></i>`;
    }).join('')}</div>` : '';
    return `<div class="card"><div class="toolbar"><h3 style="margin:0">방문 유입</h3><span class="sp"></span>
      ${[1, 7, 30].map(d => `<button class="btn sm ${trafficDays === d ? 'primary' : ''}" data-days="${d}">${d === 1 ? '오늘' : d + '일'}</button>`).join('')}</div>
      <p class="small muted">${tr.from} ~ ${tr.to} · 사람 <b>${fmt(tr.byAgent.human || 0)}</b> · AI 크롤러 <b>${fmt(tr.byAgent['ai-bot'] || 0)}</b> · 검색 크롤러 <b>${fmt(tr.byAgent['search-bot'] || 0)}</b></p>
      ${spark}
      <div class="grid g2" style="margin-top:10px">
        <div><h4>유입 채널</h4>${bar(tr.channels, 'channel')}</div>
        <div><h4>많이 본 페이지</h4>${bar(tr.pages, 'page')}</div>
      </div>
      <div class="grid g2" style="margin-top:10px">
        <div><h4>AI 답변엔진 크롤러</h4>${bar(tr.aiBots, 'bot')}</div>
        <div><h4>검색엔진 크롤러</h4>${bar(tr.searchBots, 'bot')}</div>
      </div>
      <p class="small muted">행을 누르면 어떤 페이지로 들어왔는지, 어떤 날에 들어왔는지 자세히 볼 수 있습니다.</p></div>`;
  }

  function bindTraffic() {
    $$('[data-days]').forEach(b => b.onclick = async () => { trafficDays = Number(b.dataset.days); views.dash(); });
    $$('[data-drill]').forEach(tr2 => tr2.onclick = async () => {
      const type = tr2.dataset.drill, key = tr2.dataset.key;
      const d = await api(`/traffic/drill?type=${type}&key=${encodeURIComponent(key)}&days=${trafficDays}`);
      modal(`<h2>${esc(d.title)}</h2><p class="muted small">최근 ${trafficDays === 1 ? '오늘' : trafficDays + '일'} · 방문 ${fmt(d.total)}회</p>
${d.groups.map(g2 => `<h4>${esc(g2.label)}</h4>${g2.rows.length ? `<div class="tbl"><table><tbody>${g2.rows.map(r => `<tr><td>${esc(r.key)}</td><td class="num">${fmt(r.count)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">기록 없음</p>'}`).join('')}`);
    });
  }

  views.dash = async () => {
    const d = await api('/shop-dash');
    $('#inqBadge').hidden = !d.inquiries.new; $('#inqBadge').textContent = d.inquiries.new;
    const o = d.orders, m = d.members, q = d.quotes;
    const gold = q.rows.find(r => r.code === 'au999') || {};
    const waiting = (o.byStatus.pending || 0) + (o.byStatus.paid || 0) + (o.byStatus.ready || 0);
    $('#view').innerHTML = `<h1>대시보드 <span class="muted small">${d.today} 기준</span></h1>
<div class="grid g4">
  <div class="kpi gold"><b>${fmt(gold.buy)}</b><span>순금 매입가(원/돈) · ${esc(q.updatedText)} 기준</span></div>
  <div class="kpi"><b>${fmt(o.todayCount)}건</b><span>오늘 주문 · 결제 ${fmt(o.todaySum)}원</span></div>
  <div class="kpi ${waiting ? 'warn' : ''}"><b>${fmt(waiting)}건</b><span>처리할 주문(입금대기·준비·발송 전)</span></div>
  <div class="kpi"><b>${fmt(m.total)}명</b><span>회원 · 최근 7일 +${fmt(m.week)}명</span></div>
</div>

<div class="grid g2" style="margin-top:14px">
  <div class="card"><div class="toolbar"><h3 style="margin:0">오늘 시세</h3><span class="sp"></span><span class="pill ${q.source === 'manual' ? 'ok' : 'warn'}">${q.source === 'manual' ? '수기 입력' : '자동 수집'}</span></div>
    <div class="tbl"><table><thead><tr><th>종목</th><th class="num">매입가</th><th class="num">판매가</th><th class="num">전일 대비</th></tr></thead><tbody>
    ${q.rows.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${fmt(r.buy)}</td><td class="num">${r.sell ? fmt(r.sell) : '-'}</td><td class="num ${r.diff > 0 ? 'up' : r.diff < 0 ? 'down' : ''}">${r.diff ? (r.diff > 0 ? '▲' : '▼') + fmt(Math.abs(r.diff)) : '-'}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="small muted">단위 원/돈(3.75g) · 저장하면 홈·상품 가격에 바로 반영됩니다.</p>
    <div class="toolbar"><button class="btn primary sm" onclick="location.hash='quotes'">오늘 시세 입력 →</button></div></div>

  <div class="card"><div class="toolbar"><h3 style="margin:0">주문 현황</h3><span class="sp"></span><button class="btn sm" onclick="location.hash='orders'">주문 관리 →</button></div>
    <p class="small muted">최근 7일 ${fmt(o.week)}건 · 결제 ${fmt(o.weekSum)}원</p>
    <p>${Object.entries(OST2).map(([k, v]) => `<span class="pill ${k === 'pending' && o.byStatus.pending ? 'warn' : ''}">${v} ${fmt(o.byStatus[k] || 0)}</span>`).join(' ')}</p>
    <div class="tbl"><table><thead><tr><th>주문번호</th><th>주문자</th><th class="num">금액</th><th>상태</th></tr></thead><tbody>
    ${o.recent.map(r => `<tr><td class="small">${esc(r.order_no)}<br><span class="muted">${dt(r.created_at)}</span></td><td class="small">${esc(r.buyer_name)}<br><span class="muted">${r.receive_method === 'pickup' ? '매장수령' : '택배'}</span></td><td class="num">${fmt(r.total)}</td><td class="small">${OST2[r.status] || r.status}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">주문이 없습니다.</td></tr>'}
    </tbody></table></div></div>
</div>

<div class="grid g2">
  <div class="card"><div class="toolbar"><h3 style="margin:0">회원 현황</h3><span class="sp"></span><button class="btn sm" onclick="location.hash='members'">회원 관리 →</button></div>
    <p>전체 <b>${fmt(m.total)}명</b> · 최근 7일 가입 <b>${fmt(m.week)}명</b> · 구매 경험 <b>${fmt(m.buyers)}명</b> · 적립금 잔액 <b>${fmt(m.points)}원</b></p>
    <div class="tbl"><table><thead><tr><th>이름</th><th>이메일</th><th>가입일</th><th class="num">적립금</th></tr></thead><tbody>
    ${m.recent.map(r => `<tr><td>${esc(r.name)}</td><td class="small">${esc(r.email)}</td><td class="small">${d8(r.created_at)}</td><td class="num">${fmt(r.points)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">가입한 회원이 없습니다.</td></tr>'}
    </tbody></table></div>
    ${d.qna.open ? `<p class="small"><span class="pill warn">답변 대기 1:1 문의 ${d.qna.open}건</span> <button class="btn sm" onclick="location.hash='shop'">답변하러 가기 →</button></p>` : ''}</div>

  ${trafficCard(d.traffic)}
</div>`;
    bindTraffic();
  };

  // ── 시세 ──
  views.quotes = async () => {
    const d = await api('/quotes'); const sp = d.spot; const st = d.settings;
    $('#view').innerHTML = `<h1>시세 관리 <span class="muted small">단위: 원/돈(3.75g) · 저장 즉시 홈·시세표·제품 가격·llms.txt 반영, 이력 자동 저장</span></h1>
<div class="card"><h3 style="margin-top:0">오늘 시세 입력</h3><p class="small muted">매입가 = 고객이 파실 때 드리는 금액, 판매가 = 골드바·실버바 판매 기준(부가세 포함). 비워 두면 기존 값 유지. 판매가가 없는 종목은 "문의"로 표시됩니다.</p>
<div class="tbl"><table><thead><tr><th>코드</th><th>종목</th><th>순도</th><th class="num">매입가(원/돈)</th><th class="num">판매가(원/돈)</th><th class="num">전일 매입</th><th class="num">등락</th><th>비고</th><th>갱신</th><th></th></tr></thead><tbody id="qRows">${d.rows.map(r => `<tr data-code="${esc(r.code)}"><td class="small">${esc(r.code)}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.purity || '')}</td><td class="num"><input name="buy" type="number" step="100" value="${r.buy ?? ''}"></td><td class="num"><input name="sell" type="number" step="100" value="${r.sell ?? ''}" placeholder="문의"></td><td class="num muted">${fmt(r.prev_buy)}</td><td class="num ${r.diff > 0 ? 'up' : r.diff < 0 ? 'down' : ''}">${r.diff > 0 ? '+' : ''}${fmt(r.diff)} (${r.pct}%)</td><td><input name="note" value="${esc(r.note || '')}" style="text-align:left"></td><td class="small muted">${dt(r.updated_at)}</td><td><button class="btn sm danger" data-del="${esc(r.code)}">삭제</button></td></tr>`).join('')}</tbody></table></div>
<div class="toolbar" style="margin-top:10px"><button class="btn primary" id="saveQ">시세 저장</button><button class="btn" id="addQ">+ 종목 추가</button><span class="sp"></span><a class="btn" href="/api/admin/quotes/template.xlsx">엑셀 양식(현재 값)</a><label class="btn" for="qFile">엑셀 업로드</label><input type="file" id="qFile" accept=".xlsx,.xls,.csv" hidden></div><div id="upResult"></div></div>
<div class="card"><h3 style="margin-top:0">14K·18K 주얼리 환산 기준</h3>
  <p class="small muted">14K 중량 ÷ 3.75 = 14K 돈 수 → 14K 돈 수 × 순금 환산 계수 = 순금 돈 수 → 순금 판매가 × 순금 돈 수 + 공임 = 판매가. 18K를 고르면 중량 = 14K 중량 × 18K 중량 배수.</p>
  <form id="karatForm" class="form"><div class="row3"><label>14K 순금 환산 계수 <input name="k14_pure_factor" type="number" step="0.0001" value="${esc(st.k14_pure_factor)}"></label><label>18K 중량 배수 <input name="k18_weight_factor" type="number" step="0.01" value="${esc(st.k18_weight_factor)}"></label><label>18K 순금 환산 계수 <input name="k18_pure_factor" type="number" step="0.0001" value="${esc(st.k18_pure_factor)}"></label></div>
  <p class="small" id="karatEx"></p><button class="btn primary">환산 기준 저장</button></form></div>
<div class="card"><h3 style="margin-top:0">실시간 시세 수집</h3>
  <p>${d.live.fetchedAt ? `마지막 수집 <b>${dt(d.live.fetchedAt)}</b> · 출처 <b>${esc(d.live.source || '-')}</b>${d.live.officialAt ? ' · 고시 ' + esc(d.live.officialAt) : ''}` : '<span class="pill warn">아직 수집 안 됨</span>'}${d.live.error ? ` <span class="pill warn">최근 오류: ${esc(d.live.error)}</span>` : ''}</p>
  <form id="liveForm" class="form"><div class="row3"><label>시세 반영 방식 <select name="quote_source">${[['manual', '직접 입력만(권장)'], ['live', '실시간 수집 자동 반영'], ['spot', '국제시세 환산(하루 2회)']].map(([v, l]) => `<option value="${v}"${st.quote_source === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label>수집 주기(분) <input name="live_interval_min" type="number" min="1" max="60" value="${esc(st.live_interval_min)}"></label><label>매입가 조정(%) <input name="live_buy_adj_pct" type="number" step="0.1" value="${esc(st.live_buy_adj_pct)}"></label></div>
  <div class="row3"><label>판매가 조정(%) <input name="live_sell_adj_pct" type="number" step="0.1" value="${esc(st.live_sell_adj_pct)}"></label></div>
  <div class="toolbar"><button class="btn primary">저장</button><button type="button" class="btn gold" id="liveNow">지금 수집</button></div></form>
  <p class="small muted">실시간 모드에서는 위 표에 직접 넣은 값이 다음 수집 때 덮어써집니다. 매장 가격을 따로 운영하려면 '직접 입력만'으로 바꾸세요. 조정 예: 매입가 -1 → 고시가보다 1% 낮게, 판매가 2 → 2% 높게 표시.</p></div>
<div class="grid g2">
  <div class="card"><h3 style="margin-top:0">국제 시세 환산(참고)</h3>
    <p>${sp.available ? `XAU <b>$${sp.xau}</b>/oz${sp.xag ? ` · XAG $${sp.xag}` : ''}${sp.xpt ? ` · XPT $${sp.xpt}` : ''} · USDKRW <b>${sp.usdkrw}</b> · 순금 환산 <b>${fmt(sp.gold_krw_g)}원/g · ${fmt(sp.gold_krw_don)}원/돈</b><br><span class="small muted">${esc(sp.updated_at)} · ${esc(sp.source)}</span>` : '<span class="pill warn">아직 조회 안 됨</span>'}</p>
    <form id="spotForm" class="form"><div class="row3"><label>매입 스프레드(%) <input name="spot_buy_spread_pct" type="number" step="0.1" value="${esc(st.spot_buy_spread_pct)}"></label><label>판매 스프레드(%) <input name="spot_sell_spread_pct" type="number" step="0.1" value="${esc(st.spot_sell_spread_pct)}"></label><label>제품 마진(%) <input name="margin_pct" type="number" step="0.1" value="${esc(st.margin_pct)}"></label></div>
    <label class="check"><input type="checkbox" name="spot_fetch" ${st.spot_fetch !== '0' ? 'checked' : ''}> 국제시세 자동 조회(참고 표시)</label>
    <label>시세 안내 문구 <textarea name="quote_note" style="min-height:60px">${esc(st.quote_note)}</textarea></label>
    <div class="toolbar"><button class="btn primary">설정 저장</button><button type="button" class="btn" id="spotRefresh">지금 조회</button><button type="button" class="btn gold" id="spotApply">환산값으로 시세 한 번 반영</button></div></form>
    <p class="small muted">환산: 달러/온스 ÷ 31.1035 × 환율 × 3.75. 매입가 = 환산가 × (1 − 매입 스프레드), 순금 판매가 = 환산가 × (1 + 판매 스프레드). 실제 매장 정책에 맞게 스프레드를 조정하세요.</p></div>
  <div class="card"><h3 style="margin-top:0">갱신 이력</h3><div class="tbl" style="max-height:340px"><table><thead><tr><th>일시</th><th>방식</th><th class="num">종목</th><th>담당</th><th>내용</th></tr></thead><tbody>${d.updates.map(u => `<tr><td class="small">${dt(u.created_at)}</td><td>${esc(u.source)}</td><td class="num">${u.rows}</td><td>${esc(u.by_admin)}</td><td class="small muted">${esc((u.filename || '') + ' ' + (u.detail || '')).slice(0, 80)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">없음</td></tr>'}</tbody></table></div>
  <h3>국제시세 30일</h3><div class="spark">${d.spotHistory.map(h => `<i title="${h.date} $${h.xau}" style="height:${Math.round(20 + (h.xau / Math.max(...d.spotHistory.map(x => x.xau)) * 16))}px"></i>`).join('') || '<span class="muted small">데이터 없음</span>'}</div></div>
</div>`;
    $('#saveQ').onclick = (e) => busy(e.target, async () => { const rows = $$('#qRows tr').map(tr => ({ code: tr.dataset.code, buy: tr.querySelector('[name=buy]').value, sell: tr.querySelector('[name=sell]').value, note: tr.querySelector('[name=note]').value })); const r = await api('/quotes', { method: 'POST', body: { rows } }); toast(`저장 — ${r.rows}종목 반영`); views.quotes(); });
    $('#addQ').onclick = () => { modal(`<h2>종목 추가</h2><form class="form" id="qf"><div class="row3"><label>코드(영문·숫자) <input name="code" required placeholder="예: au375"></label><label>종목명 <input name="name" required placeholder="예: 9K"></label><label>순도 <input name="purity" placeholder="예: 375"></label></div><div class="row3"><label>금속 <select name="metal"><option value="gold">금</option><option value="silver">은</option><option value="platinum">백금</option></select></label><label>매입가(원/돈) <input name="buy" type="number"></label><label>판매가(원/돈) <input name="sell" type="number"></label></div><label>정렬 <input name="sort" type="number" value="50"></label><button class="btn primary">추가</button></form>`); $('#qf').onsubmit = async (e) => { e.preventDefault(); try { await api('/quotes', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); closeModal(); toast('추가'); views.quotes(); } catch (err) { toast(err.message, true); } }; };
    $$('[data-del]').forEach(b => b.onclick = async () => { if (confirm(`${b.dataset.del} 종목을 삭제할까요? 이력도 삭제됩니다.`)) { await api('/quotes/' + b.dataset.del, { method: 'DELETE' }); views.quotes(); } });
    $('#qFile').onchange = async () => { const f = $('#qFile').files[0]; if (!f) return; const fd = new FormData(); fd.append('file', f); fd.append('dry', '1'); $('#upResult').innerHTML = '<p class="muted">파일 검사 중…</p>'; try { const pv = await api('/quotes/upload', { method: 'POST', body: fd }); $('#upResult').innerHTML = `<div class="card"><b>${pv.count}행 인식</b> ${pv.errors.length ? `<span class="up">(경고: ${esc(pv.errors.join('; '))})</span>` : ''}<table><thead><tr><th>코드</th><th class="num">매입</th><th class="num">판매</th></tr></thead><tbody>${pv.preview.map(r => `<tr><td>${esc(r.code)}</td><td class="num">${fmt(r.buy)}</td><td class="num">${fmt(r.sell)}</td></tr>`).join('')}</tbody></table><button class="btn primary" id="doUp">이대로 반영</button></div>`; $('#doUp').onclick = (e) => busy(e.target, async () => { const fd2 = new FormData(); fd2.append('file', f); const r = await api('/quotes/upload', { method: 'POST', body: fd2 }); toast(`반영 ${r.rows}종목`); views.quotes(); }); } catch (e) { $('#upResult').innerHTML = `<p class="up">${esc(e.message)}</p>`; } };
    $('#spotForm').onsubmit = async (e) => { e.preventDefault(); const f = e.target; await api('/quotes/settings', { method: 'POST', body: { spot_buy_spread_pct: f.spot_buy_spread_pct.value, spot_sell_spread_pct: f.spot_sell_spread_pct.value, margin_pct: f.margin_pct.value, spot_fetch: f.spot_fetch.checked ? '1' : '0', quote_note: f.quote_note.value } }); toast('설정 저장'); };
    $('#liveForm').onsubmit = async (e) => { e.preventDefault(); const f = e.target; await api('/quotes/settings', { method: 'POST', body: { quote_source: f.quote_source.value, live_interval_min: f.live_interval_min.value, live_buy_adj_pct: f.live_buy_adj_pct.value, live_sell_adj_pct: f.live_sell_adj_pct.value } }); toast('저장'); views.quotes(); };
    { const f = $('#karatForm'); const ex = () => { const k14 = Number(f.k14_pure_factor.value) || 0, w = Number(f.k18_weight_factor.value) || 0, k18 = Number(f.k18_pure_factor.value) || 0; const don = 3.75 / 3.75; $('#karatEx').innerHTML = `예) 14K 3.75g → 14K ${don}돈 → 순금 <b>${(don * k14).toFixed(4)}돈</b> · 18K ${(3.75 * w).toFixed(2)}g → 순금 <b>${(3.75 * w / 3.75 * k18).toFixed(4)}돈</b>`; }; f.oninput = ex; ex();
      f.onsubmit = async (e) => { e.preventDefault(); await api('/quotes/settings', { method: 'POST', body: { k14_pure_factor: f.k14_pure_factor.value, k18_weight_factor: f.k18_weight_factor.value, k18_pure_factor: f.k18_pure_factor.value } }); toast('환산 기준 저장 · 제품 가격에 바로 반영'); }; }
    $('#liveNow').onclick = (e) => busy(e.target, async () => { const r = await api('/quotes/live/refresh', { method: 'POST' }); toast(`수집 완료 · ${r.changed}종목 변경`); views.quotes(); });
    $('#spotRefresh').onclick = (e) => busy(e.target, async () => { const r = await api('/quotes/spot/refresh', { method: 'POST' }); toast(`조회 완료 XAU $${r.spot.xau} · USDKRW ${r.spot.usdkrw}`); views.quotes(); });
    $('#spotApply').onclick = (e) => busy(e.target, async () => { if (!confirm('국제시세 환산값으로 순금·22K·18K·14K·은·백금 시세를 덮어씁니다. 진행할까요?')) return; const r = await api('/quotes/spot/apply', { method: 'POST' }); toast(`${r.rows}종목 반영`); views.quotes(); });
  };

  // ── 제품 ──
  views.products = async () => {
    const rows = await api('/products');
    $('#view').innerHTML = `<h1>제품 관리 <span class="muted small">${rows.length}개 · 가격 = (판매 시세/g × 순중량 + 공임) × (1+마진) · 소개글 ${rows.filter(r => r.has_body).length}개</span></h1>
<p class="small muted">가격은 시세에 자동 연동됩니다. 고정가를 넣으면 시세와 무관하게 표시됩니다. 소개글은 자동발행이 매일 채우거나 「AI 생성」/「템플릿 생성」으로 바로 만들 수 있습니다.</p>
<div class="toolbar"><input id="pf" placeholder="검색" style="max-width:240px"><span class="sp"></span><button class="btn gold" id="addP">+ 제품 추가</button></div>
<div class="tbl"><table><thead><tr><th>제품</th><th>분류</th><th>순도</th><th class="num">순중량(g)</th><th class="num">공임</th><th class="num">현재 가격</th><th>뱃지</th><th>표시</th><th>소개글</th><th></th></tr></thead><tbody>${rows.map(r => `<tr data-n="${esc(r.name)}"><td><b>${esc(r.name)}</b><br><a class="small" href="/products/${esc(r.slug)}" target="_blank">보기 ↗</a></td><td>${CAT[r.category] || r.category}</td><td>${esc(r.purity)}</td><td class="num">${r.weight_g}</td><td class="num">${fmt(r.labor)}</td><td class="num"><b>${fmt(r.price)}</b>${r.price_fixed ? '<br><span class="pill muted">고정</span>' : ''}</td><td>${esc(r.badge || '')}</td><td class="small">${r.featured ? 'BEST ' : ''}${r.ready_today ? '오늘출발 ' : ''}${r.karat_option ? '14/18K' : ''}</td><td>${r.has_body ? `<span class="pill ok">${r.ai_generated ? 'AI' : '작성'}</span>` : '<span class="pill warn">없음</span>'}</td><td><button class="btn sm" data-edit="${r.id}">편집</button> <button class="btn sm" data-gen="${r.id}">AI 생성</button> <button class="btn sm" data-tpl="${r.id}">템플릿</button> <button class="btn sm" data-opts="${r.id}">옵션</button><button class="btn sm danger" data-del="${r.id}">삭제</button></td></tr>`).join('')}</tbody></table></div>`;
    $('#pf').oninput = (e) => { const v = e.target.value.trim(); $$('tbody tr').forEach(tr => tr.style.display = !v || tr.dataset.n.includes(v) ? '' : 'none'); };
    $$('[data-gen]').forEach(b => b.onclick = () => busy(b, async () => { const r = await api(`/products/${b.dataset.gen}/generate`, { method: 'POST', body: {} }); toast('생성: ' + r.post.title); views.products(); }));
    $$('[data-tpl]').forEach(b => b.onclick = () => busy(b, async () => { const r = await api(`/products/${b.dataset.tpl}/generate`, { method: 'POST', body: { template: true } }); toast('템플릿 생성: ' + r.post.title); views.products(); }));
    $$('[data-del]').forEach(b => b.onclick = async () => { if (confirm('삭제?')) { await api('/products/' + b.dataset.del, { method: 'DELETE' }); views.products(); } });
    const form = async (id) => { const p = id ? await api('/products/' + id) : {}; modal(`<h2>${id ? '제품 편집' : '제품 추가'}</h2><form class="form" id="pform"><input type="hidden" name="id" value="${id || ''}"><div class="row3"><label>이름 <input name="name" value="${esc(p.name || '')}" required></label><label>분류 <select name="category">${Object.entries(CAT).map(([k, v]) => `<option value="${k}" ${p.category === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>slug(URL) <input name="slug" value="${esc(p.slug || '')}" placeholder="비우면 자동"></label></div><div class="row3"><label>금속 <select name="metal"><option value="gold" ${p.metal !== 'silver' ? 'selected' : ''}>금</option><option value="silver" ${p.metal === 'silver' ? 'selected' : ''}>은</option></select></label><label>순도 <input name="purity" value="${esc(p.purity || '999.9')}"></label><label>순중량(g) <input name="weight_g" type="number" step="0.001" value="${p.weight_g ?? ''}"></label></div><p class="small" id="convPrev" style="margin:-4px 0 8px;color:#8a6a1f"></p><div class="row3"><label>시세 코드 <input name="quote_code" value="${esc(p.quote_code || 'au999')}" placeholder="au999 / ag999"></label><label>공임(원) <input name="labor" type="number" value="${p.labor ?? 0}"></label><label>마진(%) 비우면 설정값 <input name="margin_pct" type="number" step="0.1" value="${p.margin_pct ?? ''}"></label></div><div class="row3"><label>고정가(원) 비우면 시세 연동 <input name="price_fixed" type="number" value="${p.price_fixed ?? ''}"></label><label>뱃지 <input name="badge" value="${esc(p.badge || '')}" placeholder="BEST / 선물추천 / NEW"></label><label>메인 진열 <select name="section_tag"><option value="">노출 안 함</option>${[['best', 'BEST 탭'], ['gift', 'GIFT 탭'], ['diamond', 'DIAMOND 탭'], ['collection', 'GOLD COLLECTION'], ['weekly', 'WEEKLY SPECIAL(특가)']].map(([k, v]) => `<option value="${k}" ${p.section_tag === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>정렬 <input name="sort" type="number" value="${p.sort ?? 0}"></label></div><label>이미지 URL <input name="image" value="${esc(p.image || '')}" placeholder="/uploads/products/xxx.jpg"> <input type="file" id="pimg" accept="image/*"></label><label>한 줄 요약 <input name="summary" value="${esc(p.summary || '')}"></label><label>본문 HTML <textarea name="body_html" style="min-height:200px">${esc(p.body_html || '')}</textarea></label><label>FAQ JSON [{"q":"","a":""}] <textarea name="faq_json" style="min-height:70px">${esc(p.faq_json || '[]')}</textarea></label><div class="row3"><label class="check"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}> BEST(홈 추천)</label><label class="check"><input type="checkbox" name="ready_today" ${p.ready_today ? 'checked' : ''}> 오늘 출발</label><label class="check"><input type="checkbox" name="karat_option" ${p.karat_option ? 'checked' : ''}> 14K 등록 + 18K 선택(중량 ×1.2)</label></div>
<label>스톤 옵션 — 한 줄에 하나, 이름=추가금액 <button type="button" class="btn sm" id="stonePreset">모이사나이트·랩다이아 넣기</button><textarea name="stone_text" style="min-height:64px" placeholder="모이사나이트=0&#10;랩다이아=300000">${(() => { try { return JSON.parse(p.stone_json || '[]').map(x => `${x.name}=${x.add || 0}`).join('\n'); } catch (e) { return ''; } })()}</textarea></label>
<div class="row"><label>상태 <select name="status"><option value="published" ${p.status !== 'draft' ? 'selected' : ''}>공개</option><option value="draft" ${p.status === 'draft' ? 'selected' : ''}>비공개</option></select></label></div><button class="btn primary">저장</button></form>`);
      { const kf = await api('/karat').catch(() => null); const f = $('#pform');
        const prev = () => { const is14 = f.quote_code.value === 'au585' || f.purity.value === '585'; const w = Number(f.weight_g.value) || 0; const el = $('#convPrev'); if (!is14 || !w || !kf) { el.textContent = ''; return; }
          const k = kf.factors, don14 = w / 3.75, pure14 = don14 * k.k14, w18 = w * k.k18w, pure18 = w18 / 3.75 * k.k18, lab = Number(f.labor.value) || 0, sell = kf.pureSell || 0;
          el.innerHTML = `14K ${w}g = ${don14.toFixed(4)}돈 → 순금 <b>${pure14.toFixed(4)}돈</b>${sell ? ` → 판매가 약 <b>${fmt(Math.round((sell * pure14 + lab) / 100) * 100)}원</b>` : ''} · 18K ${w18.toFixed(3)}g → 순금 ${pure18.toFixed(4)}돈${sell ? ` → 약 ${fmt(Math.round((sell * pure18 + lab) / 100) * 100)}원` : ''} <span class="muted">(공임 포함, 스톤 별도)</span>`; };
        ['weight_g', 'purity', 'quote_code', 'labor'].forEach(n => f[n].addEventListener('input', prev)); prev(); }
      $('#stonePreset').onclick = () => { const t = $('#pform').stone_text; if (!t.value.trim() || confirm('입력된 스톤 옵션을 바꿀까요?')) t.value = '모이사나이트=0\n랩다이아=300000'; $('#pform').karat_option.checked = true; };
      $('#pimg').onchange = async () => { const f = $('#pimg').files[0]; if (!f) return; const fd = new FormData(); fd.append('file', f); try { const r = await api('/products/upload-image', { method: 'POST', body: fd }); $('#pform').image.value = r.url; toast('이미지 업로드'); } catch (e) { toast(e.message, true); } };
      $('#pform').onsubmit = async (e) => { e.preventDefault(); const o = Object.fromEntries(new FormData(e.target)); o.featured = e.target.featured.checked; o.ready_today = e.target.ready_today.checked; o.karat_option = e.target.karat_option.checked;
        o.stone_json = JSON.stringify(String(o.stone_text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [n, a] = l.split('='); return { name: (n || '').trim(), add: Number(String(a || '').replace(/[^\d.-]/g, '')) || 0 }; }).filter(x => x.name)); delete o.stone_text; try { JSON.parse(o.faq_json || '[]'); await api('/products', { method: 'POST', body: o }); closeModal(); toast('저장'); views.products(); } catch (err) { toast(err.message, true); } }; };
    $$('[data-opts]').forEach(b => b.onclick = async () => {
      const pid = b.dataset.opts;
      const rows = await api(`/products/${pid}/options`);
      const KINDS = [['karat', '순도(14K·18K)'], ['size', '호수·사이즈'], ['design', '디자인·색상'], ['stone', '스톤'], ['etc', '기타']];
      const line = (o) => `<tr><td><select name="kind">${KINDS.map(([k, v]) => `<option value="${k}"${(o && o.kind) === k ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
<td><input name="label" value="${esc(o ? o.label : '')}" placeholder="예: 18K / 12호 / 랩다이아"></td>
<td><input name="add_price" type="number" value="${o ? o.add_price : 0}" style="width:110px"></td>
<td><input name="weight_mult" type="number" step="0.01" value="${o && o.weight_mult ? o.weight_mult : ''}" placeholder="18K=1.2" style="width:90px"></td>
<td><button type="button" class="btn sm danger" data-orm>삭제</button></td></tr>`;
      modal(`<h2>상품 옵션</h2><p class="small muted">옵션은 상세페이지에서 드롭다운으로 보입니다. 추가금액은 선택 시 더해지고, 중량 배수는 18K처럼 금 중량이 달라질 때만 넣습니다.</p>
<div class="tbl"><table><thead><tr><th>구분</th><th>옵션명</th><th class="num">추가금액(원)</th><th>중량 배수</th><th></th></tr></thead><tbody id="optRows">${(rows.length ? rows : [null]).map(line).join('')}</tbody></table></div>
<div class="toolbar"><button class="btn sm" id="optAdd">+ 줄 추가</button><span class="sp"></span><button class="btn primary" id="optSave">저장</button></div>`);
      const bind = () => $$('[data-orm]').forEach(x => x.onclick = () => { if ($$('#optRows tr').length > 1) x.closest('tr').remove(); });
      bind();
      $('#optAdd').onclick = () => { $('#optRows').insertAdjacentHTML('beforeend', line(null)); bind(); };
      $('#optSave').onclick = (e) => busy(e.target, async () => {
        const rows2 = $$('#optRows tr').map((tr, i) => ({
          kind: tr.querySelector('[name=kind]').value, label: tr.querySelector('[name=label]').value.trim(),
          add_price: tr.querySelector('[name=add_price]').value, weight_mult: tr.querySelector('[name=weight_mult]').value, sort: i,
        })).filter(r => r.label);
        const r = await api(`/products/${pid}/options`, { method: 'POST', body: { rows: rows2 } });
        toast(r.count + '개 옵션 저장'); closeModal();
      });
    });
    $('#addP').onclick = () => form(); $$('[data-edit]').forEach(b => b.onclick = () => form(b.dataset.edit));
  };

  // ── 콘텐츠 ──
  views.posts = async (status = '') => {
    const rows = await api('/posts?kind=blog' + (status ? '&status=' + status : ''));
    $('#view').innerHTML = `<h1>콘텐츠(블로그)</h1><div class="toolbar"><button class="btn ${!status ? 'primary' : ''}" data-s="">전체</button><button class="btn ${status === 'published' ? 'primary' : ''}" data-s="published">발행</button><button class="btn ${status === 'draft' ? 'primary' : ''}" data-s="draft">초안</button><span class="sp"></span><button class="btn" id="genNow">지금 1건 생성</button><button class="btn gold" id="newPost">+ 직접 작성</button></div>
<div class="tbl"><table><thead><tr><th>제목</th><th>유형</th><th>상태</th><th>생성</th><th>인블로그</th><th>발행</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.title)}</b><br><a class="small" href="/blog/${esc(r.slug)}" target="_blank">/blog/${esc(r.slug)}</a></td><td>${TL[r.type] || r.type || ''}</td><td><span class="pill ${r.status === 'published' ? 'ok' : 'warn'}">${r.status === 'published' ? '발행' : '초안'}</span></td><td class="small">${r.source === 'ai' ? 'AI ' + esc(r.model || '') : r.source === 'template' ? '템플릿' : '수동'}<br><span class="muted">${esc(r.gen_slot || '')}</span></td><td>${r.inblog_status === 'published' ? '<span class="pill ok">동기화</span>' : r.inblog_status === 'error' ? `<span class="pill err" title="${esc(r.inblog_error)}">오류</span>` : r.inblog_status === 'draft' ? '<span class="pill">초안</span>' : '<span class="pill muted">-</span>'}</td><td class="small">${dt(r.published_at)}</td><td><button class="btn sm" data-edit="${r.id}">편집</button> <button class="btn sm ${r.status === 'published' ? '' : 'primary'}" data-pub="${r.id}" data-to="${r.status === 'published' ? '0' : '1'}">${r.status === 'published' ? '내리기' : '발행'}</button> <button class="btn sm" data-ib="${r.id}">인블로그 전송</button> <button class="btn sm danger" data-del="${r.id}">삭제</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">없음</td></tr>'}</tbody></table></div>`;
    $$('[data-s]').forEach(b => b.onclick = () => views.posts(b.dataset.s));
    $('#genNow').onclick = (e) => busy(e.target, async () => { const r = await api('/automation/generate', { method: 'POST', body: {} }); toast(`생성: ${r.post.title}`); views.posts(status); });
    $$('[data-pub]').forEach(b => b.onclick = () => busy(b, async () => { await api(`/posts/${b.dataset.pub}/publish`, { method: 'POST', body: { publish: b.dataset.to === '1' } }); toast(b.dataset.to === '1' ? '발행' : '초안으로 내림'); views.posts(status); }));
    $$('[data-ib]').forEach(b => b.onclick = () => busy(b, async () => { const r = await api(`/posts/${b.dataset.ib}/inblog`, { method: 'POST' }); toast(r.ok ? '인블로그 전송 완료' : r.skipped ? '인블로그 미설정(설정에서 API 키 입력)' : '오류: ' + r.error, !r.ok && !r.skipped); views.posts(status); }));
    $$('[data-del]').forEach(b => b.onclick = async () => { if (confirm('삭제?')) { await api('/posts/' + b.dataset.del, { method: 'DELETE' }); views.posts(status); } });
    const form = async (id, kind = 'blog') => { const p = id ? await api('/posts/' + id) : { kind }; modal(`<h2>${id ? '글 편집' : '새 글'}</h2><form class="form" id="postForm"><input type="hidden" name="id" value="${id || ''}"><input type="hidden" name="kind" value="${esc(p.kind || kind)}"><div class="row3"><label>제목 <input name="title" value="${esc(p.title || '')}" required></label>${(p.kind || kind) === 'blog' ? `<label>유형 <select name="type">${Object.entries(TL).map(([k, v]) => `<option value="${k}" ${p.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` : '<span></span>'}<label>slug <input name="slug" value="${esc(p.slug || '')}" placeholder="비우면 자동"></label></div><label>요약(excerpt) <input name="excerpt" value="${esc(p.excerpt || '')}"></label><label>meta description <input name="meta_description" value="${esc(p.meta_description || '')}"></label><label>태그(쉼표) <input name="tags" value="${esc(p.tags || '')}"></label><label>본문 HTML <textarea name="body_html" style="min-height:320px">${esc(p.body_html || '')}</textarea></label><div class="row"><label>상태 <select name="status"><option value="draft" ${p.status !== 'published' ? 'selected' : ''}>초안</option><option value="published" ${p.status === 'published' ? 'selected' : ''}>발행</option></select></label></div><button class="btn primary">저장</button></form>`);
      $('#postForm').onsubmit = async (e) => { e.preventDefault(); try { await api('/posts', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); closeModal(); toast('저장'); views[(p.kind || kind) === 'blog' ? 'posts' : 'notice'](); } catch (err) { toast(err.message, true); } }; };
    $('#newPost').onclick = () => form(); $$('[data-edit]').forEach(b => b.onclick = () => form(b.dataset.edit));
    views._postForm = form;
  };

  // ── 자동발행 ──
  views.auto = async () => {
    const d = await api('/automation'); const s = await api('/settings');
    $('#view').innerHTML = `<h1>자동발행 <span class="muted small">매일 첫 슬롯 = 오늘의 금시세 리포트(월요일은 주간), 둘째 슬롯 = 가이드·제품·동향 로테이션</span></h1>
<div class="grid g2">
<div class="card"><h3 style="margin-top:0">스케줄·발행 방식</h3><form id="af" class="form"><label>슬롯(KST, 쉼표) <input name="gen_times" value="${esc(s.gen_times)}"></label><label class="check"><input type="checkbox" name="auto_generate" ${s.auto_generate !== '0' ? 'checked' : ''}> 자동 생성 ON</label><label class="check"><input type="checkbox" name="auto_publish" ${s.auto_publish !== '0' ? 'checked' : ''}> 생성 즉시 발행 (OFF면 초안으로 저장 후 검토)</label><label class="check"><input type="checkbox" name="inblog_push" ${s.inblog_push !== '0' ? 'checked' : ''}> 발행 시 인블로그로 전송</label><button class="btn primary">저장</button></form>
<h3>LLM</h3><form id="lf" class="form"><label>Provider <select name="llm_provider">${Object.entries(d.providers).map(([k, v]) => `<option value="${k}" ${s.llm_provider === k ? 'selected' : ''}>${v.label} ${v.key_set ? '(키 있음)' : '(키 없음)'}${v.supports_search ? ' · 웹검색' : ''}</option>`).join('')}</select></label>${Object.entries(d.providers).map(([k, v]) => `<div class="row"><label>${v.label} API 키 <input name="${k === 'openai-compatible' ? 'oai_compat_api_key' : k + '_api_key'}" value="${esc(s[k === 'openai-compatible' ? 'oai_compat_api_key' : k + '_api_key'] || '')}" placeholder="${v.key_source === 'env' ? '환경변수로 설정됨' : 'sk-…'}"></label><label>모델 <input name="model_${k}" value="${esc(s['model_' + k] || v.model || '')}"></label></div>`).join('')}<label>OpenAI 호환 Base URL <input name="oai_compat_base_url" value="${esc(s.oai_compat_base_url || '')}"></label><button class="btn primary">저장</button></form>
<p class="small muted">현재: <span class="pill ${d.llm.available ? 'ok' : 'warn'}">${d.llm.available ? d.llm.label + ' / ' + d.llm.model : '키 없음 — 시세 리포트·제품 소개(템플릿)만 발행'}</span></p>
<h3>인블로그</h3><form id="if" class="form"><div class="row"><label>API 키 <input name="inblog_api_key" value="${esc(s.inblog_api_key || '')}" placeholder="${s._env.inblog ? '환경변수로 설정됨' : 'inblog 대시보드 → 설정 → API 키'}"></label><label>블로그 주소 <input name="inblog_url" value="${esc(s.inblog_url || '')}" placeholder="https://blog.도메인"></label></div><div class="toolbar"><button class="btn primary">저장</button><button type="button" class="btn" id="ibTest">연결 테스트</button></div></form></div>
<div class="card"><h3 style="margin-top:0">최근 실행</h3><table><thead><tr><th>날짜</th><th>슬롯</th><th>상태</th><th>내용</th></tr></thead><tbody>${d.recent.map(r => `<tr><td>${r.run_date}</td><td>${r.slot}</td><td><span class="pill ${r.status === 'ok' ? 'ok' : r.status === 'failed' ? 'err' : ''}">${r.status}</span></td><td class="small">${esc(r.detail || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">없음</td></tr>'}</tbody></table>
<div class="toolbar" style="margin-top:10px">${Object.entries(TL).map(([k, v]) => `<button class="btn sm" data-gen="${k}">${v} 1건 생성</button>`).join('')}</div>
<h3>주제 풀 <span class="muted small">(가이드·동향은 LLM 필요)</span></h3><div class="toolbar"><button class="btn sm gold" id="addTopic">+ 주제 추가</button></div><div class="tbl" style="max-height:360px"><table><thead><tr><th>유형</th><th>주제</th><th>사용</th><th>활성</th><th></th></tr></thead><tbody>${d.topics.map(t => `<tr><td>${TL[t.type] || t.type}</td><td>${esc(t.topic)}<br><span class="small muted">${esc(t.hint || '')}</span></td><td class="num">${t.use_count}</td><td>${t.active ? '✓' : '-'}</td><td><button class="btn sm" data-tgen="${t.id}" data-type="${t.type}">생성</button> <button class="btn sm danger" data-tdel="${t.id}">삭제</button></td></tr>`).join('')}</tbody></table></div></div></div>`;
    $('#af').onsubmit = async (e) => { e.preventDefault(); const f = e.target; await api('/settings', { method: 'POST', body: { gen_times: f.gen_times.value, auto_generate: f.auto_generate.checked ? '1' : '0', auto_publish: f.auto_publish.checked ? '1' : '0', inblog_push: f.inblog_push.checked ? '1' : '0' } }); toast('저장'); };
    $('#lf').onsubmit = async (e) => { e.preventDefault(); await api('/settings', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('LLM 설정 저장'); views.auto(); };
    $('#if').onsubmit = async (e) => { e.preventDefault(); await api('/settings', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('인블로그 설정 저장'); views.auto(); };
    $('#ibTest').onclick = (e) => busy(e.target, async () => { const r = await api('/automation/inblog-test'); toast(`연결 성공: ${r.blog?.name || r.blog?.subdomain || 'OK'}`); });
    $$('[data-gen]').forEach(b => b.onclick = () => busy(b, async () => { const r = await api('/automation/generate', { method: 'POST', body: { type: b.dataset.gen } }); toast('생성: ' + r.post.title); views.auto(); }));
    $$('[data-tgen]').forEach(b => b.onclick = () => busy(b, async () => { const r = await api('/automation/generate', { method: 'POST', body: { type: b.dataset.type, topicId: Number(b.dataset.tgen) } }); toast('생성: ' + r.post.title); views.auto(); }));
    $$('[data-tdel]').forEach(b => b.onclick = async () => { if (confirm('삭제?')) { await api('/automation/topics/' + b.dataset.tdel, { method: 'DELETE' }); views.auto(); } });
    $('#addTopic').onclick = () => { modal(`<h2>주제 추가</h2><form class="form" id="tf"><label>유형 <select name="type"><option value="guide">금 거래 가이드</option><option value="trend">금 시장 동향</option></select></label><label>주제 <input name="topic" required></label><label>힌트(구성·주의) <textarea name="hint" style="min-height:60px"></textarea></label><button class="btn primary">추가</button></form>`); $('#tf').onsubmit = async (e) => { e.preventDefault(); await api('/automation/topics', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); closeModal(); views.auto(); }; };
  };

  // ── 문의 ──
  views.inquiries = async () => {
    const rows = await api('/inquiries');
    $('#view').innerHTML = `<h1>예약·문의 <span class="muted small">${rows.length}건</span></h1><div class="tbl"><table><thead><tr><th>접수</th><th>구분</th><th>성함·연락처</th><th>품목·중량</th><th>내용</th><th>상태</th><th>메모</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td class="small">${dt(r.created_at)}</td><td>${IK[r.kind] || r.kind}</td><td><b>${esc(r.name)}</b><br><a href="tel:${esc(r.phone)}">${esc(r.phone)}</a></td><td class="small">${esc(r.item || '')} ${esc(r.weight || '')}</td><td class="small" style="max-width:280px">${esc(r.message || '')}</td><td><select data-st="${r.id}"><option value="new" ${r.status === 'new' ? 'selected' : ''}>신규</option><option value="contacted" ${r.status === 'contacted' ? 'selected' : ''}>연락함</option><option value="done" ${r.status === 'done' ? 'selected' : ''}>완료</option></select></td><td><input data-memo="${r.id}" value="${esc(r.memo || '')}" placeholder="메모" style="text-align:left"></td><td><button class="btn sm" data-save="${r.id}">저장</button> <button class="btn sm danger" data-del="${r.id}">삭제</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">없음</td></tr>'}</tbody></table></div>`;
    $$('[data-save]').forEach(b => b.onclick = async () => { const id = b.dataset.save; await api('/inquiries/' + id, { method: 'POST', body: { status: $(`[data-st="${id}"]`).value, memo: $(`[data-memo="${id}"]`).value } }); toast('저장'); views.inquiries(); });
    $$('[data-del]').forEach(b => b.onclick = async () => { if (confirm('삭제?')) { await api('/inquiries/' + b.dataset.del, { method: 'DELETE' }); views.inquiries(); } });
  };

  // ── 공지·후기·유튜브 ──
  views.notice = async () => {
    const [notices, reviews, videos] = await Promise.all([api('/posts?kind=notice'), api('/reviews'), api('/videos')]);
    $('#view').innerHTML = `<h1>공지 · 고객 후기 · 유튜브</h1>
<div class="card"><div class="toolbar"><h3 style="margin:0">공지사항</h3><span class="sp"></span><button class="btn sm gold" id="newNotice">+ 공지 작성</button></div><table><thead><tr><th>제목</th><th>상태</th><th>발행</th><th></th></tr></thead><tbody>${notices.map(r => `<tr><td><b>${esc(r.title)}</b></td><td><span class="pill ${r.status === 'published' ? 'ok' : 'warn'}">${r.status === 'published' ? '발행' : '초안'}</span></td><td class="small">${dt(r.published_at)}</td><td><button class="btn sm" data-nedit="${r.id}">편집</button> <button class="btn sm danger" data-ndel="${r.id}">삭제</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">없음</td></tr>'}</tbody></table></div>
<div class="card"><div class="toolbar"><h3 style="margin:0">고객 후기 <span class="muted small">(게재 동의 받은 후기만)</span></h3><span class="sp"></span><button class="btn sm" id="bulkReview">후기 일괄 등록</button><button class="btn sm gold" id="newReview">+ 후기 추가</button></div><table><thead><tr><th>고객</th><th>별점</th><th>구분</th><th>내용</th><th>표시</th><th></th></tr></thead><tbody>${reviews.map(r => `<tr><td>${esc(r.name)}</td><td>${'★'.repeat(r.rating)}</td><td>${esc(r.kind || '')}</td><td class="small">${esc(r.text)}</td><td>${r.visible ? '✓' : '-'}</td><td><button class="btn sm danger" data-rdel="${r.id}">삭제</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">없음</td></tr>'}</tbody></table></div>
<div class="card"><h3 style="margin-top:0">유튜브·쇼츠 <span class="muted small">URL과 제목만 넣으면 홈·유튜브 페이지에 VideoObject로 노출</span></h3><form id="vf" class="form"><div class="row3"><label>유튜브 URL <input name="url" required placeholder="https://www.youtube.com/shorts/…"></label><label>제목 <input name="title" required></label><label>게시일 <input name="published" type="date"></label></div><button class="btn primary">추가</button></form><table><thead><tr><th>썸네일</th><th>제목</th><th>ID</th><th></th></tr></thead><tbody>${videos.map(v => `<tr><td><img src="https://i.ytimg.com/vi/${esc(v.youtube_id)}/default.jpg" width="80"></td><td>${esc(v.title)}</td><td class="small">${esc(v.youtube_id)}</td><td><button class="btn sm danger" data-vdel="${v.id}">삭제</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">없음</td></tr>'}</tbody></table></div>`;
    const postForm = async (id) => { if (!views._postForm) await views.posts(); $('#view').innerHTML = ''; await views.notice(); views._postForm(id, 'notice'); };
    $('#newNotice').onclick = () => views._postForm ? views._postForm(null, 'notice') : postForm(null); $$('[data-nedit]').forEach(b => b.onclick = () => views._postForm ? views._postForm(b.dataset.nedit, 'notice') : postForm(b.dataset.nedit));
    $$('[data-ndel]').forEach(b => b.onclick = async () => { if (confirm('삭제?')) { await api('/posts/' + b.dataset.ndel, { method: 'DELETE' }); views.notice(); } });
    $('#newReview').onclick = () => { modal(`<h2>후기 추가</h2><form class="form" id="rf"><div class="row3"><label>고객 표기 <input name="name" placeholder="김OO" required></label><label>별점 <select name="rating"><option>5</option><option>4</option><option>3</option></select></label><label>구분 <input name="kind" placeholder="금 매입 / 골드바 구매 / 출장"></label></div><label>내용 <textarea name="text" required style="min-height:90px;font-family:inherit"></textarea></label><div class="row"><label>출처 <input name="source" placeholder="매장 / 네이버 / 카카오톡"></label><label>사진 URL(선택) <input name="photo" placeholder="/uploads/products/xxx.jpg"></label></div><button class="btn primary">추가</button></form>`); $('#rf').onsubmit = async (e) => { e.preventDefault(); await api('/reviews', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); closeModal(); views.notice(); }; };
    $('#bulkReview').onclick = () => { modal(`<h2>후기 일괄 등록</h2><p class="small muted">게재 동의를 받은 실제 후기만 넣어 주세요. 한 줄에 하나씩, <b>이름 | 별점 | 구분 | 내용</b> 형식입니다. 내용만 넣으면 '고객 · 별점 5'로 저장됩니다.</p><form class="form" id="rbf"><label>후기 <textarea name="text" required style="min-height:260px;font-family:inherit" placeholder="김OO | 5 | 금 매입 | 시세 그대로 쳐주셔서 믿음이 갔어요"></textarea></label><label>출처 <input name="source" placeholder="네이버 플레이스 / 매장 / 카카오톡"></label><button class="btn primary">등록</button></form>`); $('#rbf').onsubmit = async (e) => { e.preventDefault(); const r = await api('/reviews/bulk', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast(r.added + '건 등록'); closeModal(); views.notice(); }; };
    $$('[data-rdel]').forEach(b => b.onclick = async () => { if (confirm('삭제?')) { await api('/reviews/' + b.dataset.rdel, { method: 'DELETE' }); views.notice(); } });
    $('#vf').onsubmit = async (e) => { e.preventDefault(); try { await api('/videos', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('추가'); views.notice(); } catch (err) { toast(err.message, true); } };
    $$('[data-vdel]').forEach(b => b.onclick = async () => { await api('/videos/' + b.dataset.vdel, { method: 'DELETE' }); views.notice(); });
  };

  // ── 계획 ──
  views.plan = async () => {
    const d = await api('/plan');
    $('#view').innerHTML = `<h1>4주 실행계획 <span class="muted small">착수 ${d.kickoff} · 현재 ${d.currentWeek}주차 · 자동 판정 항목은 시스템이 체크, 나머지는 수동</span></h1>${d.weeks.map(w => `<div class="week ${w.week === d.currentWeek ? 'cur' : ''}"><h2 style="margin-top:0">${w.week}주차 <span class="muted small">${w.start} ~ ${w.end}</span></h2>${w.tasks.map(t => `<div class="task"><input type="checkbox" data-t="${t.id}" ${t.done || t.auto === true ? 'checked' : ''} ${t.auto === true ? 'disabled' : ''}><div class="t">${esc(t.title)} <span class="pill ${t.auto === true ? 'ok' : t.auto === false ? 'warn' : 'muted'}">${t.auto === true ? '자동 완료' : t.auto === false ? '자동 미완' : '수동'}</span><small>${esc(t.owner || '')} ${t.note ? '· ' + esc(t.note) : ''}</small></div><input data-note="${t.id}" value="${esc(t.note || '')}" placeholder="비고" style="max-width:260px;text-align:left"></div>`).join('')}</div>`).join('')}`;
    $$('[data-t]').forEach(c => c.onchange = async () => { await api('/plan/' + c.dataset.t, { method: 'POST', body: { done: c.checked, note: $(`[data-note="${c.dataset.t}"]`).value } }); toast('저장'); });
    $$('[data-note]').forEach(i => i.onchange = async () => { const c = $(`[data-t="${i.dataset.note}"]`); await api('/plan/' + i.dataset.note, { method: 'POST', body: { done: c.checked, note: i.value } }); toast('비고 저장'); });
  };

  // ── 리포트·스크린샷 ──
  views.reports = async () => {
    const [rows, sh] = await Promise.all([api('/reports'), api('/screenshots')]);
    $('#view').innerHTML = `<h1>리포트 · 전후 스크린샷</h1>
<div class="card"><div class="toolbar"><button class="btn primary" data-gen="weekly">이번 주 주간 리포트 생성</button><button class="btn" data-gen="baseline">베이스라인 리포트</button><button class="btn" data-gen="monthly">월간 종합 리포트</button><span class="sp"></span><span class="small muted">매주 킥오프 요일 08:30 자동 생성(감사·스크린샷 포함). HTML은 브라우저에서 인쇄→PDF, DOCX는 클라이언트 전달용.</span></div>
<table><thead><tr><th>리포트</th><th>기간</th><th>생성</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.title)}</b></td><td>${r.period_start} ~ ${r.period_end}</td><td class="small">${dt(r.created_at)}</td><td><a class="btn sm" href="/api/admin/reports/${r.id}/html" target="_blank">HTML 열기</a> ${r.docx_path ? `<a class="btn sm" href="/api/admin/reports/${r.id}/docx">DOCX</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">없음</td></tr>'}</tbody></table></div>
<div class="card"><h3 style="margin-top:0">전후 스크린샷 <span class="muted small">이전 = 착수 전 기존 채널(당근·Threads), 이후 = 신규 홈페이지 최신 캡처 · 리포트에 자동 첨부</span></h3>
<div class="toolbar"><button class="btn primary" id="capNow" ${sh.available ? '' : 'disabled'}>지금 캡처${sh.available ? '' : ' (서버에 크롬 없음)'}</button><label class="btn" for="shotFiles">이미지 업로드</label><input type="file" id="shotFiles" accept="image/*" multiple hidden><span class="small muted">기준(이전) ${sh.baseline ? '있음' : '없음'} · 최신(이후) ${sh.latest || '없음'} · 크롬 ${esc(sh.chrome || '-')}</span></div>
<div class="shots">${sh.pairs.map(p => `<figure><img src="/api/admin/screenshots/file?path=${encodeURIComponent(p.before || '')}" alt=""><figcaption>이전 — ${esc(p.label)}</figcaption></figure><figure><img src="/api/admin/screenshots/file?path=${encodeURIComponent(p.after || '')}" alt=""><figcaption>이후 — ${esc(p.label)}</figcaption></figure>`).join('')}</div>
${sh.admin.length ? `<h3>관리자 화면</h3><div class="shots">${sh.admin.map(a => `<figure><img src="/api/admin/screenshots/file?path=${encodeURIComponent(a.file)}" alt=""><figcaption>${esc(a.label)}</figcaption></figure>`).join('')}</div>` : ''}
<p class="small muted">캡처 폴더: ${sh.dirs.map(d => `${d.date}(${d.files.length})`).join(' · ') || '없음'}</p></div>`;
    $$('[data-gen]').forEach(b => b.onclick = () => busy(b, async () => { const r = await api('/reports/generate', { method: 'POST', body: { kind: b.dataset.gen } }); toast('생성: ' + r.report.title); views.reports(); }));
    $('#capNow').onclick = (e) => busy(e.target, async () => { const r = await api('/screenshots/capture', { method: 'POST' }); toast(`${r.count}장 캡처${r.errors.length ? ' · 오류 ' + r.errors.length : ''}`); views.reports(); });
    $('#shotFiles').onchange = async () => { const fd = new FormData(); for (const f of $('#shotFiles').files) fd.append('files', f); const r = await api('/screenshots/upload', { method: 'POST', body: fd }); toast(`${r.saved}장 저장`); views.reports(); };
  };

  // ── 감사·방문 ──
  views.audit = async () => {
    const [a, t] = await Promise.all([api('/audit'), api('/traffic')]);
    const L = a.latest;
    $('#view').innerHTML = `<h1>기술 감사 · 방문 통계</h1><div class="grid g2"><div class="card"><div class="toolbar"><h3 style="margin:0">SEO·AEO·GEO 자체 감사 <span class="pill ${L && L.score >= 80 ? 'ok' : 'warn'}">${L ? L.score + '점 · ' + L.date : '미실행'}</span></h3><span class="sp"></span><button class="btn primary sm" id="runAudit">지금 감사</button></div><p class="small muted">추이: ${a.history.map(h => `${h.date.slice(5)} ${h.score}`).join(' → ') || '-'}</p><table><thead><tr><th>항목</th><th>판정</th><th>근거</th></tr></thead><tbody>${(L ? L.items : []).map(i => `<tr><td>${esc(i.label)}</td><td><span class="pill ${i.ok ? 'ok' : 'err'}">${i.ok ? '통과' : '미충족'}</span></td><td class="small muted">${esc(i.detail || '')}</td></tr>`).join('')}</tbody></table></div>
<div class="card"><h3 style="margin-top:0">방문 (${t.from} ~ ${t.to})</h3><p>사람 <b>${fmt(t.byAgent.human || 0)}</b> · AI 크롤러 <b>${fmt(t.byAgent['ai-bot'] || 0)}</b> · 검색봇 <b>${fmt(t.byAgent['search-bot'] || 0)}</b> · 기타 봇 ${fmt(t.byAgent['other-bot'] || 0)}</p><h3>AI 크롤러</h3><table><tbody>${Object.entries(t.aiBots).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v}</td></tr>`).join('') || '<tr><td class="muted">아직 없음</td></tr>'}</tbody></table><h3>검색 봇</h3><table><tbody>${Object.entries(t.searchBots).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v}</td></tr>`).join('') || '<tr><td class="muted">아직 없음</td></tr>'}</tbody></table><h3>인기 페이지</h3><table><tbody>${t.topPages.map(p => `<tr><td>${esc(p.path)}</td><td class="num">${p.c}</td></tr>`).join('') || '<tr><td class="muted">없음</td></tr>'}</tbody></table><h3>유입 경로</h3><table><tbody>${t.topRefs.map(p => `<tr><td>${esc(p.ref_host)}</td><td class="num">${p.c}</td></tr>`).join('') || '<tr><td class="muted">없음</td></tr>'}</tbody></table></div></div>`;
    $('#runAudit').onclick = (e) => busy(e.target, async () => { const r = await api('/audit/run', { method: 'POST' }); toast(`감사 ${r.score}점`); views.audit(); });
  };

  // ── 설정 ──
  views.settings = async () => {
    const s = await api('/settings');
    const F = (k, label, ph = '') => `<label>${label} <input name="${k}" value="${esc(s[k] || '')}" placeholder="${esc(ph)}"></label>`;
    $('#view').innerHTML = `<h1>설정</h1><form id="sf" class="form card">
<h3 style="margin-top:0">사이트</h3><div class="row3">${F('site_url', '사이트 URL(canonical·sitemap)', 'https://www.도메인')}${F('site_name', '사이트명')}${F('legal_name', '상호(법적)')}</div><div class="row">${F('en_name', '영문명')}${F('slogan', '슬로건')}</div>
<label>노출 키워드(쉼표, meta keywords·키워드 허브 페이지) <input name="keywords" value="${esc(s.keywords)}"></label>
<h3>매장 정보 <span class="muted small">(비워 두면 화면·스키마에서 생략)</span></h3><div class="row3">${F('phone', '상담 연락처(우측 버튼·전화)')}${F('phone2', '매장 문의전화')}${F('kakao_id', '카카오톡 ID')}</div><div class="row3">${F('address', '주소')}${F('address_detail', '상세 주소(건물·층·호)', '예: 한국주얼리랜드 2층')}${F('email', '이메일')}</div><div class="row3">${F('ceo', '대표자')}${F('biz_no', '사업자등록번호')}${F('privacy_officer', '개인정보보호책임자')}</div><div class="row3">${F('hours', '영업시간 문구')}${F('hours_open', '오픈(HH:MM)')}${F('hours_close', '마감(HH:MM)')}</div>
<h3>채널 (sameAs·푸터·llms.txt)</h3><div class="row3">${F('kakao_channel', '카카오 오픈채팅 링크')}${F('naver_place', '네이버 플레이스')}${F('naver_blog', '네이버 블로그')}</div><div class="row3">${F('instagram', '인스타그램')}${F('youtube', '유튜브')}${F('threads', 'Threads')}</div><div class="row3">${F('daangn', '당근 업체 프로필')}${F('inblog_url', '인블로그 주소')}${F('old_site_url', '기존 홈페이지(전후 비교용)')}</div>
<h3>검색엔진·분석</h3><div class="row3">${F('naver_verification', '네이버 서치어드바이저 소유확인')}${F('google_verification', '구글 서치콘솔 소유확인')}${F('ga_id', 'GA4 측정 ID', 'G-XXXX')}</div>
<h3>프로젝트</h3><div class="row">${F('kickoff_date', '착수일(주차 계산 기준)')}<span></span></div>
<button class="btn primary">저장</button></form>
<div class="card"><h3 style="margin-top:0">관리자 비밀번호 변경</h3><form id="pwf" class="form"><div class="row"><label>새 비밀번호(8자 이상) <input name="pw" type="password" required minlength="8"></label><span></span></div><button class="btn">변경</button></form></div>`;
    $('#sf').onsubmit = async (e) => { e.preventDefault(); await api('/settings', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('저장'); };
    $('#pwf').onsubmit = async (e) => { e.preventDefault(); await api('/password', { method: 'POST', body: { pw: e.target.pw.value } }); toast('비밀번호 변경'); e.target.reset(); };
  };

  boot();

  // ===== 온라인몰 관리 (10-06) =====
  const OSTAT = { pending: '입금 대기', paid: '결제 완료', ready: '상품 준비', shipping: '배송 중', done: '배송 완료', cancel: '취소', refund: '환불' };

  views.orders = async () => {
    const d = await api('/orders');
    $('#view').innerHTML = `<h1>주문 관리 <span class="muted small">상태 변경·송장 입력 · 누적 매출 ${fmt(d.sum)}원</span></h1>
<div class="toolbar"><input id="oq" placeholder="주문번호·이름·연락처 검색" style="min-width:240px">
  <select id="ost"><option value="">전체 상태</option>${Object.entries(OSTAT).map(([k, v]) => `<option value="${k}">${v} (${d.counts[k] || 0})</option>`).join('')}</select></div>
<div class="tbl"><table><thead><tr><th>주문번호</th><th>주문일</th><th>주문자</th><th>상품</th><th class="num">결제금액</th><th>결제</th><th>상태</th><th>송장</th></tr></thead><tbody id="oRows">
${d.rows.map(o => `<tr data-id="${o.id}">
  <td><b>${esc(o.order_no)}</b><br><small class="muted">${o.receive_method === 'pickup' ? '매장수령' : (esc(o.addr1 || '') + ' ' + esc(o.addr2 || ''))}</small></td>
  <td class="small">${dt(o.created_at)}</td>
  <td>${esc(o.buyer_name)}<br><small class="muted">${esc(o.buyer_phone)}</small></td>
  <td class="small">${o.items.map(i => `${esc(i.name)}${i.option_text ? ' (' + esc(i.option_text) + ')' : ''} × ${i.qty}`).join('<br>')}</td>
  <td class="num">${fmt(o.total)}<br><small class="muted">${o.point_used ? '적립 -' + fmt(o.point_used) : ''}${o.coupon_discount ? ' 쿠폰 -' + fmt(o.coupon_discount) : ''}</small></td>
  <td class="small">${o.pay_method === 'card' ? '카드' : '무통장'}</td>
  <td><select data-ost="${o.id}">${Object.entries(OSTAT).map(([k, v]) => `<option value="${k}"${o.status === k ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
  <td><input data-oc="${o.id}" value="${esc(o.courier || '')}" placeholder="택배사" style="width:90px"><input data-otn="${o.id}" value="${esc(o.tracking_no || '')}" placeholder="운송장" style="width:130px"><button class="btn sm" data-osave="${o.id}">저장</button></td>
</tr>`).join('') || '<tr><td colspan="8" class="muted">주문이 없습니다.</td></tr>'}
</tbody></table></div>`;
    const reload = async () => { const q = $('#oq').value.trim(); const st = $('#ost').value; const r = await api(`/orders?q=${encodeURIComponent(q)}&status=${st}`); d.rows = r.rows; views.orders(); };
    $('#oq').onchange = reload; $('#ost').onchange = reload;
    $$('[data-ost]').forEach(sel => sel.onchange = async () => { await api('/orders/' + sel.dataset.ost, { method: 'POST', body: { status: sel.value } }); toast('상태 변경'); });
    $$('[data-osave]').forEach(b => b.onclick = () => busy(b, async () => {
      const id = b.dataset.osave;
      await api('/orders/' + id, { method: 'POST', body: { courier: $(`[data-oc="${id}"]`).value, tracking_no: $(`[data-otn="${id}"]`).value } });
      toast('송장 저장');
    }));
  };

  views.members = async () => {
    const d = await api('/members');
    $('#view').innerHTML = `<h1>회원 관리 <span class="muted small">총 ${fmt(d.total)}명</span></h1>
<div class="toolbar"><input id="mq" placeholder="이름·이메일·연락처 검색" style="min-width:240px"></div>
<div class="tbl"><table><thead><tr><th>회원</th><th>연락처</th><th>가입일</th><th class="num">주문</th><th class="num">적립금</th><th>메모</th><th></th></tr></thead><tbody>
${d.rows.map(m => `<tr>
  <td><b>${esc(m.name)}</b><br><small class="muted">${esc(m.email)}</small></td>
  <td class="small">${esc(m.phone || '-')}<br><small class="muted">${esc(m.addr1 || '')}</small></td>
  <td class="small">${d8(m.created_at)}</td>
  <td class="num">${m.orders.c}건<br><small class="muted">${fmt(m.orders.t)}원</small></td>
  <td class="num">${fmt(m.points)}</td>
  <td><input data-memo="${m.id}" value="${esc(m.memo || '')}" placeholder="메모" style="width:150px"></td>
  <td><button class="btn sm" data-pt="${m.id}">적립금 조정</button><button class="btn sm" data-msave="${m.id}">메모 저장</button></td>
</tr>`).join('') || '<tr><td colspan="7" class="muted">회원이 없습니다.</td></tr>'}
</tbody></table></div>`;
    $('#mq').onchange = async () => { const r = await api('/members?q=' + encodeURIComponent($('#mq').value.trim())); d.rows = r.rows; views.members(); };
    $$('[data-pt]').forEach(b => b.onclick = async () => {
      const v = prompt('적립금 조정 금액 (지급 +, 차감 -)', '1000'); if (v === null) return;
      const why = prompt('사유', '관리자 지급') || '관리자 지급';
      const r = await api(`/members/${b.dataset.pt}/points`, { method: 'POST', body: { amount: Number(v), reason: why } });
      toast('적립금 ' + fmt(r.points) + '원'); views.members();
    });
    $$('[data-msave]').forEach(b => b.onclick = () => busy(b, async () => { await api(`/members/${b.dataset.msave}/memo`, { method: 'POST', body: { memo: $(`[data-memo="${b.dataset.msave}"]`).value } }); toast('메모 저장'); }));
  };

  views.shop = async () => {
    const [coupons, banners, qna, st] = await Promise.all([api('/coupons'), api('/banners'), api('/qna'), api('/settings')]);
    const s = st.settings || st;
    $('#view').innerHTML = `<h1>쇼핑몰 설정 <span class="muted small">배송·적립·계좌·배너·쿠폰·1:1 문의</span></h1>
<div class="card"><h3 style="margin-top:0">기본 설정</h3>
  <form id="shopForm" class="form"><div class="row3">
    <label>기본 배송비(원) <input name="shipping_fee" type="number" value="${esc(s.shipping_fee)}"></label>
    <label>무료배송 기준(원) <input name="free_ship_over" type="number" value="${esc(s.free_ship_over)}"></label>
    <label>적립률(%) <input name="point_rate_pct" type="number" step="0.1" value="${esc(s.point_rate_pct)}"></label></div>
    <label>입금 계좌 안내 <textarea name="bank_info" style="min-height:70px" placeholder="예: 국민은행 123456-78-901234 (예금주 문강금은)">${esc(s.bank_info)}</textarea></label>
    <label>메인 인기 키워드 (쉼표로 구분) <input name="popular_keywords" value="${esc(s.popular_keywords)}"></label>
    <div class="row"><label>토스페이먼츠 클라이언트 키 <input name="pg_client_key" value="${esc(s.pg_client_key)}" placeholder="입력하면 카드결제가 열립니다"></label>
      <label>시크릿 키 <input name="pg_secret_key" value="${esc(s.pg_secret_key)}" type="password"></label></div>
    <button class="btn primary">저장</button></form></div>

<div class="card"><div class="toolbar"><h3 style="margin:0">메인 배너</h3><span class="sp"></span><button class="btn sm gold" id="addBanner">+ 배너 추가</button></div>
<div class="tbl"><table><thead><tr><th>이미지</th><th>구역</th><th>문구</th><th>링크</th><th>글자색</th><th>순서</th><th>표시</th><th></th></tr></thead><tbody>
${banners.map(b => `<tr><td><img src="${esc(b.image)}" style="width:120px;border-radius:6px"></td><td>${b.slot === 'main' ? '메인 슬라이드' : b.slot === 'limited' ? '한정 상품' : '컬렉션'}</td>
<td class="small"><b>${esc(b.title || '')}</b><br>${esc(b.subtitle || '')}</td><td class="small">${esc(b.btn_text || '')}<br>${esc(b.href || '')}</td>
<td class="small">${b.theme === 'light' ? '흰 글자' : '검정 글자'}</td><td class="num">${b.sort}</td><td>${b.active ? '✓' : '-'}</td>
<td><button class="btn sm" data-bedit="${b.id}">편집</button><button class="btn sm danger" data-bdel="${b.id}">삭제</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">배너가 없습니다.</td></tr>'}
</tbody></table></div></div>

<div class="card"><div class="toolbar"><h3 style="margin:0">쿠폰</h3><span class="sp"></span><button class="btn sm gold" id="addCoupon">+ 쿠폰 추가</button></div>
<div class="tbl"><table><thead><tr><th>번호</th><th>이름</th><th>할인</th><th class="num">최소금액</th><th class="num">사용</th><th>상태</th><th></th></tr></thead><tbody>
${coupons.map(c => `<tr><td><b>${esc(c.code)}</b></td><td>${esc(c.name)}</td><td>${c.kind === 'percent' ? c.value + '%' : fmt(c.value) + '원'}</td><td class="num">${fmt(c.min_total)}</td>
<td class="num">${c.used_count}${c.usage_limit ? '/' + c.usage_limit : ''}</td><td>${c.active ? '사용' : '중지'}</td>
<td><button class="btn sm danger" data-cdel="${c.id}">삭제</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">쿠폰이 없습니다.</td></tr>'}
</tbody></table></div></div>

<div class="card"><div class="toolbar"><h3 style="margin:0">메인 FAQ</h3><span class="sp"></span><button class="btn sm" id="faqAdd">+ 질문 추가</button><button class="btn primary" id="faqSave">저장</button></div>
<div id="faqRows"></div><p class="small muted">메인 하단과 /faq 상단에 노출됩니다. 비워 두면 기본 FAQ가 보입니다.</p></div>

<div class="card"><h3 style="margin-top:0">1:1 문의</h3>
<div class="tbl"><table><thead><tr><th>등록</th><th>작성자</th><th>유형</th><th>내용</th><th>답변</th><th></th></tr></thead><tbody>
${qna.map(q => `<tr><td class="small">${dt(q.created_at)}</td><td class="small">${esc(q.name)}<br>${esc(q.phone || '')}</td><td class="small">${esc(q.kind)}</td>
<td class="small"><b>${esc(q.title)}</b><br>${esc(q.body)}</td>
<td><textarea data-qa="${q.id}" style="min-height:60px;width:220px">${esc(q.answer || '')}</textarea></td>
<td><button class="btn sm" data-qsave="${q.id}">답변 저장</button><button class="btn sm danger" data-qdel="${q.id}">삭제</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">문의가 없습니다.</td></tr>'}
</tbody></table></div></div>`;

    { const faqs = await api('/home-faq');
      const frow = (f) => `<div class="faq-row" style="display:grid;gap:6px;margin-bottom:10px;border-bottom:1px solid #eee;padding-bottom:10px">
<input name="q" value="${esc(f ? f.q : '')}" placeholder="질문"><textarea name="a" style="min-height:60px" placeholder="답변">${esc(f ? f.a : '')}</textarea>
<div><button type="button" class="btn sm danger" data-frm>삭제</button></div></div>`;
      const paint = (list) => { $('#faqRows').innerHTML = list.map(frow).join(''); $$('[data-frm]').forEach(b => b.onclick = () => b.closest('.faq-row').remove()); };
      paint(faqs);
      $('#faqAdd').onclick = () => { $('#faqRows').insertAdjacentHTML('beforeend', frow(null)); $$('[data-frm]').forEach(b => b.onclick = () => b.closest('.faq-row').remove()); };
      $('#faqSave').onclick = (e) => busy(e.target, async () => {
        const rows = $$('#faqRows .faq-row').map(d => ({ q: d.querySelector('[name=q]').value.trim(), a: d.querySelector('[name=a]').value.trim() })).filter(r => r.q && r.a);
        const r = await api('/home-faq', { method: 'POST', body: { rows } }); toast(r.count + '개 FAQ 저장');
      });
    }
    $('#shopForm').onsubmit = async (e) => {
      e.preventDefault();
      const o = Object.fromEntries(new FormData(e.target));
      await api('/shop-settings', { method: 'POST', body: o }); toast('저장했습니다');
    };
    const bannerForm = (b) => {
      b = b || {};
      modal(`<h2>${b.id ? '배너 편집' : '배너 추가'}</h2><form class="form" id="bf"><input type="hidden" name="id" value="${b.id || ''}">
<div class="row3"><label>구역 <select name="slot"><option value="main"${b.slot === 'main' ? ' selected' : ''}>메인 슬라이드</option><option value="collection"${b.slot === 'collection' ? ' selected' : ''}>컬렉션(GOLD COLLECTION)</option><option value="limited"${b.slot === 'limited' ? ' selected' : ''}>한정 상품</option></select></label>
<label>글자색 <select name="theme"><option value="dark"${b.theme !== 'light' ? ' selected' : ''}>검정</option><option value="light"${b.theme === 'light' ? ' selected' : ''}>흰색</option></select></label>
<label>순서 <input name="sort" type="number" value="${b.sort || 0}"></label></div>
<label>PC 이미지 URL (1920×800 권장) <input name="image" value="${esc(b.image || '')}" required> <input type="file" id="bimg" accept="image/*"></label>
<label>모바일 이미지 URL (선택) <input name="image_m" value="${esc(b.image_m || '')}"> <input type="file" id="bimgm" accept="image/*"></label>
<label>제목 ( / 는 줄바꿈) <input name="title" value="${esc(b.title || '')}"></label>
<label>보조 문구 ( / 는 줄바꿈) <input name="subtitle" value="${esc(b.subtitle || '')}"></label>
<div class="row"><label>버튼 문구 <input name="btn_text" value="${esc(b.btn_text || '')}"></label><label>이동 링크 <input name="href" value="${esc(b.href || '')}" placeholder="/products?category=goldbar"></label></div>
<label class="check"><input type="checkbox" name="active" ${b.active === 0 ? '' : 'checked'}> 표시</label>
<button class="btn primary">저장</button></form>`);
      const up = async (fileInput, target) => {
        const f = fileInput.files[0]; if (!f) return;
        const fd = new FormData(); fd.append('file', f);
        const r = await api('/products/upload-image', { method: 'POST', body: fd });
        $('#bf')[target].value = r.url; toast('업로드 완료');
      };
      $('#bimg').onchange = () => up($('#bimg'), 'image');
      $('#bimgm').onchange = () => up($('#bimgm'), 'image_m');
      $('#bf').onsubmit = async (e) => {
        e.preventDefault();
        const o = Object.fromEntries(new FormData(e.target)); o.active = e.target.active.checked;
        await api('/banners', { method: 'POST', body: o }); closeModal(); views.shop();
      };
    };
    $('#addBanner').onclick = () => bannerForm();
    $$('[data-bedit]').forEach(b => b.onclick = () => bannerForm(banners.find(x => String(x.id) === b.dataset.bedit)));
    $$('[data-bdel]').forEach(b => b.onclick = async () => { if (confirm('배너를 삭제할까요?')) { await api('/banners/' + b.dataset.bdel, { method: 'DELETE' }); views.shop(); } });
    $('#addCoupon').onclick = () => {
      modal(`<h2>쿠폰 추가</h2><form class="form" id="cf"><div class="row3">
<label>쿠폰 번호 <input name="code" required placeholder="WELCOME10"></label><label>이름 <input name="name" required placeholder="신규 가입 할인"></label>
<label>종류 <select name="kind"><option value="amount">정액(원)</option><option value="percent">정률(%)</option></select></label></div>
<div class="row3"><label>할인 값 <input name="value" type="number" required></label><label>최소 주문금액 <input name="min_total" type="number" value="0"></label><label>사용 제한(횟수) <input name="usage_limit" type="number" placeholder="비우면 무제한"></label></div>
<div class="row"><label>시작일 <input name="starts_at" type="date"></label><label>종료일 <input name="ends_at" type="date"></label></div>
<button class="btn primary">저장</button></form>`);
      $('#cf').onsubmit = async (e) => { e.preventDefault(); await api('/coupons', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); closeModal(); views.shop(); };
    };
    $$('[data-cdel]').forEach(b => b.onclick = async () => { if (confirm('쿠폰을 삭제할까요?')) { await api('/coupons/' + b.dataset.cdel, { method: 'DELETE' }); views.shop(); } });
    $$('[data-qsave]').forEach(b => b.onclick = () => busy(b, async () => { await api('/qna/' + b.dataset.qsave, { method: 'POST', body: { answer: $(`[data-qa="${b.dataset.qsave}"]`).value } }); toast('답변 저장'); }));
    $$('[data-qdel]').forEach(b => b.onclick = async () => { if (confirm('문의를 삭제할까요?')) { await api('/qna/' + b.dataset.qdel, { method: 'DELETE' }); views.shop(); } });
  };

})();
