'use strict';
// 주간·월간 리포트 자동 생성 — 4주 실행계획 체크 + 실측 지표(콘텐츠·시세·제품·문의·방문·AI봇·기술감사) + 전후 스크린샷
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('../db');
const { now, kstDate, addDays, fmtKoDate, esc, fmtNum } = require('./util');
const settings = require('./settings');
const analytics = require('./analytics');
const audit = require('./audit');
const quotes = require('./quotes');
const inblog = require('./inblog');
const shot = require('./screenshot');

function kickoff() { return settings.cfg('kickoff_date') || '2026-09-15'; }
function weekRange(n) { const s = addDays(kickoff(), 7 * (n - 1)); return { start: s, end: addDays(s, 6) }; }
function currentWeek(date = kstDate()) { const diff = Math.floor((new Date(date + 'T00:00:00+09:00') - new Date(kickoff() + 'T00:00:00+09:00')) / 86400000); return Math.max(1, Math.floor(diff / 7) + 1); }
function ts(dateStr) { return Math.floor(new Date(dateStr + 'T00:00:00+09:00').getTime() / 1000); }

function autoStatus(key, { start, end }) {
  const c = (sql, ...a) => db.prepare(sql).get(...a).c;
  const posts = c("SELECT COUNT(*) c FROM posts WHERE kind='blog' AND status='published'");
  const products = c("SELECT COUNT(*) c FROM products WHERE status='published' AND body_html IS NOT NULL AND body_html<>''");
  const lastAudit = audit.latest();
  switch (key) {
    case 'site_built': return true;
    case 'audit_pass': return !!lastAudit && lastAudit.score >= 80;
    case 'audit_90': return !!lastAudit && lastAudit.score >= 90;
    case 'quote_updated': return c("SELECT COUNT(*) c FROM quote_updates WHERE source<>'seed'") > 0;
    case 'quote_updated_week': return c('SELECT COUNT(*) c FROM quote_updates WHERE created_at>=? AND created_at<?', ts(start), ts(addDays(end, 1))) > 0;
    case 'spot_ok': return !!quotes.spot().available;
    case 'auto_running': return c("SELECT COUNT(*) c FROM gen_runs WHERE status='ok'") > 0;
    case 'inblog_connected': return inblog.enabled() && c("SELECT COUNT(*) c FROM posts WHERE inblog_status='published'") > 0;
    case 'baseline_report': return c("SELECT COUNT(*) c FROM reports WHERE kind='baseline'") > 0;
    case 'products_10': return products >= 10; case 'products_20': return products >= 20;
    case 'posts_14': return posts >= 14; case 'posts_28': return posts >= 28; case 'posts_50': return posts >= 50;
    case 'guides_10': return c("SELECT COUNT(*) c FROM posts WHERE kind='blog' AND status='published' AND type='guide'") >= 10;
    case 'reports_4': return c("SELECT COUNT(*) c FROM posts WHERE kind='blog' AND status='published' AND type='report'") >= 4;
    case 'videos_linked': return c('SELECT COUNT(*) c FROM videos') > 0;
    case 'reviews_5': return c('SELECT COUNT(*) c FROM reviews WHERE visible=1') >= 5;
    case 'monthly_report': return c("SELECT COUNT(*) c FROM reports WHERE kind='monthly'") > 0;
    default: return null;
  }
}

function collect(week) {
  const range = weekRange(week); const from = ts(range.start), to = ts(addDays(range.end, 1));
  const q = (sql, ...a) => db.prepare(sql).get(...a).c;
  const posts = {
    week: q("SELECT COUNT(*) c FROM posts WHERE kind='blog' AND status='published' AND published_at>=? AND published_at<?", from, to),
    total: q("SELECT COUNT(*) c FROM posts WHERE kind='blog' AND status='published'"), drafts: q("SELECT COUNT(*) c FROM posts WHERE kind='blog' AND status='draft'"),
    byType: db.prepare("SELECT type, COUNT(*) c FROM posts WHERE kind='blog' AND status='published' GROUP BY type").all(),
    inblog: q("SELECT COUNT(*) c FROM posts WHERE inblog_status='published'"), inblogErr: q("SELECT COUNT(*) c FROM posts WHERE inblog_status='error'"),
    list: db.prepare("SELECT title, slug, type, source, published_at FROM posts WHERE kind='blog' AND status='published' AND published_at>=? AND published_at<? ORDER BY published_at").all(from, to),
    slotsMissed: q("SELECT COUNT(*) c FROM gen_runs WHERE status<>'ok' AND run_date>=? AND run_date<=?", range.start, range.end),
  };
  const products = { total: q("SELECT COUNT(*) c FROM products WHERE status='published'"), withBody: q("SELECT COUNT(*) c FROM products WHERE status='published' AND body_html IS NOT NULL AND body_html<>''") };
  const st = quotes.stats(); const sp = quotes.spot();
  const quoteUp = { week: q("SELECT COUNT(*) c FROM quote_updates WHERE created_at>=? AND created_at<? AND source<>'seed'", from, to), last: db.prepare('SELECT created_at, source, rows FROM quote_updates ORDER BY id DESC LIMIT 1').get(), stats: st, spot: sp };
  const inq = { week: q('SELECT COUNT(*) c FROM inquiries WHERE created_at>=? AND created_at<?', from, to), total: q('SELECT COUNT(*) c FROM inquiries'), byKind: db.prepare('SELECT kind, COUNT(*) c FROM inquiries WHERE created_at>=? AND created_at<? GROUP BY kind').all(from, to), pending: q("SELECT COUNT(*) c FROM inquiries WHERE status='new'") };
  const traffic = analytics.summary(range.start, range.end);
  const prevTraffic = week > 1 ? analytics.summary(weekRange(week - 1).start, weekRange(week - 1).end) : null;
  const lastAudit = audit.latest();
  const tasks = db.prepare('SELECT * FROM plan_tasks WHERE week=? ORDER BY sort, id').all(week).map(t => ({ ...t, auto: t.auto_key ? autoStatus(t.auto_key, range) : null }));
  const doneCount = tasks.filter(t => t.done || t.auto === true).length;
  const next = db.prepare('SELECT * FROM plan_tasks WHERE week=? ORDER BY sort, id').all(week + 1);
  return { week, range, posts, products, quoteUp, inq, traffic, prevTraffic, audit: lastAudit, auditHistory: audit.history(), tasks, doneCount, next, generatedAt: kstDate(), kickoff: kickoff(), shots: shot.pairs() };
}

function shotsHtml(d) {
  const sh = d.shots; if (!sh || (!sh.pairs.length && !sh.admin.length)) return '';
  const cell = (f, cap) => f ? `<figure style="margin:0"><img src="${shot.dataUri(f)}" alt="${esc(cap)}" style="width:100%;border:1px solid #ddd;border-radius:6px"><figcaption class="muted">${esc(cap)}</figcaption></figure>` : `<div class="muted" style="border:1px dashed #ddd;border-radius:6px;padding:40px;text-align:center">이미지 없음</div>`;
  const rows = sh.pairs.map(p => `<tr><th colspan="2" style="text-align:left">${esc(p.label)}</th></tr><tr><td style="width:50%;vertical-align:top">${cell(p.before, '이전 — 기존 온라인 채널(당근 업체 프로필·Threads) 또는 구 홈페이지')}</td><td style="width:50%;vertical-align:top">${cell(p.after, `이후 — 신규 홈페이지 (${sh.afterDir ? path.basename(sh.afterDir) : ''} 캡처)`)}</td></tr>`).join('');
  const admin = sh.admin.length ? `<h3>관리자 화면(신설)</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${sh.admin.map(a => cell(a.file, a.label)).join('')}</div>` : '';
  return `<h2>0. 전후 비교 (기존 채널 → 신규 홈페이지)</h2><p class="muted">같은 해상도(데스크톱 960×600 기준)로 캡처. 좌: 착수 전 기존 온라인 채널, 우: 신규 홈페이지 최신 캡처.</p><table style="table-layout:fixed">${rows}</table>${admin}`;
}
function statusBadge(t) { const ok = t.done || t.auto === true; return ok ? '<span class="ok">완료</span>' : t.auto === false ? '<span class="pending">미완</span>' : '<span class="manual">확인 필요</span>'; }
const TYPE_LABEL = { report: '금시세 리포트', product: '제품 소개', guide: '금 거래 가이드', trend: '금 시장 동향' };

function renderHtml(d, kind = 'weekly') {
  const s = settings.all();
  const title = kind === 'baseline' ? '베이스라인 리포트 (착수 시점 기준선)' : kind === 'monthly' ? '월간 종합 리포트 (1개월 구축 결과)' : `${d.week}주차 주간 리포트`;
  const period = `${fmtKoDate(d.range.start)} ~ ${fmtKoDate(d.range.end)}`;
  const tr = d.traffic, pv = tr.byAgent; const pct = (a, b) => b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%` : '-'; const prevH = d.prevTraffic?.byAgent?.human || 0;
  const g = d.quoteUp.stats.gold;
  const auditRows = d.audit ? d.audit.items.map(i => `<tr><td>${esc(i.label)}</td><td>${i.ok ? '<span class="ok">통과</span>' : '<span class="pending">미충족</span>'}</td><td>${esc(i.detail || '')}</td></tr>`).join('') : '<tr><td colspan="3">감사 미실행</td></tr>';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)} — 문강금은 홈페이지 신설 프로젝트</title>
<style>body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#1c1a17;max-width:860px;margin:32px auto;padding:0 20px;line-height:1.6}h1{font-size:24px;border-bottom:3px solid #b8860b;padding-bottom:8px}h2{font-size:18px;color:#8a6508;margin-top:32px}table{border-collapse:collapse;width:100%;font-size:14px;margin:8px 0 16px}th,td{border:1px solid #ddd;padding:6px 10px;text-align:left;vertical-align:top}th{background:#faf5e6}.ok{color:#1a8f3c;font-weight:700}.pending{color:#c0392b;font-weight:700}.manual{color:#8a6d00;font-weight:700}.kpi{display:flex;gap:12px;flex-wrap:wrap}.kpi div{flex:1 1 150px;background:#faf7f0;border-radius:10px;padding:12px 14px}.kpi b{display:block;font-size:22px;color:#8a6508}.muted{color:#667085;font-size:13px}.summary{background:#fdf8e7;border-left:4px solid #d4af37;padding:12px 16px;border-radius:6px}@media print{body{margin:0}}</style></head><body>
<p class="muted">문강금은 홈페이지 신설 · AEO/GEO/SEO 구축 프로젝트 — 공급: 세느루(SAENRU) · 착수 ${fmtKoDate(d.kickoff)} · 작성 ${fmtKoDate(d.generatedAt)} (자동 생성)</p>
<h1>${esc(title)}</h1>
<p><strong>기간:</strong> ${period}</p>
<div class="summary"><strong>요약.</strong> 이번 주 콘텐츠 ${d.posts.week}건 발행(누적 ${d.posts.total}건, 인블로그 동기화 ${d.posts.inblog}건), 제품 페이지 ${d.products.withBody}/${d.products.total}개 작성, 시세 갱신 ${d.quoteUp.week}회(순금 매입가 ${g ? fmtNum(g.buy) + '원/돈' : '-'}), 문의 ${d.inq.week}건. 사람 방문 ${fmtNum(pv.human || 0)}회(전주 대비 ${pct(pv.human || 0, prevH)}), AI 크롤러 방문 ${fmtNum(pv['ai-bot'] || 0)}회. 기술 감사 ${d.audit ? d.audit.score + '점' : '미실행'}. 계획 항목 ${d.doneCount}/${d.tasks.length} 완료.</div>
${shotsHtml(d)}
<h2>1. 이번 주 실행계획 체크</h2>
<table><thead><tr><th style="width:52%">항목</th><th>담당</th><th>상태</th><th>비고</th></tr></thead><tbody>${d.tasks.map(t => `<tr><td>${esc(t.title)}</td><td>${esc(t.owner || '')}</td><td>${statusBadge(t)}</td><td>${esc(t.note || (t.auto === null ? '수동 확인 항목' : '자동 판정'))}</td></tr>`).join('')}</tbody></table>
<h2>2. 콘텐츠 발행 (매일 2건 자동)</h2>
<div class="kpi"><div><b>${d.posts.week}</b>이번 주 발행</div><div><b>${d.posts.total}</b>누적 발행</div><div><b>${d.posts.inblog}</b>인블로그 동기화</div><div><b>${d.posts.drafts}</b>검토 대기(초안)</div></div>
<p class="muted">유형별 누적: ${d.posts.byType.map(r => `${TYPE_LABEL[r.type] || r.type} ${r.c}`).join(' · ') || '-'}${d.posts.inblogErr ? ` · 인블로그 전송 오류 ${d.posts.inblogErr}건` : ''}${d.posts.slotsMissed ? ` · 자동발행 실패 슬롯 ${d.posts.slotsMissed}회` : ''}</p>
<table><thead><tr><th>발행일</th><th>유형</th><th>제목</th><th>생성</th></tr></thead><tbody>${d.posts.list.map(p => `<tr><td>${kstDate(new Date(p.published_at * 1000))}</td><td>${TYPE_LABEL[p.type] || p.type}</td><td><a href="${esc(settings.siteUrl())}/blog/${esc(p.slug)}">${esc(p.title)}</a></td><td>${p.source === 'ai' ? 'AI' : p.source === 'template' ? '데이터 템플릿' : '수동'}</td></tr>`).join('') || '<tr><td colspan="4">이번 주 발행 없음</td></tr>'}</tbody></table>
<h2>3. 시세 데이터 · 제품 페이지</h2>
<div class="kpi"><div><b>${d.quoteUp.week}</b>이번 주 시세 갱신</div><div><b>${g ? fmtNum(g.buy) : '-'}</b>순금 매입가(원/돈)</div><div><b>${d.quoteUp.stats.m30 > 0 ? '+' : ''}${d.quoteUp.stats.m30}%</b>30일 변동</div><div><b>${d.products.withBody}/${d.products.total}</b>제품 소개 작성</div></div>
<p class="muted">마지막 갱신: ${d.quoteUp.last ? `${kstDate(new Date(d.quoteUp.last.created_at * 1000))} · ${esc(d.quoteUp.last.source)} · ${d.quoteUp.last.rows}종목` : '없음'} · 국제시세 ${d.quoteUp.spot.available ? `XAU $${d.quoteUp.spot.xau}/oz · USDKRW ${d.quoteUp.spot.usdkrw} (${esc(d.quoteUp.spot.updated_at)})` : '미조회'}</p>
<h2>4. 방문 · AI 크롤러 · 문의</h2>
<div class="kpi"><div><b>${fmtNum(pv.human || 0)}</b>사람 방문 <span class="muted">(전주 ${pct(pv.human || 0, prevH)})</span></div><div><b>${fmtNum(pv['ai-bot'] || 0)}</b>AI 크롤러 방문</div><div><b>${fmtNum(pv['search-bot'] || 0)}</b>검색엔진 봇</div><div><b>${d.inq.week}</b>문의 <span class="muted">(누적 ${d.inq.total}, 미처리 ${d.inq.pending})</span></div></div>
<table><thead><tr><th>AI 크롤러</th><th>방문</th><th>검색 봇</th><th>방문</th><th>유입 경로(사람)</th><th>방문</th></tr></thead><tbody>${(() => { const a = Object.entries(tr.aiBots), b = Object.entries(tr.searchBots), c = tr.topRefs; const n = Math.max(a.length, b.length, c.length, 1); let rows = ''; for (let i = 0; i < n; i++) rows += `<tr><td>${esc(a[i]?.[0] || '')}</td><td>${a[i]?.[1] ?? ''}</td><td>${esc(b[i]?.[0] || '')}</td><td>${b[i]?.[1] ?? ''}</td><td>${esc(c[i]?.ref_host || '')}</td><td>${c[i]?.c ?? ''}</td></tr>`; return rows; })()}</tbody></table>
<p class="muted">문의 유형: ${d.inq.byKind.map(k => `${({ sell: '매입 예약', buy: '구매', visit: '방문 예약(과거)', consult: '상담' })[k.kind] || k.kind} ${k.c}`).join(' · ') || '-'} · 인기 페이지: ${tr.topPages.slice(0, 6).map(p => `${esc(p.path)}(${p.c})`).join(' · ') || '-'}</p>
<h2>5. 기술 감사 (SEO·AEO·GEO 항목)</h2>
<p>자체 감사 점수 <strong>${d.audit ? d.audit.score : '-'}점</strong> (추이: ${d.auditHistory.map(h => `${h.date.slice(5)} ${h.score}`).join(' → ') || '-'})</p>
<table><thead><tr><th>항목</th><th>판정</th><th>근거</th></tr></thead><tbody>${auditRows}</tbody></table>
<h2>6. 다음 주 계획</h2><ul>${d.next.map(t => `<li>${esc(t.title)} <span class="muted">(${esc(t.owner || '')})</span></li>`).join('') || '<li>월간 리포트로 종료</li>'}</ul>
<p class="muted">본 리포트는 ${esc(s.legal_name)} 홈페이지 시스템이 실측 데이터로 자동 생성했습니다. AI 인용·순위·매출은 보장 대상이 아니며, 지표는 매주 동일 방법으로 재측정합니다.</p>
</body></html>`;
}

async function buildDocx(d, kind) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun } = require('docx');
  const P = (t, o = {}) => new Paragraph({ children: [new TextRun({ text: t, ...o })] });
  const img = (file, w = 290) => { try { const buf = fs.readFileSync(file); const type = file.endsWith('.jpg') ? 'jpg' : 'png'; const ratio = file.includes('_mobile') ? 844 / 390 : 600 / 960; return new Paragraph({ children: [new ImageRun({ type, data: buf, transformation: { width: w, height: Math.round(w * ratio) } })] }); } catch (_) { return P('(이미지 없음)'); } };
  const shotRows = (d.shots && d.shots.pairs.length) ? d.shots.pairs.map(p => new TableRow({ children: [new TableCell({ children: [P(`${p.label} — 이전(기존 채널)`, { bold: true, size: 18 }), p.before ? img(p.before) : P('이미지 없음')] }), new TableCell({ children: [P(`${p.label} — 이후(신규 홈페이지)`, { bold: true, size: 18 }), p.after ? img(p.after) : P('이미지 없음')] })] })) : [];
  const adminRows = (d.shots && d.shots.admin.length) ? [0, 2].filter(i => d.shots.admin[i]).map(i => new TableRow({ children: d.shots.admin.slice(i, i + 2).map(a => new TableCell({ children: [P(a.label, { bold: true, size: 18 }), img(a.file)] })) })) : [];
  const H = (t, lv = HeadingLevel.HEADING_2) => new Paragraph({ text: t, heading: lv });
  const tbl = (rows) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map((r, i) => new TableRow({ children: r.map(c => new TableCell({ children: [P(String(c ?? ''), i === 0 ? { bold: true } : {})] })) })) });
  const title = kind === 'baseline' ? '베이스라인 리포트' : kind === 'monthly' ? '월간 종합 리포트' : `${d.week}주차 주간 리포트`;
  const pv = d.traffic.byAgent; const g = d.quoteUp.stats.gold;
  const children = [
    new Paragraph({ text: `문강금은 홈페이지 신설 — ${title}`, heading: HeadingLevel.HEADING_1 }),
    P(`기간 ${fmtKoDate(d.range.start)} ~ ${fmtKoDate(d.range.end)} · 작성 ${fmtKoDate(d.generatedAt)} · 공급 세느루(SAENRU)`, { color: '667085' }),
    P(`요약: 콘텐츠 ${d.posts.week}건 발행(누적 ${d.posts.total}, 인블로그 ${d.posts.inblog}), 제품 소개 ${d.products.withBody}/${d.products.total}, 시세 갱신 ${d.quoteUp.week}회(순금 매입 ${g ? g.buy.toLocaleString() + '원/돈' : '-'}), 문의 ${d.inq.week}건, 사람 방문 ${pv.human || 0}, AI 크롤러 ${pv['ai-bot'] || 0}, 기술 감사 ${d.audit ? d.audit.score + '점' : '미실행'}, 계획 ${d.doneCount}/${d.tasks.length} 완료.`, { bold: true }),
    ...(shotRows.length ? [H('0. 전후 비교 (기존 채널 → 신규 홈페이지)'), P('같은 해상도로 캡처. 좌: 착수 전 기존 온라인 채널, 우: 신규 홈페이지 최신 캡처.', { color: '667085', size: 18 }), new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: shotRows })] : []),
    ...(adminRows.length ? [H('관리자 화면(신설)', HeadingLevel.HEADING_3), new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: adminRows })] : []),
    H('1. 실행계획 체크'), tbl([['항목', '담당', '상태'], ...d.tasks.map(t => [t.title, t.owner || '', (t.done || t.auto === true) ? '완료' : t.auto === false ? '미완' : '확인 필요'])]),
    H('2. 콘텐츠 발행'), tbl([['발행일', '유형', '제목'], ...(d.posts.list.length ? d.posts.list.map(p => [kstDate(new Date(p.published_at * 1000)), TYPE_LABEL[p.type] || p.type, p.title]) : [['-', '-', '이번 주 발행 없음']])]),
    H('3. 시세·제품 페이지'), P(`시세 갱신 ${d.quoteUp.week}회 · 순금 매입가 ${g ? g.buy.toLocaleString() + '원/돈' : '-'} · 30일 변동 ${d.quoteUp.stats.m30}% · 제품 소개 ${d.products.withBody}/${d.products.total} · 국제시세 ${d.quoteUp.spot.available ? 'XAU $' + d.quoteUp.spot.xau : '미조회'}`),
    H('4. 방문·AI 크롤러·문의'), tbl([['구분', '값'], ['사람 방문', String(pv.human || 0)], ['AI 크롤러 방문', String(pv['ai-bot'] || 0)], ['검색엔진 봇', String(pv['search-bot'] || 0)], ['문의(주간/누적)', `${d.inq.week} / ${d.inq.total}`], ['AI 크롤러 상세', Object.entries(d.traffic.aiBots).map(([k, v]) => `${k} ${v}`).join(', ') || '-']]),
    H('5. 기술 감사'), P(`점수 ${d.audit ? d.audit.score : '-'}점`), tbl([['항목', '판정', '근거'], ...(d.audit ? d.audit.items.map(i => [i.label, i.ok ? '통과' : '미충족', i.detail || '']) : [['감사 미실행', '', '']])]),
    H('6. 다음 주 계획'), ...(d.next.length ? d.next.map(t => P(`• ${t.title} (${t.owner || ''})`)) : [P('월간 리포트로 종료')]),
    P('본 리포트는 홈페이지 시스템이 실측 데이터로 자동 생성했습니다. AI 인용·순위·매출은 보장 대상이 아닙니다.', { color: '667085', size: 18 }),
  ];
  const doc = new Document({ sections: [{ children }] });
  const buf = await Packer.toBuffer(doc);
  const file = path.join(DATA_DIR, 'reports', `${kind}-week${d.week}-${d.generatedAt}.docx`);
  fs.writeFileSync(file, buf); return file;
}

async function generate(week, kind = 'weekly') {
  const d = collect(week); const html = renderHtml(d, kind);
  let docxPath = null; try { docxPath = await buildDocx(d, kind); } catch (e) { console.error('[report] docx 생성 실패', e.message); }
  const title = kind === 'baseline' ? '베이스라인 리포트' : kind === 'monthly' ? '월간 종합 리포트' : `${week}주차 주간 리포트`;
  db.prepare(`INSERT INTO reports (week,period_start,period_end,kind,title,html,json,docx_path,created_at) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(kind,week) DO UPDATE SET title=excluded.title, html=excluded.html, json=excluded.json, docx_path=excluded.docx_path, created_at=excluded.created_at`)
    .run(week, d.range.start, d.range.end, kind, title, html, JSON.stringify({ ...d, shots: undefined }), docxPath, now());
  return db.prepare('SELECT id, week, kind, title, period_start, period_end, docx_path, created_at FROM reports WHERE kind=? AND week=?').get(kind, week);
}
module.exports = { kickoff, weekRange, currentWeek, collect, renderHtml, generate, autoStatus, TYPE_LABEL };
