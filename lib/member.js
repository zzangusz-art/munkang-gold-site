'use strict';
// 회원 인증 — 쿠키 mk_member (JWT). 관리자(lib/auth.js)와 분리.
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { now } = require('./util');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const COOKIE = 'mk_member';
const CART_COOKIE = 'mk_cart';

const byEmail = (email) => db.prepare('SELECT * FROM members WHERE email=?').get(String(email || '').trim().toLowerCase());
const byId = (id) => db.prepare('SELECT * FROM members WHERE id=?').get(id);

function signup({ email, pw, name, phone, zipcode, addr1, addr2, marketing }) {
  const mail = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) throw new Error('이메일 형식을 확인해 주세요.');
  if (String(pw || '').length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다.');
  if (!String(name || '').trim()) throw new Error('이름을 입력해 주세요.');
  if (byEmail(mail)) throw new Error('이미 가입된 이메일입니다.');
  const info = db.prepare(`INSERT INTO members (email,pw_hash,name,phone,zipcode,addr1,addr2,marketing,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(mail, bcrypt.hashSync(String(pw), 10), String(name).trim().slice(0, 40),
    String(phone || '').slice(0, 20), String(zipcode || '').slice(0, 10), String(addr1 || '').slice(0, 120), String(addr2 || '').slice(0, 120),
    marketing ? 1 : 0, now());
  return byId(info.lastInsertRowid);
}

function login(email, pw) {
  const m = byEmail(email);
  if (!m || m.status !== 'active' || !bcrypt.compareSync(String(pw || ''), m.pw_hash)) return null;
  db.prepare('UPDATE members SET last_login=? WHERE id=?').run(now(), m.id);
  return m;
}

const sign = (m) => jwt.sign({ mid: m.id, name: m.name }, SECRET, { expiresIn: '30d' });
function current(req) {
  const raw = req.cookies?.[COOKIE];
  if (!raw) return null;
  try { const p = jwt.verify(raw, SECRET); return p.mid ? byId(p.mid) : null; } catch (_) { return null; }
}
function setCookie(res, m) {
  res.cookie(COOKIE, sign(m), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 864e5 });
}
const clearCookie = (res) => res.clearCookie(COOKIE);
function changePw(id, pw) { db.prepare('UPDATE members SET pw_hash=? WHERE id=?').run(bcrypt.hashSync(String(pw), 10), id); }

// 비회원 장바구니 토큰
function cartToken(req, res) {
  let t = req.cookies?.[CART_COOKIE];
  if (!t) {
    t = require('crypto').randomBytes(16).toString('hex');
    res.cookie(CART_COOKIE, t, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 90 * 864e5 });
  }
  return t;
}

// 적립금
function addPoints(memberId, amount, reason, orderNo) {
  if (!memberId || !amount) return;
  db.prepare('INSERT INTO point_ledger (member_id,amount,reason,order_no,created_at) VALUES (?,?,?,?,?)').run(memberId, amount, reason || '', orderNo || '', now());
  db.prepare('UPDATE members SET points = MAX(0, points + ?) WHERE id=?').run(amount, memberId);
}

module.exports = { COOKIE, CART_COOKIE, signup, login, current, setCookie, clearCookie, changePw, cartToken, addPoints, byEmail, byId };
