'use strict';
// 공개 페이지 ① 홈 · 오늘의 금시세 · 계산기 · 제품
const express = require('express');
const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const { page, faqLd } = require('../lib/layout');
const settings = require('../lib/settings');
const quotes = require('../lib/quotes');
const spotLib = require('../lib/spot');
const youtubeLib = require('../lib/youtube');
const { CAT_LABEL } = require('../lib/content/templates');
const { productCard } = require('../lib/cards');
const { esc, attr, fmtNum, kstDate, isoFromTs, fmtKoDate, truncate, stripHtml } = require('../lib/util');

const router = express.Router();
// 제품 탭 — '오늘 출발'과 'BEST'는 카테고리가 아니라 표시 조건(즉시 출고·추천)이다
const TAB_LABEL = { today: '오늘 출발', best: 'BEST', ...CAT_LABEL };
const tabLabel = (k) => TAB_LABEL[k] || '전체 제품';
const FAQ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'seed', 'faq.json'), 'utf8'));

// ── 공용 조각 ──
function chg(diff, pct) {
  if (diff > 0) return `<span class="chg up">▲ ${fmtNum(diff)} <small>(+${pct}%)</small></span>`;
  if (diff < 0) return `<span class="chg down">▼ ${fmtNum(Math.abs(diff))} <small>(${pct}%)</small></span>`;
  return '<span class="chg flat">보합</span>';
}
function sparkline(hist, w = 120, h = 32, key = 'buy') {
  const vals = hist.map(x => x[key]).filter(v => v != null);
  if (vals.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="#d8d2c4" stroke-dasharray="3 3"/></svg>`;
  const min = Math.min(...vals), max = Math.max(...vals); const span = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * (w - 4) + 2).toFixed(1)},${(h - 3 - (v - min) / span * (h - 6)).toFixed(1)}`);
  const up = vals[vals.length - 1] >= vals[0]; const col = up ? '#c0392b' : '#1f5fbf';
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><defs><linearGradient id="g${key}${w}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".25"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs><polygon fill="url(#g${key}${w})" points="2,${h} ${pts.join(' ')} ${w - 2},${h}"/><polyline fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" points="${pts.join(' ')}"/><circle r="2.5" cx="${pts[pts.length - 1].split(',')[0]}" cy="${pts[pts.length - 1].split(',')[1]}" fill="${col}"/></svg>`;
}
function faqHtml(faqs, title = '자주 묻는 질문') {
  return `<section class="faq" id="faq">${title ? `<h2>${esc(title)}</h2>` : ''}<div class="faq-list">${faqs.map((f, i) => `<details class="faq-item"${i === 0 ? ' open' : ''}><summary><h3>${esc(f.q)}</h3></summary><div class="faq-a"><p>${esc(f.a)}</p></div></details>`).join('')}</div></section>`;
}
const TL = { report: '금시세 리포트', guide: '금 거래 가이드', trend: '금 시장 동향', product: '제품 소개' };
function postCard(p) {
  return `<article class="post-card reveal"><a href="/blog/${attr(p.slug)}"><span class="tag tag-${attr(p.type || 'guide')}">${TL[p.type] || '가이드'}</span><h3>${esc(p.title)}</h3><p>${esc(truncate(p.excerpt || stripHtml(p.body_html), 90))}</p><time datetime="${isoFromTs(p.published_at || p.created_at)}">${fmtKoDate(kstDate(new Date((p.published_at || p.created_at) * 1000)))}</time></a></article>`;
}
// 상단 시세 바(모든 내부 페이지 공통) — AI/검색 크롤러가 어느 페이지에서든 당일 시세를 읽게 함
function quoteBar() {
  const st = quotes.stats(); if (!st.gold) return '';
  const items = st.rows.map(r => `<a class="qb-item" data-code="${attr(r.code)}" href="/price/${r.metal}"><b>${esc(r.name)}</b><span>${fmtNum(r.buy)}</span>${chg(r.diff, r.pct)}</a>`).join('');
  return `<div class="quote-bar" aria-label="오늘의 시세 요약"><div class="wrap qb-inner"><span class="qb-label">오늘의 매입가 <small>원/돈 · ${esc(st.updatedText)}</small></span><div class="qb-track">${items}</div><a class="qb-more" href="/price">시세표 →</a></div></div>`;
}
function datasetLd(rows, updated) {
  const site = settings.siteUrl();
  return { '@context': 'https://schema.org', '@type': 'Dataset', name: '오늘의 금·은·백금 시세 — 문강금은 종로3가', description: `순금(24K)·18K·14K·백금·은 ${rows.length}종목의 1돈(3.75g) 매입가·판매가와 전일 대비 등락. 문강금은 매장 고시가로 매일 갱신하는 1차 데이터.`, url: `${site}/price`, creator: { '@id': site + '/#org' }, license: `${site}/privacy`, dateModified: updated ? isoFromTs(updated) : kstDate(), temporalCoverage: kstDate(), spatialCoverage: '서울 종로구', keywords: ['오늘의 금시세', '금 매입가', '순금 시세', '18K 시세', '14K 시세', '은시세', '백금시세', '종로 금은방'], variableMeasured: ['매입가(원/돈)', '판매가(원/돈)', '전일 대비'], isAccessibleForFree: true, distribution: [{ '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${site}/api/prices` }] };
}
// ── 오늘의 금시세 ──
const METAL_META = {
  gold: { h1: '오늘의 금시세 — 순금·18K·14K 매입가·판매가', intro: '순금(24K 999.9)·18K·14K의 1돈(3.75g) 기준 매입가와 골드바 판매가입니다. 18K 매입가는 순금 매입가의 73.5%, 14K는 57%로 계산합니다.', desc: (g, t) => `오늘의 금시세 ${t} 갱신 — 순금 24K 매입 ${g ? fmtNum(g.buy) + '원/돈' : ''}, 18K·14K 매입가, 골드바 판매가, 90일 추이, 국제 금시세·환율 환산. 종로3가 문강금은 매장 고시가.`, kw: '금시세' },
  silver: { h1: '오늘의 은시세 — 은(Ag 999) 매입가·실버바 판매가', intro: '순은(999) 1돈(3.75g) 기준 매입가와 실버바 판매가입니다. 은은 금보다 가격 변동성이 크고, 실버바 구매 시 부가세 10%가 적용됩니다.', desc: (g, t) => `오늘의 은시세 ${t} 갱신 — 은 999 매입가·실버바 판매가(원/돈·원/g), 90일 추이, 국제 은시세 환산. 종로3가 문강금은.`, kw: '은시세' },
  platinum: { h1: '오늘의 백금시세 — 백금(Pt) 매입가', intro: '백금(플래티넘) 1돈 기준 매입가입니다. Pt950·Pt900 제품은 함량만큼 환산되며, 화이트골드와는 다른 금속이므로 감정으로 구분합니다.', desc: (g, t) => `오늘의 백금시세 ${t} 갱신 — 백금(Pt) 매입가(원/돈·원/g), Pt950·Pt900 환산, 90일 추이. 종로3가 문강금은.`, kw: '백금시세' },
};
function priceExplain(metal) {
  return `<section class="section explain"><div class="wrap narrow">
<h2>${metal === 'gold' ? '금' : metal === 'silver' ? '은' : '백금'} 시세는 어떻게 읽어야 하나요?</h2>
<p><strong>매입가</strong>는 고객이 파실 때 문강금은이 드리는 금액, <strong>판매가</strong>는 골드바·실버바를 구매하실 때 기준가(부가세 포함)입니다. 표의 단위는 1돈(3.75g)이며 g 단위는 버튼으로 전환할 수 있습니다. <strong>전일 대비</strong>는 직전 고시가와의 차이입니다.</p>
<h2>시세가 오르내리는 이유는 무엇인가요?</h2>
<ul><li><strong>국제 시세</strong>: 달러/트로이온스 기준 국제 가격이 기본. 미국 금리·달러·중앙은행 매입·지정학 요인이 움직입니다.</li><li><strong>환율</strong>: 원/달러 환율이 오르면 국제 시세가 그대로여도 국내 가격이 오릅니다.</li><li><strong>국내 수급</strong>: 돌·결혼 시즌 실물 수요, 정제·유통 비용이 스프레드에 반영됩니다.</li></ul>
<h2>이 시세로 얼마를 받을 수 있나요?</h2>
<p>순도별 매입가 × 순중량이 기준입니다. 18K 매입가는 순금 매입가의 73.5%, 14K는 57%이며 보석·부속품 무게는 제외됩니다. <a href="/calculator">매입가 계산기</a>에서 순도와 중량을 넣으면 예상 금액이 바로 나오고, 정확한 금액은 매장 감정 후 확정됩니다.</p>
${faqHtml([{ q: '시세는 하루에 몇 번 갱신되나요?', a: '보통 오전에 고시하고 국제 시세·환율 변동이 크면 오후에 다시 고시합니다. 페이지의 갱신 시각이 적용 기준입니다.' }, { q: '표의 가격에 부가세가 포함되나요?', a: '매입가는 고객이 받는 금액 그대로이며, 홈페이지에 표시되는 판매가와 제품 가격은 부가세가 포함된 금액입니다.' }, { q: '온라인 시세와 왜 다른가요?', a: '온라인 시세는 대부분 국제 환산가 또는 1g 기준입니다. 매장 고시가는 정제·유통 비용이 반영된 실거래 기준이며, 돈·g 단위를 맞춰 비교하세요.' }])}
</div></section>`;
}
function pricePage(req, res, metal) {
  const meta = METAL_META[metal] || METAL_META.gold; const all = quotes.list(); const rows = metal ? quotes.list(metal) : all; const st = quotes.stats(); const sp = quotes.spot(); const g = metal === 'silver' ? st.silver : metal === 'platinum' ? st.platinum : st.gold;
  const hist = g ? quotes.history(g.id, 90) : []; const spHist = spotLib.history(30);
  const tabs = [['', '전체'], ['gold', '금시세'], ['silver', '은시세'], ['platinum', '백금시세']].map(([k, v]) => `<a class="tab${(metal || '') === k ? ' active' : ''}" href="${k ? '/price/' + k : '/price'}">${v}</a>`).join('');
  const h1 = metal ? meta.h1 : '오늘의 금·은·백금 시세표 — 매입가·판매가';
  const intro = metal ? meta.intro : '순금(24K)·18K·14K·백금·은의 1돈(3.75g) 기준 매입가와 골드바·실버바 판매가입니다. 문강금은 종로3가 매장 고시가로 매일 갱신되며, 실거래가는 감정 결과에 따라 확정됩니다.';
  const body = `
<section class="page-head price-head"><div class="wrap"><p class="eyebrow">실시간 시세 · ${esc(st.updatedText)} 기준</p><h1>${h1}</h1><p class="bluf">${intro} ${g ? `현재 ${esc(g.name)} 매입가는 <strong>${fmtNum(g.buy)}원/돈(${fmtNum(g.buyG)}원/g)</strong>, 전일 대비 ${g.diff > 0 ? '+' : ''}${fmtNum(g.diff)}원(${g.pct}%)입니다.` : ''}</p><div class="tabs">${tabs}</div></div></section>
<section class="section market">
  <div class="wrap">
    <div class="stat-row">${[[g ? fmtNum(g.buy) : '-', `${g ? esc(g.name) : ''} 매입가`], [g && g.sell ? fmtNum(g.sell) : '—', '판매가'], [g ? (g.diff > 0 ? '+' : '') + fmtNum(g.diff) : '-', '전일 대비', g ? (g.diff > 0 ? 'up' : g.diff < 0 ? 'down' : '') : ''], [(st.m30 > 0 ? '+' : '') + st.m30 + '%', '순금 30일 변동', st.m30 > 0 ? 'up' : st.m30 < 0 ? 'down' : ''], [sp.available ? '$' + fmtNum(Math.round(sp.xau)) : '-', '국제 금시세(온스)']].map(([v, l, c]) => `<div class="stat ${c || ''}"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
    <div class="market-controls"><span class="unit-toggle" role="group" aria-label="단위"><button class="ut active" data-unit="don">1돈(3.75g)</button><button class="ut" data-unit="g">1g</button></span><span class="sp"></span><a class="btn btn-gold" href="/calculator">매입가 계산기</a></div>
    <div class="table-wrap"><table class="price-table market-table" id="mkTable"><thead><tr><th>종목</th><th>순도</th><th class="num">매입가</th><th class="num">판매가</th><th class="num">전일 대비</th><th>90일 추이</th></tr></thead><tbody>
      ${rows.map(r => `<tr data-code="${attr(r.code)}" data-name="${attr(r.name)}" data-buy="${r.buy || ''}" data-sell="${r.sell || ''}"><td><b>${esc(r.name)}</b><br><small class="muted">${esc(r.label)}</small></td><td>${esc(r.purity || '')}</td><td class="num"><b class="pv" data-don="${r.buy || ''}">${fmtNum(r.buy)}</b><small class="unit-lbl">원/돈</small></td><td class="num">${r.sell ? `<span class="pv" data-don="${r.sell}">${fmtNum(r.sell)}</span><small class="unit-lbl">원/돈</small>` : '<span class="muted">문의</span>'}</td><td class="num">${chg(r.diff, r.pct)}</td><td><button class="spark-btn" data-hist="${attr(r.code)}" aria-label="${attr(r.name)} 90일 추이 보기">${sparkline(quotes.history(r.id, 90), 110, 30)}</button></td></tr>`).join('')}
    </tbody></table></div>
    <p class="note">${esc(settings.cfg('quote_note'))} 종목을 누르면 90일 그래프가 열립니다.</p>
    <div class="modal" id="histModal" hidden><div class="modal-box"><button class="modal-close" aria-label="닫기">×</button><h3 id="histTitle"></h3><div id="histChart"></div><p class="note" id="histNote"></p></div></div>
    ${sp.available ? `<div class="spot-card reveal"><div><h2>국제 시세로 환산하면 얼마인가요?</h2><p>국제 금시세 <b>$${fmtNum(Math.round(sp.xau * 100) / 100)}/oz</b>${sp.xag ? ` · 은 $${sp.xag}/oz` : ''}${sp.xpt ? ` · 백금 $${fmtNum(Math.round(sp.xpt))}/oz` : ''}, 환율 <b>${fmtNum(Math.round(sp.usdkrw * 10) / 10)}원/$</b> (${esc(sp.updated_at)} 조회) → 순금 환산 <b>${fmtNum(sp.gold_krw_g)}원/g · ${fmtNum(sp.gold_krw_don)}원/돈</b>${sp.silver_krw_g ? `, 은 ${fmtNum(sp.silver_krw_g)}원/g` : ''}. 매장 매입가는 환산가에서 정제·유통 비용을 뺀 값이고 판매가는 더한 값입니다.</p><p class="note">환산 공식: 달러/온스 ÷ 31.1035 × 환율. 출처 ${esc(sp.source)}. 참고용이며 거래 기준가는 매장 고시가입니다.</p></div><div class="spot-chart">${sparkline(spHist.map(h => ({ buy: h.xau })), 320, 90)}<span class="note">국제 금시세 30일(USD/oz)</span></div></div>` : ''}
  </div>
</section>
${priceExplain(metal || 'gold')}`;
  const ld = [datasetLd(all, st.lastUpdated), faqLd([{ q: '시세는 하루에 몇 번 갱신되나요?', a: '보통 오전에 고시하고 변동이 크면 오후에 다시 고시합니다. 페이지의 갱신 시각이 기준입니다.' }, { q: '표의 가격에 부가세가 포함되나요?', a: '매입가는 고객이 받는 금액 그대로이며, 홈페이지에 표시되는 판매가와 제품 가격은 부가세가 포함된 금액입니다.' }])];
  res.send(page({ title: metal ? `${meta.h1.split(' — ')[0]} ${st.updatedText} — ${g ? esc(g.name) + ' 매입 ' + fmtNum(g.buy) + '원/돈' : ''}` : `오늘의 금시세 ${st.updatedText} — 순금 매입 ${st.gold ? fmtNum(st.gold.buy) + '원/돈' : ''} · 18K·14K·은·백금 매입가/판매가`, description: metal ? meta.desc(g, st.updatedText) : `오늘의 금·은·백금 시세표 ${st.updatedText} 갱신. 순금 24K 매입 ${st.gold ? fmtNum(st.gold.buy) + '원/돈(' + fmtNum(st.gold.buyG) + '원/g)' : ''}, 18K·14K·백금·은 매입가와 골드바·실버바 판매가, 전일 대비, 90일 추이, 국제 금시세 환산. 종로3가 문강금은.`, path: metal ? `/price/${metal}` : '/price', body, breadcrumbs: [{ name: '오늘의 금시세', href: '/price' }, ...(metal ? [{ name: meta.kw, href: `/price/${metal}` }] : [])], jsonld: ld, dateModified: st.lastUpdated ? isoFromTs(st.lastUpdated) : undefined, bodyClass: 'market-page' }));
}
router.get('/price', (req, res) => pricePage(req, res, ''));
router.get('/price/:metal', (req, res, next) => { if (!METAL_META[req.params.metal]) return next(); pricePage(req, res, req.params.metal); });

// ── 계산기 ──
router.get('/calculator', (req, res) => {
  const s = settings.all(); const st = quotes.stats(); const rows = st.rows;
  const faqs = [FAQ[1], FAQ[2], FAQ[3], { q: '계산 결과와 실제 매입가가 다를 수 있나요?', a: '네. 계산기는 각인 순도와 입력 중량 기준의 예상치입니다. 실제로는 감정 순도, 보석·부속품 제외 중량, 결제 시점 시세가 적용되어 달라질 수 있습니다.' }];
  const body = `
<section class="page-head"><div class="wrap"><p class="eyebrow">매입가 계산기</p><h1>금 매입가 계산기 — 순도·중량으로 예상 금액 즉시 확인</h1><p class="bluf">순금(24K)·18K·14K·백금·은 중에서 순도를 고르고 중량을 g 또는 돈으로 입력하면 ${esc(st.updatedText)} 문강금은 시세 기준 예상 매입가가 계산됩니다. 순금 1돈 매입가 ${st.gold ? fmtNum(st.gold.buy) + '원' : '-'} 기준.</p></div></section>
<section class="section"><div class="wrap calc-grid">
  <div class="calc-card big reveal" id="calc-widget" data-quotes='${attr(JSON.stringify(rows.map(r => ({ code: r.code, name: r.name, purity: r.purity, buy: r.buy, metal: r.metal }))))}'>
    <div class="calc-row"><label>순도 선택</label><div class="chips" id="calcPurity">${rows.map((r, i) => `<button class="chip${i === 0 ? ' active' : ''}" data-code="${attr(r.code)}">${esc(r.name)} <small>${esc(r.purity || '')}</small></button>`).join('')}</div></div>
    <div class="calc-row"><label for="calcW">중량</label><div class="calc-input"><input id="calcW" type="number" inputmode="decimal" min="0" step="0.01" value="3.75"><span class="unit-toggle" role="group"><button class="ut active" data-u="g">g</button><button class="ut" data-u="don">돈</button></span></div><input id="calcRange" type="range" min="0" max="200" step="0.25" value="3.75" aria-label="중량 슬라이더"><div class="presets" id="calcPresets">${[[1.875, '반돈'], [3.75, '1돈'], [7.5, '2돈'], [11.25, '3돈'], [18.75, '5돈'], [37.5, '10돈']].map(([g, l]) => `<button class="chip sm" data-g="${g}">${l}</button>`).join('')}</div></div>
    <div class="calc-result"><span class="cr-label">예상 매입가</span><b id="calcTotal">0원</b><span class="cr-sub" id="calcSub"></span></div>
    <table class="calc-table" id="calcTable"><thead><tr><th>순도</th><th class="num">1g</th><th class="num">1돈</th><th class="num">입력 중량</th></tr></thead><tbody>${rows.map(r => `<tr data-code="${attr(r.code)}"><td>${esc(r.name)}</td><td class="num">${fmtNum(r.buyG)}원</td><td class="num">${fmtNum(r.buy)}원</td><td class="num ct-total">-</td></tr>`).join('')}</tbody></table>
    <div class="calc-actions"><a class="btn btn-gold" id="calcApply" href="/apply?kind=sell">이 금액으로 매입 예약</a><a class="btn btn-kakao" href="${attr(s.kakao_channel)}" target="_blank" rel="noopener">카카오톡 문의</a><button class="btn btn-ghost-dark" id="calcCopy" type="button">결과 복사</button></div>
    <p class="note">${esc(s.quote_note)}</p>
  </div>
  <aside class="side-col"><div class="side-card"><h3>단위 환산</h3><ul class="side-list"><li>1돈<span>3.75g</span></li><li>1냥(10돈)<span>37.5g</span></li><li>1트로이온스<span>31.1035g</span></li><li>반돈<span>1.875g</span></li></ul></div><div class="side-card"><h3>순도별 매입 비율</h3><ul class="side-list"><li>24K(999.9)<span>100%</span></li><li>18K(750)<span>73.5%</span></li><li>14K(585)<span>57%</span></li></ul><a class="link" href="/guide/purity">순도 표기 안내 →</a></div><div class="side-card"><h3>감정 시 제외되는 것</h3><p>큐빅·다이아 등 보석, 잠금장치 스프링(철), 시계 무브먼트, 도금 제품.</p></div></aside>
</div></section>
<section class="section explain"><div class="wrap narrow"><h2>계산 공식은 무엇인가요?</h2><p><strong>예상 매입가 = 해당 순도 매입가(원/g) × 순중량(g)</strong>. 순도별 매입가는 순금 매입가에 매장 비율(18K 73.5%, 14K 57%)을 적용해 고시됩니다. 1돈은 3.75g이므로 돈 단위 입력은 3.75를 곱해 g으로 환산합니다.</p><h2>왜 실제 금액과 다를 수 있나요?</h2><ul><li>각인과 실제 순도가 다른 경우(감정 결과 적용)</li><li>보석·부속품·이물질 무게 제외</li><li>결제 시점의 고시 시세 적용</li></ul><h2>은·백금도 계산되나요?</h2><p>네. 은(Ag 999)과 백금(Pt)도 같은 방식으로 계산됩니다. Pt950·Pt900은 함량만큼 환산되므로 상담 시 안내해 드립니다.</p>${faqHtml(faqs)}</div></section>`;
  res.send(page({ title: `금 매입가 계산기 — 순도(24K·18K·14K)·중량(g/돈)으로 예상 금액 (순금 ${st.gold ? fmtNum(st.gold.buy) + '원/돈' : ''})`, description: `순도와 중량만 입력하면 오늘 시세로 예상 매입가를 계산합니다. 순금 ${st.gold ? fmtNum(st.gold.buyG) + '원/g' : ''}, 18K·14K·백금·은 매입가, 돈·g 환산, 감정 시 제외 항목. 종로3가 문강금은.`, path: '/calculator', body, breadcrumbs: [{ name: '오늘의 금시세', href: '/price' }, { name: '매입가 계산기', href: '/calculator' }], jsonld: [faqLd(faqs), { '@context': 'https://schema.org', '@type': 'WebApplication', name: '문강금은 금 매입가 계산기', url: settings.siteUrl() + '/calculator', applicationCategory: 'FinanceApplication', operatingSystem: 'Web', offers: { '@type': 'Offer', price: 0, priceCurrency: 'KRW' } }], quoteBar: quoteBar(), bodyClass: 'calc-page' }));
});

// ── 제품 목록 ──
router.get('/products', (req, res) => {
  const cat = TAB_LABEL[req.query.category] ? req.query.category : ''; const q = String(req.query.q || '').trim().slice(0, 40);
  let sql = "SELECT * FROM products WHERE status='published'"; const args = [];
  if (cat === 'today') sql += ' AND ready_today=1';
  else if (cat === 'best') sql += ' AND featured=1';
  else if (cat) { sql += ' AND category=?'; args.push(cat); } if (q) { sql += ' AND (name LIKE ? OR summary LIKE ?)'; args.push(`%${q}%`, `%${q}%`); }
  const TYPE_WORD = { necklace: '목걸이', earring: '귀걸이', bracelet: '팔찌', ring: '반지' };
  const tWord = TYPE_WORD[req.query.t];
  if (tWord) { sql += ' AND (name LIKE ? OR summary LIKE ?)'; args.push(`%${tWord}%`, `%${tWord}%`); }
  sql += ' ORDER BY featured DESC, sort, id';
  const rows = db.prepare(sql).all(...args); const st = quotes.stats(); const site = settings.siteUrl();
  const counts = Object.fromEntries(db.prepare("SELECT category, COUNT(*) c FROM products WHERE status='published' GROUP BY category").all().map(r => [r.category, r.c]));
  counts.today = db.prepare("SELECT COUNT(*) c FROM products WHERE status='published' AND ready_today=1").get().c;
  counts.best = db.prepare("SELECT COUNT(*) c FROM products WHERE status='published' AND featured=1").get().c;
  const body = `
<section class="page-head"><div class="wrap"><p class="eyebrow">제품</p><h1>${cat ? tabLabel(cat) : '주얼리·골드바·실버바·순금 기념품'} <small>${rows.length}개</small></h1><p class="bluf">모든 제품 가격은 ${esc(st.updatedText)} 문강금은 고시 시세(순금 판매 ${st.gold && st.gold.sell ? fmtNum(st.gold.sell) + '원/돈' : ''})에 연동되어 자동 계산되며, 결제 시점 매장 고시가가 최종 적용됩니다. 실물 귀금속 구매 시 부가세 10%가 별도이며, 구매하신 제품은 되파실 때 당일 매입 시세로 다시 매입합니다.</p>
<div class="tabs"><a class="tab${!cat ? ' active' : ''}" href="/products">전체</a>${Object.entries(TAB_LABEL).map(([k, v]) => `<a class="tab${cat === k ? ' active' : ''}" href="/products?category=${k}">${v} ${counts[k] || 0}</a>`).join('')}</div></div></section>
<section class="section"><div class="wrap">
  <div class="market-controls"><input type="search" id="pFilter" placeholder="제품명 검색" aria-label="제품 검색" value="${attr(q)}"><select id="pSort" aria-label="정렬"><option value="featured">추천순</option><option value="price-asc">가격 낮은순</option><option value="price-desc">가격 높은순</option><option value="weight">중량순</option></select></div>
  <div class="pgrid" id="pGrid">${rows.map(productCard).join('') || '<p class="note">등록된 제품이 없습니다.</p>'}</div>
</div></section>
<section class="section explain"><div class="wrap narrow"><h2>제품 가격은 어떻게 정해지나요?</h2><p><strong>가격 = (당일 판매 시세 원/g × 순중량) + 공임</strong>이며, 표시 가격은 부가세가 포함된 금액입니다. 페이지마다 적용 시세 기준시각을 표시하고, 시세가 바뀌면 가격도 자동으로 바뀝니다.</p><h2>되팔 때는 얼마를 받나요?</h2><p>되파는 시점의 문강금은 매입 시세(원/돈) × 순중량입니다.</p><h2>구매는 어떻게 하나요?</h2><p>매장 방문 시 당일 시세로 바로 구매·수령하실 수 있고, <a href="/apply?kind=buy">구매 예약</a>에 제품·수량을 남기시면 준비해 두었다가 방문 시 드립니다. 온라인 결제·배송은 준비 중입니다.</p></div></section>`;
  const KWT = { today: '오늘 출발 제품', best: '베스트 제품', goldbar: '종로 골드바 가격', silverbar: '종로 실버바 가격', women: '순금 여성 주얼리 가격', men: '순금 남성 주얼리 가격', baby: '종로 돌반지·순금 아기 선물 가격', gift: '순금 기념품·행운의 열쇠 가격', jewelry: '14K·18K 주얼리·다이아 가격' };
  res.send(page({ title: `${cat ? KWT[cat] : '주얼리·골드바·실버바·순금 기념품 가격'} — 당일 시세 연동 ${rows.length}개 제품 | 종로3가 금은방`, description: `${cat ? tabLabel(cat) : '주얼리·골드바·실버바·돌반지·순금 기념품'} ${rows.length}개 제품 가격. ${st.updatedText} 시세 연동 자동 계산, 적용 기준시각 표기, 부가세 별도, 되팔 때 당일 매입. 종로3가 문강금은.`, path: '/products', body, breadcrumbs: [{ name: '제품', href: '/products' }, ...(cat ? [{ name: tabLabel(cat), href: `/products?category=${cat}` }] : [])], quoteBar: quoteBar(), jsonld: [{ '@context': 'https://schema.org', '@type': 'ItemList', name: cat ? tabLabel(cat) : '문강금은 제품', numberOfItems: rows.length, itemListElement: rows.slice(0, 50).map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.name, url: `${site}/products/${encodeURIComponent(p.slug)}` })) }] }));
});

module.exports = { router, chg, sparkline, faqHtml, postCard, quoteBar, productCard, FAQ };
