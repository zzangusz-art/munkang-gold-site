'use strict';
// 장바구니·주문 — 옵션별 가격, 쿠폰·적립금, 무통장/PG
const { db, getSetting } = require('../db');
const { now } = require('./util');
const quotes = require('./quotes');
const member = require('./member');

const num = (v, d = 0) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const shippingFeeDefault = () => num(getSetting('shipping_fee'), 3000);
const freeShipOver = () => num(getSetting('free_ship_over'), 500000);
const pointRate = () => num(getSetting('point_rate_pct'), 0);

// 제품 옵션(관리자 등록) — kind별 목록
function options(productId) {
  const rows = db.prepare('SELECT * FROM product_options WHERE product_id=? AND active=1 ORDER BY kind, sort, id').all(productId);
  const by = {};
  for (const r of rows) (by[r.kind] = by[r.kind] || []).push(r);
  return by;
}

// 선택한 옵션 id 배열 → 가격·표기
function priceWith(product, optionIds = []) {
  const ids = (Array.isArray(optionIds) ? optionIds : String(optionIds || '').split(',')).map(Number).filter(Boolean);
  const chosen = ids.length ? db.prepare(`SELECT * FROM product_options WHERE product_id=? AND id IN (${ids.map(() => '?').join(',')})`).all(product.id, ...ids) : [];
  const karat = chosen.find((o) => o.kind === 'karat' && /18/.test(o.label)) ? '18k' : '14k';
  const stoneAdd = chosen.filter((o) => o.kind === 'stone').reduce((a, o) => a + num(o.add_price), 0);
  const base = quotes.productPrice(product, { karat, stoneAdd });
  const add = chosen.filter((o) => o.kind !== 'stone').reduce((a, o) => a + num(o.add_price), 0);
  const price = base.price == null ? null : base.price + add;
  return { price, basis: base.basis, weight_g: base.weight_g, pure_don: base.pure_don, chosen, label: chosen.map((o) => o.label).join(' / ') };
}

const owner = (req, res) => {
  const m = member.current(req);
  return m ? { member_id: m.id, token: null, member: m } : { member_id: null, token: member.cartToken(req, res), member: null };
};

function list(req, res) {
  const o = owner(req, res);
  const rows = o.member_id
    ? db.prepare('SELECT * FROM cart_items WHERE member_id=? ORDER BY id DESC').all(o.member_id)
    : db.prepare('SELECT * FROM cart_items WHERE token=? ORDER BY id DESC').all(o.token);
  return rows.map((r) => {
    const p = db.prepare('SELECT * FROM products WHERE id=?').get(r.product_id);
    return { ...r, product: p, line_total: r.unit_price * r.qty };
  }).filter((r) => r.product);
}

function add(req, res, { product_id, option_ids, qty }) {
  const o = owner(req, res);
  const p = db.prepare("SELECT * FROM products WHERE id=? AND status='published'").get(product_id);
  if (!p) throw new Error('판매 중인 상품이 아닙니다.');
  const pr = priceWith(p, option_ids);
  if (pr.price == null) throw new Error('가격을 계산할 수 없습니다. 매장으로 문의해 주세요.');
  const n = Math.min(99, Math.max(1, num(qty, 1)));
  const key = (Array.isArray(option_ids) ? option_ids : String(option_ids || '').split(',')).filter(Boolean).sort().join(',');
  const same = o.member_id
    ? db.prepare('SELECT * FROM cart_items WHERE member_id=? AND product_id=? AND IFNULL(option_ids,\'\')=?').get(o.member_id, p.id, key)
    : db.prepare('SELECT * FROM cart_items WHERE token=? AND product_id=? AND IFNULL(option_ids,\'\')=?').get(o.token, p.id, key);
  if (same) db.prepare('UPDATE cart_items SET qty=MIN(99, qty+?), unit_price=? WHERE id=?').run(n, pr.price, same.id);
  else db.prepare('INSERT INTO cart_items (member_id,token,product_id,option_text,option_ids,unit_price,qty,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(o.member_id, o.token, p.id, pr.label, key, pr.price, n, now());
  return count(req, res);
}

function setQty(req, res, id, qty) {
  const o = owner(req, res);
  const n = Math.min(99, Math.max(0, num(qty, 1)));
  const where = o.member_id ? 'member_id=?' : 'token=?';
  const val = o.member_id || o.token;
  if (n === 0) db.prepare(`DELETE FROM cart_items WHERE id=? AND ${where}`).run(id, val);
  else db.prepare(`UPDATE cart_items SET qty=? WHERE id=? AND ${where}`).run(n, id, val);
}
function remove(req, res, id) { setQty(req, res, id, 0); }
function clear(req, res) {
  const o = owner(req, res);
  if (o.member_id) db.prepare('DELETE FROM cart_items WHERE member_id=?').run(o.member_id);
  else db.prepare('DELETE FROM cart_items WHERE token=?').run(o.token);
}
function count(req, res) { return list(req, res).reduce((a, r) => a + r.qty, 0); }
// 로그인 시 비회원 장바구니를 회원 장바구니로 옮긴다
function mergeToMember(req, res, memberId) {
  const t = req.cookies?.[member.CART_COOKIE];
  if (!t) return;
  db.prepare('UPDATE cart_items SET member_id=?, token=NULL WHERE token=?').run(memberId, t);
}

// 쿠폰 확인
function checkCoupon(code, itemsTotal) {
  const c = db.prepare('SELECT * FROM coupons WHERE code=? AND active=1').get(String(code || '').trim().toUpperCase());
  const t = now();
  if (!c) return { ok: false, msg: '쿠폰 번호를 확인해 주세요.' };
  if (c.starts_at && t < c.starts_at) return { ok: false, msg: '아직 사용할 수 없는 쿠폰입니다.' };
  if (c.ends_at && t > c.ends_at) return { ok: false, msg: '사용 기간이 지난 쿠폰입니다.' };
  if (c.usage_limit && c.used_count >= c.usage_limit) return { ok: false, msg: '모두 사용된 쿠폰입니다.' };
  if (itemsTotal < c.min_total) return { ok: false, msg: `${c.min_total.toLocaleString('ko-KR')}원 이상 주문 시 사용할 수 있습니다.` };
  const discount = c.kind === 'percent' ? Math.floor(itemsTotal * c.value / 100 / 100) * 100 : Math.min(c.value, itemsTotal);
  return { ok: true, coupon: c, discount };
}

function totals(items, { couponCode, pointUse, receiveMethod } = {}) {
  const itemsTotal = items.reduce((a, r) => a + r.unit_price * r.qty, 0);
  let shipping = 0;
  if (receiveMethod !== 'pickup' && itemsTotal > 0) {
    const perItem = items.map((r) => num(r.product?.shipping_fee, shippingFeeDefault()));
    shipping = itemsTotal >= freeShipOver() ? 0 : Math.max(...perItem, 0);
  }
  const cp = couponCode ? checkCoupon(couponCode, itemsTotal) : { ok: false, discount: 0 };
  const discount = cp.ok ? cp.discount : 0;
  const point = Math.max(0, Math.min(num(pointUse), itemsTotal - discount));
  const total = Math.max(0, itemsTotal - discount + shipping - point);
  const earn = Math.floor(total * pointRate() / 100 / 10) * 10;
  return { itemsTotal, shipping, discount, point, total, earn, coupon: cp.ok ? cp.coupon : null, couponMsg: cp.ok ? '' : cp.msg };
}

const orderNo = () => {
  const d = new Date(Date.now() + 9 * 3600e3).toISOString().slice(2, 10).replace(/-/g, '');
  return d + '-' + String(Math.floor(Math.random() * 9000) + 1000);
};

function createOrder(req, res, form) {
  const items = list(req, res);
  if (!items.length) throw new Error('장바구니가 비어 있습니다.');
  const m = member.current(req);
  const t = totals(items, { couponCode: form.coupon_code, pointUse: m ? Math.min(num(form.point_use), m.points) : 0, receiveMethod: form.receive_method });
  const no = orderNo();
  const ts = now();
  const info = db.prepare(`INSERT INTO orders
    (order_no,member_id,buyer_name,buyer_phone,buyer_email,receiver_name,receiver_phone,zipcode,addr1,addr2,memo,receive_method,pay_method,
     items_total,shipping_fee,coupon_code,coupon_discount,point_used,point_earned,total,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    no, m ? m.id : null, String(form.buyer_name || '').slice(0, 40), String(form.buyer_phone || '').slice(0, 20), String(form.buyer_email || '').slice(0, 80),
    String(form.receiver_name || form.buyer_name || '').slice(0, 40), String(form.receiver_phone || form.buyer_phone || '').slice(0, 20),
    String(form.zipcode || '').slice(0, 10), String(form.addr1 || '').slice(0, 120), String(form.addr2 || '').slice(0, 120), String(form.memo || '').slice(0, 500),
    form.receive_method === 'pickup' ? 'pickup' : 'delivery', form.pay_method === 'card' ? 'card' : 'bank',
    t.itemsTotal, t.shipping, t.coupon ? t.coupon.code : null, t.discount, t.point, t.earn, t.total, 'pending', ts, ts);
  const oid = info.lastInsertRowid;
  const ins = db.prepare('INSERT INTO order_items (order_id,product_id,name,option_text,unit_price,qty,image) VALUES (?,?,?,?,?,?,?)');
  for (const r of items) ins.run(oid, r.product_id, r.product.name, r.option_text || '', r.unit_price, r.qty, r.product.image || '');
  if (t.coupon) db.prepare('UPDATE coupons SET used_count=used_count+1 WHERE id=?').run(t.coupon.id);
  if (m && t.point > 0) member.addPoints(m.id, -t.point, '주문 사용', no);
  clear(req, res);
  return db.prepare('SELECT * FROM orders WHERE id=?').get(oid);
}

const orderItems = (orderId) => db.prepare('SELECT * FROM order_items WHERE order_id=?').all(orderId);
const findOrder = (no) => db.prepare('SELECT * FROM orders WHERE order_no=?').get(String(no || '').trim());

// 결제 완료 처리(무통장 입금 확인·PG 승인 공통)
function markPaid(order, { payKey } = {}) {
  db.prepare("UPDATE orders SET status='paid', pay_key=?, paid_at=?, updated_at=? WHERE id=?").run(payKey || null, now(), now(), order.id);
  if (order.member_id && order.point_earned > 0) member.addPoints(order.member_id, order.point_earned, '주문 적립', order.order_no);
}

module.exports = {
  options, priceWith, list, add, setQty, remove, clear, count, mergeToMember,
  checkCoupon, totals, createOrder, orderItems, findOrder, markPaid,
  shippingFeeDefault, freeShipOver, pointRate,
};
