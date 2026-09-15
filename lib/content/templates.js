'use strict';
// LLM 없이도 발행 가능한 템플릿 콘텐츠 — 자사 시세 DB(1차 데이터) 기반
// ① 오늘의 금시세 리포트(일간/주간)  ② 제품 소개 초안
const quotes = require('../quotes');
const { esc, fmtNum, kstDate, addDays, fmtKoDate } = require('../util');
const { db } = require('../../db');

function signHtml(diff, pct) {
  if (diff > 0) return `<span class="up">▲ ${fmtNum(diff)}원 (+${pct}%)</span>`;
  if (diff < 0) return `<span class="down">▼ ${fmtNum(Math.abs(diff))}원 (${pct}%)</span>`;
  return '<span class="flat">보합</span>';
}
function quoteTable(rows) {
  return `<table><thead><tr><th>종목(순도)</th><th>매입가(원/돈)</th><th>매입가(원/g)</th><th>판매가(원/돈)</th><th>전일 대비(매입)</th></tr></thead><tbody>` +
    rows.map(r => `<tr><td>${esc(r.name)} <small>${esc(r.purity || '')}</small></td><td>${fmtNum(r.buy)}</td><td>${fmtNum(r.buyG)}</td><td>${r.sell ? fmtNum(r.sell) : '문의'}</td><td>${signHtml(r.diff, r.pct)}</td></tr>`).join('') + '</tbody></table>';
}

// ── 금시세 리포트 (weekly=true면 주간, 아니면 일간) ──
function priceReport({ date = kstDate(), weekly = false } = {}) {
  const st = quotes.stats(); const g = st.gold; const s = st.silver; const sp = quotes.spot();
  const from = weekly ? addDays(date, -6) : date;
  const hist = g ? quotes.history(g.id, weekly ? 7 : 30) : [];
  const wk = hist.length > 1 ? hist[0] : null; const wkDiff = wk && wk.buy && g ? g.buy - wk.buy : 0; const wkPct = wk && wk.buy ? Math.round(wkDiff / wk.buy * 1000) / 10 : 0;
  const title = weekly ? `주간 금시세 리포트 (${fmtKoDate(from)} ~ ${fmtKoDate(date)}) — 순금 ${g ? fmtNum(g.buy) + '원/돈' : ''}` : `${fmtKoDate(date)} 오늘의 금시세 — 순금 매입 ${g ? fmtNum(g.buy) + '원/돈' : ''}${g && g.diff ? ' (' + (g.diff > 0 ? '▲' : '▼') + fmtNum(Math.abs(g.diff)) + ')' : ''}`;
  const tone = g ? (g.diff > 0 ? '상승' : g.diff < 0 ? '하락' : '보합') : '보합';
  const bluf = g ? `${fmtKoDate(date)} 문강금은 기준 순금(24K) 매입가는 <strong>1돈(3.75g) ${fmtNum(g.buy)}원(1g ${fmtNum(g.buyG)}원)</strong>으로 전일 대비 ${g.diff === 0 ? '보합' : (g.diff > 0 ? '+' : '') + fmtNum(g.diff) + '원(' + g.pct + '%) ' + tone}입니다.${g.sell ? ` 순금 판매가(골드바 기준)는 ${fmtNum(g.sell)}원/돈입니다.` : ''}${weekly && wk ? ` 한 주 전과 비교하면 ${wkDiff > 0 ? '+' : ''}${fmtNum(wkDiff)}원(${wkPct}%)입니다.` : ''}` : '시세 데이터 준비 중입니다.';
  const body = `
<p class="bluf">${bluf}</p>
<h2>오늘 순금·18K·14K·은 시세는 얼마인가요?</h2>
<p>아래 표는 문강금은 매장 고시가(${st.updatedText} 갱신)입니다. 매입가는 고객이 금을 파실 때 문강금은이 드리는 금액, 판매가는 골드바·실버바를 구매하실 때 기준가입니다. 18K·14K는 함량(75%·58.5%)만큼 순금 대비 낮게 책정되며, 실제 거래가는 감정 결과에 따라 확정됩니다.</p>
${quoteTable(st.rows)}
<h2>${weekly ? '이번 주' : '최근'} 금시세 흐름은 어떤가요?</h2>
<p>최근 30일 순금 매입가는 최고 ${st.hi30 ? fmtNum(st.hi30) + '원' : '-'}, 최저 ${st.lo30 ? fmtNum(st.lo30) + '원' : '-'}이며 30일 변동률은 ${st.m30 > 0 ? '+' : ''}${st.m30}%입니다. ${sp.available ? `국제 금시세는 온스당 ${fmtNum(Math.round(sp.xau))}달러, 원/달러 환율 ${fmtNum(Math.round(sp.usdkrw))}원으로 환산하면 1g당 약 ${fmtNum(sp.gold_krw_g)}원(${sp.updated_at} 기준)입니다. 국내 매입가는 여기에 정제·유통 비용과 매입 스프레드가 반영됩니다.` : '국제 금시세(달러/온스)와 원/달러 환율이 오르면 국내 시세도 같은 방향으로 움직입니다.'}</p>
<h2>금을 팔기 좋은 시점인가요?</h2>
<ul>
<li><strong>보유 금을 팔려는 분</strong>: 시세가 30일 고점 부근이면 감정 후 매도하는 것이 유리합니다. 문강금은은 30분 이내 정밀 감정 후 현장에서 현금을 드립니다.</li>
<li><strong>골드바를 사려는 분</strong>: 단기 등락보다 분할 매수가 안정적입니다. 골드바는 구매 시 부가가치세 10%가 붙고, 되팔 때는 시세 기준 매입가로 매입됩니다.</li>
<li><strong>돌반지·선물</strong>: 시세와 무관하게 필요한 시점에 구매하되, 순금 1돈 기준 가격을 시세표에서 확인해 두면 매장별 비교가 쉽습니다.</li>
</ul>
<p>${s ? `은(Ag 999) 매입가는 ${fmtNum(s.buy)}원/돈(${fmtNum(s.buyG)}원/g)${s.sell ? ', 실버바 판매가는 ' + fmtNum(s.sell) + '원/돈' : ''}입니다.` : ''} 투자 판단은 본인 책임이며 문강금은은 시세 정보만 제공합니다.</p>
<h3>자주 묻는 질문</h3>
<h4>시세는 하루에 몇 번 바뀌나요?</h4><p>국제 금시세와 환율에 따라 오전·오후 갱신될 수 있으며, 페이지의 갱신 시각이 적용 기준입니다. 방문 전 전화로 당일 시세를 확인하시면 정확합니다.</p>
<h4>18K 반지를 팔면 얼마를 받나요?</h4><p>18K는 순금 함량 75%이므로 순금 매입가의 약 75%에 중량을 곱한 금액이 기준입니다. <a href="/calculator">매입가 계산기</a>에서 순도와 중량을 넣으면 예상 금액이 바로 계산됩니다.</p>
<p class="cta">지금 시세로 팔거나 사시려면 <a href="/apply">매입·구매 예약</a> 또는 전화 ${esc(require('../settings').cfg('phone'))}으로 문의해 주세요. 종로3가역 11번 출구 앞 매장에서 바로 감정해 드립니다.</p>`;
  const excerpt = g ? `순금 매입 ${fmtNum(g.buy)}원/돈(${fmtNum(g.buyG)}원/g), 전일 대비 ${g.diff > 0 ? '+' : ''}${fmtNum(g.diff)}원. 18K ${fmtNum(quotes.byCode('au750')?.buy)}원 · 14K ${fmtNum(quotes.byCode('au585')?.buy)}원 · 은 ${s ? fmtNum(s.buy) : '-'}원.` : '시세 준비 중';
  return {
    title, slug: weekly ? `weekly-gold-price-${date}` : `gold-price-${date}`, type: 'report',
    meta_description: `${fmtKoDate(date)} 문강금은 금시세. ${excerpt}`.slice(0, 155), excerpt, body_html: body,
    tags: '오늘의 금시세,순금 시세,18K 시세,14K 시세,은시세,종로 금은방',
    faq: [{ q: '시세는 하루에 몇 번 바뀌나요?', a: '국제 금시세와 환율에 따라 오전·오후 갱신될 수 있으며, 페이지의 갱신 시각이 적용 기준입니다.' }, { q: '18K 반지를 팔면 얼마를 받나요?', a: '18K는 순금 함량 75%이므로 순금 매입가의 약 75%에 중량을 곱한 금액이 기준이며, 정확한 금액은 감정 후 확정됩니다.' }],
  };
}

// ── 제품 소개 초안 ──
const CAT_LABEL = { goldbar: '골드바', silverbar: '실버바', baby: '돌반지·아기 선물', jewelry: '순금 주얼리', gift: '기념품·행운의 열쇠', coin: '순금 코인' };
function productDraft(p) {
  const pr = quotes.productPrice(p); const cat = CAT_LABEL[p.category] || '제품';
  const don = p.weight_g ? Math.round(p.weight_g / quotes.DON * 100) / 100 : null;
  const summary = `${p.name}은(는) 순도 ${p.purity}${p.metal === 'gold' ? ' 순금' : p.metal === 'silver' ? ' 은' : ''} ${p.weight_g}g(${don}돈) ${cat}으로, 문강금은 ${pr.basis || '당일'} 시세 기준 가격은 ${pr.price ? fmtNum(pr.price) + '원' : '문의'}입니다. 가격은 매장 고시 시세에 연동되어 매일 바뀝니다.`;
  const body = `
<h2>${esc(p.name)}은(는) 어떤 제품인가요?</h2>
<p>${esc(p.name)}은(는) 순도 ${esc(p.purity)}${p.metal === 'gold' ? '(24K 순금)' : p.metal === 'silver' ? '(순은)' : ''}, 순중량 ${p.weight_g}g(${don}돈)의 ${cat}입니다. ${p.category === 'goldbar' || p.category === 'silverbar' ? '제조사 각인과 순도·중량 표기가 있는 정품이며 보증서와 함께 드립니다.' : p.category === 'baby' ? '아기 돌·백일 선물로 가장 많이 찾는 구성이며, 각인·케이스 포장이 가능합니다.' : '선물용 케이스 포장과 각인이 가능합니다.'}</p>
<h2>가격은 어떻게 정해지나요?</h2>
<p>가격 = (당일 ${p.metal === 'silver' ? '은' : '금'} 판매 시세 × 순중량) + 공임${(p.margin_pct ?? require('../settings').num('margin_pct')) ? ' + 소정의 마진' : ''}. ${pr.per_g ? `현재 적용 시세는 1g당 ${fmtNum(pr.per_g)}원(${esc(pr.basis)} 고시)` : '현재 시세는 시세표'}이며, 시세가 바뀌면 이 페이지의 가격도 자동으로 바뀝니다. 결제 시점의 매장 고시가가 최종 적용됩니다.</p>
<h2>구매 후 되팔 수 있나요?</h2>
<p>네. 문강금은은 자사 판매 제품을 포함한 모든 금·은 제품을 당일 매입 시세로 다시 매입합니다. 골드바·실버바는 보증서와 함께 보관하시면 재매입 시 감정이 빠릅니다.</p>
<h2>구매 방법은?</h2>
<ul><li><strong>매장 방문</strong>: 종로3가역 11번 출구 앞. 당일 시세로 바로 구매·수령.</li><li><strong>예약 구매</strong>: <a href="/apply?kind=buy">구매 예약</a>에 제품·수량을 남기면 준비해 두었다가 방문 시 바로 드립니다.</li><li><strong>카카오톡 상담</strong>: 시세·재고·각인 문의.</li></ul>`;
  const faq = [
    { q: `${p.name} 가격은 얼마인가요?`, a: pr.price ? `${pr.basis} 시세 기준 ${fmtNum(pr.price)}원이며, 시세에 따라 매일 바뀝니다. 결제 시점 매장 고시가가 적용됩니다.` : '시세 연동 가격이며 매장 또는 전화로 당일 가격을 안내합니다.' },
    { q: '부가세가 포함된 가격인가요?', a: '골드바·실버바 등 실물 귀금속 구매에는 부가가치세 10%가 적용됩니다. 표시 가격의 부가세 포함 여부는 결제 전 안내드립니다.' },
    { q: '되팔 때는 얼마에 매입하나요?', a: '되파는 시점의 문강금은 매입 시세(원/돈)에 순중량을 곱한 금액입니다. 보증서·케이스가 있으면 감정이 빠릅니다.' },
  ];
  return { summary, body_html: body, faq_json: JSON.stringify(faq), title: `${p.name} — 가격·중량·구매 안내 (${cat})`, slug: `product-${p.slug}`, excerpt: summary.slice(0, 160), meta_description: summary.slice(0, 155), tags: [p.name, cat, '문강금은', p.metal === 'gold' ? '순금' : '은'], faq };
}

module.exports = { priceReport, productDraft, quoteTable, signHtml, CAT_LABEL };
