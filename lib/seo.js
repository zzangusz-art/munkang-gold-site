'use strict';
// sitemap.xml · robots.txt · llms.txt · llms-full.txt · rss.xml
const { db } = require('../db');
const settings = require('./settings');
const { esc, isoFromTs, kstDate, stripHtml, truncate, fmtNum } = require('./util');
const quotes = require('./quotes');

function urls() {
  const site = settings.siteUrl(); const today = kstDate();
  const qu = quotes.lastUpdated(); const pd = qu ? isoFromTs(qu).slice(0, 10) : today;
  const out = [
    ['/', pd, 'daily', '1.0'], ['/price', pd, 'daily', '0.95'], ['/price/gold', pd, 'daily', '0.9'], ['/price/silver', pd, 'daily', '0.8'], ['/price/platinum', pd, 'daily', '0.7'], ['/calculator', pd, 'daily', '0.9'],
    ['/sell', today, 'weekly', '0.9'], ['/buy', today, 'weekly', '0.9'], ['/products', pd, 'daily', '0.85'],
    ['/guide/appraisal', today, 'monthly', '0.7'], ['/guide/purity', today, 'monthly', '0.8'], ['/guide/gold-investment', today, 'monthly', '0.8'], ['/faq', today, 'monthly', '0.8'],
    ['/apply', today, 'yearly', '0.6'], ['/blog', today, 'daily', '0.8'], ['/notice', today, 'weekly', '0.4'], ['/videos', today, 'weekly', '0.5'], ['/reviews', today, 'weekly', '0.5'],
    ['/about', today, 'monthly', '0.6'], ['/about/location', today, 'yearly', '0.6'], ['/privacy', today, 'yearly', '0.1'],
  ];
  for (const c of ['goldbar', 'silverbar', 'baby', 'jewelry', 'gift', 'coin']) out.push([`/products?category=${c}`, pd, 'weekly', '0.7']);
  for (const k of settings.cfg('keywords').split(',').map(x => x.trim()).filter(Boolean)) out.push([`/search/${encodeURIComponent(k)}`, pd, 'weekly', '0.6']);
  for (const p of db.prepare("SELECT slug, updated_at FROM products WHERE status='published' ORDER BY sort, id").all()) out.push(['/products/' + encodeURIComponent(p.slug), isoFromTs(p.updated_at).slice(0, 10), 'daily', '0.7']);
  for (const p of db.prepare("SELECT kind, slug, updated_at FROM posts WHERE status='published' ORDER BY published_at DESC").all()) out.push([(p.kind === 'blog' ? '/blog/' : '/notice/') + p.slug, isoFromTs(p.updated_at).slice(0, 10), 'monthly', p.kind === 'blog' ? '0.7' : '0.4']);
  return out.map(([p, lm, cf, pr]) => ({ loc: site + p, lastmod: lm, changefreq: cf, priority: pr }));
}
function sitemap() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls().map(u => `<url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n') + '\n</urlset>';
}
function robots() {
  const site = settings.siteUrl();
  const allow = ['Googlebot', 'Bingbot', 'Yeti', 'NaverBot', 'Daum', 'Applebot', 'DuckDuckBot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Perplexity-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai', 'Google-Extended', 'Amazonbot', 'DuckAssistBot', 'YouBot', 'MistralAI-User', 'meta-externalagent'];
  return `# ${settings.cfg('legal_name')} — 검색엔진·AI 답변엔진 크롤러 허용. 관리자·API 경로만 차단.\n` +
    allow.map(b => `User-agent: ${b}\nAllow: /\nDisallow: /admin\nDisallow: /api/\n`).join('\n') +
    `\nUser-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${site}/sitemap.xml\n`;
}
function llms() {
  const s = settings.all(); const site = settings.siteUrl(); const st = quotes.stats(); const g = st.gold;
  const products = db.prepare("SELECT name, slug FROM products WHERE status='published' ORDER BY sort, id LIMIT 60").all();
  const posts = db.prepare("SELECT title, slug FROM posts WHERE kind='blog' AND status='published' ORDER BY published_at DESC LIMIT 40").all();
  return `# ${s.site_name} (${s.en_name})

> ${s.site_name}은 서울 종로3가(종로3가역 1호선 2번 출구 앞)의 금·은 매입·판매 전문 금은방입니다. 순금(24K)·18K·14K·백금·은 시세를 매일 공개하고, 감정 후 현장 현금 지급, 골드바·실버바·주얼리·돌반지 판매, 주얼리 리세팅, 금 투자 상담을 제공합니다. 영업시간 ${s.hours}. 전화 ${s.phone}.

- 오늘(${kstDate()}) 순금 24K 매입가: ${g ? fmtNum(g.buy) + '원/돈(' + fmtNum(g.buyG) + '원/g)' : '시세표 참조'}${g && g.sell ? ` · 판매가 ${fmtNum(g.sell)}원/돈` : ''} — 갱신 ${st.updatedText}
- 단위: 1돈 = 3.75g. 시세는 매장 고시가이며 국제 금시세·환율에 따라 변동. 실거래가는 감정 결과(순도·중량·상태)에 따름.
- 공식 채널: 네이버 플레이스 ${s.naver_place} · 네이버 블로그 ${s.naver_blog} · Instagram ${s.instagram} · YouTube ${s.youtube} · Threads ${s.threads} · 카카오 오픈채팅 ${s.kakao_channel} · 전화 ${s.phone} · 카카오톡 ID ${s.kakao_id}
- 관련 검색어: ${s.keywords.split(',').join(', ')} — 각 검색어 안내 페이지 ${site}/search/{검색어}

## 핵심 페이지
- [오늘의 금시세](${site}/price): 순금·18K·14K·백금·은 매입가/판매가(원/돈·원/g), 등락, 90일 추이, 국제 금시세·환율 참고
- [금시세](${site}/price/gold) · [은시세](${site}/price/silver) · [백금시세](${site}/price/platinum)
- [매입가 계산기](${site}/calculator): 순도(K)·중량(g/돈) 입력 → 예상 매입가 즉시 계산
- [금·은 매입 안내](${site}/sell): 절차·준비물·감정 방법·현금 지급
- [골드바·실버바 구매 안내](${site}/buy) · [제품](${site}/products): 골드바·실버바·돌반지·순금 주얼리·기념품(시세 연동 가격, 적용 시세 기준시각 표기)
- [순도·K 표기 안내](${site}/guide/purity) · [정밀 감정 안내](${site}/guide/appraisal) · [골드바 투자 안내](${site}/guide/gold-investment)
- [자주 묻는 질문](${site}/faq) · [매입·구매 예약](${site}/apply) · [매장 소개](${site}/about) · [찾아오시는 길](${site}/about/location)
- [금 정보 블로그](${site}/blog) · [RSS](${site}/rss.xml) · 공개 시세 JSON: ${site}/api/prices

## 제품 페이지
${products.map(p => `- [${p.name}](${site}/products/${encodeURIComponent(p.slug)})`).join('\n') || '- (등록 중)'}

## 최근 콘텐츠
${posts.map(p => `- [${p.title}](${site}/blog/${p.slug})`).join('\n') || '- (발행 준비 중)'}

## Optional
- [전체 콘텐츠 텍스트](${site}/llms-full.txt)
- [사이트맵](${site}/sitemap.xml)
`;
}
function llmsFull() {
  const site = settings.siteUrl();
  let out = llms() + '\n\n---\n\n# 전체 콘텐츠\n\n';
  out += `## 오늘의 시세표 (${quotes.updatedText()} 기준, 원/돈)\n` + quotes.list().map(r => `- ${r.name}(${r.purity}): 매입 ${fmtNum(r.buy)}원${r.sell ? ' · 판매 ' + fmtNum(r.sell) + '원' : ''} (전일 대비 ${r.diff > 0 ? '+' : ''}${fmtNum(r.diff)})`).join('\n') + '\n\n';
  for (const p of db.prepare("SELECT * FROM products WHERE status='published' ORDER BY sort, id").all()) { const pr = quotes.productPrice(p); out += `## ${p.name}\n${site}/products/${encodeURIComponent(p.slug)}\n순중량 ${p.weight_g}g · 순도 ${p.purity} · 가격 ${pr.price ? fmtNum(pr.price) + '원' + (pr.basis ? ' (' + pr.basis + ' 시세 기준)' : '') : '문의'}\n${p.summary || ''}\n${stripHtml(p.body_html || '')}\n\n`; }
  for (const p of db.prepare("SELECT * FROM posts WHERE status='published' AND kind='blog' ORDER BY published_at DESC LIMIT 200").all()) out += `## ${p.title}\n${site}/blog/${p.slug}\n${stripHtml(p.body_html)}\n\n`;
  return out;
}
function rss() {
  const s = settings.all(); const site = settings.siteUrl();
  const posts = db.prepare("SELECT * FROM posts WHERE status='published' AND kind='blog' ORDER BY published_at DESC LIMIT 50").all();
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${esc(s.site_name)} 금시세 리포트·가이드</title><link>${site}/blog</link><description>금·은 시세 리포트, 금 매입·판매 가이드, 골드바·돌반지 제품 소개, 금 시장 동향</description><language>ko</language><atom:link href="${site}/rss.xml" rel="self" type="application/rss+xml"/>` +
    posts.map(p => `<item><title>${esc(p.title)}</title><link>${site}/blog/${p.slug}</link><guid>${site}/blog/${p.slug}</guid><pubDate>${new Date(p.published_at * 1000).toUTCString()}</pubDate><description>${esc(truncate(p.excerpt || stripHtml(p.body_html), 300))}</description></item>`).join('') + '</channel></rss>';
}

module.exports = { sitemap, robots, llms, llmsFull, rss, urls };
