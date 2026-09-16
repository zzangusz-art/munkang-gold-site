'use strict';
// 시세 모듈 — 금·은·백금 순도별 매입가/판매가(원/돈). 업서트·이력·통계·엑셀·계산기
const XLSX = require('xlsx');
const { db, getSetting } = require('../db');
const settings = require('./settings');
const { now, kstDate, addDays } = require('./util');

const DON = 3.75; // 1돈 = 3.75g
const OZ = 31.1034768; // 1 troy oz = 31.1035g
const METALS = { gold: '금', silver: '은', platinum: '백금' };
const METAL_LABEL = { gold: '금시세', silver: '은시세', platinum: '백금시세' };

// 기본 종목 정의(시드·엑셀 양식·계산기 순도 목록에 공통 사용)
const BASE = [
  { code: 'au999', metal: 'gold', name: '순금 24K', purity: '999.9', sort: 1, ratio: 1 },
  { code: 'au750', metal: 'gold', name: '18K', purity: '750', sort: 2, ratio: 0.735 },
  { code: 'au585', metal: 'gold', name: '14K', purity: '585', sort: 3, ratio: 0.57 },
  { code: 'pt999', metal: 'platinum', name: '백금(Pt) 999', purity: '999', sort: 5, ratio: 1 },
  { code: 'ag999', metal: 'silver', name: '은(Ag) 999', purity: '999', sort: 6, ratio: 1 },
];
const BASE_BY_CODE = Object.fromEntries(BASE.map(b => [b.code, b]));

const upsertStmt = db.prepare(`INSERT INTO quotes (code,metal,name,purity,buy,sell,prev_buy,prev_sell,sort,note,updated_at)
  VALUES (@code,@metal,@name,@purity,@buy,@sell,NULL,NULL,@sort,@note,@updated_at)
  ON CONFLICT(code) DO UPDATE SET
    name=COALESCE(NULLIF(excluded.name,''),quotes.name), metal=excluded.metal, purity=COALESCE(NULLIF(excluded.purity,''),quotes.purity),
    prev_buy=CASE WHEN excluded.buy IS NOT NULL AND excluded.buy<>quotes.buy THEN quotes.buy ELSE quotes.prev_buy END,
    prev_sell=CASE WHEN excluded.sell IS NOT NULL AND excluded.sell<>quotes.sell THEN quotes.sell ELSE quotes.prev_sell END,
    buy=COALESCE(excluded.buy,quotes.buy), sell=COALESCE(excluded.sell,quotes.sell),
    sort=COALESCE(excluded.sort,quotes.sort), note=COALESCE(NULLIF(excluded.note,''),quotes.note), updated_at=excluded.updated_at`);
const histStmt = db.prepare('INSERT INTO quote_history (quote_id,date,buy,sell) VALUES (?,?,?,?) ON CONFLICT(quote_id,date) DO UPDATE SET buy=excluded.buy, sell=excluded.sell');

function toInt(v) { if (v === null || v === undefined || v === '') return null; const n = Number(String(v).replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? Math.round(n) : null; }

// rows: [{code, metal?, name?, purity?, buy, sell, note?}]
function upsertRows(rows, date = kstDate()) {
  let n = 0; const ts = now();
  const tx = db.transaction((rs) => {
    for (const r of rs) {
      const base = BASE_BY_CODE[r.code] || {};
      upsertStmt.run({ code: r.code, metal: r.metal || base.metal || 'gold', name: r.name || base.name || r.code, purity: r.purity || base.purity || '', buy: r.buy ?? null, sell: r.sell ?? null, sort: r.sort ?? base.sort ?? 99, note: r.note || '', updated_at: ts });
      const q = db.prepare('SELECT id, buy, sell FROM quotes WHERE code=?').get(r.code);
      histStmt.run(q.id, date, q.buy, q.sell); n++;
    }
  });
  tx(rows); return n;
}
function logUpdate(source, { filename = null, rows = 0, by = 'system', detail = '' } = {}) {
  db.prepare('INSERT INTO quote_updates (source,filename,rows,by_admin,detail,created_at) VALUES (?,?,?,?,?,?)').run(source, filename, rows, by, detail, now());
}

// ── 조회 ──
function withChange(r) {
  const dBuy = (r.buy ?? 0) - (r.prev_buy ?? r.buy ?? 0); const dSell = (r.sell ?? 0) - (r.prev_sell ?? r.sell ?? 0);
  const pctBuy = r.prev_buy ? Math.round((dBuy / r.prev_buy) * 1000) / 10 : 0;
  const pctSell = r.prev_sell ? Math.round((dSell / r.prev_sell) * 1000) / 10 : 0;
  return { ...r, diff: dBuy, pct: pctBuy, diffSell: dSell, pctSell, buyG: r.buy ? Math.round(r.buy / DON) : null, sellG: r.sell ? Math.round(r.sell / DON) : null, label: METALS[r.metal] || r.metal };
}
function list(metal) { return db.prepare(`SELECT * FROM quotes${metal ? ' WHERE metal=?' : ''} ORDER BY sort, id`).all(...(metal ? [metal] : [])).map(withChange); }
function byCode(code) { const r = db.prepare('SELECT * FROM quotes WHERE code=?').get(code); return r ? withChange(r) : null; }
function history(quoteId, days = 90) { return db.prepare('SELECT date, buy, sell FROM quote_history WHERE quote_id=? AND date>=? ORDER BY date').all(quoteId, addDays(kstDate(), -days)); }
function lastUpdated() { return db.prepare('SELECT MAX(updated_at) m FROM quotes').get().m; }
function updatedText() { const u = lastUpdated(); if (!u) return kstDate(); const d = new Date(u * 1000); const p = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d); return p; }
function gold() { return byCode('au999'); }
function stats() {
  const rows = list(); const g = byCode('au999'); const s = byCode('ag999'); const p = byCode('pt999');
  const hist = g ? history(g.id, 30) : [];
  const first = hist.find(h => h.buy != null); const last = hist.length ? hist[hist.length - 1] : null;
  const m30 = first && last && first.buy ? Math.round(((last.buy - first.buy) / first.buy) * 1000) / 10 : 0;
  const buys = hist.map(h => h.buy).filter(v => v != null);
  return { gold: g, silver: s, platinum: p, rows, lastUpdated: lastUpdated(), updatedText: updatedText(), m30, hi30: buys.length ? Math.max(...buys) : null, lo30: buys.length ? Math.min(...buys) : null, up: rows.filter(r => r.diff > 0).length, down: rows.filter(r => r.diff < 0).length, flat: rows.filter(r => r.diff === 0).length };
}

// ── 계산기: 순도·중량 → 예상 매입가 ──
function calc({ code, weight_g, unit = 'g', weight }) {
  const q = byCode(code); if (!q || !q.buy) return null;
  let g = Number(weight_g);
  if (!Number.isFinite(g) && weight != null) { const w = Number(weight); g = unit === 'don' ? w * DON : unit === 'oz' ? w * OZ : w; }
  if (!Number.isFinite(g) || g <= 0) return null;
  const perG = q.buy / DON; const total = Math.round(perG * g);
  return { code, name: q.name, purity: q.purity, weight_g: Math.round(g * 100) / 100, weight_don: Math.round(g / DON * 100) / 100, per_g: Math.round(perG), per_don: q.buy, total, basis: updatedText(), note: settings.cfg('quote_note') };
}

// ── 제품 가격: (판매가/g × 순중량 + 공임) × (1+마진) + 스톤 옵션 ──
// 주얼리는 14K 고시 중량으로 등록하고, 18K를 고르면 중량 × 1.2로 계산한다(매장 정책).
const K18 = 1.2;
function stoneOptions(p) {
  try { const a = JSON.parse(p.stone_json || '[]'); return Array.isArray(a) ? a.filter(x => x && x.name).map(x => ({ name: String(x.name), add: Number(x.add) || 0 })) : []; }
  catch (_) { return []; }
}
function productPrice(p, opts = {}) {
  const is18 = !!(p.karat_option && opts.karat === '18k');
  const add = Number(opts.stoneAdd) || 0;
  const weight = (p.weight_g || 0) * (is18 ? K18 : 1);
  if (p.price_fixed) return { price: p.price_fixed + add, basis: null, fixed: true, weight_g: weight, is18 };
  const q = p.quote_code ? byCode(p.quote_code) : null;
  const per = q ? ((q.sell || q.buy) / DON) : null; if (!per || !p.weight_g) return { price: null, basis: null, weight_g: weight, is18 };
  const margin = (p.margin_pct == null || p.margin_pct === '') ? settings.num('margin_pct') : Number(p.margin_pct);
  const price = Math.round((per * weight + (p.labor || 0)) * (1 + margin / 100) / 100) * 100 + add;
  return { price, basis: updatedText(), fixed: false, per_g: Math.round(per), quote: q, weight_g: Math.round(weight * 1000) / 1000, is18 };
}

// ── 국제 시세 → 국내 환산(원/g) ──
function spot() {
  const xau = Number(getSetting('spot_xau_usd')) || null; const xag = Number(getSetting('spot_xag_usd')) || null; const xpt = Number(getSetting('spot_xpt_usd')) || null; const fx = Number(getSetting('spot_usdkrw')) || null;
  const at = getSetting('spot_updated_at') || ''; const src = getSetting('spot_source') || '';
  const conv = (usdOz) => (usdOz && fx) ? Math.round(usdOz / OZ * fx) : null;
  return { xau, xag, xpt, usdkrw: fx, gold_krw_g: conv(xau), gold_krw_don: conv(xau) ? conv(xau) * DON : null, silver_krw_g: conv(xag), platinum_krw_g: conv(xpt), updated_at: at, source: src, available: !!(xau && fx) };
}
// 국제시세 기준 순금 매입/판매 자동 계산(설정 ON일 때 스케줄러가 호출)
function applySpotToQuotes(by = 'spot') {
  const sp = spot(); if (!sp.available) return 0;
  const buySp = settings.num('spot_buy_spread_pct'), sellSp = settings.num('spot_sell_spread_pct');
  const base = sp.gold_krw_don; const rows = [];
  for (const b of BASE.filter(x => x.metal === 'gold')) rows.push({ code: b.code, buy: Math.round(base * b.ratio * (1 - buySp / 100) / 100) * 100, sell: b.code === 'au999' ? Math.round(base * (1 + sellSp / 100) / 100) * 100 : null });
  if (sp.silver_krw_g) rows.push({ code: 'ag999', buy: Math.round(sp.silver_krw_g * DON * (1 - buySp / 100) / 10) * 10, sell: Math.round(sp.silver_krw_g * DON * (1 + sellSp / 100) / 10) * 10 });
  if (sp.platinum_krw_g) rows.push({ code: 'pt999', buy: Math.round(sp.platinum_krw_g * DON * (1 - buySp / 100) / 100) * 100, sell: null });
  const n = upsertRows(rows); logUpdate('spot', { rows: n, by, detail: `XAU ${sp.xau} · USDKRW ${sp.usdkrw}` }); return n;
}

// ── 엑셀 ──
function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' }); const out = []; const errors = [];
  const ws = wb.Sheets[wb.SheetNames[0]]; const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let hi = data.findIndex(r => r.some(c => /코드|code|종목|품목/i.test(String(c)))); if (hi < 0) hi = 0;
  const header = data[hi].map(c => String(c).trim()); const col = (re) => header.findIndex(h => re.test(h));
  const cCode = col(/코드|code/i), cName = col(/종목|품목|name/i), cBuy = col(/매입/i), cSell = col(/판매/i), cNote = col(/비고|note/i);
  if (cCode < 0 && cName < 0) return { rows: [], errors: ['코드 또는 종목 열을 찾지 못했습니다.'] };
  for (let i = hi + 1; i < data.length; i++) {
    const r = data[i]; const codeRaw = cCode >= 0 ? String(r[cCode] || '').trim() : ''; const name = cName >= 0 ? String(r[cName] || '').trim() : '';
    if (!codeRaw && !name) continue;
    let code = codeRaw || BASE.find(b => b.name === name)?.code; if (!code) { errors.push(`${i + 1}행 "${name}": 코드를 알 수 없음(양식의 코드 열 사용)`); continue; }
    const buy = cBuy >= 0 ? toInt(r[cBuy]) : null; const sell = cSell >= 0 ? toInt(r[cSell]) : null;
    if (buy === null && sell === null) { errors.push(`${i + 1}행 ${code}: 매입가·판매가 모두 비어 있음`); continue; }
    out.push({ code, name: name || undefined, buy, sell, note: cNote >= 0 ? String(r[cNote] || '') : '' });
  }
  return { rows: out, errors };
}
function buildTemplate() {
  const wb = XLSX.utils.book_new(); const rows = list();
  const aoa = [['코드', '종목', '매입가(원/돈)', '판매가(원/돈)', '비고']];
  for (const b of BASE) { const r = rows.find(x => x.code === b.code); aoa.push([b.code, b.name, r?.buy ?? '', r?.sell ?? '', r?.note ?? '']); }
  const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = [{ wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws, '시세');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { DON, OZ, METALS, METAL_LABEL, BASE, BASE_BY_CODE, upsertRows, logUpdate, list, byCode, history, stats, gold, lastUpdated, updatedText, calc, productPrice, stoneOptions, K18, spot, applySpotToQuotes, parseWorkbook, buildTemplate, withChange };
