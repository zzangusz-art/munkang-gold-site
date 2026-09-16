'use strict';
// 공개 페이지 ② 매입 안내 · 구매 안내 · 가이드(순도·감정·투자) · FAQ · 예약 · 후기 · 유튜브 · 매장소개 · 오시는 길 · 개인정보
const express = require('express');
const { db } = require('../db');
const { page, faqLd } = require('../lib/layout');
const settings = require('../lib/settings');
const quotes = require('../lib/quotes');
const { esc, attr, fmtNum, kstDate, isoFromTs, truncate } = require('../lib/util');
const { chg, faqHtml, quoteBar, FAQ } = require('./pages-main');

const router = express.Router();
const site = () => settings.siteUrl();

function articleLd({ title, desc, url, faqs }) {
  const s = site();
  const out = [{ '@context': 'https://schema.org', '@type': 'Article', headline: title, description: desc, url: s + url, author: { '@id': s + '/#org' }, publisher: { '@id': s + '/#org' }, mainEntityOfPage: s + url, dateModified: kstDate(), inLanguage: 'ko-KR' }];
  if (faqs?.length) out.push(faqLd(faqs)); return out;
}
function sideQuotes() {
  const st = quotes.stats();
  return `<div class="side-card"><h3>오늘의 매입가 <small>원/돈</small></h3><ul class="side-list">${st.rows.map(r => `<li><a href="/price/${r.metal}">${esc(r.name)}</a><span>${fmtNum(r.buy)} ${chg(r.diff, r.pct)}</span></li>`).join('')}</ul><a class="link" href="/calculator">매입가 계산기 →</a></div>`;
}
function shell({ eyebrow, h1, bluf, sections, faqs, side, cta = 'sell' }) {
  const s = settings.all();
  return `<section class="page-head"><div class="wrap"><p class="eyebrow">${eyebrow}</p><h1>${h1}</h1><p class="bluf">${bluf}</p></div></section>
<section class="section"><div class="wrap grid2"><div class="main-col"><article class="prose">${sections}</article>${faqs?.length ? faqHtml(faqs) : ''}</div><aside class="side-col">${side || ''}<div class="side-card"><h3>${cta === 'buy' ? '구매 예약' : '매입 예약'}</h3><p>${cta === 'buy' ? '제품·수량을 남기시면 당일 시세로 준비해 둡니다.' : '품목과 중량만 남기시면 영업시간 내 바로 연락드립니다.'}</p><a class="btn btn-gold block" href="/apply?kind=${cta}">${cta === 'buy' ? '구매 예약' : '매입 예약'}</a><a class="btn btn-kakao block" href="${attr(s.kakao_channel)}" target="_blank" rel="noopener">카카오톡 상담</a><a class="btn btn-ghost-dark block" href="tel:${attr(s.phone)}">${esc(s.phone)}</a></div></aside></div></section>`;
}

// ── 금·은 매입 안내 ──
router.get('/sell', (req, res) => {
  const st = quotes.stats(); const g = st.gold; const s = settings.all();
  const faqs = [FAQ[2], FAQ[3], FAQ[4], FAQ[1]];
  const sections = `
<h2>문강금은은 어떤 금·은을 매입하나요?</h2>
<p>순금(24K)·18K·14K 주얼리, 골드바·코인, 돌반지, 금니(치과금), 백금(Pt) 제품, 은(실버바·은수저·은 주얼리)을 <strong>형태와 상관없이 순도·중량 기준</strong>으로 매입합니다. 끊어진 목걸이, 한 짝만 남은 귀걸이, 변색된 은도 괜찮습니다. 도금(GP·GF) 제품과 보석·부속품은 매입 대상이 아니거나 무게에서 제외됩니다.</p>
<table><thead><tr><th>품목</th><th>매입 기준</th><th>오늘 매입가(원/돈)</th></tr></thead><tbody>${st.rows.map(r => `<tr><td>${esc(r.name)} <small>${esc(r.purity || '')}</small></td><td>${r.metal === 'gold' ? (r.code === 'au999' ? '순금 100%' : '순금 함량 ' + (Number(r.purity) / 10) + '%') : r.metal === 'silver' ? '순은 999 기준' : '백금 순도 환산'}</td><td>${fmtNum(r.buy)} ${chg(r.diff, r.pct)}</td></tr>`).join('')}</tbody></table>
<p class="note">${esc(st.updatedText)} 고시 · <a href="/price">전체 시세표</a> · <a href="/calculator">계산기</a></p>
<h2>매입 절차는 어떻게 되나요?</h2>
<ol class="steps"><li><strong>매장 방문</strong> — 종로3가역 11번 출구 앞 매장으로 오세요(예약 없이 가능). 본인 신분증 지참.</li><li><strong>중량 측정</strong> — 고객이 보는 앞에서 전자저울로 순중량을 잽니다. 보석·부속품은 제외.</li><li><strong>순도 감정</strong> — 시금석과 시약으로 분석하고, 필요하면 XRF로 순도를 확인합니다. 결과는 함께 보며 30분 이내에 끝납니다.</li><li><strong>금액 제시</strong> — 당일 시세 × 순도 × 중량. 마음에 들지 않으면 팔지 않으셔도 됩니다.</li><li><strong>현금 지급</strong> — 동의 즉시 현장에서 현금으로 드립니다(계좌이체는 하지 않습니다).</li></ol>
<h2>매입가는 어떻게 계산되나요?</h2>
<p><strong>매입가 = 순도별 매입가(원/g) × 순중량(g)</strong>. 예를 들어 순금 매입가가 ${g ? fmtNum(g.buy) + '원/돈(' + fmtNum(g.buyG) + '원/g)' : '-'}이면 18K 5g 반지는 약 ${g ? fmtNum(Math.round(g.buyG * 0.75 * 5)) : '-'}원이 기준입니다. 정확한 금액은 감정 후 확정됩니다.</p>
<h2>준비물과 주의사항</h2>
<ul><li>본인 신분증(일정 금액 이상 거래 기록용)</li><li>보증서·케이스가 있으면 감정이 빠름(없어도 무방)</li><li>여러 점을 한꺼번에 가져오시면 순도별로 나눠 감정</li><li>도금·이미테이션은 매입 불가. 헷갈리면 <a href="${attr(s.kakao_channel)}" target="_blank" rel="noopener">카카오톡</a>으로 사진 먼저 보내 주세요</li></ul>`;
  res.send(page({ title: `금·은 매입 안내 — 오늘 순금 ${g ? fmtNum(g.buy) + '원/돈' : ''} · 절차·준비물·감정 방법`, description: `종로3가 문강금은 금·은 매입 안내. 순금·18K·14K·백금·은 매입가(${st.updatedText}), 5단계 매입 절차, 준비물, 감정 방법. 30분 정밀 감정 후 현장 현금 지급.`, path: '/sell', body: shell({ eyebrow: '금 팔기', h1: '금·은 매입 안내 — 순도·중량 기준, 30분 감정, 현장 현금', bluf: `문강금은은 순금·18K·14K·백금·은 제품을 형태와 상관없이 순도·중량 기준으로 매입합니다. 오늘 순금 매입가는 ${g ? fmtNum(g.buy) + '원/돈' : '시세표 참조'}이며, 고객이 보는 앞에서 30분 이내 감정 후 현장에서 현금을 드립니다.`, sections, faqs, side: sideQuotes() }), breadcrumbs: [{ name: '금 팔기', href: '/sell' }], jsonld: [...articleLd({ title: '금·은 매입 안내', desc: '매입 품목·절차·준비물·감정 방법', url: '/sell', faqs }), { '@context': 'https://schema.org', '@type': 'HowTo', name: '금 매입 절차', step: ['매장 방문', '중량 측정', '순도 감정', '금액 제시', '현금 지급'].map((n, i) => ({ '@type': 'HowToStep', position: i + 1, name: n })) }], quoteBar: quoteBar() }));
});

// ── 골드바·실버바 구매 안내 ──
router.get('/buy', (req, res) => {
  const st = quotes.stats(); const g = st.gold; const sv = st.silver;
  const faqs = [FAQ[5], FAQ[6], { q: '골드바는 어떤 단위가 있나요?', a: '1g, 3.75g(1돈), 10g, 37.5g(10돈), 100g 등이 있으며 단위가 클수록 그램당 공임 부담이 낮습니다. 제품 페이지에서 당일 시세 연동 가격을 확인하세요.' }, { q: '구매한 골드바를 되팔면 얼마인가요?', a: '되파는 시점의 문강금은 매입 시세(원/돈) × 순중량입니다. 보증서·케이스와 함께 보관하시면 재매입 감정이 빠릅니다.' }];
  const goldbars = db.prepare("SELECT * FROM products WHERE status='published' AND category IN ('goldbar','silverbar') ORDER BY category DESC, weight_g").all();
  const sections = `
<h2>골드바·실버바 가격은 어떻게 정해지나요?</h2>
<p><strong>가격 = (당일 판매 시세 원/g × 순중량) + 공임</strong>, 여기에 실물 귀금속 구매 시 <strong>부가가치세 10%</strong>가 붙습니다. 오늘 순금 판매 시세는 ${g && g.sell ? fmtNum(g.sell) + '원/돈(' + fmtNum(g.sellG) + '원/g)' : '시세표 참조'}${sv && sv.sell ? `, 은 판매 시세는 ${fmtNum(sv.sell)}원/돈` : ''}입니다. 제품 페이지의 가격은 이 시세에 자동 연동되며 적용 기준시각을 표시합니다.</p>
<table><thead><tr><th>제품</th><th>순도</th><th>순중량</th><th>오늘 가격(부가세 별도)</th></tr></thead><tbody>${goldbars.map(p => { const pr = quotes.productPrice(p); return `<tr><td><a href="/products/${attr(p.slug)}">${esc(p.name)}</a></td><td>${esc(p.purity)}</td><td>${p.weight_g}g</td><td>${pr.price ? fmtNum(pr.price) + '원' : '문의'}</td></tr>`; }).join('')}</tbody></table>
<p class="note">${esc(st.updatedText)} 시세 기준 · 결제 시점 매장 고시가 적용</p>
<h2>어떤 단위를 사는 것이 좋은가요?</h2>
<ul><li><strong>선물·소액</strong>: 1g·1돈(3.75g). 케이스·각인 가능.</li><li><strong>투자·보관</strong>: 10g·37.5g·100g. 그램당 공임이 낮고 되팔 때 스프레드 부담이 상대적으로 작음.</li><li><strong>은 투자</strong>: 실버바 1kg이 표준. 은은 금보다 변동성이 크므로 분할 매수 권장.</li></ul>
<h2>구매 방법은?</h2>
<ol class="steps"><li><strong>매장 방문</strong> — 종로3가역 11번 출구 앞. 당일 시세로 바로 구매·수령, 보증서 제공.</li><li><strong>구매 예약</strong> — <a href="/apply?kind=buy">예약 페이지</a>에 제품·수량을 남기면 준비해 두었다가 방문 시 바로 드립니다.</li><li><strong>카카오톡 상담</strong> — 재고·각인·선물 포장 문의.</li></ol>
<p>온라인 결제·택배 배송은 준비 중이며, 현재는 매장 수령 방식으로 운영합니다.</p>
<h2>되팔 때는 어떻게 되나요?</h2>
<p>문강금은은 자사 판매 골드바·실버바를 포함해 모든 금·은을 당일 매입 시세로 다시 매입합니다. 구매가와 매입가의 차이(부가세+스프레드)가 있으므로 단기 매매보다는 중장기 보유 관점을 권합니다. <a href="/guide/gold-investment">골드바 투자 안내</a>에서 자세히 설명합니다.</p>`;
  res.send(page({ title: `골드바·실버바 구매 안내 — 오늘 순금 판매 ${g && g.sell ? fmtNum(g.sell) + '원/돈' : ''} · 단위별 가격·부가세·되팔기`, description: `종로3가 문강금은 골드바·실버바 구매 안내. 1g·1돈·10g·37.5g·100g 골드바와 실버바 1kg 당일 시세 연동 가격(${st.updatedText}), 부가세 10%, 보증서, 되팔 때 매입 기준.`, path: '/buy', body: shell({ eyebrow: '금 사기', h1: '골드바·실버바 구매 안내 — 당일 시세 연동, 보증서, 재매입', bluf: `골드바·실버바 가격은 당일 판매 시세 × 순중량 + 공임으로 정해지며 부가세 10%가 별도입니다. 부가세 별도로 진행을 원하시면 매장 방문을 부탁드립니다. 오늘 순금 판매 시세는 ${g && g.sell ? fmtNum(g.sell) + '원/돈' : '시세표 참조'}. 매장에서 당일 시세로 구매·수령하고, 되팔 때는 당일 매입 시세로 다시 매입합니다.`, sections, faqs, side: sideQuotes(), cta: 'buy' }), breadcrumbs: [{ name: '금 사기', href: '/buy' }], jsonld: articleLd({ title: '골드바·실버바 구매 안내', desc: '가격 구조·단위 선택·구매 방법·재매입', url: '/buy', faqs }), quoteBar: quoteBar() }));
});

// ── 가이드 ──
const GUIDES = {
  purity: { eyebrow: '금 정보', h1: '금 순도·K 표기 안내 — 24K·18K·14K, 999.9·750·585 읽는 법', bluf: '24K는 999.9(순금), 18K는 750(75%), 14K는 585(58.5%)입니다. 제품 안쪽 각인으로 확인할 수 있고, GP·GF 등 도금 표기와 구분해야 합니다. 매입가는 순금 매입가에 매장 비율(18K 73.5%, 14K 57%)을 곱해 정해집니다.', title: '금 순도·K 표기 안내 — 24K·18K·14K와 천분율(999.9·750·585)', desc: '금 순도 표기 정리: K와 천분율 대응표, 각인 위치, 도금(GP·GEP·GF) 구분, 화이트골드·핑크골드, 백금(Pt) 표기, 순도별 매입가 계산.', sections: () => `<h2>K와 천분율은 어떻게 대응되나요?</h2><table><thead><tr><th>K</th><th>천분율</th><th>순금 함량</th><th>순금 매입가 대비</th></tr></thead><tbody><tr><td>24K</td><td>999 / 999.9</td><td>99.9~99.99%</td><td>100%</td></tr><tr><td>18K</td><td>750</td><td>75%</td><td>약 75%</td></tr><tr><td>14K</td><td>585</td><td>58.5%</td><td>약 58.5%</td></tr><tr><td>10K</td><td>417</td><td>41.7%</td><td>약 41.7%</td></tr></tbody></table><h2>각인은 어디를 보면 되나요?</h2><ul><li>반지: 안쪽 링 면</li><li>목걸이·팔찌: 잠금장치 또는 연결 고리 옆 작은 판</li><li>귀걸이: 침(포스트)</li><li>골드바·코인: 앞면(순도·중량·제조사)</li></ul><h2>도금은 어떻게 구분하나요?</h2><p>GP(Gold Plated)·GEP·GF(Gold Filled)·HGE 표기가 있으면 도금입니다. 자석에 붙거나 마모 부위 색이 다르면 도금 가능성이 큽니다. 확실한 방법은 매장에서 시금석·시약으로 확인하는 것입니다.</p><h2>화이트골드·핑크골드·백금은?</h2><p>화이트골드(팔라듐·니켈 합금)와 핑크골드(구리 비율↑)는 각인 순도(750·585)대로 금 시세로 매입합니다. 백금은 Pt950·Pt900으로 표기되는 별도 금속이며 <a href="/price/platinum">백금 시세</a>로 매입합니다.</p><h2>순도별 매입가 계산</h2><p>순금 1g 매입가 × 함량 비율 × 중량. <a href="/calculator">계산기</a>에서 바로 계산됩니다.</p>`, faqs: [FAQ[1], { q: '각인이 없는 금도 매입되나요?', a: '네. 시금석과 시약으로 순도를 확인해 매입합니다.' }, { q: '18K 각인인데 14K로 나올 수 있나요?', a: '드물게 각인과 실제 함량이 다를 수 있으며, 감정 결과를 고객과 함께 확인해 매입가를 정합니다.' }] },
  appraisal: { eyebrow: '금 정보', h1: '정밀 감정 안내 — 고객 참관, 30분 이내, 감정만 받아도 OK', bluf: '문강금은의 감정은 고객이 보는 앞에서 전자저울로 순중량을 재고, 시금석과 시약으로 순도를 확인하는 방식입니다. 필요하면 XRF로 한 번 더 확인합니다. 대부분 30분 이내에 끝나며 감정 결과를 듣고 팔지 않으셔도 됩니다.', title: '금 정밀 감정 안내 — 저울·시금석·시약 감정 방법과 소요 시간', desc: '금·은 감정 방법(전자저울 중량, 시금석·시약 순도 확인), 소요 시간 30분, 고객 참관 원칙, 제외 항목(보석·부속품), 감정만 받는 경우.', sections: () => `<h2>감정은 어떤 순서로 진행되나요?</h2><ol class="steps"><li><strong>외관 확인</strong> — 각인, 보석·부속품 유무, 도금 여부 1차 확인</li><li><strong>중량 측정</strong> — 0.01g 전자저울, 보석·스프링 등 비금속 제외</li><li><strong>순도 측정</strong> — 시금석과 시약으로 순도 확인, 필요 시 XRF 분석 병행</li><li><strong>결과 안내</strong> — 순도·순중량·당일 시세 × 매입가 제시</li></ol><h2>감정 방법별 차이는?</h2><table><thead><tr><th>방법</th><th>원리</th><th>특징</th></tr></thead><tbody><tr><td>시금석·시약</td><td>돌에 긁어 시약 반응 확인</td><td>전통 방식, 미세 흠집 가능</td></tr><tr><td>XRF 측정기</td><td>X선 형광으로 성분 비율 분석</td><td>비파괴·빠름, 표면 도금 두꺼우면 보조 검사</td></tr><tr><td>비중 측정</td><td>물속 무게로 밀도 계산</td><td>골드바·코인 확인용</td></tr></tbody></table><h2>감정에서 제외되는 것은?</h2><ul><li>큐빅·다이아몬드 등 보석</li><li>잠금장치 스프링(철), 시계 무브먼트</li><li>도금·이미테이션</li></ul><h2>감정만 받아도 되나요?</h2><p>네. 감정 비용은 없으며 결과를 듣고 결정하시면 됩니다. 여러 매장을 비교하실 때는 같은 기준(1돈 vs 1g, 부속 제외 여부)으로 비교하세요.</p>`, faqs: [FAQ[3], FAQ[9], { q: '감정 비용이 있나요?', a: '없습니다. 감정만 받고 판매하지 않으셔도 됩니다.' }] },
  'gold-investment': { eyebrow: '금 정보', h1: '골드바 투자 안내 — 부가세·스프레드·단위·보관·KRX 금시장 비교', bluf: '실물 골드바는 구매 시 부가세 10%와 매입·판매 스프레드가 있어 단기 매매에는 불리하고, 실물 보유·선물·중장기 자산 보관에 적합합니다. 단위가 클수록 그램당 비용이 낮으며, 되팔 때는 당일 매입 시세가 적용됩니다.', title: '골드바 투자 안내 — 부가세 10%·스프레드·단위 선택·보관·KRX 금시장 비교', desc: '실물 골드바 투자의 비용 구조(부가세·공임·스프레드), 단위별 장단점, 보관·재매입, KRX 금시장·금 ETF와의 차이. 종로3가 문강금은.', sections: () => `<h2>실물 골드바의 비용 구조는?</h2><ul><li><strong>부가가치세 10%</strong>: 실물 인수 시 부과, 되팔 때 환급되지 않음</li><li><strong>공임</strong>: 제조·각인 비용, 단위가 클수록 그램당 부담 낮음</li><li><strong>스프레드</strong>: 판매가와 매입가의 차이</li></ul><p>따라서 구매 직후 되팔면 손실이 나며, 시세가 그만큼 오르기까지 기다리는 중장기 관점이 필요합니다.</p><h2>단위별로 무엇이 다른가요?</h2><table><thead><tr><th>단위</th><th>적합</th><th>비고</th></tr></thead><tbody><tr><td>1g·3.75g</td><td>선물·소액 적립</td><td>그램당 공임 비율 높음</td></tr><tr><td>10g·37.5g</td><td>투자 입문</td><td>공임 비율 낮음, 분할 매도 가능</td></tr><tr><td>100g 이상</td><td>자산 보관</td><td>그램당 비용 최저, 목돈 필요</td></tr></tbody></table><h2>KRX 금시장·금 ETF와는 어떻게 다른가요?</h2><table><thead><tr><th>구분</th><th>실물 골드바</th><th>KRX 금시장</th><th>금 ETF</th></tr></thead><tbody><tr><td>보유 형태</td><td>실물</td><td>계좌(실물 인출 가능)</td><td>증권</td></tr><tr><td>부가세</td><td>구매 시 10%</td><td>인출 시 10%</td><td>없음</td></tr><tr><td>장점</td><td>즉시 실물, 선물·보관</td><td>1g 단위, 소액 적립</td><td>거래 편의</td></tr><tr><td>주의</td><td>스프레드·보관</td><td>증권사 수수료</td><td>운용보수·괴리</td></tr></tbody></table><p class="note">세금·수수료는 변동될 수 있으니 최신 규정을 확인하고, 투자 판단은 본인 책임입니다.</p><h2>보관과 되팔기</h2><p>보증서·케이스와 함께 습기 없는 곳에 보관하세요. 문강금은은 자사·타사 골드바 모두 순도·중량 확인 후 당일 매입 시세로 매입합니다.</p>`, faqs: [FAQ[5], { q: '골드바 살 때 신분증이 필요한가요?', a: '일정 금액 이상 거래는 기록을 위해 신분 확인이 필요할 수 있습니다.' }, { q: '실버바도 같은 구조인가요?', a: '네. 부가세 10%와 스프레드가 있으며 은은 금보다 변동성이 큽니다.' }] },
};
router.get('/guide/:key', (req, res, next) => {
  const g = GUIDES[req.params.key]; if (!g) return next();
  res.send(page({ title: g.title, description: g.desc, path: `/guide/${req.params.key}`, body: shell({ ...g, sections: g.sections(), side: sideQuotes(), cta: req.params.key === 'gold-investment' ? 'buy' : 'sell' }), breadcrumbs: [{ name: '금 정보', href: '/blog' }, { name: g.h1.split(' — ')[0], href: `/guide/${req.params.key}` }], jsonld: articleLd({ title: g.h1, desc: g.desc, url: `/guide/${req.params.key}`, faqs: g.faqs }), quoteBar: quoteBar() }));
});

// ── FAQ ──
router.get('/faq', (req, res) => {
  const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">FAQ</p><h1>금 팔기·사기 자주 묻는 질문</h1><p class="bluf">오늘 매입가, 18K·14K 매입 비율, 준비물, 감정 방법, 골드바 부가세, 돌반지 가격, 영업시간 등 실제 상담에서 가장 많이 받는 질문에 직답으로 정리했습니다.</p></div></section><section class="section"><div class="wrap narrow">${faqHtml(FAQ, '')}<p class="cta">원하는 답이 없다면 ${esc(settings.cfg('phone'))} 또는 <a href="/apply">예약·문의</a>, <a href="${attr(settings.cfg('kakao_channel'))}" target="_blank" rel="noopener">카카오톡</a>으로 물어봐 주세요.</p></div></section>`;
  res.send(page({ title: '금 매입·판매 FAQ — 오늘 매입가·18K 비율·준비물·감정·부가세 질문 답변', description: '금 팔 때 준비물, 18K·14K 매입 비율, 감정 방법과 시간, 골드바 부가세, 돌반지 가격, 영업시간·위치 등 종로3가 문강금은 자주 묻는 질문.', path: '/faq', body, breadcrumbs: [{ name: '자주 묻는 질문', href: '/faq' }], jsonld: [faqLd(FAQ)], quoteBar: quoteBar() }));
});

// ── 예약 ──
router.get('/apply', (req, res) => {
  const s = settings.all(); const item = String(req.query.item || '').slice(0, 80); const kind = ['sell', 'buy', 'visit', 'consult'].includes(req.query.kind) ? req.query.kind : 'sell'; const amt = String(req.query.amt || '').slice(0, 60);
  const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">예약·문의</p><h1>매입·구매 예약</h1><p class="bluf">품목과 대략적인 중량(팔 때) 또는 제품·수량(살 때)을 남겨 주시면 영업시간(${esc(s.hours_open)}–${esc(s.hours_close)}) 내 바로 연락드려 시세와 일정을 안내합니다. 급하시면 ${esc(s.phone)}으로 전화 주세요. 감정만 받아도 되고, 예약 없이 매장 방문도 가능합니다.</p></div></section>
<section class="section"><div class="wrap grid2">
  <form class="inq-form big reveal" method="post" action="/api/inquiry" data-ajax>
    <fieldset><legend>예약 구분</legend><div class="radio-row">${[['sell', '금·은 팔기'], ['buy', '골드바·제품 구매'], ['consult', '상담(리세팅·투자)']].map(([k, v]) => `<label><input type="radio" name="kind" value="${k}"${kind === k ? ' checked' : ''}> ${v}</label>`).join('')}</div></fieldset>
    <div class="row"><label>성함 <input name="name" required maxlength="40"></label><label>연락처 <input name="phone" required maxlength="20" inputmode="tel" placeholder="010-0000-0000"></label></div>
    <div class="row"><label>품목 / 제품 <input name="item" maxlength="80" value="${attr(item)}" placeholder="예: 18K 반지 2개, 골드바 10g 1개"></label><label>중량 / 수량 <input name="weight" maxlength="30" value="${attr(amt)}" placeholder="예: 10g, 3돈, 2개"></label></div>
    <label>문의 내용 <textarea name="message" rows="5" maxlength="1500" placeholder="방문 희망 일시, 각인 문구, 궁금한 점"></textarea></label>
    <input type="text" name="website" class="sr" tabindex="-1" autocomplete="off">
    <label class="agree"><input type="checkbox" name="agree" value="1" required> <a href="/privacy" target="_blank">개인정보 수집·이용</a>에 동의합니다. (수집: 성함·연락처·문의 내용 / 목적: 매입·구매 상담 / 보유: 상담 종료 후 1년)</label>
    <button class="btn btn-gold block" type="submit">예약 신청하기</button><p class="form-msg" aria-live="polite"></p>
  </form>
  <aside class="side-col"><div class="side-card"><h3>접수 후 절차</h3><ol class="side-steps"><li>영업시간 내 담당자 연락</li><li>시세·방문 일정 안내</li><li>매장 감정 → 현금 지급 / 제품 수령</li></ol></div><div class="side-card"><h3>바로 연락</h3><a class="btn btn-gold block" href="tel:${attr(s.phone)}">${esc(s.phone)}</a><a class="btn btn-kakao block" href="${attr(s.kakao_channel)}" target="_blank" rel="noopener">카카오톡 상담</a><p class="note">${esc(s.address)} · ${esc(s.hours)}</p></div>${sideQuotes()}</aside>
</div></section>`;
  res.send(page({ title: '매입·구매 예약 — 품목·중량만 남기면 영업시간 내 연락', description: `종로3가 문강금은 금·은 매입 예약, 골드바·주얼리·돌반지 구매 예약, 리세팅·투자 상담. 전화 ${s.phone}, 카카오톡 상담, ${s.hours}.`, path: '/apply', body, breadcrumbs: [{ name: '예약·문의', href: '/apply' }], quoteBar: quoteBar() }));
});

// ── 후기 ──
router.get('/reviews', (req, res) => {
  const rows = db.prepare('SELECT * FROM reviews WHERE visible=1 ORDER BY id DESC LIMIT 100').all(); const s = settings.all();
  const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.rating, 0) / rows.length * 10) / 10 : 0;
  const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">고객 후기</p><h1>실제 거래 고객 후기 <small>${rows.length}건${rows.length ? ` · 평균 ${avg}점` : ''}</small></h1><p class="bluf">매장 매입과 골드바·주얼리·돌반지 구매 고객이 남긴 후기입니다. 게재에 동의한 후기만 표시하며, 당근 업체 프로필의 후기는 <a href="${attr(s.daangn)}" target="_blank" rel="noopener">여기</a>에서 볼 수 있습니다.</p></div></section><section class="section"><div class="wrap">${rows.length ? `<div class="rv-grid">${rows.map(r => `<blockquote class="rv reveal"><span class="stars">${'★'.repeat(r.rating)}</span><p>${esc(r.text)}</p><footer>${esc(r.name)} · ${esc(r.kind || '')} · ${kstDate(new Date(r.created_at * 1000))}</footer></blockquote>`).join('')}</div>` : `<p class="note">후기를 준비 중입니다. 거래 후 후기를 남겨 주시면 감사드립니다.</p>`}</div></section>`;
  const ld = rows.length ? [{ '@context': 'https://schema.org', '@type': 'JewelryStore', '@id': site() + '/#org', name: s.site_name, aggregateRating: { '@type': 'AggregateRating', ratingValue: avg, reviewCount: rows.length, bestRating: 5 }, review: rows.slice(0, 10).map(r => ({ '@type': 'Review', author: { '@type': 'Person', name: r.name }, reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5 }, reviewBody: r.text, datePublished: kstDate(new Date(r.created_at * 1000)) })) }] : [];
  res.send(page({ title: `고객 후기 ${rows.length}건 — 종로3가 문강금은 매입·구매 후기`, description: `문강금은에서 금·은을 팔거나 골드바·돌반지를 구매한 고객의 후기 ${rows.length}건. 감정 과정, 매입가, 응대에 대한 실제 평가.`, path: '/reviews', body, breadcrumbs: [{ name: '문강금은', href: '/about' }, { name: '고객 후기', href: '/reviews' }], jsonld: ld, quoteBar: quoteBar() }));
});

// ── 유튜브 ──
router.get('/videos', (req, res) => {
  const s = settings.all(); const videos = db.prepare('SELECT * FROM videos ORDER BY sort, id DESC').all();
  const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">유튜브 · 쇼츠</p><h1>문강금은 유튜브 — 감정·시세·매장 이야기</h1><p class="bluf">공식 채널 <a href="${attr(s.youtube)}" target="_blank" rel="noopener">@munkanggold</a>에서 실제 감정 과정, 오늘의 시세, 돌반지·골드바 소개를 쇼츠로 보여드립니다. 인스타그램(<a href="${attr(s.instagram)}" target="_blank" rel="noopener">@munkanggold</a>)과 Threads에서도 시세를 매일 올립니다.</p></div></section><section class="section"><div class="wrap">${videos.length ? `<div class="video-grid">${videos.map(v => `<div class="video reveal"><div class="yt" data-id="${attr(v.youtube_id)}"><img src="https://i.ytimg.com/vi/${attr(v.youtube_id)}/hqdefault.jpg" alt="${attr(v.title)}" loading="lazy" width="480" height="360"><button class="yt-play" aria-label="${attr(v.title)} 재생">▶</button></div><h2>${esc(v.title)}</h2>${v.description ? `<p>${esc(truncate(v.description, 120))}</p>` : ''}</div>`).join('')}</div>` : `<p class="note">영상 목록을 준비 중입니다. <a href="${attr(s.youtube)}" target="_blank" rel="noopener">유튜브 채널</a>에서 바로 보실 수 있습니다.</p>`}</div></section>`;
  const ld = videos.map(v => ({ '@context': 'https://schema.org', '@type': 'VideoObject', name: v.title, description: v.description || v.title, thumbnailUrl: `https://i.ytimg.com/vi/${v.youtube_id}/hqdefault.jpg`, uploadDate: v.published || kstDate(), embedUrl: `https://www.youtube.com/embed/${v.youtube_id}`, contentUrl: `https://www.youtube.com/watch?v=${v.youtube_id}`, publisher: { '@id': site() + '/#org' } }));
  res.send(page({ title: `유튜브·쇼츠 영상 ${videos.length}편 — 감정 과정·오늘의 시세·제품 소개`, description: `문강금은 공식 유튜브 @munkanggold 영상 ${videos.length}편. 금 감정 과정, 오늘의 금시세, 돌반지·골드바 소개 쇼츠.`, path: '/videos', body, breadcrumbs: [{ name: '문강금은', href: '/about' }, { name: '유튜브', href: '/videos' }], jsonld: ld }));
});

// ── 매장 소개 ──
router.get('/about', (req, res) => {
  const s = settings.all(); const st = quotes.stats();
  const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">매장 소개</p><h1>${esc(s.site_name)} — 종로3가 금·은 매입·판매 전문</h1><p class="bluf">${esc(s.site_name)}은 서울 종로3가 귀금속 거리, 종로3가역 11번 출구 바로 앞에 있는 금은방입니다. "신뢰"를 원칙으로 매입가·판매가를 매일 공개하고, 고객이 보는 앞에서 감정한 뒤 현장에서 현금으로 드립니다. 골드바·실버바·주얼리·돌반지 판매, 주얼리 리세팅, 금 투자 상담을 제공합니다.</p></div></section>
<section class="section"><div class="wrap grid2"><div class="main-col">
<figure class="store-photo reveal"><img src="/img/store.jpg" alt="문강금은 매장 내부 — 벽면 간판 MUNKANG GOLD EXCHANGE" width="1400" height="800" loading="lazy"><figcaption>종로3가역 11번 출구 앞 문강금은 매장</figcaption></figure>
<div class="greeting reveal"><p>금과 은을 다루는 일에는 무엇보다 <b>'신뢰'</b>가 우선이라고 생각합니다.</p><p>문강금은은 그 믿음 하나로 오랜 시간 고객님들과 함께해왔습니다. 화려함보다 진심을, 겉치레보다 정직한 거래를 우선으로 하는 것이 저희의 원칙입니다. 앞으로도 투명하고 믿을 수 있는 문강금은으로 곁에 있겠습니다.</p><div class="badges"><span>검증된 제품 퀄리티</span><span>종로의 압도적으로 합리적인 가격</span><span>문의전화 ${esc(s.phone2)}</span></div><p>취급 품목은 금, 은이며, 정밀 감정을 거쳐 30분 이내로 매입 및 현장 현금 지급이 가능합니다. 이외에도 주얼리와 돌반지 판매, 골드바 매매까지 폭넓게 운영하고 있습니다.</p><p><b>주요 서비스는 금·은 판매·매입과 투자 상담입니다.</b> 국제 시세는 시시각각 변합니다. 그 흐름에 맞춰 골드바 투자 상담을 진행해드리며, 감정 후 30분 이내 매입, 즉시 현금 지급까지 한 번에 처리해드립니다.</p><p>금과 은, 그 하나하나에 담긴 이야기를 소중히 다루는 곳, 문강금은입니다.</p><p>짧은 기간이지만 동안 걸어온 길, 앞으로도 정직함을 바탕으로 고객님과의 신뢰를 이어가겠습니다. 감사합니다.</p><p class="sig">문강금은 드림 · 종로3가역 11번 출구 앞</p></div>
<article class="prose">
<h2>문강금은은 어떤 곳인가요?</h2><p>종로3가 귀금속 거리에서 금·은을 사고파는 매장입니다. 매입은 순도·중량 기준으로 형태와 상관없이 진행하고, 판매 제품은 당일 시세에 연동된 가격을 홈페이지에 적용 시각과 함께 표시합니다. 인스타그램·유튜브·Threads에 매일 시세와 감정 과정을 올리며, 당근 업체 프로필에서 동네 이웃 후기를 보실 수 있습니다.</p>
<h2>무엇을 하나요?</h2><table><thead><tr><th>서비스</th><th>내용</th></tr></thead><tbody><tr><td>금·은 매입</td><td>순금·18K·14K·백금·은 제품, 골드바·코인, 돌반지, 금니 — 감정 후 현장 현금</td></tr><tr><td>골드바·실버바 판매</td><td>1g~100g 골드바, 실버바 100g~1kg, 보증서 제공, 당일 시세 재매입</td></tr><tr><td>돌반지·순금 선물</td><td>돌반지·돌팔찌·금수저·행운의 열쇠·12지신 오브제, 각인·케이스</td></tr><tr><td>리세팅·상담</td><td>헌 금으로 새 주얼리, 골드바 적립 상담</td></tr></tbody></table>
<h2>왜 문강금은을 선택하나요?</h2><ul><li><strong>시세 공개</strong>: 매입가·판매가를 돈·g 단위로 매일 공개(${esc(st.updatedText)} 갱신). 다른 매장과 비교하기 쉽습니다.</li><li><strong>참관 감정</strong>: 저울과 측정기를 고객 쪽으로 돌려 함께 확인합니다.</li><li><strong>현장 현금</strong>: 동의 즉시 현금으로 드립니다(계좌이체 없음).</li><li><strong>연중무휴</strong>: 매일 ${esc(s.hours_open)}–${esc(s.hours_close)}, 전화 상담 24시간.</li></ul>
<h2>매장 정보</h2><table class="spec"><tbody><tr><th>상호</th><td>${esc(s.legal_name)} (${esc(s.en_name)})</td></tr>${s.ceo ? `<tr><th>대표</th><td>${esc(s.ceo)}</td></tr>` : ''}${s.biz_no ? `<tr><th>사업자등록번호</th><td>${esc(s.biz_no)}</td></tr>` : ''}<tr><th>주소</th><td>${esc(s.address)}${s.address_detail ? ' ' + esc(s.address_detail) : ''}</td></tr><tr><th>전화</th><td>${esc(s.phone)}${s.phone2 ? ' / ' + esc(s.phone2) : ''}</td></tr><tr><th>영업시간</th><td>${esc(s.hours)}</td></tr><tr><th>업종</th><td>귀금속 소매·매입(금은방)</td></tr><tr><th>상담 채널</th><td><a href="${attr(s.kakao_channel)}" target="_blank" rel="noopener">카카오 오픈채팅</a> · 전화 ${esc(s.phone)} · 카카오톡 ID ${esc(s.kakao_id)}</td></tr><tr><th>공식 채널</th><td><a href="${attr(s.naver_place)}" target="_blank" rel="noopener">네이버 플레이스</a> · <a href="${attr(s.naver_blog)}" target="_blank" rel="noopener">네이버 블로그</a> · <a href="${attr(s.instagram)}" target="_blank" rel="noopener">Instagram</a> · <a href="${attr(s.youtube)}" target="_blank" rel="noopener">YouTube</a> · <a href="${attr(s.threads)}" target="_blank" rel="noopener">Threads</a> · <a href="${attr(s.daangn)}" target="_blank" rel="noopener">당근</a></td></tr></tbody></table>
</article></div><aside class="side-col"><div class="side-card"><h3>바로가기</h3><ul class="side-list"><li><a href="/about/location">찾아오시는 길</a></li><li><a href="/reviews">고객 후기</a></li><li><a href="/videos">유튜브</a></li><li><a href="/price">오늘의 금시세</a></li></ul></div>${sideQuotes()}</aside></div></section>`;
  res.send(page({ title: `매장 소개 — ${s.site_name} (종로3가역 11번 출구 앞 금·은 매입·판매 금은방)`, description: `${s.site_name}은 종로3가 귀금속 거리의 금은방으로 매입가·판매가를 매일 공개하고 고객 참관 감정, 현장 현금 지급, 골드바·주얼리·돌반지 판매를 제공합니다. ${s.hours}.`, path: '/about', body, breadcrumbs: [{ name: '문강금은', href: '/about' }], jsonld: [{ '@context': 'https://schema.org', '@type': 'AboutPage', name: '매장 소개', url: site() + '/about', mainEntity: { '@id': site() + '/#org' } }], quoteBar: quoteBar() }));
});
router.get('/about/location', (req, res) => {
  const s = settings.all();
  const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">문강금은</p><h1>찾아오시는 길 — 종로3가역 11번 출구 앞</h1><p class="bluf">${esc(s.address)}${s.address_detail ? ' ' + esc(s.address_detail) : ''}. 지하철 1·3·5호선 종로3가역 11번 출구로 나오면 바로 앞입니다. ${esc(s.hours)}. 방문 전 전화(${esc(s.phone)})나 카카오톡으로 당일 시세를 확인하실 수 있습니다.</p></div></section>
<section class="section"><div class="wrap grid2"><div class="main-col"><div class="map-box"><a class="map-card lg" href="${attr(s.naver_place)}" target="_blank" rel="noopener"><b>네이버 지도로 길찾기</b><span>${esc(s.address)}</span><span class="map-go">네이버 지도 열기 →</span></a></div><article class="prose"><h2>어떻게 오나요?</h2><ul><li><strong>지하철</strong>: 1·3·5호선 종로3가역 <strong>11번 출구</strong> 바로 앞.</li><li><strong>버스</strong>: 종로3가 정류장 하차 후 도보 2~3분.</li><li><strong>주차</strong>: 인근 공영·민영 주차장을 이용해 주세요.</li></ul><h2>방문 전 준비</h2><p>팔려는 금·은 제품과 신분증만 가져오시면 됩니다. 구매는 제품·수량을 <a href="/apply?kind=buy">예약</a>해 두시면 대기 없이 수령하실 수 있습니다.</p></article></div><aside class="side-col"><div class="side-card"><h3>연락처</h3><p>${esc(s.legal_name)}<br>${esc(s.address)}<br>전화 <a href="tel:${attr(s.phone)}">${esc(s.phone)}</a>${s.phone2 ? `<br>전화 <a href="tel:${attr(s.phone2)}">${esc(s.phone2)}</a>` : ''}<br>${esc(s.hours)}</p><a class="btn btn-gold block" href="https://map.naver.com/p/search/${encodeURIComponent('문강금은 종로3가')}" target="_blank" rel="noopener">네이버 지도에서 보기</a><a class="btn btn-kakao block" href="${attr(s.kakao_channel)}" target="_blank" rel="noopener">카카오톡 상담</a></div></aside></div></section>`;
  res.send(page({ title: '찾아오시는 길 — 종로3가역 11번 출구 앞, 매일 10~20시', description: `문강금은 오시는 길. ${s.address}, 지하철 1·3·5호선 종로3가역 11번 출구 바로 앞. ${s.hours}. 전화 ${s.phone}.`, path: '/about/location', body, breadcrumbs: [{ name: '문강금은', href: '/about' }, { name: '찾아오시는 길', href: '/about/location' }] }));
});

// ── 개인정보처리방침 ──
router.get('/privacy', (req, res) => {
  const s = settings.all();
  const body = `<section class="page-head"><div class="wrap"><h1>개인정보처리방침</h1><p class="bluf">${esc(s.legal_name)}(이하 "매장")는 개인정보 보호법에 따라 이용자의 개인정보를 보호하고 관련 고충을 신속하게 처리하기 위해 다음과 같이 개인정보처리방침을 수립·공개합니다. 시행일 2026년 9월 15일.</p></div></section><section class="section"><div class="wrap narrow prose">
<h2>1. 수집하는 개인정보 항목과 방법</h2><p>매입·구매 예약 및 상담 신청 시 성함, 연락처(휴대전화), 이메일(선택), 품목·중량·문의 내용을 수집합니다. 서비스 이용 과정에서 접속 IP, 브라우저 정보, 유입 경로가 자동 수집될 수 있습니다.</p>
<h2>2. 수집·이용 목적</h2><ul><li>금·은 매입·판매·리세팅 상담 및 예약 진행</li><li>상담 결과 안내 및 문의 응대</li><li>서비스 개선을 위한 통계(개인 식별 불가 형태)</li></ul>
<h2>3. 보유 및 이용 기간</h2><p>상담 종료 후 1년간 보관 후 지체 없이 파기합니다. 단, 거래가 성립된 경우 관계 법령에 따라 거래 기록을 법정 기간 보관합니다.</p>
<h2>4. 제3자 제공 및 처리 위탁</h2><p>이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 홈페이지 운영을 위한 서버 호스팅(Railway Corporation, 미국)에 데이터 보관을 위탁하며, 이 경우 개인정보 국외 이전에 해당할 수 있습니다.</p>
<h2>5. 정보주체의 권리</h2><p>이용자는 언제든지 개인정보 열람·정정·삭제·처리정지를 요구할 수 있으며, ${esc(s.phone)}${s.email ? ' 또는 ' + esc(s.email) : ''}으로 요청하시면 지체 없이 조치합니다.</p>
<h2>6. 파기 절차 및 방법</h2><p>보유 기간이 경과하거나 목적이 달성된 개인정보는 전자 파일은 복구 불가능한 방법으로 삭제하고, 종이 문서는 분쇄 또는 소각합니다.</p>
<h2>7. 안전성 확보 조치</h2><ul><li>전 구간 HTTPS 암호화 전송</li><li>관리자 접근 권한 최소화 및 비밀번호 암호화 저장</li><li>접근 기록 보관 및 정기 점검</li></ul>
<h2>8. 개인정보 보호책임자</h2><p>${s.privacy_officer ? '성명: ' + esc(s.privacy_officer) + ' · ' : ''}연락처: ${esc(s.phone)}${s.email ? ' · 이메일: ' + esc(s.email) : ''}</p>
<h2>9. 방침 변경</h2><p>본 방침은 법령·서비스 변경 시 개정될 수 있으며, 개정 시 홈페이지에 시행일과 함께 공지합니다.</p></div></section>`;
  res.send(page({ title: '개인정보처리방침', description: `${s.legal_name} 개인정보처리방침 — 매입·구매 예약 시 수집하는 항목과 목적, 보유 기간(상담 종료 후 1년), 처리 위탁, 정보주체의 권리, 안전성 확보 조치, 보호책임자 연락처.`, path: '/privacy', body, breadcrumbs: [{ name: '개인정보처리방침', href: '/privacy' }], noindex: true }));
});

// ── 키워드 허브 (/search/종로금매입 등) — 노출 희망 키워드별 직답 페이지. 실제 시세·제품·안내를 담아 얇은 페이지가 되지 않게 함 ──
const KW = {
  '종로금거래소': { h: '종로 금거래소 문강금은 — 금·은 매입·판매, 오늘 시세 공개', a: '종로3가역 11번 출구 앞 문강금은은 금·은을 매입·판매하는 종로 금거래소(금은방)입니다. 순금·18K·14K·은 시세를 매일 공개하고 30분 이내 감정 후 현장 현금을 드립니다.', to: '/about', cat: 'goldbar' },
  '종로3가금거래소': { h: '종로3가 금거래소 — 종로3가역 11번 출구 앞 문강금은', a: '종로3가역 11번 출구 바로 앞 문강금은은 금·은 매입과 골드바·돌반지 판매를 함께 하는 종로3가 금거래소입니다. 매일 10~20시 연중무휴.', to: '/about/location', cat: 'goldbar' },
  '종로금매입': { h: '종로 금매입 — 오늘 순금 매입가 공개, 30분 감정, 현장 현금', a: '종로 금매입은 문강금은에서 순도·중량 기준으로 형태와 상관없이 진행합니다. 오늘 순금 매입가는 시세표에 공개되며 18K·14K는 함량만큼 환산됩니다.', to: '/sell', cat: '' },
  '종로3가금매입': { h: '종로3가 금매입 — 역 11번 출구 앞, 감정 참관·현금 지급', a: '종로3가에서 금을 파실 때는 매입가 공개 여부, 1돈 기준인지, 부속품 제외 여부를 확인하세요. 문강금은은 세 가지를 모두 공개합니다.', to: '/sell', cat: '' },
  '종로골드바': { h: '종로 골드바 — 1g·1돈·10g·37.5g·100g 당일 시세 연동 가격', a: '종로 골드바는 문강금은에서 당일 판매 시세 × 순중량 + 공임으로 가격이 정해지며 부가세 10% 별도입니다. 보증서 제공, 되팔 때 당일 매입 시세.', to: '/buy', cat: 'goldbar' },
  '종로돌반지': { h: '종로 돌반지 — 반돈·한돈 순금 돌반지, 각인·케이스', a: '종로 돌반지는 순금 1돈(3.75g) 또는 반돈 기준 당일 시세에 공임이 더해져 정해집니다. 문강금은 제품 페이지에 오늘 시세가 반영된 가격이 표시됩니다.', to: '/products?category=baby', cat: 'baby' },
  '종로금방': { h: '종로 금방 문강금은 — 금·은 매입·판매, 시세 공개', a: '종로 금방(금은방) 문강금은은 매입가·판매가를 매일 공개하고 고객 참관 감정으로 신뢰를 지킵니다.', to: '/about', cat: 'jewelry' },
  '종로금은방': { h: '종로 금은방 문강금은 — 신뢰로 거래하는 종로3가 금은방', a: '종로 금은방 문강금은은 종로3가역 11번 출구 앞에서 금·은 매입과 골드바·주얼리·돌반지 판매를 운영합니다.', to: '/about', cat: 'jewelry' },
  '종로3가금은방': { h: '종로3가 금은방 — 종로3가역 11번 출구 앞 문강금은', a: '종로3가 금은방을 찾으신다면 지하철 11번 출구 바로 앞 문강금은으로 오세요. 매일 10~20시, 전화 상담 24시간.', to: '/about/location', cat: 'jewelry' },
  '종로귀금속': { h: '종로 귀금속 — 금·은·백금 매입과 순금 제품 판매', a: '종로 귀금속 거리의 문강금은은 금·은·백금을 매입하고 골드바·실버바·순금 주얼리를 판매합니다. 순도별 시세를 매일 공개합니다.', to: '/price', cat: 'jewelry' },
  '종로쥬얼리': { h: '종로 쥬얼리 — 순금 반지·팔찌·목걸이, 시세 연동 가격', a: '종로 쥬얼리(주얼리) 매장 문강금은은 순금 반지·쌍가락지·팔찌·목걸이를 당일 시세 연동 가격으로 판매하고, 헌 금 리세팅도 합니다.', to: '/products?category=jewelry', cat: 'jewelry' },
  '종로주얼리': { h: '종로 주얼리 — 순금 반지·팔찌·목걸이, 시세 연동 가격', a: '종로 주얼리 매장 문강금은은 순금 반지·쌍가락지·팔찌·목걸이를 당일 시세 연동 가격으로 판매하고, 헌 금 리세팅도 합니다.', to: '/products?category=jewelry', cat: 'jewelry' },
  '종로금반지': { h: '종로 금반지 — 순금 반지 한돈·쌍가락지, 오늘 시세 가격', a: '종로 금반지는 순금 1돈 기준 당일 판매 시세 + 공임으로 가격이 정해집니다. 문강금은은 사이즈 조절·각인이 가능하고 되팔 때 당일 매입 시세를 적용합니다.', to: '/products?category=jewelry', cat: 'jewelry' },
  '종로금팔찌': { h: '종로 금팔찌 — 순금 팔찌·돌팔찌, 시세 연동 가격', a: '종로 금팔찌는 순중량 × 당일 시세 + 공임입니다. 문강금은에서 순금 팔찌와 돌팔찌를 시세 연동 가격으로 구매하실 수 있습니다.', to: '/products?category=jewelry', cat: 'jewelry' },
  '종로금목걸이': { h: '종로 금목걸이 — 순금 목걸이 두돈·세돈, 시세 연동 가격', a: '종로 금목걸이는 순중량과 당일 시세로 가격이 정해집니다. 문강금은은 순금 목걸이 판매와 끊어진 목걸이 매입을 모두 합니다.', to: '/products?category=jewelry', cat: 'jewelry' },
};
router.get('/search/:kw', (req, res, next) => {
  const kw = decodeURIComponent(req.params.kw).replace(/\s+/g, ''); const k = KW[kw]; if (!k) return next();
  const s = settings.all(); const st = quotes.stats(); const g = st.gold;
  const prods = k.cat ? db.prepare("SELECT * FROM products WHERE status='published' AND category=? ORDER BY featured DESC, sort LIMIT 4").all(k.cat) : [];
  const { productCard } = require('./pages-main');
  const faqs = [FAQ[0], FAQ[2], FAQ[7]];
  const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">${esc(kw)}</p><h1>${esc(k.h)}</h1><p class="bluf">${esc(k.a)} 오늘 순금 매입가 ${g ? fmtNum(g.buy) + '원/돈(' + fmtNum(g.buyG) + '원/g)' : '시세표 참조'}, ${esc(st.updatedText)} 갱신.</p></div></section>
<section class="section"><div class="wrap grid2"><div class="main-col"><article class="prose">
<h2>${esc(kw)}, 무엇을 확인해야 하나요?</h2><ul><li><strong>시세 공개 여부</strong>: 매입가·판매가를 돈·g 단위로 공개하는지. 문강금은은 <a href="/price">시세표</a>를 매일 갱신합니다.</li><li><strong>감정 방식</strong>: 고객이 보는 앞에서 저울·XRF로 확인하는지. <a href="/guide/appraisal">감정 안내</a></li><li><strong>현금 지급·재매입</strong>: 매입은 현장 현금, 판매 제품은 되팔 때 당일 매입 시세 적용.</li><li><strong>위치·시간</strong>: 종로3가역 11번 출구 앞, ${esc(s.hours)}.</li></ul>
<h2>오늘 시세는 얼마인가요?</h2><table><thead><tr><th>종목</th><th>매입(원/돈)</th><th>판매(원/돈)</th><th>전일 대비</th></tr></thead><tbody>${st.rows.map(r => `<tr><td>${esc(r.name)}</td><td>${fmtNum(r.buy)}</td><td>${r.sell ? fmtNum(r.sell) : '문의'}</td><td>${chg(r.diff, r.pct)}</td></tr>`).join('')}</tbody></table>
<h2>바로 이용하기</h2><p><a class="btn btn-gold" href="${attr(k.to)}">자세히 보기</a> <a class="btn btn-ghost-dark" href="/calculator">매입가 계산기</a> <a class="btn btn-kakao" href="${attr(s.kakao_channel)}" target="_blank" rel="noopener">오픈채팅 상담</a></p>
${prods.length ? `<h2>관련 제품</h2><div class="pgrid">${prods.map(productCard).join('')}</div>` : ''}
</article>${faqHtml(faqs)}</div><aside class="side-col">${sideQuotes()}<div class="side-card"><h3>다른 검색어</h3><ul class="side-list">${Object.keys(KW).filter(x => x !== kw).slice(0, 8).map(x => `<li><a href="/search/${encodeURIComponent(x)}">${esc(x)}</a></li>`).join('')}</ul></div></aside></div></section>`;
  res.send(page({ title: k.h, description: truncate(`${k.a} 오늘 순금 매입가 ${g ? fmtNum(g.buy) + '원/돈' : ''}, ${st.updatedText} 갱신. 전화 ${s.phone}, 카카오 오픈채팅 상담.`, 158), path: `/search/${encodeURIComponent(kw)}`, body, breadcrumbs: [{ name: kw, href: `/search/${encodeURIComponent(kw)}` }], jsonld: [...articleLd({ title: k.h, desc: k.a, url: `/search/${encodeURIComponent(kw)}`, faqs })], quoteBar: quoteBar() }));
});
router.get('/search', (req, res) => res.redirect(301, '/products?q=' + encodeURIComponent(String(req.query.q || ''))));

module.exports = { router, KW };
