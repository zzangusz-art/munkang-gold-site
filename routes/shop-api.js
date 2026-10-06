'use strict';
// 온라인몰 API — 장바구니·찜·주문·회원·1:1문의
const express = require('express');
const { db } = require('../db');
const cart = require('../lib/cart');
const member = require('../lib/member');
const settings = require('../lib/settings');
const { now } = require('../lib/util');

const router = express.Router();
const ok = (res, data) => res.json({ ok: true, ...data });
const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });

// 장바구니
router.get('/cart', (req, res) => ok(res, { count: cart.count(req, res), items: cart.list(req, res).map((r) => ({ id: r.id, name: r.product.name, qty: r.qty, unit_price: r.unit_price, option_text: r.option_text })) }));
router.post('/cart', (req, res) => {
  try { const count = cart.add(req, res, req.body || {}); ok(res, { count }); } catch (e) { fail(res, e.message); }
});
router.post('/cart/:id', (req, res) => { cart.setQty(req, res, Number(req.params.id), req.body.qty); const items = cart.list(req, res); ok(res, { count: items.reduce((a, r) => a + r.qty, 0), totals: cart.totals(items, {}) }); });
router.delete('/cart/:id', (req, res) => { cart.remove(req, res, Number(req.params.id)); const items = cart.list(req, res); ok(res, { count: items.reduce((a, r) => a + r.qty, 0), totals: cart.totals(items, {}) }); });

// 가격 미리보기(옵션 선택 시)
router.post('/price', (req, res) => {
  const p = db.prepare("SELECT * FROM products WHERE id=? AND status='published'").get(req.body.product_id);
  if (!p) return fail(res, '상품을 찾을 수 없습니다.');
  const pr = cart.priceWith(p, req.body.option_ids || []);
  ok(res, { price: pr.price, label: pr.label, weight_g: pr.weight_g });
});

// 찜
router.post('/wish/:pid', (req, res) => {
  const m = member.current(req); if (!m) return fail(res, '로그인이 필요합니다.', 401);
  const pid = Number(req.params.pid);
  const row = db.prepare('SELECT id FROM wishlists WHERE member_id=? AND product_id=?').get(m.id, pid);
  if (row) { db.prepare('DELETE FROM wishlists WHERE id=?').run(row.id); return ok(res, { liked: false }); }
  db.prepare('INSERT INTO wishlists (member_id,product_id,created_at) VALUES (?,?,?)').run(m.id, pid, now());
  ok(res, { liked: true });
});

// 주문 금액 계산(쿠폰·적립금 반영)
router.post('/checkout/quote', (req, res) => {
  const items = cart.list(req, res); const m = member.current(req);
  const t = cart.totals(items, { couponCode: req.body.coupon_code, pointUse: m ? Math.min(Number(req.body.point_use) || 0, m.points) : 0, receiveMethod: req.body.receive_method });
  ok(res, { totals: t });
});

// 주문 생성
router.post('/checkout', (req, res) => {
  try {
    const b = req.body || {};
    if (!b.agree) return fail(res, '주문 내용에 동의해 주세요.');
    if (!String(b.buyer_name || '').trim() || !String(b.buyer_phone || '').trim()) return fail(res, '주문자 이름과 연락처를 입력해 주세요.');
    if (b.receive_method !== 'pickup' && !String(b.addr1 || '').trim()) return fail(res, '배송 주소를 입력해 주세요.');
    const order = cart.createOrder(req, res, b);
    ok(res, { order_no: order.order_no, total: order.total, redirect: `/order/${order.order_no}` });
  } catch (e) { fail(res, e.message); }
});

// 회원
router.post('/signup', (req, res) => {
  try {
    const b = req.body || {};
    if (!b.agree) return fail(res, '개인정보 수집·이용에 동의해 주세요.');
    const m = member.signup(b);
    member.setCookie(res, m); cart.mergeToMember(req, res, m.id);
    ok(res, { redirect: b.next || '/mypage' });
  } catch (e) { fail(res, e.message); }
});
router.post('/login', (req, res) => {
  const m = member.login(req.body.email, req.body.pw);
  if (!m) return fail(res, '이메일 또는 비밀번호를 확인해 주세요.', 401);
  member.setCookie(res, m); cart.mergeToMember(req, res, m.id);
  ok(res, { redirect: req.body.next || '/mypage' });
});
router.post('/profile', (req, res) => {
  const m = member.current(req); if (!m) return fail(res, '로그인이 필요합니다.', 401);
  const b = req.body || {};
  db.prepare('UPDATE members SET name=?, phone=?, zipcode=?, addr1=?, addr2=? WHERE id=?')
    .run(String(b.name || m.name).slice(0, 40), String(b.phone || '').slice(0, 20), String(b.zipcode || '').slice(0, 10), String(b.addr1 || '').slice(0, 120), String(b.addr2 || '').slice(0, 120), m.id);
  if (b.pw) { if (String(b.pw).length < 8) return fail(res, '비밀번호는 8자 이상이어야 합니다.'); member.changePw(m.id, b.pw); }
  ok(res, {});
});

// 1:1 문의
router.post('/qna', (req, res) => {
  const b = req.body || {};
  if (!b.agree) return fail(res, '개인정보 수집·이용에 동의해 주세요.');
  if (!String(b.title || '').trim() || !String(b.body || '').trim()) return fail(res, '제목과 내용을 입력해 주세요.');
  const m = member.current(req);
  db.prepare('INSERT INTO qna (member_id,name,phone,email,kind,secret,title,body,created_at) VALUES (?,?,?,?,?,1,?,?,?)')
    .run(m ? m.id : null, String(b.name || '').slice(0, 40), String(b.phone || '').slice(0, 20), String(b.email || '').slice(0, 80),
      ['order', 'product', 'delivery', 'etc'].includes(b.kind) ? b.kind : 'etc', String(b.title).slice(0, 80), String(b.body).slice(0, 2000), now());
  ok(res, {});
});

// 구매 고객 리뷰 작성
router.post('/review', (req, res) => {
  const m = member.current(req); if (!m) return fail(res, '구매하신 회원만 작성하실 수 있습니다.', 401);
  const b = req.body || {};
  const bought = db.prepare(`SELECT 1 FROM orders o JOIN order_items i ON i.order_id=o.id
    WHERE o.member_id=? AND i.product_id=? AND o.status IN ('paid','ready','shipping','done')`).get(m.id, Number(b.product_id));
  if (!bought) return fail(res, '해당 상품을 구매하신 회원만 작성하실 수 있습니다.');
  db.prepare('INSERT INTO reviews (name,rating,kind,text,source,visible,created_at,product_id,member_id,photos) VALUES (?,?,?,?,?,1,?,?,?,?)')
    .run(m.name.slice(0, 1) + '**', Math.min(5, Math.max(1, Number(b.rating) || 5)), '구매 리뷰', String(b.text || '').slice(0, 1000), '온라인몰', now(), Number(b.product_id), m.id, JSON.stringify(b.photos || []));
  ok(res, {});
});

module.exports = { router };
