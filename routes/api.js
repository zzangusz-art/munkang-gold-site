'use strict';
// 공개 API — 시세 JSON(AI/개발자용) · 이력 · 계산기 · 국제시세 · 문의 접수
const express = require('express');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const quotes = require('../lib/quotes');
const { now, kstDate, isoFromTs } = require('../lib/util');
const settings = require('../lib/settings');

const router = express.Router();
const meta = () => ({ source: settings.cfg('legal_name'), site: settings.siteUrl(), unit: '원/돈(3.75g)', updated: quotes.lastUpdated() ? isoFromTs(quotes.lastUpdated()) : null, basis: quotes.updatedText(), date: kstDate(), note: settings.cfg('quote_note') + ' 출처 표기: 문강금은(' + settings.siteUrl() + '/price)' });

router.get('/prices', (req, res) => {
  const metal = ['gold', 'silver', 'platinum'].includes(req.query.metal) ? req.query.metal : null;
  const rows = quotes.list(metal);
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ ...meta(), count: rows.length, items: rows.map(r => ({ id: r.id, code: r.code, metal: r.metal, name: r.name, purity: r.purity, buy_per_don: r.buy, buy_per_g: r.buyG, sell_per_don: r.sell, sell_per_g: r.sellG, prev_buy: r.prev_buy, diff: r.diff, pct: r.pct })) });
});
router.get('/prices/:code/history', (req, res) => {
  const q = quotes.byCode(req.params.code); if (!q) return res.status(404).json({ error: 'not found' });
  const days = Math.min(365, Math.max(7, parseInt(req.query.days || '90', 10) || 90));
  res.set('Cache-Control', 'public, max-age=600');
  res.json({ code: q.code, name: q.name, unit: '원/돈', history: quotes.history(q.id, days) });
});
router.get('/spot', (req, res) => { res.set('Cache-Control', 'public, max-age=300'); res.json({ ...quotes.spot(), history: require('../lib/spot').history(30) }); });
// 실시간 시세 — 홈 시세판·티커가 60초마다 호출. 서버는 최소 60초 간격으로만 원본을 다시 수집한다.
router.get('/live', async (req, res) => {
  const live = require('../lib/live');
  if (settings.cfg('quote_source') === 'live') await live.refresh();
  const st = quotes.stats(); const sp = quotes.spot();
  res.set('Cache-Control', 'no-store');
  res.json({ mode: settings.cfg('quote_source'), updatedText: st.updatedText, updated: st.lastUpdated ? isoFromTs(st.lastUpdated) : null, official: live.status().officialAt, items: st.rows.map(r => ({ code: r.code, name: r.name, buy: r.buy, sell: r.sell, diff: r.diff, pct: r.pct, buyG: r.buyG })), intl: sp.available ? { xau: sp.xau, usdkrw: sp.usdkrw } : null });
});
router.get('/calc', (req, res) => {
  const r = quotes.calc({ code: String(req.query.code || 'au999'), weight: Number(req.query.weight), unit: String(req.query.unit || 'g') });
  if (!r) return res.status(400).json({ error: '순도 코드와 중량(양수)을 확인하세요.' });
  res.json(r);
});

const inqLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false, message: { error: '요청이 많습니다. 잠시 후 다시 시도해 주세요.' } });
router.post('/inquiry', inqLimit, (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 40); const phone = String(b.phone || '').trim().slice(0, 25);
  if (!name || !phone) return res.status(400).json({ error: '성함과 연락처를 입력해 주세요.' });
  if (!/^[\d\s\-+().]{8,25}$/.test(phone)) return res.status(400).json({ error: '연락처 형식을 확인해 주세요.' });
  if (!b.agree) return res.status(400).json({ error: '개인정보 수집·이용에 동의해 주세요.' });
  if (b.website) return res.json({ ok: true });
  const kind = ['sell', 'buy', 'visit', 'consult'].includes(b.kind) ? b.kind : 'consult';
  const ts = now();
  const info = db.prepare('INSERT INTO inquiries (kind,category,name,phone,email,item,weight,message,agree,ip,ua,referrer,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?,?,?,?)')
    .run(kind, String(b.category || '').slice(0, 30), name, phone, String(b.email || '').slice(0, 80), String(b.item || '').slice(0, 120), String(b.weight || '').slice(0, 40), String(b.message || '').slice(0, 1500), (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].slice(0, 45), String(req.headers['user-agent'] || '').slice(0, 200), String(req.headers.referer || '').slice(0, 200), ts, ts);
  res.json({ ok: true, id: info.lastInsertRowid, message: '접수되었습니다. 영업시간 내 담당자가 바로 연락드립니다. 급하시면 ' + settings.cfg('phone') + '로 전화 주세요.' });
});

module.exports = { router };
