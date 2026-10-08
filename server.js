'use strict';
// 문강금은 홈페이지 + 관리자 — 서버 엔트리
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { db, DATA_DIR } = require('./db');
const layout = require('./lib/layout');
const seo = require('./lib/seo');
const analytics = require('./lib/analytics');
const scheduler = require('./lib/scheduler');
const audit = require('./lib/audit');
const settings = require('./lib/settings');
const { seedIfEmpty } = require('./scripts/seed');
const { page } = layout;

seedIfEmpty();
// 글 제목·슬로건의 " — " 정리(멱등) — 카드·목록에서 대시 나열로 읽히지 않게
db.prepare("UPDATE posts SET title=REPLACE(REPLACE(title, ' — 가격', ' 가격'), ' — ', ', ') WHERE title LIKE '% — %'").run();
db.prepare("UPDATE settings SET value=REPLACE(value, ' — ', '. ') WHERE key='slogan' AND value LIKE '% — %'").run();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://www.googletagmanager.com', 'https://www.youtube.com', 'https://wcs.naver.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      fontSrc: ["'self'", 'https://cdn.jsdelivr.net', 'data:'],
      imgSrc: ["'self'", 'data:', 'https://i.ytimg.com', 'https://www.google-analytics.com', 'https://*.googleusercontent.com'],
      frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com', 'https://www.google.com', 'https://maps.google.com', 'https://s.tradingview.com', 'https://www.tradingview-widget.com'],
      connectSrc: ["'self'", 'https://www.google-analytics.com', 'https://region1.google-analytics.com', 'https://wcs.naver.net'],
      scriptSrcAttr: null,
      objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], upgradeInsecureRequests: null,
    },
  },
  crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(compression());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());

const PUBLIC_DIR = path.join(__dirname, 'public');
const STAMP = (() => { try { return String(Math.max(...['css/site.css', 'js/site.js', 'admin/admin.js', 'admin/admin.css', 'img/og.png', 'img/hero.jpg', 'img/hero-mobile.jpg'].map(f => fs.statSync(path.join(PUBLIC_DIR, f)).mtimeMs))).slice(-8); } catch (_) { return String(Date.now()).slice(-8); } })();
layout.setStamp(STAMP);
// 관리자 화면 파일은 배포 즉시 반영되도록 매번 새 버전 확인(ETag) — 7일 캐시 때문에 옛 화면이 남던 문제
app.use(express.static(PUBLIC_DIR, { maxAge: '7d', index: false, setHeaders: (res, p) => { if (/\.html$/.test(p) || /[\\/]admin[\\/]/.test(p)) res.setHeader('Cache-Control', 'no-cache'); } }));

// 임시 도메인(Railway *.up.railway.app 등)으로 접속되면 검색엔진 색인 금지
app.use((req, res, next) => {
  // 임시 주소(*.up.railway.app, localhost, IP 직접 접속)만 색인 금지.
  // 정식 도메인이 SITE_URL과 달라도 색인은 막지 않는다(도메인 설정 실수로 사이트 전체가 검색에서 사라지는 사고 방지).
  const host = String(req.hostname || '').toLowerCase();
  const temporary = !host || host === 'localhost' || host === '127.0.0.1' || /\.up\.railway\.app$/.test(host) || /^[\d.]+$/.test(host) || /\.onrender\.com$/.test(host);
  if (temporary) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.use(analytics.middleware);
app.get('/healthz', (req, res) => res.json({ ok: true, app: '문강금은', dataDir: DATA_DIR, quotes: db.prepare('SELECT COUNT(*) c FROM quotes').get().c, posts: db.prepare("SELECT COUNT(*) c FROM posts WHERE status='published'").get().c, time: new Date().toISOString() }));

// SEO 파일
app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(seo.sitemap()));
app.get('/robots.txt', (req, res) => res.type('text/plain').send(seo.robots()));
app.get('/llms.txt', (req, res) => res.type('text/plain; charset=utf-8').send(seo.llms()));
app.get('/llms-full.txt', (req, res) => res.type('text/plain; charset=utf-8').send(seo.llmsFull()));
app.get('/rss.xml', (req, res) => res.type('application/rss+xml').send(seo.rss()));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'img', 'favicon.ico')));

// 흔한 별칭 URL → 정식 URL 301 (검색 신호 통합)
const REDIRECTS = { '/gold': '/price/gold', '/silver': '/price/silver', '/prices': '/price', '/price/today': '/price', '/calc': '/calculator', '/goldbar': '/products?category=goldbar', '/silverbar': '/products?category=silverbar', '/baby': '/products?category=baby', '/contact': '/apply', '/location': '/about/location', '/map': '/about/location', '/news': '/notice' };
app.use((req, res, next) => { const p = req.path.replace(/\/$/, '') || '/'; if (REDIRECTS[p]) return res.redirect(301, REDIRECTS[p]); next(); });

// 공개 API
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false }));
app.use('/api', require('./routes/api').router);
app.use('/api/shop', require('./routes/shop-api').router);

// 관리자
app.use('/api/admin', rateLimit({ windowMs: 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false }));
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes.router);
// 관리자 첫 화면 — 스크립트·스타일 주소에 수정 시각을 붙여, 예전에 받아 둔 파일 대신 새 파일을 쓰게 한다
app.get(['/admin', '/admin/*'], (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex'); res.setHeader('Cache-Control', 'no-cache');
  const dir = path.join(PUBLIC_DIR, 'admin');
  const ver = (f) => { try { return Math.floor(fs.statSync(path.join(dir, f)).mtimeMs).toString(36); } catch (_) { return '0'; } };
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
    .replace('/admin/admin.js"', `/admin/admin.js?v=${ver('admin.js')}"`)
    .replace('/admin/admin.css"', `/admin/admin.css?v=${ver('admin.css')}"`);
  res.type('html').send(html);
});

// 공개 페이지
app.use(require('./routes/pages-home').router);
app.use(require('./routes/shop').router);
app.use(require('./routes/pages-main').router);
app.use(require('./routes/pages-info').router);
app.use(require('./routes/pages-content').router);

app.use((req, res) => {
  res.status(404).send(page({ title: '페이지를 찾을 수 없습니다', description: '요청하신 페이지가 없습니다. 오늘의 금시세와 매입 안내는 홈에서 확인하세요.', path: req.path, noindex: true, body: `<section class="section"><div class="wrap narrow center"><h1>페이지를 찾을 수 없습니다</h1><p>주소가 바뀌었거나 삭제된 페이지입니다.</p><p><a class="btn btn-gold" href="/">홈으로</a> <a class="btn btn-ghost-dark" href="/price">오늘의 금시세</a></p></div></section>` }));
});
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => { console.error('[error]', err.message); res.status(500).send(page({ title: '오류', description: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', path: req.path, noindex: true, body: '<section class="section"><div class="wrap narrow center"><h1>일시적인 오류가 발생했습니다</h1><p>잠시 후 다시 시도해 주세요.</p></div></section>' })); });

const PORT = Number(process.env.PORT) || 3000;
function renderLocal(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p, headers: { 'user-agent': 'munkang-self-audit' } }, (r) => { let b = ''; r.setEncoding('utf8'); r.on('data', c => b += c); r.on('end', () => resolve(b)); }).on('error', reject);
  });
}
const runAudit = () => audit.run(renderLocal, settings.siteUrl());
adminRoutes.setAuditRunner(runAudit);

app.listen(PORT, () => {
  console.log(`[server] 문강금은 http://localhost:${PORT} (DATA_DIR=${DATA_DIR}, SITE_URL=${settings.siteUrl()})`);
  if (process.env.DISABLE_SCHEDULER !== '1') setTimeout(() => scheduler.start({ audit: runAudit }), 3000);
});

module.exports = { app, renderLocal };
