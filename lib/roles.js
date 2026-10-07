'use strict';
// 관리자 권한 — dev(전체) · shop(업체 운영자)
// 업체 운영자는 매장 운영에 필요한 화면만 본다(개발·SEO·자동발행·감사·사이트 설정 제외).
const SHOP_VIEWS = ['dash', 'quotes', 'products', 'orders', 'members', 'shop', 'inquiries', 'notice'];
const DEV_ONLY_VIEWS = ['posts', 'auto', 'plan', 'reports', 'audit', 'settings'];

// 업체 운영자에게 허용하는 API 경로(정규식)
const SHOP_API = [
  /^\/me$/, /^\/logout$/, /^\/password$/,
  /^\/stats$/, /^\/dashboard$/, /^\/karat$/,
  /^\/quotes(\/|$)/, /^\/products(\/|$)/, /^\/orders(\/|$)/, /^\/members(\/|$)/,
  /^\/coupons(\/|$)/, /^\/banners(\/|$)/, /^\/qna(\/|$)/, /^\/shop-settings$/, /^\/home-faq$/,
  /^\/inquiries(\/|$)/, /^\/reviews(\/|$)/, /^\/videos(\/|$)/, /^\/posts\?kind=notice/,
];
// 업체 운영자도 공지 글은 관리해야 하므로 posts 중 notice 종류만 허용
function allowed(user, method, path, query) {
  if (!user || user.role !== 'shop') return true;           // dev·내부 토큰은 전체 허용
  if (/^\/posts/.test(path)) {
    const kind = (query && query.kind) || '';
    return kind === 'notice' || method === 'GET';
  }
  return SHOP_API.some((re) => re.test(path));
}

module.exports = { SHOP_VIEWS, DEV_ONLY_VIEWS, allowed };
