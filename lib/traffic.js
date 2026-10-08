'use strict';
// 방문 유입 분석 — 채널·페이지·봇별 집계와 드릴다운 (2026-10-08)
const { db } = require('../db');
const { kstDate } = require('./util');

// 유입 채널 분류 (referrer 호스트 → 채널)
const CHANNELS = [
  ['네이버', /(^|\.)naver\.(com|me)$|^search\.naver|naver\.com$/i],
  ['구글', /(^|\.)google\.|^google\./i],
  ['다음·카카오', /(^|\.)daum\.net$|(^|\.)kakao\.com$|kakaocdn/i],
  ['인스타그램', /instagram\.com$/i],
  ['유튜브', /youtube\.com$|youtu\.be$/i],
  ['페이스북', /facebook\.com$|fb\.me$/i],
  ['빙·기타 검색', /bing\.com$|duckduckgo\.com$|yandex\./i],
  ['AI 답변엔진', /chatgpt\.com$|chat\.openai\.com$|perplexity\.ai$|claude\.ai$|gemini\.google\.com$|copilot\.microsoft\.com$/i],
  ['문자·메신저', /^t\.co$|band\.us$|line\.me$/i],
];
function channelOf(refHost) {
  if (!refHost) return '직접 유입';
  for (const [name, re] of CHANNELS) if (re.test(refHost)) return name;
  return '기타 사이트';
}

const range = (days) => {
  const to = kstDate();
  const from = kstDate(new Date(Date.now() + 9 * 3600e3 - (days - 1) * 86400e3));
  return { from, to };
};

// 기간 요약 — 사람/AI봇/검색봇, 채널별, 페이지별, 일자별
function summary(days = 7) {
  const { from, to } = range(days);
  const rows = db.prepare('SELECT agent, bot_name, ref_host, path, date, SUM(count) c FROM pageviews WHERE date>=? AND date<=? GROUP BY agent, bot_name, ref_host, path, date').all(from, to);
  const byAgent = { human: 0, 'ai-bot': 0, 'search-bot': 0, 'other-bot': 0 };
  const channels = {}; const pages = {}; const aiBots = {}; const searchBots = {}; const daily = {};
  for (const r of rows) {
    byAgent[r.agent] = (byAgent[r.agent] || 0) + r.c;
    daily[r.date] = daily[r.date] || { date: r.date, human: 0, ai: 0, search: 0 };
    if (r.agent === 'human') {
      daily[r.date].human += r.c;
      const ch = channelOf(r.ref_host);
      channels[ch] = (channels[ch] || 0) + r.c;
      pages[r.path] = (pages[r.path] || 0) + r.c;
    } else if (r.agent === 'ai-bot') { daily[r.date].ai += r.c; aiBots[r.bot_name || '기타'] = (aiBots[r.bot_name || '기타'] || 0) + r.c; }
    else if (r.agent === 'search-bot') { daily[r.date].search += r.c; searchBots[r.bot_name || '기타'] = (searchBots[r.bot_name || '기타'] || 0) + r.c; }
  }
  const sort = (o) => Object.entries(o).map(([k, c]) => ({ key: k, count: c })).sort((a, b) => b.count - a.count);
  return {
    from, to, days, byAgent,
    channels: sort(channels), pages: sort(pages).slice(0, 15),
    aiBots: sort(aiBots), searchBots: sort(searchBots),
    daily: Object.values(daily).sort((a, b) => a.date.localeCompare(b.date)),
    total: byAgent.human,
  };
}

// 드릴다운 — 채널/페이지/봇 하나를 눌렀을 때 세부 내역
function drill(type, key, days = 7) {
  const { from, to } = range(days);
  if (type === 'channel') {
    const rows = db.prepare("SELECT ref_host, path, date, SUM(count) c FROM pageviews WHERE date>=? AND date<=? AND agent='human' GROUP BY ref_host, path, date").all(from, to)
      .filter((r) => channelOf(r.ref_host) === key);
    const by = (f) => { const o = {}; for (const r of rows) o[f(r)] = (o[f(r)] || 0) + r.c; return Object.entries(o).map(([k, c]) => ({ key: k, count: c })).sort((a, b) => b.count - a.count); };
    return { title: key.endsWith('유입') ? key : `${key} 유입`, total: rows.reduce((a, r) => a + r.c, 0), groups: [
      { label: '들어온 페이지', rows: by((r) => r.path).slice(0, 20) },
      { label: '출처 사이트', rows: by((r) => r.ref_host || '(직접 입력·북마크)').slice(0, 20) },
      { label: '날짜별', rows: by((r) => r.date) },
    ] };
  }
  if (type === 'page') {
    const rows = db.prepare("SELECT ref_host, date, agent, SUM(count) c FROM pageviews WHERE date>=? AND date<=? AND path=? GROUP BY ref_host, date, agent").all(from, to, key);
    const human = rows.filter((r) => r.agent === 'human');
    const by = (list, f) => { const o = {}; for (const r of list) o[f(r)] = (o[f(r)] || 0) + r.c; return Object.entries(o).map(([k, c]) => ({ key: k, count: c })).sort((a, b) => b.count - a.count); };
    return { title: `${key} 페이지`, total: human.reduce((a, r) => a + r.c, 0), groups: [
      { label: '유입 채널', rows: by(human, (r) => channelOf(r.ref_host)) },
      { label: '출처 사이트', rows: by(human, (r) => r.ref_host || '(직접 입력·북마크)').slice(0, 20) },
      { label: '날짜별', rows: by(human, (r) => r.date) },
      { label: '방문 종류', rows: by(rows, (r) => ({ human: '사람', 'ai-bot': 'AI 크롤러', 'search-bot': '검색 크롤러', 'other-bot': '기타 봇' }[r.agent] || r.agent)) },
    ] };
  }
  if (type === 'bot') {
    const rows = db.prepare('SELECT path, date, SUM(count) c FROM pageviews WHERE date>=? AND date<=? AND bot_name=? GROUP BY path, date').all(from, to, key);
    const by = (f) => { const o = {}; for (const r of rows) o[f(r)] = (o[f(r)] || 0) + r.c; return Object.entries(o).map(([k, c]) => ({ key: k, count: c })).sort((a, b) => b.count - a.count); };
    return { title: `${key} 크롤러`, total: rows.reduce((a, r) => a + r.c, 0), groups: [
      { label: '수집한 페이지', rows: by((r) => r.path).slice(0, 20) },
      { label: '날짜별', rows: by((r) => r.date) },
    ] };
  }
  return { title: '', total: 0, groups: [] };
}

module.exports = { summary, drill, channelOf };
