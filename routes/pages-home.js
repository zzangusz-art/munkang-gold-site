'use strict';
// 메인 — 온라인몰 구성(작업지시서 2026-09-24): 배너 → 시세 → 진열 섹션 → FAQ
const express = require('express');
const fs = require('fs');
const path = require('path');
const { db, getSetting } = require('../db');
const { page, faqLd } = require('../lib/layout');
const settings = require('../lib/settings');
const quotes = require('../lib/quotes');
const { productCard } = require('../lib/cards');
const { esc, attr, fmtNum, isoFromTs, truncate } = require('../lib/util');

const router = express.Router();
const FAQ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'seed', 'faq.json'), 'utf8'));

// 배너 7개 제품군과 동일 (Diamond → 주얼리)
const QUICK = [
  ['women', '순금 주얼리', 'ring'], ['goldbar', '골드바', 'bar'], ['silverbar', '실버바', 'bar2'],
  ['baby', '순금 돌선물', 'baby'], ['jewelry', '14K·18K 주얼리', 'neck'], ['gift', '순금 오브제', 'gift'], ['jewelry', '다이아', 'dia'],
];
const QM_ICON = {
  ring: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="20" r="7.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M16 11.5 12.4 6h7.2L16 11.5z" fill="currentColor"/></svg>',
  bar: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 23h20l-3.2-9H9.2L6 23z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><rect x="10" y="8" width="12" height="4" rx="1.4" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  bar2: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="5" y="17" width="22" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="9" y="8.5" width="14" height="6" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  baby: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="12.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M7.5 25.5c1.7-4.3 4.9-6.4 8.5-6.4s6.8 2.1 8.5 6.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  neck: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 7c0 7.2 4 12.5 9 12.5S25 14.2 25 7" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="16" cy="23.5" r="3.6" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  gift: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="6.5" y="13" width="19" height="12.5" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="4.5" y="8" width="23" height="5" rx="1.6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M16 8v17.5" stroke="currentColor" stroke-width="2.2"/></svg>',
  dia: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M10.5 7h11l5 6.2L16 26 5.5 13.2 10.5 7z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M5.5 13.2h21M12 7l4 19 4-19" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>',
};
const PICK_TABS = [['best', 'BEST'], ['new', 'NEW'], ['gift', 'GIFT'], ['diamond', 'DIAMOND']];

function pickProducts(tab, limit = 8) {
  const base = "SELECT * FROM products WHERE status='published'";
  if (tab === 'best') return db.prepare(`${base} AND (featured=1 OR section_tag='best') ORDER BY sort, id LIMIT ?`).all(limit);
  if (tab === 'new') return db.prepare(`${base} ORDER BY created_at DESC, id DESC LIMIT ?`).all(limit);
  if (tab === 'gift') return db.prepare(`${base} AND (category IN ('gift','baby') OR section_tag='gift') ORDER BY sort, id LIMIT ?`).all(limit);
  if (tab === 'diamond') return db.prepare(`${base} AND (section_tag='diamond' OR name LIKE '%다이아%' OR name LIKE '%모이사%' OR stone_json IS NOT NULL) ORDER BY sort, id LIMIT ?`).all(limit);
  return db.prepare(`${base} ORDER BY sort, id LIMIT ?`).all(limit);
}
const tagged = (tag, limit) => db.prepare("SELECT * FROM products WHERE status='published' AND section_tag=? ORDER BY sort, id LIMIT ?").all(tag, limit);
const bannerRows = (slot) => db.prepare('SELECT * FROM banners WHERE slot=? AND active=1 ORDER BY sort, id').all(slot);
const br = (s) => esc(String(s || '')).split('/').map((x) => x.trim()).filter(Boolean).join('<br>');

router.get('/', (req, res) => {
  const s = settings.all(); const st = quotes.stats(); const sp = quotes.spot();
  const banners = bannerRows('main');
  const limited = bannerRows('limited')[0];
  const collection = bannerRows('collection')[0];
  const reviews = db.prepare('SELECT * FROM reviews WHERE visible=1 ORDER BY id DESC LIMIT 20').all();
  const faqs = (() => {
    try { const a = JSON.parse(getSetting('home_faq_json') || '[]'); if (Array.isArray(a) && a.length) return a.filter((f) => f && f.q && f.a).slice(0, 8); } catch (_) { /* 기본 FAQ 사용 */ }
    return FAQ.slice(0, 6);
  })();
  const counts = Object.fromEntries(db.prepare("SELECT category, COUNT(*) c FROM products WHERE status='published' GROUP BY category").all().map((r) => [r.category, r.c]));
  const collectionItems = tagged('collection', 4).length ? tagged('collection', 4) : pickProducts('best', 4);
  const weekly = tagged('weekly', 4);
  const news = pickProducts('new', 8);
  const keywords = String(s.popular_keywords || '콩알금,돌선물,골드바,순금반지,다이아').split(',').map((k) => k.trim()).filter(Boolean).slice(0, 8);
  const kwProducts = Object.fromEntries(keywords.map((k) => [k, db.prepare("SELECT * FROM products WHERE status='published' AND (name LIKE ? OR summary LIKE ?) ORDER BY sort, id LIMIT 4").all(`%${k}%`, `%${k}%`)]));

  const byCode = Object.fromEntries(st.rows.map((r) => [r.code, r]));
  const LINE = [['au999', '24K', '24K Gold'], ['au750', '18K', '18K Gold'], ['au585', '14K', '14K Gold'], ['pt999', '백금', 'Platinum'], ['ag999', '순은', 'Silver']]
    .map(([code, head, sub]) => ({ head, sub, code, ...(byCode[code] || {}) }));
  const intl = [['GOLD', 'XAU', sp.xau, 'OANDA:XAUUSD'], ['SILVER', 'XAG', sp.xag, 'OANDA:XAGUSD'], ['PLATINUM', 'XPT', sp.xpt, 'OANDA:XPTUSD']];

  const body = `
<section class="mainbanner" id="mainBanner" aria-label="제품군 배너">
  <div class="mb-track">${banners.map((b, i) => `
    <article class="mb-slide${i === 0 ? ' on' : ''} mb-${attr(b.theme || 'dark')}" data-i="${i}">
      <picture><source media="(max-width:900px)" srcset="${attr(b.image_m || b.image)}"><img src="${attr(b.image)}" alt="" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}></picture>
      <div class="wrap mb-copy"><h2>${br(b.title)}</h2>${b.subtitle ? `<p>${br(b.subtitle)}</p>` : ''}${b.btn_text ? `<a class="mb-btn" href="${attr(b.href || '/products')}">${esc(b.btn_text)}</a>` : ''}</div>
    </article>`).join('')}</div>
  ${banners.length > 1 ? `<button class="mb-arrow prev" type="button" aria-label="이전 배너">‹</button><button class="mb-arrow next" type="button" aria-label="다음 배너">›</button>
  <div class="mb-dots">${banners.map((_, i) => `<button type="button" class="mb-dot${i === 0 ? ' on' : ''}" data-go="${i}" aria-label="${i + 1}번 배너"></button>`).join('')}</div>` : ''}
</section>

<section class="section intl-sec">
  <div class="wrap">
    <div class="sec-head"><div><h2>국제 금·귀금속 시세</h2><p class="sub">USD/oz 기준 · 출처 TradingView</p></div></div>
    <div class="intl-grid">
      ${intl.map(([name, sym, v, tv]) => `<button type="button" class="intl-card${name === 'GOLD' ? ' on' : ''}" data-sym="${attr(tv)}"><b>${name}</b><span class="intl-p">${v ? '$' + fmtNum(Math.round(v * 100) / 100) : '-'}</span><small>${sym}/USD</small></button>`).join('')}
    </div>
    <div class="intl-chart">
      <div class="intl-tabs" role="group" aria-label="기간">${[['1D', '1일'], ['5D', '1주'], ['1M', '1개월'], ['3M', '3개월'], ['12M', '1년']].map(([k, v], i) => `<button type="button" class="intl-tab${i === 2 ? ' on' : ''}" data-range="${k}">${v}</button>`).join('')}</div>
      <div id="tvChart" class="tv-box" data-sym="OANDA:XAUUSD" data-range="1M"></div>
      <p class="note">※ 국제 금 시세 기준. 매장 고시가는 아래 금 시세 라인업을 확인해 주세요.</p>
    </div>
  </div>
</section>

<section class="section lineup-sec">
  <div class="wrap lineup-grid">
    <div class="lu-side">
      <p class="eyebrow">${esc(s.site_name)}</p>
      <h2>금 시세 라인업</h2>
      <p class="lu-unit">단위 : 3.75g(1돈) 기준<br>${esc(st.updatedText)} 기준</p>
      <a class="btn btn-gold" href="/price">전체 시세표 보기</a>
    </div>
    <div class="lu-table-wrap">
      <table class="lineup">
        <thead><tr><th><span class="sr">구분</span></th>${LINE.map((l) => `<th><b>${l.head}</b><small>${l.sub} / 3.75g</small></th>`).join('')}</tr></thead>
        <tbody>
          <tr><th class="lu-rh">내가 살 때<small>(VAT 포함)</small></th>${LINE.map((l) => `<td>${(l.code === 'au750' || l.code === 'au585') ? '<span class="lu-na">제품시세적용</span>' : (l.sell ? `<b>${fmtNum(l.sell)}</b>` : '<span class="lu-na">문의</span>')}</td>`).join('')}</tr>
          <tr><th class="lu-rh">내가 팔 때</th>${LINE.map((l) => `<td>${l.buy ? `<b>${fmtNum(l.buy)}</b>` : '<span class="lu-na">문의</span>'}</td>`).join('')}</tr>
        </tbody>
      </table>
      <ul class="lu-notes">
        <li>단위는 3.75g(1돈) 기준입니다.</li>
        <li>국제 시세 변동에 따라 하루 중에도 가격이 바뀝니다.</li>
        <li>'내가 살 때' 금액은 부가세가 포함된 금액입니다.</li>
        <li>제품별 세공비는 별도이며, 18K·14K는 제품 시세가 적용됩니다.</li>
      </ul>
    </div>
  </div>
</section>

<section class="section quick-sec"><div class="wrap">
  <div class="quick-menu">${QUICK.map(([k, label, ic]) => `<a class="qm" href="/products?category=${k}"><span class="qm-ic">${QM_ICON[ic] || ''}</span><b>${label}</b></a>`).join('')}</div>
</div></section>

${collection ? `<section class="section collection-sec"><div class="wrap">
  <div class="sec-head center"><h2>${esc(collection.title || 'GOLD COLLECTION')}</h2>${collection.subtitle ? `<p class="sub">${br(collection.subtitle)}</p>` : ''}</div>
  <a class="coll-banner" href="${attr(collection.href || '/products')}"><img src="${attr(collection.image)}" alt="${attr(collection.title || '')}" loading="lazy"></a>
  <div class="pgrid">${collectionItems.map(productCard).join('')}</div>
</div></section>` : ''}

<section class="section picks-sec"><div class="wrap">
  <div class="sec-head center"><h2>BEST / PICKS</h2></div>
  <div class="pick-tabs" role="tablist">${PICK_TABS.map(([k, v], i) => `<button type="button" class="pick-tab${i === 0 ? ' on' : ''}" data-pick="${k}" role="tab" aria-selected="${i === 0}">${v}</button>`).join('')}</div>
  ${PICK_TABS.map(([k], i) => `<div class="pgrid pick-pane${i === 0 ? ' on' : ''}" data-pane="${k}">${pickProducts(k, 8).map(productCard).join('') || '<p class="note">준비 중입니다.</p>'}</div>`).join('')}
</div></section>

<section class="section new-sec"><div class="wrap">
  <div class="sec-head"><div><h2>NEW ARRIVALS</h2><p class="sub">새로 들어온 상품</p></div><a class="link" href="/products">전체 상품 →</a></div>
  <div class="pgrid">${news.map(productCard).join('')}</div>
</div></section>

${limited ? `<section class="section limited-sec"><div class="wrap">
  <a class="limited-banner mb-${attr(limited.theme || 'dark')}" href="${attr(limited.href || '/products')}">
    <img src="${attr(limited.image)}" alt="${attr(limited.title || '한정 상품')}" loading="lazy">
    <span class="lb-copy"><b>${br(limited.title)}</b>${limited.subtitle ? `<small>${br(limited.subtitle)}</small>` : ''}${limited.btn_text ? `<em>${esc(limited.btn_text)}</em>` : ''}</span>
  </a>
</div></section>` : ''}

${weekly.length ? `<section class="section weekly-sec"><div class="wrap">
  <div class="sec-head center"><h2>WEEKLY SPECIAL</h2><p class="sub">이번 주 특가</p></div>
  <div class="pgrid">${weekly.map(productCard).join('')}</div>
</div></section>` : ''}

${reviews.length ? `<section class="section review-sec"><div class="wrap">
  <div class="sec-head"><div><h2>CUSTOMER REVIEW</h2><p class="sub">실제 구매 고객이 남긴 후기</p></div><a class="link" href="/reviews">후기 전체 →</a></div>
  <div class="rv-slider"><div class="rv-strip">${reviews.map((r) => { const ph = (() => { try { return (JSON.parse(r.photos || '[]') || [])[0] || ''; } catch (_) { return ''; } })(); return `<blockquote class="rv-card">${ph ? `<img src="${attr(ph)}" alt="" loading="lazy">` : ''}<span class="stars">${'★'.repeat(r.rating)}</span><p>${esc(truncate(r.text, 120))}</p><footer>${esc(r.name)}${r.kind ? ' · ' + esc(r.kind) : ''}</footer></blockquote>`; }).join('')}</div></div>
  <div class="rv-nav"><button type="button" class="rv-prev" aria-label="이전 후기">‹</button><button type="button" class="rv-next" aria-label="다음 후기">›</button></div>
</div></section>` : ''}

${keywords.length ? `<section class="section kw-sec2"><div class="wrap">
  <div class="sec-head center"><h2>POPULAR KEYWORDS</h2></div>
  <div class="kw-tabs">${keywords.map((k, i) => `<button type="button" class="kw-tab${i === 0 ? ' on' : ''}" data-kw="${attr(k)}">#${esc(k)}</button>`).join('')}</div>
  ${keywords.map((k, i) => `<div class="pgrid kw-pane${i === 0 ? ' on' : ''}" data-kwpane="${attr(k)}">${(kwProducts[k] || []).map(productCard).join('') || `<p class="note">'${esc(k)}' 상품을 준비 중입니다.</p>`}</div>`).join('')}
</div></section>` : ''}

<section class="section faq-sec"><div class="wrap narrow">
  <div class="sec-head center"><h2>자주 묻는 질문</h2></div>
  <div class="faq-list">${faqs.map((f, i) => `<details class="faq-item"${i === 0 ? ' open' : ''}><summary>${esc(f.q)}</summary><div class="faq-a">${esc(f.a)}</div></details>`).join('')}</div>
  <p class="center"><a class="link" href="/faq">FAQ 전체 보기 →</a></p>
</div></section>`;

  res.send(page({
    title: `문강금은 | 종로3가 금거래소·금은방 — 골드바·순금 주얼리·돌선물 온라인 구매`,
    description: `종로3가 문강금은 공식 온라인몰. 골드바·실버바·순금 주얼리·돌선물·14K·18K 주얼리를 당일 시세 가격으로 구매하세요. 오늘 순금 24K 매입가 ${st.gold ? fmtNum(st.gold.buy) + '원/돈' : ''}, ${s.hours}.`,
    path: '/', body, bodyClass: 'home shop',
    extraHead: banners[0] ? `<link rel="preload" as="image" href="${attr(banners[0].image)}" media="(min-width:901px)"><link rel="preload" as="image" href="${attr(banners[0].image_m || banners[0].image)}" media="(max-width:900px)">` : '',
    jsonld: [faqLd(faqs)],
    dateModified: st.lastUpdated ? isoFromTs(st.lastUpdated) : undefined,
  }));
});

module.exports = { router };
