'use strict';
// 온라인몰 스키마 — 회원·장바구니·찜·주문·쿠폰·적립금·배너·진열·1:1문의 (2026-10-06 작업지시서)
// db.js에서 테이블 생성 직후 호출한다.
module.exports = function shopSchema(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL, pw_hash TEXT NOT NULL,
  name TEXT NOT NULL, phone TEXT,
  zipcode TEXT, addr1 TEXT, addr2 TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  marketing INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  memo TEXT,
  created_at INTEGER NOT NULL, last_login INTEGER
);

CREATE TABLE IF NOT EXISTS product_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,              -- karat | size | design | stone | etc
  label TEXT NOT NULL,             -- 14K / 12호 / 옐로우
  add_price INTEGER NOT NULL DEFAULT 0,
  weight_mult REAL,                -- 중량 배수(18K = 1.2). 비우면 1
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_popt_product ON product_options(product_id, kind, sort);

CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
  token TEXT,                      -- 비회원 장바구니 식별자(쿠키)
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_text TEXT, option_ids TEXT,
  unit_price INTEGER NOT NULL, qty INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cart_owner ON cart_items(member_id, token);

CREATE TABLE IF NOT EXISTS wishlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE(member_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT UNIQUE NOT NULL,
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  buyer_name TEXT NOT NULL, buyer_phone TEXT NOT NULL, buyer_email TEXT,
  receiver_name TEXT, receiver_phone TEXT, zipcode TEXT, addr1 TEXT, addr2 TEXT, memo TEXT,
  receive_method TEXT NOT NULL DEFAULT 'delivery',   -- delivery | pickup
  pay_method TEXT NOT NULL DEFAULT 'bank',           -- bank | card(PG)
  items_total INTEGER NOT NULL DEFAULT 0,
  shipping_fee INTEGER NOT NULL DEFAULT 0,
  coupon_code TEXT, coupon_discount INTEGER NOT NULL DEFAULT 0,
  point_used INTEGER NOT NULL DEFAULT 0,
  point_earned INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',            -- pending(입금대기) | paid | ready | shipping | done | cancel | refund
  pay_key TEXT, paid_at INTEGER,
  courier TEXT, tracking_no TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_member ON orders(member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL, option_text TEXT,
  unit_price INTEGER NOT NULL, qty INTEGER NOT NULL DEFAULT 1,
  image TEXT
);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'amount',   -- amount | percent
  value INTEGER NOT NULL DEFAULT 0,
  min_total INTEGER NOT NULL DEFAULT 0,
  starts_at INTEGER, ends_at INTEGER,
  usage_limit INTEGER, used_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS point_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,              -- +적립 / -사용
  reason TEXT, order_no TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot TEXT NOT NULL DEFAULT 'main',    -- main(제품군 슬라이드) | limited(한정 상품)
  image TEXT NOT NULL, image_m TEXT,
  title TEXT, subtitle TEXT, btn_text TEXT, href TEXT,
  theme TEXT NOT NULL DEFAULT 'dark',   -- dark(검정 글자) | light(흰 글자)
  sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS qna (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  name TEXT NOT NULL, phone TEXT, email TEXT,
  kind TEXT NOT NULL DEFAULT 'etc',     -- order | product | delivery | etc
  secret INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL, body TEXT NOT NULL,
  answer TEXT, answered_at INTEGER,
  created_at INTEGER NOT NULL
);
`);

  // 기존 테이블 보강
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  const add = (t, n, d) => { if (!cols(t).includes(n)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${n} ${d}`); };
  add('products', 'shipping_fee', 'INTEGER');             // 비우면 설정값
  add('products', 'detail_images', 'TEXT');               // 상세 이미지 JSON 배열
  add('products', 'section_tag', 'TEXT');                 // best|new|gift|diamond|weekly|collection
  add('products', 'stock', 'INTEGER');                    // 비우면 재고 무제한
  add('reviews', 'product_id', 'INTEGER');
  add('reviews', 'member_id', 'INTEGER');
  add('reviews', 'order_no', 'TEXT');
  add('reviews', 'photos', 'TEXT');

  // 사진이 없는 골드바·실버바·돌선물·기념품에 제품군 대표컷 지정(1회)
  if (!db.prepare("SELECT value FROM settings WHERE key='cat_images_20261007'").get()) {
    const put = db.prepare("UPDATE products SET image=? WHERE category=? AND (image IS NULL OR image='')");
    put.run('/img/products/cat-goldbar.jpg', 'goldbar');
    put.run('/img/products/cat-silverbar.jpg', 'silverbar');
    put.run('/img/products/cat-baby.jpg', 'baby');
    put.run('/img/products/cat-gift.jpg', 'gift');
    db.prepare("INSERT INTO settings (key,value) VALUES ('cat_images_20261007',?)").run(String(Math.floor(Date.now() / 1000)));
  }

  // 후기에 관련 상품 연결(썸네일용) — 후기 내용과 맞는 상품
  if (!db.prepare("SELECT value FROM settings WHERE key='review_products_20261007'").get()) {
    const pairs = [
      ['주식이나 코인 대신', 'goldbar-3-75g'], ['서랍 구석', 'baby-ring-1-don'], ['역시 금은 종로가', 'goldbar-10g'],
      ['금에 대해 잘 몰라서', 'pure-gold-steady-2line-necklace'], ['결혼 예물 때문에', '14k-ball-ring-2-5mm'],
      ['주말에 방문했더니', '14k-bubble-necklace-42cm'], ['갑자기 목돈이', 'pure-gold-hammer-chain-1m'],
      ['금값이 많이 올라서', 'silverbar-1kg'], ['부모님 환갑', 'goldbar-37-5g'], ['홈페이지에 당일 금 시세', 'baby-ring-half-don'],
    ];
    const up = db.prepare('UPDATE reviews SET product_id=(SELECT id FROM products WHERE slug=?) WHERE text LIKE ? AND product_id IS NULL');
    for (const [needle, slug] of pairs) up.run(slug, '%' + needle + '%');
    db.prepare("INSERT INTO settings (key,value) VALUES ('review_products_20261007',?)").run(String(Math.floor(Date.now() / 1000)));
  }

  // 컬렉션·한정 배너 기본값 1회 등록(문구·이미지는 관리자에서 변경)
  if (!db.prepare("SELECT value FROM settings WHERE key='banner_extra_20261007'").get()) {
    const ins = db.prepare('INSERT INTO banners (slot,image,image_m,title,subtitle,btn_text,href,theme,sort,active,created_at) VALUES (?,?,?,?,?,?,?,?,?,1,?)');
    const ts = Math.floor(Date.now() / 1000);
    if (!db.prepare("SELECT 1 FROM banners WHERE slot='collection'").get())
      ins.run('collection', '/img/banners/collection.jpg', '', 'GOLD COLLECTION', '순금 오브제와 기념품을 한자리에 모았습니다.', '컬렉션 보기', '/products?category=gift', 'dark', 0, ts);
    if (!db.prepare("SELECT 1 FROM banners WHERE slot='limited'").get())
      ins.run('limited', '/img/banners/limited.jpg', '', '다이아 주얼리', '모이사나이트·랩다이아 중에서 고르실 수 있습니다.', '다이아 보러 가기', '/products?category=jewelry', 'dark', 0, ts);
    db.prepare("INSERT INTO settings (key,value) VALUES ('banner_extra_20261007',?)").run(String(ts));
  }

  // 어두운 사진 위 배너는 흰 글자로 1회 교정(밝기 실측)
  if (!db.prepare("SELECT value FROM settings WHERE key='banner_theme_20261007'").get()) {
    db.prepare("UPDATE banners SET theme='light' WHERE image IN ('/img/banners/b1.jpg','/img/banners/b2.jpg','/img/banners/b3.jpg')").run();
    db.prepare("UPDATE banners SET theme='dark' WHERE image IN ('/img/banners/b4.jpg','/img/banners/b5.jpg','/img/banners/b6.jpg','/img/banners/b7.jpg')").run();
    db.prepare("INSERT INTO settings (key,value) VALUES ('banner_theme_20261007',?)").run(String(Math.floor(Date.now() / 1000)));
  }

  // 기존 제품의 14K/18K·스톤 설정을 상품 옵션으로 1회 이전
  const done = db.prepare("SELECT value FROM settings WHERE key='opts_from_legacy_20261006'").get();
  if (!done) {
    const ins = db.prepare('INSERT INTO product_options (product_id,kind,label,add_price,weight_mult,sort,active) VALUES (?,?,?,?,?,?,1)');
    for (const p of db.prepare('SELECT * FROM products').all()) {
      const has = db.prepare('SELECT COUNT(*) c FROM product_options WHERE product_id=?').get(p.id).c;
      if (has) continue;
      if (p.karat_option) { ins.run(p.id, 'karat', '14K', 0, 1, 0); ins.run(p.id, 'karat', '18K', 0, 1.2, 1); }
      try {
        const st = JSON.parse(p.stone_json || '[]');
        if (Array.isArray(st)) st.filter((x) => x && x.name).forEach((x, i) => ins.run(p.id, 'stone', String(x.name), Number(x.add) || 0, null, i));
      } catch (_) { /* 무시 */ }
    }
    db.prepare("INSERT INTO settings (key,value) VALUES ('opts_from_legacy_20261006',?)").run(String(Math.floor(Date.now() / 1000)));
  }
};
