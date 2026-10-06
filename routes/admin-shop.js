'use strict';
// 관리자 — 온라인몰(주문·회원·쿠폰·적립금·배너·상품 옵션·1:1 문의)
const express = require('express');
const { db, setSetting } = require('../db');
const cart = require('../lib/cart');
const memberLib = require('../lib/member');
const { now } = require('../lib/util');

const router = express.Router();
const n = (v, d = 0) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? d : Number(v));
const STATUS = ['pending', 'paid', 'ready', 'shipping', 'done', 'cancel', 'refund'];

// ── 주문 ──
router.get('/orders', (req, res) => {
  const status = STATUS.includes(req.query.status) ? req.query.status : '';
  const q = String(req.query.q || '').trim();
  let sql = 'SELECT * FROM orders WHERE 1=1'; const args = [];
  if (status) { sql += ' AND status=?'; args.push(status); }
  if (q) { sql += ' AND (order_no LIKE ? OR buyer_name LIKE ? OR buyer_phone LIKE ?)'; args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY id DESC LIMIT 200';
  const rows = db.prepare(sql).all(...args).map((o) => ({ ...o, items: cart.orderItems(o.id) }));
  const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) c FROM orders GROUP BY status').all().map((r) => [r.status, r.c]));
  res.json({ rows, counts, sum: db.prepare("SELECT IFNULL(SUM(total),0) t FROM orders WHERE status NOT IN ('cancel','refund')").get().t });
});
router.post('/orders/:id', (req, res) => {
  const b = req.body || {};
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!o) return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
  if (b.status && STATUS.includes(b.status) && b.status !== o.status) {
    db.prepare('UPDATE orders SET status=?, updated_at=? WHERE id=?').run(b.status, now(), o.id);
    if (b.status === 'paid' && !o.paid_at) cart.markPaid(o, {});
    if ((b.status === 'cancel' || b.status === 'refund') && o.member_id && o.point_used) memberLib.addPoints(o.member_id, o.point_used, '주문 취소 환원', o.order_no);
  }
  if ('courier' in b || 'tracking_no' in b) {
    db.prepare('UPDATE orders SET courier=?, tracking_no=?, updated_at=? WHERE id=?')
      .run(String(b.courier || o.courier || '').slice(0, 30), String(b.tracking_no || o.tracking_no || '').slice(0, 40), now(), o.id);
  }
  res.json({ ok: true, order: db.prepare('SELECT * FROM orders WHERE id=?').get(o.id) });
});

// ── 회원 ──
router.get('/members', (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = q
    ? db.prepare('SELECT * FROM members WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? ORDER BY id DESC LIMIT 200').all(`%${q}%`, `%${q}%`, `%${q}%`)
    : db.prepare('SELECT * FROM members ORDER BY id DESC LIMIT 200').all();
  res.json({
    rows: rows.map((m) => ({ ...m, pw_hash: undefined, orders: db.prepare('SELECT COUNT(*) c, IFNULL(SUM(total),0) t FROM orders WHERE member_id=?').get(m.id) })),
    total: db.prepare('SELECT COUNT(*) c FROM members').get().c,
  });
});
router.post('/members/:id/points', (req, res) => {
  const amount = n(req.body.amount);
  if (!amount) return res.status(400).json({ error: '금액을 입력해 주세요.' });
  memberLib.addPoints(Number(req.params.id), amount, String(req.body.reason || '관리자 조정').slice(0, 60), '');
  res.json({ ok: true, points: db.prepare('SELECT points FROM members WHERE id=?').get(req.params.id).points });
});
router.post('/members/:id/memo', (req, res) => { db.prepare('UPDATE members SET memo=? WHERE id=?').run(String(req.body.memo || '').slice(0, 500), req.params.id); res.json({ ok: true }); });

// ── 쿠폰 ──
router.get('/coupons', (req, res) => res.json(db.prepare('SELECT * FROM coupons ORDER BY id DESC').all()));
router.post('/coupons', (req, res) => {
  const b = req.body || {};
  const code = String(b.code || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!code || !b.name) return res.status(400).json({ error: '쿠폰 번호와 이름을 입력해 주세요.' });
  const toTs = (d) => (d ? Math.floor(new Date(d + 'T00:00:00+09:00').getTime() / 1000) : null);
  if (b.id) {
    db.prepare('UPDATE coupons SET code=?,name=?,kind=?,value=?,min_total=?,starts_at=?,ends_at=?,usage_limit=?,active=? WHERE id=?')
      .run(code, b.name, b.kind === 'percent' ? 'percent' : 'amount', n(b.value), n(b.min_total), toTs(b.starts_at), toTs(b.ends_at), b.usage_limit ? n(b.usage_limit) : null, b.active ? 1 : 0, b.id);
  } else {
    db.prepare('INSERT INTO coupons (code,name,kind,value,min_total,starts_at,ends_at,usage_limit,active,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(code, b.name, b.kind === 'percent' ? 'percent' : 'amount', n(b.value), n(b.min_total), toTs(b.starts_at), toTs(b.ends_at), b.usage_limit ? n(b.usage_limit) : null, b.active === false ? 0 : 1, now());
  }
  res.json({ ok: true });
});
router.delete('/coupons/:id', (req, res) => { db.prepare('DELETE FROM coupons WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// ── 배너 ──
router.get('/banners', (req, res) => res.json(db.prepare('SELECT * FROM banners ORDER BY slot, sort, id').all()));
router.post('/banners', (req, res) => {
  const b = req.body || {};
  if (!b.image) return res.status(400).json({ error: '이미지를 올려 주세요.' });
  const vals = [b.slot || 'main', b.image, b.image_m || '', b.title || '', b.subtitle || '', b.btn_text || '', b.href || '', b.theme === 'light' ? 'light' : 'dark', n(b.sort), b.active === false ? 0 : 1];
  if (b.id) db.prepare('UPDATE banners SET slot=?,image=?,image_m=?,title=?,subtitle=?,btn_text=?,href=?,theme=?,sort=?,active=? WHERE id=?').run(...vals, b.id);
  else db.prepare('INSERT INTO banners (slot,image,image_m,title,subtitle,btn_text,href,theme,sort,active,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(...vals, now());
  res.json({ ok: true });
});
router.delete('/banners/:id', (req, res) => { db.prepare('DELETE FROM banners WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// ── 상품 옵션 ──
router.get('/products/:id/options', (req, res) => res.json(db.prepare('SELECT * FROM product_options WHERE product_id=? ORDER BY kind, sort, id').all(req.params.id)));
router.post('/products/:id/options', (req, res) => {
  const pid = Number(req.params.id);
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  db.prepare('DELETE FROM product_options WHERE product_id=?').run(pid);
  const ins = db.prepare('INSERT INTO product_options (product_id,kind,label,add_price,weight_mult,sort,active) VALUES (?,?,?,?,?,?,?)');
  rows.filter((r) => r && r.label).forEach((r, i) => ins.run(pid, String(r.kind || 'etc').slice(0, 20), String(r.label).slice(0, 60), n(r.add_price), r.weight_mult ? Number(r.weight_mult) : null, n(r.sort, i), r.active === false ? 0 : 1));
  res.json({ ok: true, count: rows.length });
});

// ── 1:1 문의 ──
router.get('/qna', (req, res) => res.json(db.prepare('SELECT * FROM qna ORDER BY id DESC LIMIT 200').all()));
router.post('/qna/:id', (req, res) => {
  db.prepare('UPDATE qna SET answer=?, answered_at=? WHERE id=?').run(String(req.body.answer || '').slice(0, 2000), now(), req.params.id);
  res.json({ ok: true });
});
router.delete('/qna/:id', (req, res) => { db.prepare('DELETE FROM qna WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// ── 쇼핑 설정 ──
const SHOP_KEYS = ['shipping_fee', 'free_ship_over', 'point_rate_pct', 'bank_info', 'popular_keywords', 'pg_client_key', 'pg_secret_key'];
router.post('/shop-settings', (req, res) => {
  for (const k of SHOP_KEYS) if (k in (req.body || {})) setSetting(k, req.body[k]);
  res.json({ ok: true });
});

module.exports = { router };
