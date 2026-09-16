'use strict';
// 콘텐츠 생성 파이프라인 — 유형 선택 → (LLM 또는 템플릿) → posts 저장 → (자동발행) → 인블로그 전송
const { db, getSetting } = require('../../db');
const { now, kstDate, slugify, sanitizeHtml, extractJson, stripHtml, truncate } = require('../util');
const { getLlmConfig, runLLM, llmAvailable } = require('../providers');
const templates = require('./templates');
const inblog = require('../inblog');
const settings = require('../settings');
const quotes = require('../quotes');

const TYPE_LABEL = { report: '금시세 리포트', product: '제품 소개', guide: '금 거래 가이드', trend: '금 시장 동향' };

function recentTitles(limit = 40) { return db.prepare('SELECT title FROM posts WHERE kind=? ORDER BY created_at DESC LIMIT ?').all('blog', limit).map(r => r.title); }
function uniqueSlug(base) { let s = base, n = 1; while (db.prepare('SELECT 1 FROM posts WHERE slug=?').get(s)) { n++; s = `${base}-${n}`; } return s; }
function nextProduct() { return db.prepare("SELECT * FROM products WHERE status='published' AND (body_html IS NULL OR body_html='') ORDER BY sort, id LIMIT 1").get() || null; }
function todayReportExists(date) { return !!db.prepare("SELECT 1 FROM posts WHERE kind='blog' AND type='report' AND slug LIKE ?").get(`%${date}`); }

// 유형 로테이션: 첫 슬롯은 "오늘의 금시세 리포트"(월요일은 주간 리포트) 고정 → AI 답변엔진이 매일 인용할 신선한 1차 데이터.
// 둘째 슬롯: guide 45 / trend 25 / product 30 목표 비율 중 부족한 유형. LLM 없으면 product(템플릿)·report만.
function pickType(slot, date) {
  const first = (getSetting('gen_times', '09:00,15:00').split(',')[0] || '09:00').trim();
  if (slot === first && !todayReportExists(date)) return 'report';
  const counts = {}; for (const t of ['guide', 'trend', 'product']) counts[t] = db.prepare("SELECT COUNT(*) c FROM posts WHERE kind='blog' AND type=?").get(t).c;
  const target = { guide: 0.45, product: 0.3, trend: 0.25 }; const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  let best = 'guide', gap = -Infinity;
  for (const t of ['guide', 'product', 'trend']) { const g = target[t] - counts[t] / total; if (g > gap) { gap = g; best = t; } }
  if (best === 'product' && !nextProduct()) best = llmAvailable() ? 'guide' : 'report';
  if ((best === 'guide' || best === 'trend') && !llmAvailable()) best = nextProduct() ? 'product' : 'report';
  return best;
}
function pickTopic(type) { return db.prepare('SELECT * FROM topic_pool WHERE active=1 AND type=? ORDER BY (last_used IS NULL) DESC, last_used ASC, weight DESC LIMIT 1').get(type) || null; }
function markTopic(id) { db.prepare('UPDATE topic_pool SET last_used=?, use_count=use_count+1 WHERE id=?').run(now(), id); }

const SYSTEM = (search) => `너는 서울 종로3가 금·은 매입·판매 전문 금은방 '문강금은'(종로3가역 11번 출구 앞, 매일 10~20시, 시금석·시약 감정 후 현장 현금 지급, 계좌이체·출장 매입은 하지 않음. 18K 매입가는 순금의 73.5%, 14K는 57%)의 콘텐츠 에디터다. 금을 팔거나 골드바·돌반지를 사려는 일반 독자를 위해 한국어로 쓴다.

## 원칙
${search ? '1. 웹검색으로 최신 제도(부가세·세금·KRX 금시장·순도 표시 규정)·시장 정보를 확인한 뒤 쓴다. 확인된 수치만 쓰고 출처 URL을 남긴다. 금·은 시세 수치는 검색값이 아니라 프롬프트에 주어진 "문강금은 시세표" 값만 사용한다.' : '1. 웹검색 불가. 확실한 일반 정보 위주로 쓰고 세율·수치는 "최신 규정 확인 필요"를 명시한다. 시세는 프롬프트에 주어진 값만 쓴다.'}
2. AI 답변엔진과 검색엔진이 인용하기 쉬운 구조: 첫 문단은 질문에 대한 직답(BLUF) 2~3문장. 소제목(h2)은 독자가 실제로 검색할 질문형 문장. 각 h2 아래 첫 문장이 곧바로 답이 되게 쓴다.
3. 목록은 <ul><li>, 비교는 <table>. 투자 수익 보장·과장 표현 금지. 세무·법률은 전문가 확인 권고 문구 포함. 다른 업체 비방 금지, 타 사이트 문장 복제 금지.
4. 단위는 돈(3.75g)과 g을 병기한다. 금 순도는 24K=999.9(순금), 18K=750, 14K=585로 표기.
5. 말미에 문강금은 상담 CTA 1개만(전화 ${settings.cfg('phone')}, /apply, 카카오톡).
6. 분량 1,200~2,000자. 마지막에 FAQ 3개(h3 "자주 묻는 질문" 아래 h4 질문 + p 답변).

## 출력
설명 없이 아래 JSON 하나만 \`\`\`json 코드펜스로 출력:
{"title":"검색 키워드를 담은 32자 내외 제목","slug":"english-url-slug","meta_description":"120~150자 요약","excerpt":"목록용 2문장","tags":["태그1","태그2","태그3"],"body_html":"<p>직답…</p><h2>질문형 소제목</h2>…<h3>자주 묻는 질문</h3><h4>Q</h4><p>A</p>…","faq":[{"q":"질문","a":"답"}],"source_urls":["https://…"]}`;

function priceContext() {
  const st = quotes.stats(); const sp = quotes.spot();
  return `[문강금은 시세표 — ${st.updatedText} 갱신, 원/돈(3.75g)] ` + st.rows.map(r => `${r.name} 매입 ${r.buy ?? '-'}${r.sell ? '/판매 ' + r.sell : ''}(전일 ${r.diff > 0 ? '+' : ''}${r.diff})`).join(', ') + `. 30일 변동 ${st.m30}%.` + (sp.available ? ` 국제 금시세 XAU $${sp.xau}/oz, USDKRW ${sp.usdkrw} (${sp.updated_at}).` : '');
}

async function llmArticle({ type, topic, hint, product }) {
  const cfg = getLlmConfig(); const avoid = recentTitles();
  let user = `유형: ${TYPE_LABEL[type]}\n주제: "${topic}"\n힌트: ${hint || '없음'}\n${priceContext()}\n`;
  if (product) { const pr = quotes.productPrice(product); user += `제품 정보(확인된 것만): 이름 ${product.name}, 분류 ${templates.CAT_LABEL[product.category] || product.category}, 순도 ${product.purity}, 순중량 ${product.weight_g}g, 현재 가격 ${pr.price ? pr.price + '원(' + pr.basis + ' 시세 기준)' : '시세 연동'}. 제조사·각인 디자인 등 확인되지 않은 세부는 지어내지 말 것.\n`; }
  if (avoid.length) user += `최근 제목과 중복 금지:\n- ${avoid.slice(0, 20).join('\n- ')}\n`;
  user += '위 형식의 JSON을 출력하라.';
  const { text, sources } = await runLLM(cfg, { system: SYSTEM(cfg.supportsSearch), user });
  const j = extractJson(text); if (!j || !j.title || !j.body_html) throw new Error('LLM 응답에서 글 JSON을 추출하지 못했습니다.');
  return { ...j, source_urls: [...new Set([...(j.source_urls || []), ...sources])], model: `${cfg.provider}/${cfg.model}` };
}

function savePost(art, { type, source, slot, model, autoPublish }) {
  const ts = now(); const slug = uniqueSlug(slugify(art.slug, 'post-' + ts.toString(36))); const status = autoPublish ? 'published' : 'draft';
  const info = db.prepare(`INSERT INTO posts (kind,type,slug,title,excerpt,meta_description,body_html,tags,status,source,model,gen_slot,source_urls,published_at,created_at,updated_at) VALUES ('blog',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(type, slug, truncate(art.title, 120), art.excerpt || truncate(stripHtml(art.body_html), 160), truncate(art.meta_description || art.excerpt || '', 160), sanitizeHtml(art.body_html), Array.isArray(art.tags) ? art.tags.join(',') : (art.tags || ''), status, source, model || null, slot || 'manual', JSON.stringify({ sources: art.source_urls || [], faq: art.faq || [] }), autoPublish ? ts : null, ts, ts);
  return db.prepare('SELECT * FROM posts WHERE id=?').get(info.lastInsertRowid);
}

async function pushToInblog(post) {
  if (!inblog.enabled() || getSetting('inblog_push', '1') !== '1') return { skipped: true };
  const site = settings.siteUrl();
  let faq = []; try { const j = JSON.parse(post.source_urls || '{}'); faq = j.faq || []; } catch (_) { /* no-op */ }
  const faqLd = faq.length ? JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(x => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) }) : null;
  try {
    let res;
    const payload = { title: post.title, slug: post.slug, content_html: post.body_html + `<p><em>원문: <a href="${site}/blog/${post.slug}">${site}/blog/${post.slug}</a> · 오늘의 금시세: <a href="${site}/price">${site}/price</a></em></p>`, meta_description: post.meta_description, description: post.excerpt, canonical_url: `${site}/blog/${post.slug}`, published: post.status === 'published', cta_text: '금 매입·구매 예약', cta_link: `${site}/apply`, json_ld: faqLd };
    if (post.inblog_id) res = await inblog.updatePost(post.inblog_id, { title: payload.title, content_html: payload.content_html, meta_description: payload.meta_description, description: payload.description, canonical_url: payload.canonical_url });
    else res = await inblog.createPost(payload);
    if (post.status === 'published' && res && !res.published) { try { await inblog.publish(res.id); } catch (_) { /* no-op */ } }
    const url = res ? (settings.cfg('inblog_url') ? settings.cfg('inblog_url').replace(/\/$/, '') + '/' + (res.slug || post.slug) : '') : '';
    db.prepare('UPDATE posts SET inblog_id=?, inblog_status=?, inblog_error=NULL, inblog_url=? WHERE id=?').run(res?.id || post.inblog_id, post.status === 'published' ? 'published' : 'draft', url, post.id);
    return { ok: true, id: res?.id };
  } catch (e) { db.prepare('UPDATE posts SET inblog_status=?, inblog_error=? WHERE id=?').run('error', String(e.message).slice(0, 400), post.id); return { ok: false, error: e.message }; }
}

// 글 1건 생성. opts: { slot, type?, topicId?, productId?, forceTemplate? }
async function generateOne(opts = {}) {
  const autoPublish = getSetting('auto_publish', '1') === '1'; const date = kstDate();
  const type = opts.type || pickType(opts.slot || '', date);
  let art, source = 'ai', model = null, topicRow = null, product = null;
  if (type === 'report') {
    const weekly = new Date(date + 'T00:00:00+09:00').getUTCDay() === 1;
    art = templates.priceReport({ date, weekly }); source = 'template';
    if (todayReportExists(date) && opts.slot !== 'manual') art.slug = `${art.slug}-${opts.slot.replace(':', '')}`;
    if (llmAvailable() && !opts.forceTemplate) {
      try { const cfg = getLlmConfig(); const { text } = await runLLM(cfg, { system: '너는 귀금속 시장 애널리스트다. 주어진 시세 요약만 근거로, 지어낸 수치 없이 오늘(또는 이번 주) 금·은 시세 흐름과 금을 팔거나 살 때 참고할 점을 3문단(각 2~3문장) 한국어 HTML(<p>)로 해설하라. 투자 권유·수익 보장 표현 금지.', user: priceContext(), webSearch: false }); const html = sanitizeHtml(text.replace(/```html|```/g, '')); if (html.includes('<p>')) { art.body_html = art.body_html.replace('<h2>오늘 순금', `<h2>시장 해설</h2>${html}<h2>오늘 순금`); source = 'ai'; model = `${cfg.provider}/${cfg.model}`; } } catch (_) { /* 템플릿 유지 */ }
    }
  } else if (type === 'product') {
    product = opts.productId ? db.prepare('SELECT * FROM products WHERE id=?').get(opts.productId) : nextProduct();
    if (!product) throw new Error('소개글이 필요한 제품이 없습니다.');
    if (llmAvailable() && !opts.forceTemplate) {
      const r = await llmArticle({ type, topic: `${product.name} 완전 가이드: 가격 구조, 구매, 되팔기`, hint: '직답 → 어떤 분에게 맞는가 → 가격이 정해지는 방식(시세 연동·공임·부가세) → 구매·보관·재매입 → FAQ.', product });
      art = r; model = r.model;
      db.prepare("UPDATE products SET body_html=?, summary=COALESCE(NULLIF(summary,''),?), faq_json=COALESCE(NULLIF(faq_json,''),?), ai_generated=1, updated_at=? WHERE id=?").run(sanitizeHtml(r.body_html), truncate(stripHtml(r.excerpt || r.meta_description || ''), 200), JSON.stringify(r.faq || []), now(), product.id);
    } else {
      const d = templates.productDraft(product); source = 'template';
      db.prepare("UPDATE products SET summary=COALESCE(NULLIF(summary,''),?), body_html=?, faq_json=?, updated_at=? WHERE id=?").run(d.summary, d.body_html, d.faq_json, now(), product.id);
      art = { title: d.title, slug: d.slug, meta_description: d.meta_description, excerpt: d.excerpt, tags: d.tags, body_html: `<p class="bluf">${d.summary}</p>${d.body_html}<p>제품 상세: <a href="/products/${product.slug}">${product.name} 페이지</a></p>`, faq: d.faq };
    }
  } else {
    if (!llmAvailable()) throw new Error('LLM API 키가 없어 가이드/동향 글을 생성할 수 없습니다. 관리자 → 설정에서 키를 입력하세요.');
    topicRow = opts.topicId ? db.prepare('SELECT * FROM topic_pool WHERE id=?').get(opts.topicId) : pickTopic(type);
    if (!topicRow) throw new Error(`${TYPE_LABEL[type]} 주제 풀이 비어 있습니다.`);
    const r = await llmArticle({ type, topic: topicRow.topic, hint: topicRow.hint }); art = r; model = r.model; markTopic(topicRow.id);
  }
  const post = savePost(art, { type, source, slot: opts.slot, model, autoPublish });
  const ib = await pushToInblog(post);
  return { post: db.prepare('SELECT * FROM posts WHERE id=?').get(post.id), autoPublished: autoPublish, inblog: ib, type };
}

module.exports = { generateOne, pushToInblog, TYPE_LABEL, nextProduct, pickType };
