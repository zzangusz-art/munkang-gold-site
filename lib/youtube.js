'use strict';
// 유튜브 채널 영상 자동 동기화 — 채널 RSS(키 불필요)로 최신 영상을 받아 videos 테이블에 저장한다.
// 제목의 이모지·해시태그는 정리해서 저장한다. 관리자가 직접 등록한 영상(sort<>100)은 덮어쓰지 않는다.
const { db, getSetting, setSetting } = require('../db');
const settings = require('./settings');
const { now } = require('./util');

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;
function cleanTitle(t) {
  return String(t || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(EMOJI, ' ').replace(/#[^\s#]*/g, ' ').replace(/\s+/g, ' ').trim();
}

async function sync() {
  const id = settings.cfg('youtube_channel_id'); if (!id) return { skipped: true };
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(id)}`, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; munkang-site/1.0)' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const xml = await r.text();
    const pick = (e, re) => (e.match(re) || [])[1] || '';
    const entries = xml.split('<entry>').slice(1).map(e => ({
      id: pick(e, /<yt:videoId>([^<]+)<\/yt:videoId>/),
      title: cleanTitle(pick(e, /<title>([^<]*)<\/title>/)),
      published: pick(e, /<published>([^<]+)<\/published>/).slice(0, 10),
      description: cleanTitle(pick(e, /<media:description>([^<]*)<\/media:description>/)).slice(0, 300),
    })).filter(x => x.id && x.title);
    const up = db.prepare('INSERT INTO videos (youtube_id,title,description,published,sort,created_at) VALUES (?,?,?,?,100,?) ON CONFLICT(youtube_id) DO UPDATE SET title=excluded.title, published=excluded.published WHERE videos.sort=100');
    db.transaction(() => { for (const v of entries) up.run(v.id, v.title, v.description, v.published, now()); })();
    setSetting('youtube_synced_at', String(now()));
    return { ok: true, count: entries.length };
  } catch (e) { return { ok: false, error: e.message }; } finally { clearTimeout(t); }
}
// 스케줄러에서 매분 호출 — 3시간마다 동기화
async function tick() {
  const last = Number(getSetting('youtube_synced_at')) || 0;
  if (now() - last >= 3 * 3600) return sync();
}
function latest(limit = 10) { return db.prepare('SELECT * FROM videos ORDER BY published DESC, id DESC LIMIT ?').all(limit); }

module.exports = { sync, tick, latest, cleanTitle };
