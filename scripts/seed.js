'use strict';
// 초기 데이터 시드 — 비어 있을 때만 채움(멱등). `node scripts/seed.js --force` 로 주제·계획만 재시드.
const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const quotes = require('../lib/quotes');
const { now, kstDate, addDays } = require('../lib/util');

const SEED = path.join(__dirname, '..', 'data', 'seed');
const J = (f) => JSON.parse(fs.readFileSync(path.join(SEED, f), 'utf8'));

function seedQuotes() {
  if (db.prepare('SELECT COUNT(*) c FROM quotes').get().c) return 0;
  const q = J('quotes.json');
  // 이력: 최근 14일치를 기준값 ±1.5% 랜덤워크로 생성(스파크라인·30일 통계용 초기 데이터. 실제 갱신이 쌓이면 자연히 대체됨)
  const rows = q.rows; const today = kstDate();
  for (let d = 14; d >= 1; d--) {
    const date = addDays(today, -d); const f = 1 + (Math.sin(d * 1.3) * 0.012 + Math.cos(d * 0.7) * 0.006);
    quotes.upsertRows(rows.map(r => ({ ...r, buy: r.buy ? Math.round(r.buy * f / 100) * 100 : null, sell: r.sell ? Math.round(r.sell * f / 100) * 100 : null })), date);
  }
  quotes.upsertRows(rows, today);
  quotes.logUpdate('seed', { rows: rows.length, by: 'seed', detail: q.note || '' });
  if (q.spot) { const { setSetting } = require('../db'); for (const [k, v] of Object.entries(q.spot)) setSetting(k, v); }
  return rows.length;
}
const PRODUCT_INS = 'INSERT OR IGNORE INTO products (slug,category,name,metal,purity,weight_g,quote_code,labor,margin_pct,price_fixed,summary,body_html,faq_json,image,badge,featured,sort,status,ready_today,karat_option,stone_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
function productArgs(p, sort, ts) {
  const stones = Array.isArray(p.stone_json) ? JSON.stringify(p.stone_json) : (p.stone_json || null);
  return [p.slug, p.category, p.name, p.metal || 'gold', p.purity || '999.9', p.weight_g, p.quote_code || (p.metal === 'silver' ? 'ag999' : 'au999'), p.labor || 0, p.margin_pct ?? null, p.price_fixed ?? null, p.summary || '', p.body_html || '', p.faq_json || '[]', p.image || '', p.badge || '', p.featured ? 1 : 0, sort, 'published', p.ready_today ? 1 : 0, p.karat_option ? 1 : 0, stones, ts, ts];
}
function seedProducts() {
  if (db.prepare('SELECT COUNT(*) c FROM products').get().c) return 0;
  const ts = now(); let n = 0;
  const ins = db.prepare(PRODUCT_INS);
  J('products.json').forEach((p, i) => { ins.run(...productArgs(p, i, ts)); n++; });
  return n;
}
// 운영 DB에 다이아 주얼리(모이사나이트·랩다이아 옵션)를 한 번만 추가 — 관리자가 지운 제품은 다시 넣지 않는다 (2026-09-16)
function seedDiamondJewelry() { return seedOnce('seed_diamond_20260916', p => p.diamond); }
// 순금 남성 라인업 1회 추가(2026-09-18)
function seedMensLine() { return seedOnce('seed_men_20260918', p => p.men_seed); }
// 카탈로그(14K·18K·다이아·순금) 실제 제품 1회 등록, 예시로 넣었던 주얼리 샘플은 비공개로 전환(2026-09-21)
function seedCatalog() {
  const { getSetting } = require('../db');
  if (getSetting('seed_catalog_20260921')) return 0;
  db.prepare("UPDATE products SET status='draft' WHERE slug IN ('14k-diamond-solitaire-ring','14k-diamond-necklace','14k-diamond-earrings','14k-diamond-eternity-ring','14k-diamond-tennis-bracelet','14k-basic-ring')").run();
  const n = seedOnce('seed_catalog_20260921', p => p.catalog);
  const setImg = db.prepare("UPDATE products SET image=? WHERE slug=? AND (image IS NULL OR image='')");
  for (const p of J('products.json').filter(x => x.catalog)) setImg.run(`/img/products/${p.slug}.jpg`, p.slug);
  return n;
}
function seedOnce(flag, filter) {
  const { getSetting, setSetting } = require('../db');
  if (getSetting(flag)) return 0;
  const ts = now(); let n = 0;
  const ins = db.prepare(PRODUCT_INS);
  const base = (db.prepare("SELECT MAX(sort) m FROM products").get().m || 0) + 1;
  const fill = db.prepare("UPDATE products SET karat_option=1, stone_json=?, updated_at=? WHERE slug=? AND (stone_json IS NULL OR stone_json IN ('','[]'))");
  J('products.json').filter(filter).forEach((p, i) => {
    const args = productArgs(p, base + i, ts);
    n += ins.run(...args).changes || fill.run(args[20], ts, p.slug).changes;  // 이미 있는 같은 제품은 옵션만 채운다
  });
  setSetting(flag, String(ts));
  return n;
}
function seedTopics(force) {
  if (!force && db.prepare('SELECT COUNT(*) c FROM topic_pool').get().c) return 0;
  const ins = db.prepare('INSERT INTO topic_pool (type,topic,hint,weight,active) VALUES (?,?,?,1,1)'); let n = 0;
  for (const t of J('topics.json')) { if (!db.prepare('SELECT 1 FROM topic_pool WHERE topic=?').get(t.topic)) { ins.run(t.type, t.topic, t.hint || ''); n++; } }
  return n;
}
function seedPlan(force) {
  if (!force && db.prepare('SELECT COUNT(*) c FROM plan_tasks').get().c) return 0;
  const plan = J('plan.json'); const ins = db.prepare('INSERT INTO plan_tasks (week,title,owner,auto_key,done,done_at,note,sort) VALUES (?,?,?,?,?,?,?,?)'); let n = 0;
  for (const w of plan.weeks) w.tasks.forEach((t, i) => { if (!db.prepare('SELECT 1 FROM plan_tasks WHERE week=? AND title=?').get(w.week, t.title)) { ins.run(w.week, t.title, t.owner || '', t.auto_key || null, t.done ? 1 : 0, t.done ? now() : null, t.note || '', i); n++; } });
  db.prepare("INSERT INTO settings (key,value) VALUES ('kickoff_date',?) ON CONFLICT(key) DO NOTHING").run(plan.kickoff);
  return n;
}
function seedArticles() {
  if (db.prepare("SELECT COUNT(*) c FROM posts WHERE kind='blog'").get().c) return 0;
  const ts = now(); let n = 0; const arts = J('articles.json');
  const ins = db.prepare("INSERT INTO posts (kind,type,slug,title,excerpt,meta_description,body_html,tags,status,source,source_urls,published_at,created_at,updated_at) VALUES ('blog',?,?,?,?,?,?,?,'published','manual',?,?,?,?)");
  arts.forEach((a, i) => { const t = ts - (arts.length - i) * 3600; ins.run(a.type, a.slug, a.title, a.excerpt, a.meta_description, a.body_html, (a.tags || []).join(','), JSON.stringify({ sources: [], faq: a.faq || [] }), t, t, t); n++; });
  return n;
}
function seedNotice() {
  if (db.prepare("SELECT COUNT(*) c FROM posts WHERE kind='notice'").get().c) return 0;
  const ts = now();
  db.prepare("INSERT INTO posts (kind,slug,title,excerpt,body_html,status,source,published_at,created_at,updated_at) VALUES ('notice','new-homepage-open',?,?,?,'published','manual',?,?,?)")
    .run('문강금은 홈페이지를 열었습니다 — 오늘의 금시세·매입가 계산기·제품 안내', '매일 갱신되는 금·은·백금 시세와 매입가 계산기, 골드바·실버바·돌반지 제품을 새 홈페이지에서 확인하세요.', '<p>문강금은 홈페이지를 새로 열었습니다. 종로3가 매장 고시 시세를 매일 공개하고, 순도와 중량만 넣으면 예상 매입가가 계산되는 계산기를 제공합니다.</p><ul><li><a href="/price">오늘의 금시세</a> — 순금·22K·18K·14K·백금·은 매입가/판매가, 90일 추이</li><li><a href="/calculator">매입가 계산기</a></li><li><a href="/products">골드바·실버바·돌반지·순금 주얼리</a> — 시세 연동 가격</li><li><a href="/sell">금·은 매입 안내</a> · <a href="/apply">매입·구매 예약</a></li></ul><p>방문 전 전화(0504-2525-5159) 또는 카카오톡으로 당일 시세를 확인하실 수 있습니다.</p>', ts, ts, ts);
  return 1;
}
function seedIfEmpty(force = false) {
  const r = { quotes: seedQuotes(), products: seedProducts(), diamond: seedDiamondJewelry(), men: seedMensLine(), catalog: seedCatalog(), topics: seedTopics(force), plan: seedPlan(force), articles: seedArticles(), notice: seedNotice() };
  if (Object.values(r).some(Boolean)) console.log('[seed]', JSON.stringify(r));
  return r;
}
if (require.main === module) { console.log(seedIfEmpty(process.argv.includes('--force'))); }
module.exports = { seedIfEmpty };
