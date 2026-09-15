'use strict';
// 런타임 스모크 테스트 — 서버를 임시 포트로 띄우고 주요 페이지·API·관리자 흐름을 실제 요청으로 검증
process.env.PORT = process.env.PORT || '3478';
process.env.DISABLE_SCHEDULER = '1';
process.env.DATA_DIR = process.env.DATA_DIR || require('path').join(__dirname, '..', 'data', 'smoke');
process.env.JWT_SECRET = 'smoke-secret';
require('fs').rmSync(process.env.DATA_DIR, { recursive: true, force: true });
require('../server');
const { db } = require('../db');
const BASE = `http://127.0.0.1:${process.env.PORT}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, msg, extra = '') => { console.log(`${c ? '✔' : '✘'} ${msg}${extra ? ' — ' + extra : ''}`); if (!c) fails++; };

(async () => {
  await sleep(800);
  const get = async (p, opt = {}) => { const r = await fetch(BASE + p, opt); return { status: r.status, text: await r.text(), headers: r.headers }; };
  const pages = ['/', '/price', '/price/gold', '/price/silver', '/price/platinum', '/calculator', '/sell', '/buy', '/products', '/products?category=baby', '/guide/purity', '/guide/appraisal', '/guide/gold-investment', '/faq', '/apply', '/blog', '/notice', '/videos', '/reviews', '/about', '/about/location', '/privacy', '/search/' + encodeURIComponent('종로금매입'), '/search/' + encodeURIComponent('종로돌반지')];
  const titles = new Set(); const descs = new Set();
  for (const p of pages) {
    const r = await get(p);
    const t = (r.text.match(/<title>([^<]*)<\/title>/) || [])[1] || ''; const d = (r.text.match(/name="description" content="([^"]*)"/) || [])[1] || '';
    const canon = (r.text.match(/rel="canonical" href="([^"]*)"/) || [])[1] || '';
    const ld = (r.text.match(/application\/ld\+json/g) || []).length;
    const want = p.split('?')[0];
    ok(r.status === 200 && t.length > 10 && d.length > 50 && ld >= 2 && canon.endsWith(want === '/' ? '/' : want), `GET ${decodeURIComponent(p)}`, `title ${t.length}자 · desc ${d.length}자 · JSON-LD ${ld}`);
    if (!p.includes('?')) { titles.add(t); descs.add(d); }
  }
  const n = pages.filter(p => !p.includes('?')).length;
  ok(titles.size === n, 'title 전 페이지 고유', `${titles.size}/${n}`);
  ok(descs.size === n, 'description 전 페이지 고유', `${descs.size}/${n}`);
  let r = await get('/'); ok(r.text.includes('"JewelryStore"') && r.text.includes('"Dataset"') && r.text.includes('"FAQPage"') && r.text.includes('name="keywords"') && r.text.includes('side-cta'), '홈: JewelryStore·Dataset·FAQPage·keywords·우측 상담버튼');
  ok(r.text.includes('open.kakao.com/o/pZJxBomi') && r.text.includes('010-5005-8636') && r.text.includes('hyungtak0106'), '홈: 상담 채널 3종(오픈톡·전화·카톡ID)');
  ok(r.text.includes('map.naver.com') && r.text.includes('blog.naver.com/lallapaloza') && r.text.includes('youtube.com/@munkanggold') && r.text.includes('instagram.com/munkanggold'), '홈: 네이버플레이스·블로그·유튜브·인스타 링크');
  const prod = db.prepare("SELECT slug FROM products WHERE status='published' LIMIT 1").get();
  r = await get('/products/' + prod.slug); ok(r.status === 200 && r.text.includes('"Product"') && r.text.includes('"Offer"') && r.text.includes('적용 시세 기준시각'), 'GET /products/:slug (Product·Offer·기준시각)');
  const post = db.prepare("SELECT slug FROM posts WHERE kind='blog' AND status='published' LIMIT 1").get();
  r = await get('/blog/' + post.slug); ok(r.status === 200 && r.text.includes('"Article"') && r.text.includes('"FAQPage"'), 'GET /blog/:slug (Article·FAQPage)');
  r = await get('/about'); ok(r.text.includes('신뢰') && r.text.includes('검증된 제품 퀄리티'), '매장 소개 인사말 삽입');
  r = await get('/sitemap.xml'); const locs = (r.text.match(/<loc>/g) || []).length; ok(r.status === 200 && locs >= 50, 'sitemap.xml', `${locs} URL`);
  r = await get('/robots.txt'); ok(r.text.includes('Sitemap:') && r.text.includes('GPTBot') && r.text.includes('Disallow: /admin'), 'robots.txt');
  r = await get('/llms.txt'); ok(r.text.startsWith('# 문강금은') && r.text.includes('종로금매입'), 'llms.txt');
  r = await get('/llms-full.txt'); ok(r.text.length > 5000, 'llms-full.txt', `${r.text.length}자`);
  r = await get('/rss.xml'); ok(r.text.includes('<rss') && r.text.includes('<item>'), 'rss.xml');
  r = await fetch(BASE + '/gold', { redirect: 'manual' }); ok(r.status === 301 && r.headers.get('location') === '/price/gold', '별칭 301 /gold → /price/gold');
  r = await get('/no-such-page'); ok(r.status === 404 && r.text.includes('noindex'), '404 페이지 noindex');
  // 공개 API
  r = await get('/api/prices'); const j = JSON.parse(r.text); ok(j.count >= 6 && j.items[0].buy_per_don > 0, 'API /api/prices', `${j.count}종목 · 순금 ${j.items[0].buy_per_don}`);
  r = await get('/api/prices/au999/history'); ok(JSON.parse(r.text).history.length >= 10, 'API 시세 이력');
  r = await get('/api/calc?code=au750&weight=1&unit=don'); const c = JSON.parse(r.text); ok(c.total > 0 && Math.abs(c.total - c.per_don) < 2, 'API 계산기(18K 1돈)', `${c.total}원`);
  r = await get('/api/spot'); ok(JSON.parse(r.text).available === true, 'API 국제시세(시드)');
  r = await fetch(BASE + '/api/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'sell', name: '테스트', phone: '010-1234-5678', agree: 1, item: '18K 반지', weight: '5g' }) }); ok(r.status === 200 && (await r.json()).ok, 'POST /api/inquiry');
  r = await fetch(BASE + '/api/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x' }) }); ok(r.status === 400, 'POST /api/inquiry 검증(400)');
  // 관리자
  r = await fetch(BASE + '/api/admin/dashboard'); ok(r.status === 401, '관리자 미로그인 401');
  r = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'admin', pw: 'munkang1234!' }) });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0]; ok(r.status === 200 && cookie.startsWith('mk_admin='), '관리자 로그인');
  const A = (p, opt = {}) => fetch(BASE + '/api/admin' + p, { ...opt, headers: { 'Content-Type': 'application/json', cookie, ...(opt.headers || {}) } });
  r = await A('/dashboard'); const dash = await r.json(); ok(r.status === 200 && dash.quotes.gold && dash.week >= 1, '관리자 대시보드', `${dash.week}주차 · 순금 ${dash.quotes.gold.buy}`);
  r = await A('/quotes', { method: 'POST', body: JSON.stringify({ rows: [{ code: 'au999', buy: 700000, sell: 750000 }] }) }); ok(r.status === 200, '시세 수동 입력');
  r = await get('/api/prices'); const j2 = JSON.parse(r.text); ok(j2.items[0].buy_per_don === 700000 && j2.items[0].diff === 700000 - j.items[0].buy_per_don, '시세 반영·전일대비 계산', `diff ${j2.items[0].diff}`);
  r = await A('/quotes/template.xlsx'); const xbuf = Buffer.from(await r.arrayBuffer()); ok(r.status === 200 && xbuf.length > 3000, '시세 엑셀 양식 다운로드', `${xbuf.length} bytes`);
  const XLSX = require('xlsx'); const wb = XLSX.read(xbuf, { type: 'buffer' }); const ws = wb.Sheets['시세']; const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 }); aoa[3][2] = 500000; wb.Sheets['시세'] = XLSX.utils.aoa_to_sheet(aoa); const up = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const fd = new FormData(); fd.append('file', new Blob([up], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'q.xlsx');
  r = await fetch(BASE + '/api/admin/quotes/upload', { method: 'POST', headers: { cookie }, body: fd }); const uj = await r.json(); ok(r.status === 200 && uj.rows >= 6, '시세 엑셀 업로드', `${uj.rows}행`);
  ok(db.prepare("SELECT buy FROM quotes WHERE code='au750'").get().buy === 500000, '엑셀 값 반영(18K 500,000)');
  r = await A('/quotes/spot/apply', { method: 'POST' }); ok(r.status === 200 && (await r.json()).rows >= 5, '국제시세 → 순금 시세 자동 계산');
  r = await A('/products'); const pl = await r.json(); ok(pl.length >= 15 && pl[0].price > 0, '제품 목록·시세 연동 가격', `${pl.length}개 · ${pl[0].name} ${pl[0].price}원`);
  r = await A('/automation/generate', { method: 'POST', body: JSON.stringify({ type: 'report', template: true }) }); const g1 = await r.json(); ok(r.status === 200 && g1.post && g1.post.status === 'published', '금시세 리포트 템플릿 생성', g1.post?.title);
  r = await A('/automation/generate', { method: 'POST', body: JSON.stringify({ type: 'product', template: true }) }); const g2 = await r.json(); ok(r.status === 200 && g2.post, '제품 소개 템플릿 생성', g2.post?.title);
  r = await get('/blog/' + g1.post.slug); ok(r.status === 200 && r.text.includes('오늘 순금'), '생성된 리포트 페이지 렌더');
  const before = db.prepare("SELECT COUNT(*) c FROM posts WHERE kind='blog'").get().c;
  const sch = require('../lib/scheduler'); await sch.tick(); const mid = db.prepare("SELECT COUNT(*) c FROM posts WHERE kind='blog'").get().c; await sch.tick(); const after = db.prepare("SELECT COUNT(*) c FROM posts WHERE kind='blog'").get().c;
  ok(after === mid && mid - before <= 2, '스케줄러 멱등(두 번 tick 해도 중복 없음)', `+${mid - before}`);
  r = await A('/audit/run', { method: 'POST' }); const au = await r.json(); ok(r.status === 200 && au.score >= 80, '자체 기술 감사', `${au.score}점 · 미충족: ${au.items.filter(i => !i.ok).map(i => i.label).join(', ') || '없음'}`);
  r = await A('/reports/generate', { method: 'POST', body: JSON.stringify({ kind: 'baseline', week: 1, audit: false }) }); const rp = await r.json(); ok(r.status === 200 && rp.report && rp.report.docx_path, '베이스라인 리포트 생성(HTML+DOCX)', rp.report?.docx_path);
  r = await A(`/reports/${rp.report.id}/html`); ok(r.status === 200 && (await r.text()).includes('실행계획 체크'), '리포트 HTML');
  r = await A('/plan'); const pln = await r.json(); ok(pln.weeks.length === 4 && pln.weeks[0].tasks.length >= 8, '4주 실행계획', `1주차 ${pln.weeks[0].tasks.length}항목`);
  r = await A('/inquiries'); ok((await r.json()).length >= 1, '문의 목록');
  r = await A('/reviews', { method: 'POST', body: JSON.stringify({ name: '김OO', rating: 5, kind: '금 매입', text: '감정 과정을 눈앞에서 보여줘서 믿음이 갔습니다.' }) }); ok(r.status === 200, '후기 등록');
  r = await get('/reviews'); ok(r.text.includes('AggregateRating'), '후기 페이지 AggregateRating');
  r = await A('/settings', { method: 'POST', body: JSON.stringify({ inblog_url: 'https://blog.munkanggold.com' }) }); ok(r.status === 200, '설정 저장');
  r = await get('/'); ok(r.text.includes('https://blog.munkanggold.com'), '설정 반영(sameAs·푸터)');
  console.log(fails ? `\n실패 ${fails}건` : '\n모든 스모크 테스트 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('스모크 오류', e); process.exit(1); });
