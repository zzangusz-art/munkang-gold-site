'use strict';
// 공개 페이지 ③ 블로그(금시세 리포트·가이드) · 공지
const express = require('express');
const { db } = require('../db');
const { page, faqLd } = require('../lib/layout');
const settings = require('../lib/settings');
const { esc, attr, kstDate, isoFromTs, fmtKoDate, truncate, stripHtml } = require('../lib/util');
const { postCard, faqHtml, quoteBar } = require('./pages-main');

const router = express.Router();
const TL = { report: '금시세 리포트', guide: '금 거래 가이드', trend: '금 시장 동향', product: '제품 소개' };

router.get('/blog', (req, res) => {
  const type = TL[req.query.type] ? req.query.type : '';
  const pageNo = Math.max(1, parseInt(req.query.page || '1', 10) || 1); const per = 12;
  const where = `kind='blog' AND status='published'${type ? ' AND type=?' : ''}`; const args = type ? [type] : [];
  const total = db.prepare(`SELECT COUNT(*) c FROM posts WHERE ${where}`).get(...args).c;
  const rows = db.prepare(`SELECT * FROM posts WHERE ${where} ORDER BY published_at DESC LIMIT ? OFFSET ?`).all(...args, per, (pageNo - 1) * per);
  const pages = Math.max(1, Math.ceil(total / per));
  const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">금 정보</p><h1>${type ? TL[type] : '금시세 리포트와 금 거래 가이드'} <small>${total}건</small></h1><p class="bluf">문강금은 매장 시세로 매일 작성하는 금시세 리포트, 실제 상담에서 나온 질문을 정리한 금 매입·판매 가이드, 골드바·돌반지 제품 소개, 국제 금 시장 동향을 발행합니다. 매일 새 글이 올라오며 RSS로 구독할 수 있습니다.</p><div class="tabs"><a class="tab${!type ? ' active' : ''}" href="/blog">전체</a>${Object.entries(TL).map(([k, v]) => `<a class="tab${type === k ? ' active' : ''}" href="/blog?type=${k}">${v}</a>`).join('')}</div></div></section>
<section class="section"><div class="wrap"><div class="post-grid">${rows.map(postCard).join('') || '<p class="note">첫 글이 곧 발행됩니다.</p>'}</div>
${pages > 1 ? `<nav class="pager" aria-label="페이지"><ul>${Array.from({ length: pages }, (_, i) => i + 1).map(n => `<li><a class="${n === pageNo ? 'active' : ''}" href="/blog?${new URLSearchParams({ ...(type ? { type } : {}), page: n })}">${n}</a></li>`).join('')}</ul></nav>` : ''}
<p class="note">RSS: <a href="/rss.xml">/rss.xml</a>${settings.cfg('inblog_url') ? ` · 블로그: <a href="${attr(settings.cfg('inblog_url'))}" target="_blank" rel="noopener">${esc(settings.cfg('inblog_url'))}</a>` : ''}</p></div></section>`;
  res.send(page({ title: `${type ? TL[type] : '금시세 리포트·금 거래 가이드'} ${total}건 — 매일 발행`, description: `오늘의 금시세 리포트, 금 팔기·골드바 구매 가이드, 순도·감정·세금 안내, 돌반지·골드바 제품 소개, 국제 금 시장 동향 ${total}건. 종로3가 문강금은 매장 시세 기반.`, path: '/blog', body, breadcrumbs: [{ name: '금 정보', href: '/blog' }], quoteBar: quoteBar(), jsonld: [{ '@context': 'https://schema.org', '@type': 'Blog', name: '문강금은 금시세 리포트·가이드', url: settings.siteUrl() + '/blog', publisher: { '@id': settings.siteUrl() + '/#org' }, blogPost: rows.slice(0, 10).map(p => ({ '@type': 'BlogPosting', headline: p.title, url: `${settings.siteUrl()}/blog/${p.slug}`, datePublished: isoFromTs(p.published_at) })) }] }));
});

router.get('/blog/:slug', (req, res, next) => {
  const p = db.prepare("SELECT * FROM posts WHERE kind='blog' AND slug=? AND status='published'").get(req.params.slug); if (!p) return next();
  const s = settings.all(); const site = settings.siteUrl();
  let faqs = [], sources = [];
  try { const j = JSON.parse(p.source_urls || '[]'); if (Array.isArray(j)) sources = j; else { faqs = j.faq || []; sources = j.sources || []; } } catch (_) { /* no-op */ }
  const related = db.prepare("SELECT * FROM posts WHERE kind='blog' AND status='published' AND id<>? AND type=? ORDER BY published_at DESC LIMIT 3").all(p.id, p.type);
  const latest = db.prepare("SELECT * FROM posts WHERE kind='blog' AND status='published' AND id<>? ORDER BY published_at DESC LIMIT 5").all(p.id);
  const tags = (p.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const pubDate = kstDate(new Date(p.published_at * 1000)); const modDate = kstDate(new Date(p.updated_at * 1000));
  const body = `<section class="page-head post-head"><div class="wrap narrow"><p class="eyebrow"><a href="/blog?type=${attr(p.type)}">${TL[p.type] || '가이드'}</a></p><h1>${esc(p.title)}</h1><p class="post-meta"><span>작성 ${esc(p.author || '문강금은 편집팀')}</span><time datetime="${isoFromTs(p.published_at)}">발행 ${fmtKoDate(pubDate)}</time>${modDate !== pubDate ? `<time datetime="${isoFromTs(p.updated_at)}">수정 ${fmtKoDate(modDate)}</time>` : ''}</p>${p.excerpt ? `<p class="bluf">${esc(p.excerpt)}</p>` : ''}</div></section>
<section class="section"><div class="wrap grid2"><div class="main-col"><article class="prose post-body">${p.body_html}</article>
${sources.length ? `<div class="sources"><h3>참고 자료</h3><ul>${sources.slice(0, 8).map(u => `<li><a href="${attr(u)}" target="_blank" rel="noopener nofollow">${esc(truncate(u, 80))}</a></li>`).join('')}</ul></div>` : ''}
${tags.length ? `<p class="tags">${tags.map(t => `<a class="tag" href="/blog?type=${attr(p.type)}">#${esc(t)}</a>`).join(' ')}</p>` : ''}
<div class="author-box"><img src="/img/mark.png" alt="" width="48" height="48"><div><b>${esc(s.legal_name)} 편집팀</b><p>종로3가에서 금·은을 매입·판매하는 문강금은이 매장 시세 데이터와 상담 경험을 바탕으로 작성합니다. 세무·법률 사항은 최신 규정과 전문가 확인을 권장합니다.</p></div></div>
${related.length ? `<h2 class="rel-h">같은 주제의 글</h2><div class="post-grid">${related.map(postCard).join('')}</div>` : ''}</div>
<aside class="side-col"><div class="side-card"><h3>지금 시세로 팔거나 사기</h3><p>순도·중량을 넣으면 예상 매입가가 바로 나옵니다.</p><a class="btn btn-gold block" href="/calculator">매입가 계산기</a><a class="btn btn-ghost-dark block" href="/apply">매입·구매 예약</a></div><div class="side-card"><h3>최신 글</h3><ul class="side-list">${latest.map(x => `<li><a href="/blog/${attr(x.slug)}">${esc(x.title)}</a></li>`).join('')}</ul></div></aside></div></section>`;
  const ld = [{ '@context': 'https://schema.org', '@type': p.type === 'report' ? 'AnalysisNewsArticle' : 'Article', headline: p.title, description: p.meta_description || p.excerpt, url: `${site}/blog/${p.slug}`, mainEntityOfPage: `${site}/blog/${p.slug}`, datePublished: isoFromTs(p.published_at), dateModified: isoFromTs(p.updated_at), author: { '@type': 'Organization', name: s.legal_name, url: site + '/' }, publisher: { '@id': site + '/#org' }, image: site + '/img/og.png', inLanguage: 'ko-KR', keywords: tags.join(', '), articleSection: TL[p.type] || '가이드', wordCount: stripHtml(p.body_html).length, isAccessibleForFree: true }];
  if (faqs.length) ld.push(faqLd(faqs));
  res.send(page({ title: p.title, description: p.meta_description || truncate(p.excerpt || stripHtml(p.body_html), 155), path: `/blog/${p.slug}`, body, breadcrumbs: [{ name: '금 정보', href: '/blog' }, { name: TL[p.type] || '가이드', href: `/blog?type=${p.type}` }, { name: truncate(p.title, 30), href: `/blog/${p.slug}` }], jsonld: ld, dateModified: isoFromTs(p.updated_at), bodyClass: 'post-page', quoteBar: quoteBar() }));
});

router.get('/notice', (req, res) => {
  const rows = db.prepare("SELECT * FROM posts WHERE kind='notice' AND status='published' ORDER BY published_at DESC LIMIT 100").all();
  const body = `<section class="page-head"><div class="wrap"><p class="eyebrow">문강금은</p><h1>공지사항 <small>${rows.length}건</small></h1><p class="bluf">영업시간 변경, 휴무, 시세 고시 안내, 이벤트 등 문강금은 매장 공지입니다.</p></div></section>
<section class="section"><div class="wrap narrow"><ul class="board">${rows.map(r => `<li><a href="/notice/${attr(r.slug)}"><span class="b-title">${esc(r.title)}</span><time datetime="${isoFromTs(r.published_at)}">${kstDate(new Date(r.published_at * 1000))}</time></a></li>`).join('') || '<li class="note">등록된 글이 없습니다.</li>'}</ul></div></section>`;
  res.send(page({ title: `공지사항 ${rows.length}건 — 영업시간·휴무·시세 고시·이벤트 안내`, description: `문강금은 공지사항 ${rows.length}건. 종로3가 매장 영업시간 변경, 휴무, 시세 고시 안내, 매입 이벤트를 알려 드립니다.`, path: '/notice', body, breadcrumbs: [{ name: '문강금은', href: '/about' }, { name: '공지사항', href: '/notice' }] }));
});
router.get('/notice/:slug', (req, res, next) => {
  const r = db.prepare("SELECT * FROM posts WHERE kind='notice' AND slug=? AND status='published'").get(req.params.slug); if (!r) return next();
  const body = `<section class="page-head"><div class="wrap narrow"><p class="eyebrow"><a href="/notice">공지사항</a></p><h1>${esc(r.title)}</h1><p class="post-meta"><time datetime="${isoFromTs(r.published_at)}">${fmtKoDate(kstDate(new Date(r.published_at * 1000)))}</time></p></div></section><section class="section"><div class="wrap narrow"><article class="prose">${r.body_html}</article><p><a class="link" href="/notice">← 공지사항 목록</a></p></div></section>`;
  res.send(page({ title: r.title, description: r.meta_description || truncate(stripHtml(r.body_html), 150), path: `/notice/${r.slug}`, body, breadcrumbs: [{ name: '문강금은', href: '/about' }, { name: '공지사항', href: '/notice' }, { name: truncate(r.title, 30), href: `/notice/${r.slug}` }], jsonld: [{ '@context': 'https://schema.org', '@type': 'NewsArticle', headline: r.title, datePublished: isoFromTs(r.published_at), dateModified: isoFromTs(r.updated_at), publisher: { '@id': settings.siteUrl() + '/#org' }, url: `${settings.siteUrl()}/notice/${r.slug}` }] }));
});

module.exports = { router };
