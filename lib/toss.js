'use strict';
// 토스페이먼츠 결제위젯(V2) 서버 측 — 결제 승인·취소
// 키는 관리자 > 쇼핑몰 설정(pg_client_key / pg_secret_key)에 넣는다. 시크릿 키는 서버에서만 쓴다.
const settings = require('./settings');

const API = 'https://api.tosspayments.com/v1/payments';

const clientKey = () => String(settings.cfg('pg_client_key') || '').trim();
const secretKey = () => String(settings.cfg('pg_secret_key') || '').trim();
const enabled = () => !!(clientKey() && secretKey());
const isTest = () => clientKey().startsWith('test_');
const cardMax = () => Number(settings.cfg('card_max_amount')) || 5000000;
const auth = () => 'Basic ' + Buffer.from(secretKey() + ':').toString('base64');

async function call(path, body) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await r.json(); } catch (_) { data = {}; }
  return { ok: r.ok, status: r.status, data };
}

// 결제 승인 — successUrl에서 받은 값으로 호출(요청 후 10분 이내)
const confirm = ({ paymentKey, orderId, amount }) => call('/confirm', { paymentKey, orderId, amount: Number(amount) });
// 결제 취소(전액 또는 부분)
const cancel = (paymentKey, reason, cancelAmount) => call(`/${encodeURIComponent(paymentKey)}/cancel`, { cancelReason: reason || '고객 요청', ...(cancelAmount ? { cancelAmount } : {}) });

module.exports = { clientKey, enabled, isTest, cardMax, confirm, cancel };
