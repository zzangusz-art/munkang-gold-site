'use strict';
// 스케줄러(KST) — ① 매일 2슬롯 콘텐츠 자동 생성·발행(멱등) ② 국제 시세 조회(+설정 시 순금 시세 자동 계산) ③ 매일 시세 스냅샷·기술 감사 ④ 매주(킥오프 요일) 주간 리포트·전후 스크린샷
const { db, getSetting, setSetting } = require('../db');
const { now, kstParts, kstDate } = require('./util');
const { generateOne } = require('./content/generate');
const report = require('./report');
const shot = require('./screenshot');
const auth = require('./auth');
const spot = require('./spot');
const quotes = require('./quotes');
const live = require('./live');
const youtube = require('./youtube');
const settings = require('./settings');

let timer = null; let auditRunner = null;

function slots() { return String(getSetting('gen_times', '09:00,15:00')).split(',').map(s => s.trim()).filter(Boolean); }
function alreadyRan(date, slot) { return !!db.prepare('SELECT 1 FROM gen_runs WHERE run_date=? AND slot=?').get(date, slot); }

async function runSlot(date, slot) {
  try { db.prepare('INSERT INTO gen_runs (run_date,slot,status,created_at) VALUES (?,?,?,?)').run(date, slot, 'running', now()); } catch (_) { return; }
  try {
    const { post, autoPublished, inblog, type } = await generateOne({ slot });
    db.prepare('UPDATE gen_runs SET status=?, post_id=?, detail=? WHERE run_date=? AND slot=?').run('ok', post.id, `${type}/${autoPublished ? 'published' : 'draft'}/inblog:${inblog.ok ? 'ok' : inblog.skipped ? 'skip' : 'err'}`, date, slot);
    console.log(`[scheduler] ${date} ${slot} 생성 완료: "${post.title}"`);
  } catch (e) {
    const fails = db.prepare("SELECT COUNT(*) c FROM gen_runs WHERE run_date=? AND slot LIKE ? AND status='failed'").get(date, slot + '#%').c;
    db.prepare('DELETE FROM gen_runs WHERE run_date=? AND slot=?').run(date, slot);
    if (fails < 3) db.prepare('INSERT INTO gen_runs (run_date,slot,status,detail,created_at) VALUES (?,?,?,?,?)').run(date, `${slot}#${fails + 1}`, 'failed', String(e.message).slice(0, 300), now());
    else db.prepare('INSERT INTO gen_runs (run_date,slot,status,detail,created_at) VALUES (?,?,?,?,?)').run(date, slot, 'failed', '3회 실패: ' + String(e.message).slice(0, 250), now());
    console.error(`[scheduler] ${date} ${slot} 생성 실패(${fails + 1}회): ${e.message}`);
  }
}

// 시세 일별 스냅샷(갱신 없는 날도 이력 유지 → 90일 추이 연속)
function snapshotQuotes(date) {
  if (getSetting('snap_' + date)) return;
  db.prepare('INSERT OR IGNORE INTO quote_history (quote_id,date,buy,sell) SELECT id, ?, buy, sell FROM quotes').run(date);
  setSetting('snap_' + date, '1');
}
// 국제 시세: 08:30·13:30 두 번 조회. 설정 ON이면 순금·은 시세를 자동 계산해 반영
async function spotJobs(date) {
  if (settings.cfg('quote_source') === 'live') return; // 실시간 모드에서는 live.js가 국제 시세까지 함께 수집
  const { hm } = kstParts();
  for (const t of ['08:30', '13:30']) {
    const key = `spot_${date}_${t}`; if (hm < t || getSetting(key)) continue;
    setSetting(key, '1');
    try { const r = await spot.refresh(); if (r.ok && settings.cfg('quote_source') === 'spot') { const n = quotes.applySpotToQuotes('scheduler'); console.log(`[scheduler] 국제시세 반영 ${n}종목`); } else if (r.ok) console.log(`[scheduler] 국제시세 조회 XAU ${r.xau} USDKRW ${r.usdkrw}`); else if (!r.skipped) console.warn('[scheduler] 국제시세 조회 실패', r.error); } catch (e) { console.error('[scheduler] 국제시세', e.message); }
  }
}

async function weeklyJobs(date, weekday) {
  // 킥오프 요일과 같은 요일 08:30 이후: 지난주 리포트 + 감사 + 전후 스크린샷. 4주차 종료 후 월간 리포트.
  const kd = new Date(report.kickoff() + 'T00:00:00+09:00').getUTCDay(); const map = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (weekday !== map[kd]) return;
  const key = 'weekly_done_' + date; if (getSetting(key)) return;
  const { hm } = kstParts(); if (hm < '08:30') return;
  setSetting(key, '1');
  try {
    if (auditRunner) await auditRunner();
    if (shot.available()) { try { const r = await shot.weeklyCapture({ base: `http://127.0.0.1:${process.env.PORT || 3000}`, adminCookie: auth.signInternal() }); console.log(`[scheduler] 주간 스크린샷 ${r.files.length}장`); } catch (e) { console.error('[scheduler] 스크린샷 실패', e.message); } }
    const cur = report.currentWeek(date); const prev = cur - 1;
    if (prev >= 1) { await report.generate(prev, 'weekly'); console.log(`[scheduler] ${prev}주차 주간 리포트 생성`); }
    if (prev === 4) { await report.generate(4, 'monthly'); console.log('[scheduler] 월간 종합 리포트 생성'); }
  } catch (e) { console.error('[scheduler] 주간 리포트 실패', e.message); }
}
async function dailyAudit(date) {
  const key = 'audit_done_' + date; if (getSetting(key) || !auditRunner) return;
  const { hm } = kstParts(); if (hm < '07:00') return;
  setSetting(key, '1');
  try { await auditRunner(); } catch (e) { console.error('[scheduler] 감사 실패', e.message); }
}

async function tick() {
  const { date, hm, weekday } = kstParts();
  snapshotQuotes(date);
  try { await live.tick(); } catch (e) { console.error('[scheduler] 실시간 시세', e.message); }
  try { await youtube.tick(); } catch (e) { console.error('[scheduler] 유튜브 동기화', e.message); }
  await spotJobs(date);
  if (getSetting('auto_generate', '1') === '1') { for (const slot of slots()) if (hm >= slot && !alreadyRan(date, slot)) await runSlot(date, slot); }
  await dailyAudit(date);
  await weeklyJobs(date, weekday);
}
function start({ audit } = {}) {
  auditRunner = audit || null; if (timer) return;
  tick().catch(e => console.error('[scheduler] tick 오류', e.message));
  timer = setInterval(() => tick().catch(e => console.error('[scheduler] tick 오류', e.message)), 60 * 1000);
  console.log(`[scheduler] 시작 — 콘텐츠 슬롯 ${slots().join(', ')} (KST), 실시간 시세 ${settings.cfg('live_interval_min')}분 간격(${settings.cfg('quote_source')}), 유튜브 3시간, 주간 리포트 매주 킥오프 요일 08:30, 감사 매일 07:00`);
}
function status() {
  const date = kstDate();
  return { slots: slots(), today: db.prepare('SELECT * FROM gen_runs WHERE run_date=? ORDER BY id').all(date), recent: db.prepare('SELECT * FROM gen_runs ORDER BY id DESC LIMIT 20').all(), autoGenerate: getSetting('auto_generate', '1') === '1', autoPublish: getSetting('auto_publish', '1') === '1', currentWeek: report.currentWeek() };
}
module.exports = { start, tick, slots, status, runSlot };
