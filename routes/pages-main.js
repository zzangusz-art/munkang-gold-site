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
function stoneTag(p) {
  const st = quotes.stoneOptions(p);
  if (!st.length && !p.karat_option) return '';
  const parts = [p.karat_option ? '14K·18K' : '', st.map(x => x.name).join('·')].filter(Boolean);
  return `<p class="pc-opt">${esc(parts.join(' / '))} 선택</p>`;
}
function productCard(p) {
  const pr = quotes.productPrice(p);
  return `<a class="pcard reveal" href="/products/${attr(p.slug)}" data-cat="${attr(p.category)}" data-name="${attr(p.name)}" data-price="${pr.price || 0}" data-weight="${p.weight_g || 0}"><div class="pc-img ${attr(p.metal)}">${p.image ? `<img src="${attr(p.image)}" alt="${attr(p.name)}" loading="lazy">` : `<span class="pc-glyph">${p.metal === 'silver' ? 'Ag' : 'Au'}</span><span class="pc-w">${p.weight_g}g</span>`}${p.ready_today ? '<span class="badge badge-today">오늘 출발</span>' : p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}</div><div class="pc-body"><span class="pc-cat">${CAT_LABEL[p.category] || ''}</span><h3>${esc(p.name)}</h3><p class="pc-price">${pr.price ? `<b>${fmtNum(pr.price)}원</b>` : '<b>시세 문의</b>'}</p><p class="pc-basis">${pr.basis ? `${esc(pr.basis)} 시세 기준` : p.price_fixed ? '고정가' : '당일 시세 연동'}</p>${stoneTag(p)}</div></a>`;
}

// ── 홈 ──
router.get('/', (req, res) => {
  const s = settings.all(); const st = quotes.stats(); const g = st.gold; const sp = quotes.spot();
  const posts = db.prepare("SELECT * FROM posts WHERE kind='blog' AND status='published' ORDER BY published_at DESC LIMIT 3").all();
  const videos = db.prepare('SELECT * FROM videos ORDER BY sort, id DESC LIMIT 3').all();
  const reviews = db.prepare('SELECT * FROM reviews WHERE visible=1 ORDER BY id DESC LIMIT 50').all();
  const featured = db.prepare("SELECT * FROM products WHERE status='published' AND featured=1 ORDER BY sort, id LIMIT 8").all();
  const fresh = db.prepare("SELECT * FROM products WHERE status='published' ORDER BY created_at DESC, id DESC LIMIT 4").all();
  const counts = Object.fromEntries(db.prepare("SELECT category, COUNT(*) c FROM products WHERE status='published' GROUP BY category").all().map(r => [r.category, r.c]));
  counts.today = db.prepare("SELECT COUNT(*) c FROM products WHERE status='published' AND ready_today=1").get().c;
  counts.best = db.prepare("SELECT COUNT(*) c FROM products WHERE status='published' AND featured=1").get().c;
  const CAT_TILES = [['today', '오늘출발'], ['best', 'BEST'], ['goldbar', '골드바'], ['silverbar', '실버바'], ['women', '순금 여성'], ['men', '순금 남성'], ['baby', '순금 아기'], ['gift', '순금 기념품'], ['jewelry', '주얼리(14K·18K)']];
  const byCode = Object.fromEntries(st.rows.map(r => [r.code, r]));
  const LINE = [['au999', '24K금시세', '24K Gold / 3.75g'], ['au750', '18K금시세', '18K Gold / 3.75g'], ['au585', '14K금시세', '14K Gold / 3.75g'], ['pt999', '백금시세', 'Platinum / 3.75g'], ['ag999', '순은시세', 'Silver / 3.75g']]
    .map(([code, head, sub]) => ({ head, sub, ...(byCode[code] || {}) }));
  const hist = g ? quotes.history(g.id, 30) : [];
  const faqs = FAQ.slice(0, 6);
  // 계산기 옆 유튜브 롤링 — 채널 RSS로 자동 동기화된 최신 영상
  const rollVids = youtubeLib.latest(10);
  const ytRoll = rollVids.length ? `<div class="yt-roll" id="ytRoll"><div class="yr-head"><b>문강금은 유튜브</b><span>매일 올리는 금·은 시세 영상</span><a href="${attr(s.youtube)}" target="_blank" rel="noopener">채널 보기</a></div><div class="yr-view"><div class="yr-track">${rollVids.map(v => `<button type="button" class="yr-item" data-id="${attr(v.youtube_id)}" aria-label="${attr(v.title)} 재생"><img src="https://i.ytimg.com/vi/${attr(v.youtube_id)}/oardefault.jpg" alt="" loading="lazy" width="180" height="320"><span class="yr-play" aria-hidden="true"></span><span class="yr-t">${esc(v.title)}</span></button>`).join('')}</div></div><div class="yr-nav"><button type="button" class="yr-prev" aria-label="이전 영상">&lsaquo;</button><button type="button" class="yr-next" aria-label="다음 영상">&rsaquo;</button></div></div>` : '';
  const ytModal = rollVids.length ? '<div class="yt-modal" id="ytModal" hidden><div class="yt-modal-box"><button type="button" class="yt-close" aria-label="닫기">&times;</button><div class="yt-frame"></div></div></div>' : '';
  const tickerHtml = st.rows.map(r => `<span class="tk"><b>${esc(r.name)}</b> 매입 ${fmtNum(r.buy)}${r.sell ? ` · 판매 ${fmtNum(r.sell)}` : ''} ${chg(r.diff, r.pct)}</span>`).join('') + (sp.available ? `<span class="tk"><b>국제 금시세</b> $${fmtNum(Math.round(sp.xau))}/oz · 환율 ${fmtNum(Math.round(sp.usdkrw))}원</span>` : '');
  const body = `
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-visual"><span class="hv-cue" aria-hidden="true"><i></i>아래로 내리면 오늘 시세</span></div>
    <div class="hero-main">
    <div class="hero-copy">
      <p class="eyebrow">종로3가역 1호선 2번 출구 앞 금·은 매입·판매</p>
      <h1>오늘 금 한 돈,<br><span class="hl">${g ? fmtNum(g.buy) + '원' : '당일 시세'}</span>에 사드립니다</h1>
      <p class="lead">문강금은은 종로3가에 위치한 금거래소입니다. 순금·18K·14K·백금·은 시세를 매일 공개하고, 골드바, 실버바, 주얼리, 돌반지를 당일 시세로 판매합니다.</p>
      <div class="hero-actions"><a class="btn btn-gold lg" href="/calculator">매입가 계산하기</a><a class="btn btn-ghost lg" href="/apply">매입·구매 예약</a></div>
      <ul class="trust"><li>감정 30분 이내</li><li>현장 현금 지급</li><li>매일 ${esc(s.hours_open)}–${esc(s.hours_close)}</li></ul>
    </div>
    <div class="hero-board reveal" id="board">
      <div class="hb-head"><span>오늘의 시세 <small>원/돈(3.75g)</small></span><span class="hb-time"><i class="live-dot" aria-hidden="true"></i>실시간 <span id="liveTime">${esc(st.updatedText)}</span></span></div>
      <div class="hb-main">
        <div class="hb-gold"><span class="hb-name">순금 24K 매입가</span><b class="hb-price" data-count="${g ? g.buy : 0}">0</b><span class="hb-sub"><span id="hbChg">${g ? chg(g.diff, g.pct) : ''}</span> · 1g ${g ? fmtNum(g.buyG) : '-'}원</span></div>
        <div class="hb-spark">${sparkline(hist, 260, 64)}<span class="note">최근 30일 매입가 추이 (30일 ${st.m30 > 0 ? '+' : ''}${st.m30}%)</span></div>
      </div>
      <table class="hb-table"><tbody>${st.rows.filter(r => r.code !== 'au999').map(r => `<tr data-code="${attr(r.code)}"><th>${esc(r.name)}</th><td class="num">${fmtNum(r.buy)}</td><td class="num">${r.sell ? fmtNum(r.sell) : '<span class="muted">—</span>'}</td><td class="num">${chg(r.diff, r.pct)}</td></tr>`).join('')}</tbody><tfoot><tr><th></th><td class="num">매입</td><td class="num">판매</td><td class="num">전일비</td></tr></tfoot></table>
      <div class="hb-foot"><span class="unit-toggle" role="group" aria-label="단위"><button class="ut active" data-unit="don">돈</button><button class="ut" data-unit="g">g</button></span><a href="/price">전체 시세표 →</a></div>
    </div>
    </div>
  </div>
  <div class="ticker" aria-label="오늘의 시세 흐름"><div class="ticker-track" id="tickerTrack">${tickerHtml}${tickerHtml}</div></div>
</section>

<section class="section lineup-sec">
  <div class="wrap lineup-grid">
    <div class="lu-side reveal">
      <p class="eyebrow">${esc(s.site_name)}</p>
      <h2>금 시세 라인업</h2>
      <p class="lu-unit">단위 : 3.75g(1돈) 기준<br>${esc(st.updatedText)} 기준</p>
      <ul class="lu-notes"><li>자사 골드바·실버바 판매 기준</li><li>내가 살 때 금액은 부가세 포함</li><li>타사 제품은 순도 감정 후 매입가 확정</li></ul>
      <a class="btn btn-gold" href="/price">전체 시세표 보기</a>
    </div>
    <div class="lu-table-wrap reveal">
      <table class="lineup">
        <thead><tr><th><span class="sr">구분</span></th>${LINE.map(l => `<th><b>${l.head}</b><small>${l.sub}</small></th>`).join('')}</tr></thead>
        <tbody>
          <tr><th class="lu-rh">내가 살 때<small>(VAT 포함)</small></th>${LINE.map(l => `<td>${l.sell ? `<b>${fmtNum(l.sell)}</b>${chg(l.diff, l.pct)}` : '<span class="lu-na">제품 시세 적용</span>'}</td>`).join('')}</tr>
          <tr><th class="lu-rh">내가 팔 때</th>${LINE.map(l => `<td>${l.buy ? `<b>${fmtNum(l.buy)}</b>${chg(l.diff, l.pct)}` : '<span class="lu-na">문의</span>'}</td>`).join('')}</tr>
        </tbody>
      </table>
      <p class="note">${esc(s.quote_note)}</p>
    </div>
  </div>
  ${ytRoll ? `<div class="wrap lu-yt">${ytRoll}</div>` : ''}
  ${ytModal}
</section>

<section class="section lineup-products">
  <div class="wrap">
    <div class="sec-head center"><h2>상품 라인업</h2><p class="sub">골드바·실버바부터 순금 주얼리와 기념품까지, 당일 시세로 계산한 가격을 그대로 보여 드립니다.</p></div>
    <div class="cat-tiles">${CAT_TILES.map(([k, label]) => `<a class="cat-tile reveal" href="/products?category=${k}"><b>${label}</b><span class="ct-n">${counts[k] || 0}개</span></a>`).join('')}</div>
    <div class="pgrid">${featured.map(productCard).join('') || '<p class="note">제품을 준비 중입니다.</p>'}</div>
    <p class="center"><a class="btn btn-ghost" href="/products">전체 제품 보기</a></p>
  </div>
</section>

${fresh.length ? `<section class="section new-products">
  <div class="wrap">
    <div class="sec-head"><div><h2>신규 상품</h2><p class="sub">새로 등록된 제품입니다.</p></div><a class="link" href="/products">전체 제품 →</a></div>
    <div class="pgrid">${fresh.map(productCard).join('')}</div>
  </div>
</section>` : ''}

${reviews.length ? `<section class="section reviews-sec"><div class="wrap"><div class="sec-head"><div><h2>고객 후기</h2><p class="sub">문강금은에서 거래하신 고객님들의 후기 ${reviews.length}건</p></div><a class="link" href="/reviews">후기 더 보기 →</a></div></div>
  ${[reviews.filter((_, i) => i % 2 === 0), reviews.filter((_, i) => i % 2 === 1)].filter(r => r.length).map((row, ri) => `<div class="rv-marquee${ri ? ' rev' : ''}"><div class="rv-track">${[...row, ...row].map((r, i) => `<blockquote class="rv"${i >= row.length ? ' aria-hidden="true"' : ''}><span class="stars">${'★'.repeat(r.rating)}</span><p>${esc(truncate(r.text, 140))}</p><footer>${esc(r.name)}${r.kind ? ' · ' + esc(r.kind) : ''}</footer></blockquote>`).join('')}</div></div>`).join('')}
</section>` : ''}}

<section class="section process">
  <div class="wrap">
    <div class="sec-head center"><h2>금을 팔 때는 이렇게 진행됩니다</h2></div>
    <ol class="steps-row">${[['매장 방문', '종로3가 매장으로 오세요. 신분증만 챙겨 오시면 됩니다.'], ['중량 측정', '고객 앞에서 전자저울로 순중량을 잽니다. 보석과 부속품은 뺍니다.'], ['순도 감정', '시금석에 긁어 시약 반응으로 순도를 확인하고 결과를 함께 봅니다.'], ['금액 안내', '당일 시세와 순도, 중량으로 금액을 알려드립니다. 마음에 들지 않으면 팔지 않으셔도 됩니다.'], ['매입금 즉시 수령', '동의하시면 매입금을 그 자리에서 바로 받으실 수 있습니다.']].map(([t, d], i) => `<li class="step reveal"><span class="st-n">${i + 1}</span><h3>${t}</h3><p>${d}</p></li>`).join('')}</ol>
  </div>
</section>

<section class="section posts">
  <div class="wrap">
    <div class="sec-head"><div><h2>금시세 리포트와 금 정보</h2></div><a class="link" href="/blog">전체 글 →</a></div>
    <div class="post-grid">${posts.map(postCard).join('') || '<p class="note">첫 글이 곧 발행됩니다.</p>'}</div>
  </div>
</section>


<section class="section kw-sec"><div class="wrap">
  <div class="sec-head center"><h2>종로에서 금거래소, 금은방을 찾으신다면</h2><p class="sub">종로3가역 1호선 2번 출구 앞 문강금은은 종로 금매입, 종로 골드바, 종로 돌반지, 종로 금반지·금팔찌·금목걸이까지 한 매장에서 시세 공개·감정·현금 지급으로 처리합니다.</p></div>
  <div class="kw-grid">${[['종로금매입', '종로 금매입', '순금·18K·14K·은 형태 무관 매입, 30분 감정, 현장 현금'], ['종로금거래소', '종로 금거래소', '매입가·판매가 매일 공개, 국제 시세 환산 참고'], ['종로골드바', '종로 골드바', '1g~100g 당일 시세 연동, 보증서, 당일 재매입'], ['종로돌반지', '종로 돌반지', '반돈·한돈 순금 돌반지, 각인·케이스'], ['종로금은방', '종로 금은방', '종로3가역 1호선 2번 출구 앞, 연중무휴 10~20시'], ['종로금반지', '종로 금반지·팔찌·목걸이', '순금 주얼리 시세 연동 가격, 리세팅']].map(([k, t, d]) => `<a class="kw-card reveal" href="/search/${encodeURIComponent(k)}"><b>${t}</b><span>${d}</span></a>`).join('')}</div>
</div></section>

<section class="section faq-sec"><div class="wrap">
  <div class="sec-head center"><h2>자주 묻는 질문</h2></div>
  ${faqHtml(faqs, '')}
  <p class="center"><a class="link" href="/faq">FAQ 전체 보기 →</a></p>
</div></section>

<section class="section contact-sec" id="contact"><div class="wrap contact-grid">
  <div class="reveal"><h2>매입·구매 예약</h2><p>품목과 대략적인 중량만 남겨 주세요. 영업시간 내 바로 연락드려 시세와 방문 일정을 안내합니다. 급하시면 ${esc(s.phone)}으로 전화 주세요.</p>
  <ul class="checks"><li>매입·구매·상담 모두 무료</li><li>감정만 받아도 됩니다</li><li>카카오톡으로 사진 상담 가능</li></ul>
  <div class="map-mini"><a class="map-card" href="${attr(s.naver_place)}" target="_blank" rel="noopener"><b>네이버 지도로 길찾기</b><span>${esc(s.address)}</span><span class="map-go">지도 열기 →</span></a></div></div>
  <form class="inq-form reveal" id="inqForm" method="post" action="/api/inquiry" data-ajax>
    <fieldset><legend>예약 구분</legend><div class="radio-row"><label><input type="radio" name="kind" value="sell" checked> 금·은 팔기</label><label><input type="radio" name="kind" value="buy"> 골드바·제품 구매</label><label><input type="radio" name="kind" value="consult"> 상담</label></div></fieldset>
    <div class="row"><label>성함 <input name="name" required maxlength="40" placeholder="홍길동"></label><label>연락처 <input name="phone" required maxlength="20" placeholder="010-0000-0000" inputmode="tel"></label></div>
    <div class="row"><label>품목 <input name="item" maxlength="80" placeholder="예: 18K 반지 2개, 돌반지 1돈"></label><label>대략 중량 <input name="weight" maxlength="30" placeholder="예: 10g, 3돈"></label></div>
    <label>문의 내용 <textarea name="message" rows="3" maxlength="1000" placeholder="방문 희망 시간, 궁금한 점"></textarea></label>
    <input type="text" name="website" class="sr" tabindex="-1" autocomplete="off">
    <label class="agree"><input type="checkbox" name="agree" value="1" required> <a href="/privacy" target="_blank">개인정보 수집·이용</a>에 동의합니다 (상담 목적, 1년 보관)</label>
    <button class="btn btn-gold block" type="submit">예약 신청</button>
    <p class="form-msg" aria-live="polite"></p>
  </form>
</div></section>`;

  res.send(page({
    title: `문강금은 | 종로3가 금거래소·금은방 — 종로 금매입·골드바·돌반지, 오늘 순금 ${g ? fmtNum(g.buy) + '원/돈' : ''}`,
    description: `종로 금거래소·종로3가 금은방 문강금은(종로3가역 1호선 2번 출구 앞). 종로 금매입·골드바·돌반지·금반지. 오늘 순금 24K 매입가 ${g ? fmtNum(g.buy) + '원/돈(' + fmtNum(g.buyG) + '원/g)' : ''}, 18K·14K·백금·은 시세 매일 공개. 감정 후 현장 현금 지급, 골드바·실버바·주얼리·돌반지 판매. ${s.hours}.`,
    path: '/', body, bodyClass: 'home',
    extraHead: '<link rel="preload" as="image" href="/img/hero.jpg" media="(min-width:901px)"><link rel="preload" as="image" href="/img/hero-mobile.jpg" media="(max-width:900px)">',
    jsonld: [faqLd(faqs), datasetLd(st.rows, st.lastUpdated)],
    dateModified: st.lastUpdated ? isoFromTs(st.lastUpdated) : undefined,
  }));
});

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

// ── 바로 구매(주문서) ──
router.get('/order', (req, res, next) => {
  const p = db.prepare("SELECT * FROM products WHERE slug=? AND status='published'").get(String(req.query.product || '')); if (!p) return next();
  const s = settings.all(); const st = quotes.stats();
  const stones = quotes.stoneOptions(p); const karats = p.karat_option ? ['14k', '18k'] : ['14k'];
  const opts = [];
  for (const k of karats) for (let i = 0; i < Math.max(1, stones.length); i++) {
    const pr = quotes.productPrice(p, { karat: k, stoneAdd: stones[i] ? stones[i].add : 0 });
    const label = [p.karat_option ? (k === '18k' ? '18K' : '14K') : '', stones[i] ? stones[i].name : ''].filter(Boolean).join(' / ');
    opts.push({ label: label || '기본', price: pr.price, weight: pr.weight_g });
  }
  const first = opts[0] || { price: quotes.productPrice(p).price, label: '기본' };
  const body = `
<section class="page-head"><div class="wrap"><p class="eyebrow">주문서</p><h1>${esc(p.name)} 구매</h1><p class="bluf">아래 정보를 남겨 주시면 재고와 수령 방법을 확인해 연락드립니다. 표시 금액은 ${esc(st.updatedText)} 시세 기준이며 부가세가 포함된 금액입니다.</p></div></section>
<section class="section"><div class="wrap grid2">
  <form class="inq-form big reveal" method="post" action="/api/inquiry" data-ajax>
    <input type="hidden" name="kind" value="buy">
    <div class="order-sum"><div class="os-img ${attr(p.metal)}">${p.image ? `<img src="${attr(p.image)}" alt="${attr(p.name)}">` : `<span class="pc-glyph">${p.metal === 'silver' ? 'Ag' : 'Au'}</span>`}</div>
      <div><b>${esc(p.name)}</b><span>${esc(p.purity || '')} · ${p.weight_g}g</span><b class="os-price" id="oPrice">${first.price ? fmtNum(first.price) + '원' : '시세 문의'}</b><span class="note">부가세 포함</span></div></div>
    ${opts.length > 1 ? `<label>옵션 <select name="option" id="oOpt">${opts.map((o, i) => `<option value="${attr(o.label)}" data-price="${o.price || 0}"${i === 0 ? ' selected' : ''}>${esc(o.label)}${o.price ? ` — ${fmtNum(o.price)}원` : ''}</option>`).join('')}</select></label>` : `<input type="hidden" name="option" value="${attr(first.label)}">`}
    <div class="row"><label>수량 <input name="weight" id="oQty" type="number" min="1" max="20" value="1"></label>
      <label>수령 방법 <select name="receive"><option value="매장 수령">매장 수령(종로3가)</option><option value="택배 배송">택배 배송(선입금 후 발송)</option></select></label></div>
    <div class="row"><label>성함 <input name="name" required maxlength="40"></label><label>연락처 <input name="phone" required maxlength="20" inputmode="tel" placeholder="010-0000-0000"></label></div>
    <label>요청 사항 <textarea name="message" rows="4" maxlength="1000" placeholder="방문 희망 일시, 각인 문구, 배송지 등"></textarea></label>
    <input type="hidden" name="item" id="oItem" value="${attr(p.name)}">
    <input type="text" name="website" class="sr" tabindex="-1" autocomplete="off">
    <label class="agree"><input type="checkbox" name="agree" value="1" required> <a href="/privacy" target="_blank">개인정보 수집·이용</a>에 동의합니다. (주문 확인 목적, 1년 보관)</label>
    <button class="btn btn-gold block lg" type="submit">주문서 보내기</button><p class="form-msg" aria-live="polite"></p>
    <p class="note">주문서를 보내시면 재고와 최종 금액을 확인해 연락드립니다. 결제는 매장 방문 또는 안내드리는 계좌로 진행합니다.</p>
  </form>
  <aside class="side-col"><div class="side-card"><h3>주문 절차</h3><ol class="side-steps"><li>주문서 접수</li><li>재고·금액 확인 연락</li><li>결제(매장 또는 입금)</li><li>매장 수령 또는 택배 발송</li></ol></div>
  <div class="side-card"><h3>문의</h3><p>전화 <a href="tel:${attr(s.phone)}">${esc(s.phone)}</a><br>매일 ${esc(s.hours_open)}–${esc(s.hours_close)}</p><a class="btn btn-ghost block" href="${attr(s.kakao_channel)}" target="_blank" rel="noopener">카카오톡 문의</a></div></aside>
</div></section>`;
  res.send(page({ title: `${p.name} 구매 주문서 — ${first.price ? fmtNum(first.price) + '원' : '시세 연동'} (부가세 포함)`, description: `${p.name} 구매 주문서. 옵션·수량·수령 방법을 남기면 재고와 금액을 확인해 연락드립니다. 종로3가 문강금은.`, path: '/order', body, breadcrumbs: [{ name: '제품', href: '/products' }, { name: p.name, href: `/products/${p.slug}` }, { name: '구매', href: '/order' }], noindex: true, quoteBar: quoteBar() }));
});

// ── 제품 목록 ──
router.get('/products', (req, res) => {
  const cat = TAB_LABEL[req.query.category] ? req.query.category : ''; const q = String(req.query.q || '').trim().slice(0, 40);
  let sql = "SELECT * FROM products WHERE status='published'"; const args = [];
  if (cat === 'today') sql += ' AND ready_today=1';
  else if (cat === 'best') sql += ' AND featured=1';
  else if (cat) { sql += ' AND category=?'; args.push(cat); } if (q) { sql += ' AND (name LIKE ? OR summary LIKE ?)'; args.push(`%${q}%`, `%${q}%`); }
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

// ── 제품 상세 ──
router.get('/products/:slug', (req, res, next) => {
  const p = db.prepare("SELECT * FROM products WHERE slug=? AND status='published'").get(req.params.slug); if (!p) return next();
  const s = settings.all(); const site = settings.siteUrl(); const pr = quotes.productPrice(p); const st = quotes.stats();
  let faqs = []; try { faqs = JSON.parse(p.faq_json || '[]'); } catch (_) { /* no-op */ }
  const related = db.prepare("SELECT * FROM products WHERE status='published' AND category=? AND id<>? ORDER BY sort LIMIT 4").all(p.category, p.id);
  const don = p.weight_g ? Math.round(p.weight_g / quotes.DON * 100) / 100 : null;
  // 옵션(순도 14K·18K, 스톤)별 가격을 미리 계산해 화면에서 바로 바꿔 보여준다
  const stones = quotes.stoneOptions(p);
  const karats = p.karat_option ? ['14k', '18k'] : ['14k'];
  const combos = {};
  for (const k of karats) {
    for (let i = 0; i < Math.max(1, stones.length); i++) {
      const pp = quotes.productPrice(p, { karat: k, stoneAdd: stones[i] ? stones[i].add : 0 });
      combos[`${k}|${i}`] = { price: pp.price, weight: Math.round((pp.weight_g || 0) * 100) / 100, don: Math.round((pp.weight_g || 0) / quotes.DON * 100) / 100, pure: pp.pure_don || null };
    }
  }
  const hasOpts = p.karat_option || stones.length > 0;
  const summary = p.summary || `${p.name} — 순도 ${p.purity}, ${p.weight_g}g. 문강금은 당일 시세 연동 가격.`;
  const bodyHtml = p.body_html || `<h2>${esc(p.name)}은(는) 어떤 제품인가요?</h2><p>상세 설명은 준비 중입니다. 가격은 당일 시세에 연동되며 아래 표와 상담을 통해 확인하실 수 있습니다.</p>`;
  const rq = (p.quote_code && quotes.byCode(p.quote_code)) || pr.quote;
  const specs = [['현재 가격', pr.price ? `<b class="big" id="pPrice">${fmtNum(pr.price)}원</b> <small>부가세 포함</small>` : '시세 문의'], ['적용 시세', pr.basis ? `${esc(pr.basis)} 고시 · ${pr.quote ? esc(pr.quote.name) + ' 판매 ' + fmtNum(pr.quote.sell || pr.quote.buy) + '원/돈' : ''}` : (p.price_fixed ? '고정가' : '-')], ['순도', esc(p.purity || '')], ['순중량', `<span id="pWeight">${p.weight_g}g (${don}돈)</span>${p.karat_option ? ` <small>14K 고시 중량 기준 · 18K는 ×${quotes.karatFactors().k18w}</small>` : ''}`], ...(pr.conv ? [['순금 환산', `<span id="pPure">${pr.pure_don}돈</span> <small>14K 돈 수 × ${quotes.karatFactors().k14}(18K는 중량 ×${quotes.karatFactors().k18w} 후 × ${quotes.karatFactors().k18}) · 순금 판매 시세 적용</small>`]] : []), ['분류', CAT_LABEL[p.category] || ''], ['되팔 때', rq ? `당일 ${esc(rq.name)} 매입 시세 기준 (현재 ${fmtNum(rq.buy)}원/돈 → 약 ${fmtNum(Math.round(rq.buy / quotes.DON * p.weight_g))}원)` : '당일 매입 시세']];
  const body = `
<section class="page-head"><div class="wrap"><p class="eyebrow">${CAT_LABEL[p.category] || '제품'}${p.badge ? ` · <span class="tag">${esc(p.badge)}</span>` : ''}</p><h1>${esc(p.name)} — 가격·중량·구매 안내</h1><p class="bluf">${esc(summary)}</p></div></section>
<section class="section"><div class="wrap grid2">
  <div class="main-col">
    <div class="pdetail"><div class="pd-img ${attr(p.metal)}">${p.image ? `<img src="${attr(p.image)}" alt="${attr(p.name)}">` : `<span class="pc-glyph">${p.metal === 'silver' ? 'Ag' : 'Au'}</span><span class="pc-w">${p.weight_g}g</span>`}</div>
    <div class="spec-card"><h2>${esc(p.name)} 가격·기본 정보</h2><table class="spec"><tbody>${specs.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>
    ${hasOpts ? `<div class="opt-box" id="pOpts" data-combo='${attr(JSON.stringify(combos))}'>
      ${p.karat_option ? `<div class="opt-row"><span class="opt-label">순도</span><div class="chips">${karats.map((k, i) => `<button type="button" class="chip${i === 0 ? ' active' : ''}" data-karat="${k}">${k === '14k' ? '14K' : '18K'}</button>`).join('')}</div></div>` : ''}
      ${stones.length ? `<div class="opt-row"><span class="opt-label">스톤</span><div class="chips">${stones.map((x, i) => `<button type="button" class="chip${i === 0 ? ' active' : ''}" data-stone="${i}">${esc(x.name)}${x.add ? ` <small>+${fmtNum(x.add)}원</small>` : ''}</button>`).join('')}</div></div>` : ''}
    </div>` : ''}<div class="calc-actions"><a class="btn btn-gold lg block" href="/order?product=${encodeURIComponent(p.slug)}">바로 구매</a></div><p class="note">가격은 시세 연동 자동 계산값이며 결제 시점 매장 고시가가 최종 적용됩니다.</p></div></div>
    <article class="prose">${bodyHtml}</article>
    ${faqs.length ? faqHtml(faqs, `${p.name} 자주 묻는 질문`) : ''}
  </div>
  <aside class="side-col"><div class="side-card"><h3>오늘의 시세</h3><ul class="side-list">${st.rows.slice(0, 4).map(r => `<li><a href="/price/${r.metal}">${esc(r.name)}</a><span>${fmtNum(r.buy)}</span></li>`).join('')}</ul><a class="link" href="/price">시세표 →</a></div>${related.length ? `<div class="side-card"><h3>같은 분류 제품</h3><ul class="side-list">${related.map(r => { const rp = quotes.productPrice(r); return `<li><a href="/products/${attr(r.slug)}">${esc(r.name)}</a><span>${rp.price ? fmtNum(rp.price) + '원' : ''}</span></li>`; }).join('')}</ul></div>` : ''}<div class="side-card"><h3>매장 방문</h3><p>종로3가역 1호선 2번 출구 앞 · ${esc(s.hours)}</p><a class="btn btn-ghost-dark block" href="/about/location">오시는 길</a></div></aside>
</div></section>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: summary, sku: p.slug, brand: { '@type': 'Brand', name: '문강금은' }, material: p.metal === 'silver' ? 'Silver 999' : `Gold ${p.purity}`, weight: { '@type': 'QuantitativeValue', value: p.weight_g, unitCode: 'GRM' }, image: p.image ? site + p.image : site + '/img/og.png', url: `${site}/products/${encodeURIComponent(p.slug)}`, category: CAT_LABEL[p.category] || '', additionalProperty: [{ '@type': 'PropertyValue', name: '적용 시세 기준시각', value: pr.basis || '-' }, { '@type': 'PropertyValue', name: '순도', value: p.purity }] }];
  if (pr.price) ld[0].offers = { '@type': 'Offer', priceCurrency: 'KRW', price: pr.price, priceValidUntil: kstDate(new Date(Date.now() + 86400000)), availability: 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition', url: `${site}/products/${encodeURIComponent(p.slug)}`, seller: { '@id': site + '/#org' }, priceSpecification: { '@type': 'UnitPriceSpecification', price: pr.price, priceCurrency: 'KRW', valueAddedTaxIncluded: false } };
  if (faqs.length) ld.push(faqLd(faqs));
  res.send(page({ title: `${p.name} 가격 ${pr.price ? fmtNum(pr.price) + '원' : ''} — ${p.purity} ${p.weight_g}g(${don}돈) ${CAT_LABEL[p.category] || ''}`, description: truncate(`${p.name} 가격 ${pr.price ? fmtNum(pr.price) + '원(' + pr.basis + ' 시세 기준, 부가세 별도)' : '당일 시세 연동'}. 순도 ${p.purity}, 순중량 ${p.weight_g}g(${don}돈). ${summary} 종로3가 문강금은 구매 예약·카카오톡 문의.`, 158), path: `/products/${encodeURIComponent(p.slug)}`, body, breadcrumbs: [{ name: '제품', href: '/products' }, { name: CAT_LABEL[p.category] || '제품', href: `/products?category=${p.category}` }, { name: p.name, href: `/products/${encodeURIComponent(p.slug)}` }], jsonld: ld, dateModified: isoFromTs(p.updated_at), quoteBar: quoteBar(), bodyClass: 'product-page' }));
});

module.exports = { router, chg, sparkline, faqHtml, postCard, quoteBar, productCard, FAQ };
