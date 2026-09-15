'use strict';
// 국제 금·은·백금 시세(USD/oz) + USD/KRW 환율 자동 조회 — 참고 표시·(설정 시) 순금 시세 자동 계산용.
// 무료·키 없는 공개 엔드포인트를 쓰며, 실패하면 조용히 건너뛴다(마지막 성공값 유지). 운영 시 유료 API로 교체 가능.
const { db, getSetting, setSetting } = require('../db');
const { now, kstDate, kstDateTime } = require('./util');

const SOURCES = {
  metals: [
    { name: 'gold-api.com', fetch: async (sym) => { const r = await get(`https://api.gold-api.com/price/${sym}`); return Number(r?.price) || null; } },
  ],
  fx: [
    { name: 'open.er-api.com', fetch: async () => { const r = await get('https://open.er-api.com/v6/latest/USD'); return Number(r?.rates?.KRW) || null; } },
    { name: 'frankfurter.dev', fetch: async () => { const r = await get('https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW'); return Number(r?.rates?.KRW) || null; } },
  ],
};
async function get(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'munkang-site/1.0' } }); if (!r.ok) throw new Error(`${r.status}`); return await r.json(); } finally { clearTimeout(t); }
}

async function refresh() {
  if (getSetting('spot_fetch', '1') !== '1') return { skipped: true };
  const out = { xau: null, xag: null, xpt: null, usdkrw: null, source: [] };
  for (const s of SOURCES.metals) {
    try { out.xau = await s.fetch('XAU'); out.xag = await s.fetch('XAG'); try { out.xpt = await s.fetch('XPT'); } catch (_) { /* 선택 */ } if (out.xau) { out.source.push(s.name); break; } } catch (e) { /* 다음 소스 */ }
  }
  for (const s of SOURCES.fx) { try { out.usdkrw = await s.fetch(); if (out.usdkrw) { out.source.push(s.name); break; } } catch (_) { /* 다음 */ } }
  if (!out.xau || !out.usdkrw) return { ok: false, error: '국제 시세 또는 환율 조회 실패', partial: out };
  setSetting('spot_xau_usd', out.xau); setSetting('spot_xag_usd', out.xag || ''); setSetting('spot_xpt_usd', out.xpt || ''); setSetting('spot_usdkrw', out.usdkrw);
  setSetting('spot_updated_at', kstDateTime()); setSetting('spot_source', out.source.join('+'));
  db.prepare('INSERT INTO spot_history (date,xau,xag,xpt,usdkrw,source,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET xau=excluded.xau, xag=excluded.xag, xpt=excluded.xpt, usdkrw=excluded.usdkrw, source=excluded.source, created_at=excluded.created_at')
    .run(kstDate(), out.xau, out.xag, out.xpt, out.usdkrw, out.source.join('+'), now());
  return { ok: true, ...out };
}
function history(days = 90) { return db.prepare('SELECT * FROM spot_history WHERE date>=? ORDER BY date').all(require('./util').addDays(kstDate(), -days)); }

module.exports = { refresh, history };
