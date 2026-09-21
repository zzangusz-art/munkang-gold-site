'use strict';
// 사이트 설정 — env → settings 테이블 → 기본값 순 폴백
// ※ 주소 상세·사업자번호·대표자는 공개 자료로 확인되지 않아 비워 둠(관리자 설정에서 입력). 비어 있으면 화면에 표시하지 않는다.
const { getSetting } = require('../db');

const DEFAULTS = {
  site_url: process.env.SITE_URL || 'https://munkanggold.co.kr',  // 정식 도메인(2026-09-16 확정). 관리자 설정 > 사이트 주소 값이 있으면 그 값이 우선
  site_name: '문강금은',
  legal_name: '문강금은',
  en_name: 'Munkang Gold Exchange',   // 매장 간판 표기 MUNKANG GOLD EXCHANGE
  slogan: '종로3가 금·은 매입·판매 전문. 정직한 시세, 30분 정밀 감정, 현장 현금 지급',
  phone: '010-5005-8636',        // 상담 연락처(재현 지정)
  phone2: '0507-1403-8636',      // 매장 문의전화(소개 문구)
  kakao_id: 'hyungtak0106',      // 카카오톡 아이디(친구추가)
  email: '',
  address: '서울 종로구 돈화문로5가길 1 311호',
  address_detail: '',            // 상세 주소는 address에 포함(2026-09-16 확정)
  mail_order_no: '2026-서울종로-1213',
  region_text: '종로3가역 1호선 2번 출구 앞',
  biz_no: '',
  ceo: '',
  privacy_officer: '',
  founded: '',
  hours: '매일 10:00 – 20:00 (연중무휴) · 전화 상담 24시간',
  hours_open: '10:00', hours_close: '20:00',
  youtube: 'https://www.youtube.com/@munkanggold',
  youtube_channel_id: 'UCvdYeYlPf1T0PoE77gCsAyg', // @munkanggold — 채널 RSS로 영상 자동 동기화
  instagram: 'https://www.instagram.com/munkanggold/',
  threads: 'https://www.threads.com/@munkanggold',
  kakao_channel: 'https://open.kakao.com/o/pZJxBomi',
  naver_blog: 'https://blog.naver.com/lallapaloza',
  naver_place: 'https://map.naver.com/p/entry/place/2049757349?placePath=%2Fhome',
  keywords: '종로금거래소,종로금매입,종로3가금매입,종로3가금거래소,종로골드바,종로돌반지,종로금방,종로금은방,종로3가금은방,종로귀금속,종로쥬얼리,종로주얼리,종로금반지,종로금팔찌,종로금목걸이',
  daangn: 'https://www.daangn.com/kr/local-profile/%EB%AC%B8%EA%B0%95%EA%B8%88%EC%9D%80-cg4xoms5zvua/',
  inblog_url: '',
  old_site_url: '',               // 기존 홈페이지 주소(전후 비교 캡처용). 비어 있으면 당근 업체 프로필을 '이전'으로 사용
  naver_verification: process.env.NAVER_SITE_VERIFICATION || '',
  google_verification: process.env.GOOGLE_SITE_VERIFICATION || '',
  ga_id: process.env.GA_MEASUREMENT_ID || '',
  // 시세·가격 계산
  quote_note: '시세는 국내 고시가와 국제 금시세·환율을 반영해 실시간으로 갱신되며 하루 중에도 바뀝니다. 실제 거래가는 감정 결과(순도, 중량, 상태)에 따라 정해집니다.',
  k14_pure_factor: '0.6435',      // 14K 돈 수 × 0.6435 = 순금 환산 돈 수(매장 정책)
  k18_weight_factor: '1.2',       // 18K 중량 = 14K 중량 × 1.2
  k18_pure_factor: '0.6435',      // 18K 돈 수 × 계수 = 순금 환산 돈 수(관리자에서 조정)
  margin_pct: '0',                // 제품 판매가 마진율(%) — 매장 가격판 기준 골드바 프리미엄은 공임에 반영
  labor_default: '0',             // 기본 공임(원)
  auto_quote_from_spot: '0',      // 1이면 국제시세×환율로 순금 매입/판매가 자동 계산
  spot_buy_spread_pct: '3',       // 순금 매입가 = 국제 환산가 × (1 - 3%)
  spot_sell_spread_pct: '6',      // 순금 판매가 = 국제 환산가 × (1 + 6%) — 09-15 가격판(734,000) 역산
  spot_fetch: '1',                // 국제 시세 자동 조회(참고 표시용)
  quote_source: 'manual',         // manual=관리자 직접 입력(기본) · live=한국금거래소 고시가 실시간 크롤링 반영 · spot=국제시세 환산 · manual=직접 입력
  live_interval_min: '3',         // 크롤링 주기(분)
  live_buy_adj_pct: '0',          // 크롤링 매입가 대비 매장 조정(%)
  live_sell_adj_pct: '0',         // 크롤링 판매가 대비 매장 조정(%)
  // 자동발행
  gen_times: '09:00,15:00',
  auto_generate: '1',
  auto_publish: '1',
  inblog_push: '1',
  llm_provider: 'anthropic',
  // 기획
  kickoff_date: '2026-09-15',
};

function cfg(key) {
  const v = getSetting(key, null);
  if (v !== null && v !== '') return v;
  return DEFAULTS[key] ?? '';
}
function siteUrl() { return cfg('site_url').replace(/\/$/, ''); }
function all() { const o = {}; for (const k of Object.keys(DEFAULTS)) o[k] = cfg(k); return o; }
function num(key) { const n = Number(cfg(key)); return Number.isFinite(n) ? n : 0; }

module.exports = { cfg, siteUrl, all, num, DEFAULTS };
