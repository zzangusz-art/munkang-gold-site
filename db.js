'use strict';
// SQLite 초기화 — DATA_DIR(Railway Volume) 아래 munkang.db
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { now } = require('./lib/util');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'reports'), { recursive: true });

const db = new Database(path.join(DATA_DIR, 'munkang.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id TEXT UNIQUE NOT NULL, pw_hash TEXT NOT NULL, name TEXT,
  created_at INTEGER NOT NULL, last_login INTEGER
);

-- 시세 (현재값) : 금·은·백금 순도별 매입가/판매가. 단위는 1돈(3.75g) 기준 원
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,        -- au999 au750 au585 ag999 pt999 ...
  metal TEXT NOT NULL,              -- gold|silver|platinum
  name TEXT NOT NULL,               -- 순금(24K) / 18K / 14K / 은 / 백금
  purity TEXT,                      -- 999.9 / 750 / 585
  buy INTEGER,                      -- 매입가(고객→문강금은) 원/돈
  sell INTEGER,                     -- 판매가(문강금은→고객) 원/돈, 없으면 NULL
  prev_buy INTEGER, prev_sell INTEGER,
  sort INTEGER DEFAULT 0, note TEXT,
  updated_at INTEGER NOT NULL
);

-- 시세 이력 (일자별 스냅샷)
CREATE TABLE IF NOT EXISTS quote_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  date TEXT NOT NULL, buy INTEGER, sell INTEGER,
  UNIQUE(quote_id, date)
);

-- 국제 시세 이력 (XAU/XAG USD per oz · USDKRW)
CREATE TABLE IF NOT EXISTS spot_history (
  date TEXT PRIMARY KEY, xau REAL, xag REAL, xpt REAL, usdkrw REAL, source TEXT, created_at INTEGER NOT NULL
);

-- 시세 갱신 로그
CREATE TABLE IF NOT EXISTS quote_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,             -- manual|excel|spot
  filename TEXT, rows INTEGER, by_admin TEXT, detail TEXT, created_at INTEGER NOT NULL
);

-- 제품 (골드바·실버바·돌반지·순금 주얼리·기념품)
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,           -- goldbar|silverbar|baby|jewelry|gift|coin
  name TEXT NOT NULL,
  metal TEXT NOT NULL DEFAULT 'gold',
  purity TEXT DEFAULT '999.9',
  weight_g REAL,                    -- 순중량 g
  quote_code TEXT,                  -- quotes.code (시세 연동)
  labor INTEGER DEFAULT 0,          -- 공임(원)
  margin_pct REAL,                  -- 마진율(%) NULL이면 설정값
  price_fixed INTEGER,              -- 고정가(원) — 시세 연동 안 할 때
  summary TEXT, body_html TEXT, faq_json TEXT,
  image TEXT, badge TEXT,           -- badge: 오늘출발|BEST|NEW|선물추천
  featured INTEGER DEFAULT 0, sort INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published',
  ai_generated INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

-- 게시글: 블로그(콘텐츠)·공지
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'blog', -- blog|notice
  type TEXT,                          -- blog 유형: report|product|guide|trend
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT, meta_description TEXT,
  body_html TEXT NOT NULL,
  tags TEXT,
  author TEXT DEFAULT '문강금은 편집팀',
  status TEXT NOT NULL DEFAULT 'draft',
  source TEXT DEFAULT 'manual',       -- manual|ai|template
  model TEXT, gen_slot TEXT, source_urls TEXT,
  inblog_id TEXT, inblog_status TEXT, inblog_error TEXT, inblog_url TEXT,
  published_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_kind ON posts(kind, status, published_at);

CREATE TABLE IF NOT EXISTS topic_pool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, topic TEXT NOT NULL, hint TEXT, weight INTEGER DEFAULT 1,
  active INTEGER DEFAULT 1, last_used INTEGER, use_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gen_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_date TEXT NOT NULL, slot TEXT NOT NULL,
  status TEXT, post_id INTEGER, detail TEXT, created_at INTEGER NOT NULL,
  UNIQUE(run_date, slot)
);

-- 문의(매입 예약·구매·출장·상담)
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,      -- sell|buy|visit|consult
  category TEXT, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT,
  item TEXT, weight TEXT, message TEXT, agree INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'new',
  memo TEXT, ip TEXT, ua TEXT, referrer TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

-- 고객 후기
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, rating INTEGER DEFAULT 5, kind TEXT, text TEXT NOT NULL,
  source TEXT, visible INTEGER DEFAULT 1, created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pageviews (
  date TEXT NOT NULL, path TEXT NOT NULL, agent TEXT NOT NULL,
  bot_name TEXT, ref_host TEXT, count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(date, path, agent, bot_name, ref_host)
);

CREATE TABLE IF NOT EXISTS plan_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week INTEGER NOT NULL, title TEXT NOT NULL, owner TEXT, auto_key TEXT,
  done INTEGER DEFAULT 0, done_at INTEGER, note TEXT, sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week INTEGER NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'weekly',
  title TEXT, html TEXT, json TEXT, docx_path TEXT,
  created_at INTEGER NOT NULL, UNIQUE(kind, week)
);

CREATE TABLE IF NOT EXISTS audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, score INTEGER, json TEXT, created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  youtube_id TEXT UNIQUE NOT NULL, title TEXT NOT NULL, description TEXT,
  published TEXT, sort INTEGER DEFAULT 0, created_at INTEGER NOT NULL
);
`);

// ── 마이그레이션(기존 DB에도 안전하게 적용) ──
const tableCols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
function addColumn(table, name, decl) { if (!tableCols(table).includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${decl}`); }
addColumn('products', 'ready_today', 'INTEGER DEFAULT 0');   // 오늘 출발(즉시 수령) 표시
addColumn('products', 'karat_option', 'INTEGER DEFAULT 0');  // 주얼리: 14K 기준 등록 + 18K 선택(중량 ×1.2)
addColumn('products', 'stone_json', 'TEXT');                 // 스톤 옵션 [{name,add}] 모이사나이트·랩다이아 등
db.exec("UPDATE products SET category='gift' WHERE category IN ('baby','coin')");  // 카테고리 6종 개편(2026-09-16)
db.exec("UPDATE products SET ready_today=1 WHERE ready_today=0 AND badge='오늘출발'");
db.exec("DELETE FROM quote_history WHERE quote_id IN (SELECT id FROM quotes WHERE code='au916')");
db.exec("DELETE FROM quotes WHERE code='au916'");            // 22K는 표시하지 않음

const getStmt = db.prepare('SELECT value FROM settings WHERE key=?');
const setStmt = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
function getSetting(key, def = '') { const r = getStmt.get(key); return r ? r.value : def; }
function setSetting(key, val) { setStmt.run(key, val == null ? '' : String(val)); }
function allSettings() { const o = {}; for (const r of db.prepare('SELECT key,value FROM settings').all()) o[r.key] = r.value; return o; }

if (db.prepare('SELECT COUNT(*) c FROM admins').get().c === 0) {
  const id = process.env.ADMIN_ID || 'admin';
  const pw = process.env.ADMIN_PW || 'munkang1234!';
  db.prepare('INSERT INTO admins (login_id,pw_hash,name,created_at) VALUES (?,?,?,?)').run(id, bcrypt.hashSync(pw, 10), '관리자', now());
  console.log(`[db] 최초 관리자 생성: ${id} (비밀번호는 로그인 후 변경하세요)`);
}

module.exports = { db, DATA_DIR, getSetting, setSetting, allSettings };
