'use strict';
// 실시간 시세 — 3분마다 수집해 시세표에 반영한다.
// ① 한국금거래소 공개 시세(고시가 + 전일비). 해외 서버(Railway 등) IP는 403으로 막히는 경우가 많다.
// ② ①이 막히면 국제 시세(gold-api.com, 달러/온스) × 환율로 원/돈을 구하고, 한국금거래소 매입·판매 비율(factors)을 곱해 계산한다.
//    factors는 기본값(2026-09-15 실측)으로 시작하고, ①이 성공할 때마다 그날 값으로 다시 학습한다.
// 반영 방식(quote_source): live = 자동 반영(기본) · spot = 국제시세 환산(하루 2회) · manual = 직접 입력
const { db, getSetting, setSetting } = require('../db');
const settings = require('./settings');
const quotes = require('./quotes');
const { now, kstDate, kstDateTime } = require('./util');

const KGX_URL = 'https://www.koreagoldx.co.kr/api/main';
const MIN_GAP = 60 * 1000;
const DON = quotes.DON; const OZ = quotes.OZ;
// 국제 환산가(원/돈) 대비 한국금거래소 가격 비율 — 2026-09-15 16:59 고시 기준 실측
const DEFAULT_FACTORS = {
  au: { p_pure: 0.9983, s_pure: 1.1746, p_18k: 0.7338, s_18k: 0.8633, p_14k: 0.5691, s_14k: 0.6695 },
  pt: { p: 0.9349, s: 1.1514 },
  ag: { p: 0.9283, s: 1.1149 },
};
let cache = null; let lastTry = 0; let inflight = null;

async function getJson(url, headers = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', Accept: 'application/json, text/plain, */*', 'Accept-Language': 'ko-KR,ko;q=0.9', ...headers } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json();
  } finally { clearTimeout(t); }
}
const json = (k, d) => { try { return JSON.parse(getSetting(k) || '') || d; } catch (_) { return d; } };
const r100 = (v, code) => { if (v == null || !Number.isFinite(v)) return null; const unit = code === 'ag999' ? 10 : 100; return Math.round(v / unit) * unit; };

// ── ① 한국금거래소 ──
function parseKgx(j) {
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
  const m = Object.fromEntries((j.marketPriceList || []).map(x => [String(x.type).toLowerCase(), x]));
  const intl = m.au ? { xau: m.au.ask, xag: m.ag ? m.ag.ask : null, xpt: m.pt ? m.pt.ask : null, usdkrw: m.au.priceGram && m.au.ask ? Math.round(m.au.priceGram * OZ / m.au.ask * 10) / 10 : null } : null;
  // 비율 학습: 국제 환산 원/돈 대비 고시가
  if (m.au && m.au.priceGram && m.ag && m.pt) {
    const au = m.au.priceGram * DON, ag = m.ag.priceGram * DON, pt = m.pt.priceGram * DON; const f = (v, b) => Math.round(v / b * 10000) / 10000;
    setSetting('live_factors', JSON.stringify({ au: { p_pure: f(o.p_pure, au), s_pure: f(o.s_pure, au), p_18k: f(o.p_18k, au), s_18k: f(o.s_18k, au), p_14k: f(o.p_14k, au), s_14k: f(o.s_14k, au) }, pt: { p: f(o.p_white, pt), s: f(o.s_white, pt) }, ag: { p: f(o.p_silver, ag), s: f(o.s_silver, ag) }, learnedAt: o.date }));
  }
  return { rows, officialAt: o.date, intl, source: '한국금거래소' };
}

// ── ② 국제 시세 × 환율 × 비율 ──
async function fetchIntl() {
  const metal = async (sym) => Number((await getJson(`https://api.gold-api.com/price/${sym}`)).price) || null;
  const [xau, xag, xpt] = await Promise.all([metal('XAU'), metal('XAG').catch(() => null), metal('XPT').catch(() => null)]);
  let usdkrw = null;
  for (const u of ['https://open.er-api.com/v6/latest/USD', 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW']) { try { usdkrw = Number((await getJson(u)).rates.KRW) || null; if (usdkrw) break; } catch (_) { /* 다음 */ } }
  if (!xau || !usdkrw) throw new Error('국제 시세 또는 환율 조회 실패');
  const don = (usdOz) => usdOz ? usdOz / OZ * usdkrw * DON : null;
  const base = { au: don(xau), ag: don(xag), pt: don(xpt) };
  // 전일비: 전날 마지막 기준값(원/돈)으로 계산. 기록이 없으면 보합.
  const today = kstDate(); const bases = json('live_bases', {});
  bases[today] = base; const days = Object.keys(bases).sort(); while (days.length > 10) delete bases[days.shift()];
  setSetting('live_bases', JSON.stringify(bases));
  const prevDay = Object.keys(bases).sort().filter(d => d < today).pop(); const pb = prevDay ? bases[prevDay] : base;
  const F = json('live_factors', DEFAULT_FACTORS);
  const mk = (code, b, p, fb, fs) => ({ code, buy: b[p] != null ? b[p] * fb : null, sell: b[p] != null && fs != null ? b[p] * fs : null });
  const build = (b) => [
    mk('au999', b, 'au', F.au.p_pure, F.au.s_pure), mk('au750', b, 'au', F.au.p_18k, F.au.s_18k), mk('au585', b, 'au', F.au.p_14k, F.au.s_14k),
    mk('pt999', b, 'pt', F.pt.p, F.pt.s), mk('ag999', b, 'ag', F.ag.p, F.ag.s),
  ];
  const cur = build(base); const prev = build(pb);
  const rows = cur.map((r, i) => ({ ...r, prev_buy: prev[i].buy, prev_sell: prev[i].sell }));
  return { rows, officialAt: '', intl: { xau, xag, xpt, usdkrw }, source: '국제시세 환산' };
}

// 22K 추가 + 매장 조정률(%) 적용 + 반올림
function finalize(rows) {
  const pure = rows.find(r => r.code === 'au999');
  const all = [...rows, { code: 'au916', buy: pure.buy * 0.916, sell: null, prev_buy: pure.prev_buy != null ? pure.prev_buy * 0.916 : null, prev_sell: null }];
  const b = settings.num('live_buy_adj_pct'); const s = settings.num('live_sell_adj_pct');
  const adj = (v, pct) => (v == null ? null : v * (1 + pct / 100));
  return all.map(r => ({ code: r.code, buy: r100(adj(r.buy, b), r.code), sell: r100(adj(r.sell, s), r.code), prev_buy: r100(adj(r.prev_buy, b), r.code), prev_sell: r100(adj(r.prev_sell, s), r.code) }));
}

const updStmt = db.prepare('UPDATE quotes SET buy=@buy, sell=@sell, prev_buy=@prev_buy, prev_sell=@prev_sell, updated_at=@ts WHERE code=@code');
const histStmt = db.prepare('INSERT INTO quote_history (quote_id,date,buy,sell) VALUES (?,?,?,?) ON CONFLICT(quote_id,date) DO UPDATE SET buy=excluded.buy, sell=excluded.sell');
const curStmt = db.prepare('SELECT id, buy, sell FROM quotes WHERE code=?');

function applyToQuotes(rows, by, source) {
  const ts = now(); const date = kstDate(); let changed = 0;
  db.transaction(() => {
    for (const r of rows) {
      const cur = curStmt.get(r.code); if (!cur || r.buy == null) continue;
      if (cur.buy !== r.buy || cur.sell !== r.sell) changed++;
      updStmt.run({ code: r.code, buy: r.buy, sell: r.sell, prev_buy: r.prev_buy, prev_sell: r.prev_sell, ts });
      histStmt.run(cur.id, date, r.buy, r.sell);
    }
  })();
  if (changed) quotes.logUpdate('live', { rows: changed, by, detail: source });
  return changed;
}

async function refresh({ force = false, by = 'live' } = {}) {
  if (!force && cache && Date.now() - lastTry < MIN_GAP) return cache;
  if (inflight) return inflight;
  lastTry = Date.now();
  inflight = (async () => {
    const errors = [];
    try {
      let got = null;
      try { got = parseKgx(await getJson(KGX_URL, { Referer: 'https://www.koreagoldx.co.kr/', Origin: 'https://www.koreagoldx.co.kr' })); } catch (e) { errors.push(`한국금거래소 ${e.message}`); }
      if (!got) got = await fetchIntl();
      const rows = finalize(got.rows);
      const mode = settings.cfg('quote_source');
      const changed = mode === 'live' ? applyToQuotes(rows, by, got.source) : 0;
      if (got.intl && got.intl.xau && got.intl.usdkrw) {
        setSetting('spot_xau_usd', got.intl.xau); setSetting('spot_xag_usd', got.intl.xag || ''); setSetting('spot_xpt_usd', got.intl.xpt || ''); setSetting('spot_usdkrw', got.intl.usdkrw);
        setSetting('spot_updated_at', kstDateTime()); setSetting('spot_source', got.source === '한국금거래소' ? '한국금거래소' : 'gold-api.com');
      }
      setSetting('live_fetched_at', String(now())); setSetting('live_official_at', got.officialAt || ''); setSetting('live_source', got.source);
      setSetting('live_error', errors.length ? `${kstDateTime()} ${errors.join(' / ')} → ${got.source} 사용` : '');
      cache = { ok: true, mode, changed, rows, source: got.source, officialAt: got.officialAt, intl: got.intl, fetchedAt: now() };
    } catch (e) {
      errors.push(e.message);
      setSetting('live_error', `${kstDateTime()} ${errors.join(' / ')}`.slice(0, 200));
      cache = { ...(cache || {}), ok: false, error: errors.join(' / ') };
    } finally { inflight = null; }
    return cache;
  })();
  return inflight;
}

function status() {
  return { mode: settings.cfg('quote_source'), source: getSetting('live_source') || '', fetchedAt: Number(getSetting('live_fetched_at')) || null, officialAt: getSetting('live_official_at') || '', error: getSetting('live_error') || '', intervalMin: settings.num('live_interval_min') || 3 };
}
// 스케줄러에서 매분 호출 — 설정 간격이 지났으면 갱신
async function tick() {
  if (settings.cfg('quote_source') !== 'live') return;
  const last = Number(getSetting('live_fetched_at')) || 0; const gap = Math.max(1, settings.num('live_interval_min') || 3) * 60;
  if (now() - last >= gap) await refresh({ force: true, by: 'scheduler' });
}

module.exports = { refresh, tick, status, parseKgx, fetchIntl, DEFAULT_FACTORS };
