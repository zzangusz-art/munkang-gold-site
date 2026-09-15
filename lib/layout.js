'use strict';
// 공통 레이아웃 — SEO/AEO/GEO 필수 요소를 모든 페이지에 강제:
// 고유 title/description · self canonical · OG/Twitter · 원시 HTML JSON-LD(Organization/LocalBusiness·WebSite·Breadcrumb) · 시맨틱 nav/main/footer
const settings = require('./settings');
const { esc, attr } = require('./util');

let ASSET_STAMP = String(Date.now()).slice(-6);
function setStamp(s) { ASSET_STAMP = s; }

const NAV = [
  { label: '오늘의 금시세', href: '/price', children: [
    { label: '금·은·백금 시세표', href: '/price' }, { label: '금시세(순금·18K·14K)', href: '/price/gold' }, { label: '은시세', href: '/price/silver' }, { label: '백금시세', href: '/price/platinum' }, { label: '매입가 계산기', href: '/calculator' }] },
  { label: '금 팔기(매입)', href: '/sell', children: [
    { label: '금·은 매입 안내', href: '/sell' }, { label: '출장 매입', href: '/sell#visit' }, { label: '정밀 감정 안내', href: '/guide/appraisal' }, { label: '순도·K 표기 안내', href: '/guide/purity' }, { label: '매입 예약', href: '/apply?kind=sell' }] },
  { label: '금 사기(판매)', href: '/buy', children: [
    { label: '골드바·실버바 구매 안내', href: '/buy' }, { label: '골드바', href: '/products?category=goldbar' }, { label: '실버바', href: '/products?category=silverbar' }, { label: '돌반지·아기 선물', href: '/products?category=baby' }, { label: '순금 주얼리·기념품', href: '/products?category=jewelry' }, { label: '골드바 투자 안내', href: '/guide/gold-investment' }] },
  { label: '제품', href: '/products', children: [
    { label: '전체 제품', href: '/products' }, { label: '골드바', href: '/products?category=goldbar' }, { label: '실버바', href: '/products?category=silverbar' }, { label: '돌반지', href: '/products?category=baby' }, { label: '순금 주얼리', href: '/products?category=jewelry' }, { label: '행운의 열쇠·기념품', href: '/products?category=gift' }] },
  { label: '금 정보', href: '/blog', children: [
    { label: '전체 글', href: '/blog' }, { label: '금시세 리포트', href: '/blog?type=report' }, { label: '금 거래 가이드', href: '/blog?type=guide' }, { label: '금 시장 동향', href: '/blog?type=trend' }, { label: '제품 소개', href: '/blog?type=product' }, { label: '자주 묻는 질문', href: '/faq' }] },
  { label: '문강금은', href: '/about', children: [
    { label: '매장 소개', href: '/about' }, { label: '찾아오시는 길', href: '/about/location' }, { label: '고객 후기', href: '/reviews' }, { label: '유튜브·쇼츠', href: '/videos' }, { label: '공지사항', href: '/notice' }] },
];

function orgLd() {
  const s = settings.all(); const site = settings.siteUrl();
  const sameAs = [s.instagram, s.youtube, s.threads, s.naver_blog, s.naver_place, s.inblog_url, s.daangn, s.kakao_channel].filter(Boolean);
  const o = {
    '@context': 'https://schema.org', '@type': ['LocalBusiness', 'JewelryStore', 'Organization'], '@id': site + '/#org',
    name: s.site_name, legalName: s.legal_name, alternateName: [s.en_name, 'MUNKANG GOLD EXCHANGE', '문강금거래소', 'munkanggold', '문강금은 종로3가', '종로 금거래소 문강금은', '종로3가 금거래소', '종로 금은방 문강금은', '종로3가 금은방', '종로 금방'],
    url: site + '/', logo: site + '/img/logo.png', image: site + '/img/og.png',
    description: `${s.site_name}은 서울 종로3가(종로3가역 11번 출구 앞)에서 금·은·백금을 매입하고 골드바·실버바·돌반지·순금 주얼리를 판매하는 금은방입니다. 매일 갱신되는 순금·18K·14K·은 시세를 공개하고, 30분 이내 정밀 감정과 현장 현금 지급, 출장 매입을 제공합니다.`,
    telephone: '+82-' + s.phone.replace(/^0/, ''),
    keywords: s.keywords,
    address: { '@type': 'PostalAddress', streetAddress: [s.address_detail, '종로3가'].filter(Boolean).join(' '), addressLocality: '종로구', addressRegion: '서울특별시', addressCountry: 'KR' },
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: s.hours_open, closes: s.hours_close }],
    areaServed: ['서울', '종로구', '대한민국'], priceRange: '₩₩', currenciesAccepted: 'KRW', paymentAccepted: '현금, 계좌이체',
    knowsAbout: ['금시세', '종로 금매입', '종로3가 금매입', '은 매입', '종로 골드바', '실버바', '종로 돌반지', '순금', '18K', '14K', '백금', '금 감정', '출장 매입', '종로 금은방', '종로 귀금속', '종로 주얼리', '종로 금반지', '종로 금팔찌', '종로 금목걸이'],
    hasOfferCatalog: { '@type': 'OfferCatalog', name: '금·은 매입·판매 서비스', itemListElement: ['금·은 매입', '골드바·실버바 판매', '돌반지·순금 주얼리 판매', '정밀 감정', '출장 매입', '주얼리 리세팅', '금 투자 상담'].map(n => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: n } })) },
    sameAs, contactPoint: [{ '@type': 'ContactPoint', telephone: '+82-' + s.phone.replace(/^0/, ''), contactType: 'customer service', areaServed: 'KR', availableLanguage: 'ko' }, { '@type': 'ContactPoint', telephone: '+82-' + s.phone2.replace(/^0/, ''), contactType: 'sales', areaServed: 'KR', availableLanguage: 'ko' }],
    hasMap: s.naver_place || undefined,
  };
  if (s.email) o.email = s.email; if (s.ceo) o.founder = { '@type': 'Person', name: s.ceo }; if (s.biz_no) o.vatID = s.biz_no; if (s.founded) o.foundingDate = s.founded;
  return o;
}
function websiteLd() {
  const s = settings.all(); const site = settings.siteUrl();
  return { '@context': 'https://schema.org', '@type': 'WebSite', '@id': site + '/#website', url: site + '/', name: s.site_name, inLanguage: 'ko-KR', publisher: { '@id': site + '/#org' },
    potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: site + '/products?q={search_term_string}' }, 'query-input': 'required name=search_term_string' } };
}
function breadcrumbLd(items) {
  const site = settings.siteUrl();
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ name: '홈', href: '/' }, ...items].map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: site + it.href })) };
}
function faqLd(faqs) { return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }; }

function navHtml(current) {
  const cur = String(current || '').split('?')[0];
  return `<nav class="nav" aria-label="주 메뉴"><ul class="nav-list">${NAV.map(n => {
    const active = cur === n.href || n.children.some(c => cur === c.href.split('?')[0].split('#')[0]) || (n.href !== '/' && cur.startsWith(n.href + '/'));
    return `<li class="nav-item${active ? ' active' : ''}"><a href="${n.href}">${n.label}</a><ul class="sub">${n.children.map(c => `<li><a href="${c.href}">${c.label}</a></li>`).join('')}</ul></li>`;
  }).join('')}</ul></nav>`;
}

function page({ title, description, path, jsonld = [], body, breadcrumbs = [], ogImage, noindex = false, bodyClass = '', extraHead = '', dateModified, quoteBar = '' }) {
  const s = settings.all(); const site = settings.siteUrl();
  const url = site + (path === '/' ? '/' : path.replace(/\/$/, ''));
  const fullTitle = title.includes(s.site_name) ? title : `${title} | ${s.site_name}`;
  const ld = [orgLd(), websiteLd(), ...(breadcrumbs.length ? [breadcrumbLd(breadcrumbs)] : []), ...jsonld];
  const og = ogImage || site + '/img/og.png';
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${attr(description)}">
<meta name="keywords" content="${attr(s.keywords)}">
<link rel="canonical" href="${attr(url)}">
${noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1">'}
<meta property="og:type" content="website"><meta property="og:site_name" content="${attr(s.site_name)}"><meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${attr(fullTitle)}"><meta property="og:description" content="${attr(description)}"><meta property="og:url" content="${attr(url)}"><meta property="og:image" content="${attr(og)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${attr(fullTitle)}"><meta name="twitter:description" content="${attr(description)}"><meta name="twitter:image" content="${attr(og)}">
${dateModified ? `<meta property="article:modified_time" content="${attr(dateModified)}">` : ''}
${s.naver_verification ? `<meta name="naver-site-verification" content="${attr(s.naver_verification)}">` : ''}
${s.google_verification ? `<meta name="google-site-verification" content="${attr(s.google_verification)}">` : ''}
<meta name="theme-color" content="#151311">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="32x32" href="/img/icon-32.png"><link rel="apple-touch-icon" href="/img/icon-180.png"><link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="application/rss+xml" title="${attr(s.site_name)} 금시세 리포트·가이드" href="${site}/rss.xml">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-kr@5.0.13/index.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-kr@5.0.13/700.css">
<link rel="stylesheet" href="/css/site.css?v=${ASSET_STAMP}">
${ld.map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n')}
${s.ga_id ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${attr(s.ga_id)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${attr(s.ga_id)}');</script>` : ''}
${extraHead}
</head>
<body class="${attr(bodyClass)}">
<a class="skip" href="#main">본문 바로가기</a>
<header class="header" id="header">
  <div class="topbar"><div class="wrap"><span class="tb-long">📍 종로3가역 11번 출구 앞 · ${esc(s.hours)}</span><span class="tb-short">📍 종로3가역 11번 출구 앞 · 매일 ${esc(s.hours_open)}–${esc(s.hours_close)}</span><span class="tb-right"><a href="${attr(s.kakao_channel)}" target="_blank" rel="noopener">오픈채팅</a><a href="${attr(s.naver_place)}" target="_blank" rel="noopener">네이버 플레이스</a><a href="${attr(s.instagram)}" target="_blank" rel="noopener">인스타그램</a><a href="/about/location">오시는 길</a></span></div></div>
  <div class="wrap header-inner">
    <a class="logo" href="/" aria-label="${attr(s.site_name)} 홈"><img src="/img/logo.png" alt="${attr(s.site_name)} 로고" width="200" height="52"></a>
    ${navHtml(path)}
    <div class="header-cta"><a class="btn btn-call" href="tel:${attr(s.phone)}">📞 ${esc(s.phone)}</a><a class="btn btn-gold" href="/apply">매입·구매 예약</a></div>
    <button class="burger" id="burger" aria-label="메뉴 열기" aria-expanded="false"><span></span><span></span><span></span></button>
  </div>
  <div class="mobile-nav" id="mobileNav">${NAV.map(n => `<details><summary>${n.label}</summary><ul>${n.children.map(c => `<li><a href="${c.href}">${c.label}</a></li>`).join('')}</ul></details>`).join('')}<a class="btn btn-gold block" href="/apply">매입·구매 예약</a><a class="btn btn-ghost-dark block" href="${attr(s.kakao_channel)}" target="_blank" rel="noopener">카카오톡 상담</a></div>
</header>
${quoteBar}
${breadcrumbs.length ? `<div class="wrap"><ol class="crumbs" aria-label="현재 위치"><li><a href="/">홈</a></li>${breadcrumbs.map((b, i) => i === breadcrumbs.length - 1 ? `<li aria-current="page">${esc(b.name)}</li>` : `<li><a href="${attr(b.href)}">${esc(b.name)}</a></li>`).join('')}</ol></div>` : ''}
<main id="main">
${body}
</main>
<section class="cta-band"><div class="wrap cta-inner"><div><h2>금 팔 때도, 살 때도 — 시세부터 감정·현금까지 한 자리에서</h2><p>종로3가 매장에서 30분 이내 정밀 감정 후 현장 현금 지급. 거동이 불편하거나 수량이 많으면 출장 매입으로 찾아갑니다. 골드바·실버바·돌반지는 당일 시세로 구매하실 수 있습니다.</p></div><div class="cta-actions"><a class="btn btn-light" href="tel:${attr(s.phone)}">📞 ${esc(s.phone)}</a><a class="btn btn-gold" href="/apply">매입·구매 예약</a><a class="btn btn-kakao" href="${attr(s.kakao_channel)}" target="_blank" rel="noopener">카카오톡 상담</a></div></div></section>
<footer class="footer">
  <div class="wrap footer-grid">
    <div class="f-brand"><img src="/img/logo-white.png" alt="" width="180" height="47" loading="lazy"><p>${esc(s.legal_name)}<br>${esc(s.slogan)}</p><p class="f-social"><a href="${attr(s.instagram)}" target="_blank" rel="noopener">Instagram</a><a href="${attr(s.youtube)}" target="_blank" rel="noopener">YouTube</a><a href="${attr(s.naver_place)}" target="_blank" rel="noopener">네이버 플레이스</a>${s.naver_blog ? `<a href="${attr(s.naver_blog)}" target="_blank" rel="noopener">네이버 블로그</a>` : ''}<a href="${attr(s.threads)}" target="_blank" rel="noopener">Threads</a>${s.inblog_url ? `<a href="${attr(s.inblog_url)}" target="_blank" rel="noopener">블로그</a>` : ''}</p>
<p class="f-kw">${s.keywords.split(',').map(k => `<a href="/search/${encodeURIComponent(k.trim())}">${esc(k.trim())}</a>`).join(' · ')}</p></div>
    <div><h3>바로가기</h3><ul><li><a href="/price">오늘의 금시세</a></li><li><a href="/calculator">매입가 계산기</a></li><li><a href="/sell">금·은 매입 안내</a></li><li><a href="/products?category=goldbar">골드바</a></li><li><a href="/products?category=baby">돌반지</a></li><li><a href="/faq">자주 묻는 질문</a></li><li><a href="/blog">금 정보·시세 리포트</a></li></ul></div>
    <div><h3>매장 정보</h3><address><strong>${esc(s.legal_name)}</strong>${s.ceo ? `<br>대표 ${esc(s.ceo)}` : ''}${s.biz_no ? ` · 사업자등록번호 ${esc(s.biz_no)}` : ''}<br>${esc(s.address)}${s.address_detail ? ' ' + esc(s.address_detail) : ''}<br>전화 <a href="tel:${attr(s.phone)}">${esc(s.phone)}</a>${s.phone2 ? ` · <a href="tel:${attr(s.phone2)}">${esc(s.phone2)}</a>` : ''}<br>${esc(s.hours)}${s.email ? `<br>이메일 <a href="mailto:${attr(s.email)}">${esc(s.email)}</a>` : ''}${s.privacy_officer ? `<br>개인정보보호책임자 ${esc(s.privacy_officer)}` : ''}</address></div>
  </div>
  <div class="wrap footer-bottom"><span>© ${new Date().getFullYear()} ${esc(s.legal_name)}. All rights reserved.</span><span><a href="/privacy">개인정보처리방침</a> · <a href="/sitemap.xml">사이트맵</a> · <a href="/llms.txt">AI 크롤러 안내</a></span></div>
</footer>
<aside class="side-cta" aria-label="상담 채널">
  <a class="sc-btn sc-open" href="${attr(s.kakao_channel)}" target="_blank" rel="noopener"><span class="sc-ic">💬</span><span class="sc-t"><b>오픈채팅 상담</b><small>카카오 오픈톡 바로가기</small></span></a>
  <a class="sc-btn sc-call" href="tel:${attr(s.phone)}"><span class="sc-ic">📞</span><span class="sc-t"><b>${esc(s.phone)}</b><small>전화 상담 · 24시간</small></span></a>
  <button class="sc-btn sc-id" type="button" data-copy="${attr(s.kakao_id)}"><span class="sc-ic">🟡</span><span class="sc-t"><b>카톡 ID ${esc(s.kakao_id)}</b><small>누르면 복사 · 친구추가</small></span></button>
  <a class="sc-btn sc-apply" href="/apply"><span class="sc-ic">📝</span><span class="sc-t"><b>매입·구매 예약</b><small>품목·중량만 남기기</small></span></a>
  <button class="fc-top" id="toTop" aria-label="맨 위로">↑</button>
</aside>
<div class="mobile-bar"><a href="${attr(s.kakao_channel)}" target="_blank" rel="noopener">💬 오픈채팅</a><a href="tel:${attr(s.phone)}">📞 전화</a><button type="button" data-copy="${attr(s.kakao_id)}">🟡 카톡ID</button><a href="/apply">📝 예약</a></div>
<script src="/js/site.js?v=${ASSET_STAMP}" defer></script>
</body>
</html>`;
}

module.exports = { page, orgLd, websiteLd, breadcrumbLd, faqLd, NAV, setStamp };
