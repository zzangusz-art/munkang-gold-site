'use strict';
// 실시간 시세 크롤링 — 한국금거래소 공개 시세(고시가 + 국제 시세)를 주기적으로 가져와 시세표에 반영한다.
// 반영 방식(quote_source): live = 크롤링 값 자동 반영(기본) · spot = 국제시세 환산 · manual = 관리자 직접 입력
// 요청 폭주를 막기 위해 최소 간격(MIN_GAP) 안에서는 캐시를 돌려준다. 실패하면 마지막 성공값을 유지한다.
const { db, getSetting, setSetting } = require('../db');
const settings = require('./settings');
const quotes = require('./quotes');
const { now, kstDate, kstDateTime } = require('./util');

const SRC_URL = 'https://www.koreagoldx.co.kr/api/main';
const MIN_GAP = 60 * 1000;
let cache = null; let lastTry = 0; let inflight = null;

async function getJson(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; munkang-site/1.0)', Accept: 'application/json', Referer: 'https://www.koreagoldx.co.kr/' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json();
  } finally { clearTimeout(t); }
}

// 원/돈 기준 종목 값으로 변환
function parse(j) {
  const o = j && j.officialPrice4; if (!o || !o.p_pure) throw new Error('고시가 데이터 형식이 바뀌었습니다');
  const n = (v) => (v == null || v === '' ? null : Number(v));
  const row = (code, buy, sell, dBuy, dSell) => ({ code, buy: n(buy), sell: n(sell), prev_buy: buy != null && dBuy != null ? n(buy) - n(dBuy) : null, prev_sell: sell != null && dSell != null ? n(sell) - n(dSell) : null });
  const rows = [
    row('au999', o.p_pure, o.s_pure, o.turm_p_pure, o.turm_s_pure),
    row('au750', o.p_18k, o.s_18k, o.turm_p_18k, o.turm_s_18k),
    row('au585', o.p_14k, o.s_14k, o.turm_p_14k, o.turm_s_14k),
    row('pt999', o.p_white, o.s_white, o.turm_p_white, o.turm_s_white),
    row('ag999', o.p_silver, o.s_silver, o.turm_p_silver, o.turm_s_silver),
  ];
  const pure = rows[0];
  rows.push({ code: 'au916', buy: Math.round(pure.buy * 0.916 / 100) * 100, sell: null, prev_buy: pure.prev_buy ? Math.round(pure.prev_buy * 0.916 / 100) * 100 : null, prev_sell: null });
  const m = Object.fromEntries((j.marketPriceList || []).map(x => [String(x.type).toLowerCase(), x]));
  const intl = m.au ? { xau: m.au.ask, xag: m.ag ? m.ag.ask : null, xpt: m.pt ? m.pt.ask : null, usdkrw: m.au.priceGram && m.au.ask ? Math.round(m.au.priceGram * quotes.OZ / m.au.ask * 10) / 10 : null, at: m.au.date } : null;
  return { rows, officialAt: o.date, intl };
}

// 매장 조정률(%) 적용 — 매입가·판매가를 크롤링 값 대비 가감
function adjust(rows) {
  const b = settings.num('live_buy_adj_pct'); const s = settings.num('live_sell_adj_pct');
  const round = (v, code) => { if (v == null) return null; const unit = code === 'ag999' ? 10 : 100; return Math.round(v / unit) * unit; };
  return rows.map(r => ({
    ...r,
    buy: round(r.buy != null ? r.buy * (1 + b / 100) : null, r.code), sell: round(r.sell != null ? r.sell * (1 + s / 100) : null, r.code),
    prev_buy: round(r.prev_buy != null ? r.prev_buy * (1 + b / 100) : null, r.code), prev_sell: round(r.prev_sell != null ? r.prev_sell * (1 + s / 100) : null, r.code),
  }));
}

const updStmt = db.prepare('UPDATE quotes SET buy=@buy, sell=@sell, prev_buy=@prev_buy, prev_sell=@prev_sell, updated_at=@ts WHERE code=@code');
const histStmt = db.prepare('INSERT INTO quote_history (quote_id,date,buy,sell) VALUES (?,?,?,?) ON CONFLICT(quote_id,date) DO UPDATE SET buy=excluded.buy, sell=excluded.sell');
const curStmt = db.prepare('SELECT id, buy, sell FROM quotes WHERE code=?');

function applyToQuotes(rows, by = 'live') {
  const ts = now(); const date = kstDate(); let changed = 0;
  db.transaction(() => {
    for (const r of rows) {
      const cur = curStmt.get(r.code); if (!cur || r.buy == null) continue;
      if (cur.buy !== r.buy || cur.sell !== r.sell) changed++;
      updStmt.run({ code: r.code, buy: r.buy, sell: r.sell, prev_buy: r.prev_buy, prev_sell: r.prev_sell, ts });
      histStmt.run(cur.id, date, r.buy, r.sell);
    }
  })();
  if (changed) quotes.logUpdate('live', { rows: changed, by, detail: '한국금거래소 고시가 크롤링' });
  return changed;
}

async function refresh({ force = false, by = 'live' } = {}) {
  if (!force && cache && Date.now() - lastTry < MIN_GAP) return cache;
  if (inflight) return inflight;
  lastTry = Date.now();
  inflight = (async () => {
    try {
      const parsed = parse(await getJson(SRC_URL));
      const rows = adjust(parsed.rows);
      const mode = settings.cfg('quote_source');
      const changed = mode === 'live' ? applyToQuotes(rows, by) : 0;
      if (parsed.intl && parsed.intl.xau && parsed.intl.usdkrw) {
        setSetting('spot_xau_usd', parsed.intl.xau); setSetting('spot_xag_usd', parsed.intl.xag || ''); setSetting('spot_xpt_usd', parsed.intl.xpt || ''); setSetting('spot_usdkrw', parsed.intl.usdkrw);
        setSetting('spot_updated_at', kstDateTime()); setSetting('spot_source', '한국금거래소');
      }
      setSetting('live_fetched_at', String(now())); setSetting('live_official_at', parsed.officialAt || ''); setSetting('live_error', '');
      cache = { ok: true, mode, changed, rows, officialAt: parsed.officialAt, intl: parsed.intl, fetchedAt: now() };
    } catch (e) {
      setSetting('live_error', `${kstDateTime()} ${e.message}`.slice(0, 200));
      cache = { ...(cache || {}), ok: false, error: e.message };
    } finally { inflight = null; }
    return cache;
  })();
  return inflight;
}

function status() {
  return { mode: settings.cfg('quote_source'), fetchedAt: Number(getSetting('live_fetched_at')) || null, officialAt: getSetting('live_official_at') || '', error: getSetting('live_error') || '', intervalMin: settings.num('live_interval_min') || 3 };
}
// 스케줄러에서 매분 호출 — 설정 간격이 지났으면 갱신
async function tick() {
  if (settings.cfg('quote_source') !== 'live') return;
  const last = Number(getSetting('live_fetched_at')) || 0; const gap = Math.max(1, settings.num('live_interval_min') || 3) * 60;
  if (now() - last >= gap) await refresh({ force: true, by: 'scheduler' });
}

module.exports = { refresh, tick, status, parse };
