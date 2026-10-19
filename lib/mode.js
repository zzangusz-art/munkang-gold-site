'use strict';
// 판매 모드 — gold(금 시세 온라인몰 전체) / jewelry(14K·18K 주얼리몰)
// 상품·배너 데이터는 지우지 않고 화면에서만 거른다. 관리자 > 쇼핑몰 설정 '판매 모드'로 즉시 전환(2026-10-19).
const settings = require('./settings');

const isJewelry = () => settings.cfg('shop_mode') === 'jewelry';

// 주얼리몰 카테고리(상품명·스톤 옵션으로 분류)
const JEWELRY_CATS = [
  { k: 'best', label: 'BEST', href: '/products?category=best' },
  { k: 'new', label: 'NEW', href: '/products?category=new' },
  { k: 'ring', label: '반지', href: '/products?category=jewelry&t=ring' },
  { k: 'necklace', label: '목걸이', href: '/products?category=jewelry&t=necklace' },
  { k: 'bracelet', label: '팔찌', href: '/products?category=jewelry&t=bracelet' },
  { k: 'earring', label: '귀걸이', href: '/products?category=jewelry&t=earring' },
  { k: 'diamond', label: '다이아', href: '/products?category=jewelry&t=diamond' },
];
const TYPE_WORD = { necklace: '목걸이', earring: '귀걸이', bracelet: '팔찌', ring: '반지' };

function typeOf(p) {
  const n = String(p.name || '');
  if (/다이아|모이사|테니스/.test(n) || (p.stone_json && p.stone_json !== '[]')) return 'diamond';
  for (const [k, w] of Object.entries(TYPE_WORD)) if (n.includes(w)) return k;
  return '';
}
// t 필터(반지·목걸이·팔찌·귀걸이·다이아) — 다이아 상품도 원래 종류(반지 등)에 같이 보인다
function matchType(p, t) {
  if (!t) return true;
  if (t === 'diamond') return typeOf(p) === 'diamond';
  const w = TYPE_WORD[t];
  return w ? String(p.name || '').includes(w) || String(p.summary || '').includes(w) : true;
}

// 주얼리몰에서 보여줄 상품: 주얼리(14K·18K) 분류만
const allowedProduct = (p) => !isJewelry() || p.category === 'jewelry';
// 배너: 링크가 주얼리 분류로 가는 것만
const allowedBanner = (b) => !isJewelry() || /category=jewelry/.test(String(b.href || ''));

const JEWELRY_FAQ = [
  { q: '14K와 18K는 무엇이 다른가요?', a: '14K는 금 함량이 58.5%, 18K는 75%입니다. 18K가 색이 더 진하고 금 함량이 높아 가격이 더 높습니다. 대부분의 상품은 14K 기준으로 등록되어 있고, 상세 페이지에서 18K로 바꿔 주문할 수 있습니다.' },
  { q: '반지 호수나 목걸이 길이를 정해서 주문할 수 있나요?', a: '네. 상품마다 제작 가능한 호수·길이가 다르며, 요청 사항에 원하는 호수·길이를 적어 주시면 맞춰 제작합니다. 제작 상품은 평일 7~9일이 걸립니다.' },
  { q: '모이사나이트와 랩다이아는 어떻게 다른가요?', a: '모이사나이트는 다이아몬드와 비슷한 광채를 내는 다른 보석이고, 랩다이아는 연구소에서 만든 실제 다이아몬드입니다. 랩다이아가 더 비싸며, 상세 페이지에서 원하는 스톤을 고르실 수 있습니다.' },
  { q: '배송은 얼마나 걸리고 배송비는 얼마인가요?', a: '결제 확인 후 영업일 1~3일 안에 발송합니다(제작 상품은 평일 7~9일). 배송비는 3,000원이며 50만원 이상 주문은 무료입니다. 종로3가 매장 수령도 가능합니다.' },
  { q: '교환이나 반품이 되나요?', a: '상품을 받은 날부터 7일 이내에 신청할 수 있습니다. 착용 흔적이 있거나, 사전에 동의를 받은 주문 제작 상품은 교환·반품이 제한됩니다. 자세한 기준은 교환·환불·배송 안내를 확인해 주세요.' },
  { q: '구매 후 수리나 관리는 어떻게 하나요?', a: '구매하신 주얼리의 수리·사이즈 조정 등은 종로3가 매장으로 문의해 주세요. 상태를 확인한 뒤 가능 여부와 비용을 안내해 드립니다.' },
];

module.exports = { isJewelry, JEWELRY_CATS, typeOf, matchType, allowedProduct, allowedBanner, JEWELRY_FAQ };
