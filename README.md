# 문강금은 홈페이지 + 관리자

종로3가 금·은 매입·판매 금은방 **문강금은**의 신규 홈페이지. 오늘의 금·은·백금 시세, 매입가 계산기, 골드바·실버바·돌반지 제품(시세 연동 가격), 매입·구매 예약, 금 정보 블로그를 제공하며 SEO·AEO·GEO 최적화, 콘텐츠 자동발행(인블로그 연동), 주간 리포트(전후 스크린샷 포함) 자동 생성이 내장된 단일 Node 앱.

- 공개: `/` 홈 · `/price` `/price/{gold|silver|platinum}` 시세 · `/calculator` 계산기 · `/sell` 매입 안내 · `/buy` 구매 안내 · `/products` 제품 · `/guide/{purity|appraisal|gold-investment}` · `/faq` · `/apply` 예약 · `/blog` · `/notice` · `/videos` · `/reviews` · `/about` `/about/location` · `/search/{키워드}` 키워드 허브
- 관리자: `/admin` (시세 입력/엑셀/국제시세 자동 · 제품 · 콘텐츠 · 자동발행 · 예약문의 · 공지/후기/유튜브 · 4주 계획 · 리포트/스크린샷 · 기술감사 · 설정)
- SEO 파일: `/sitemap.xml` `/robots.txt` `/llms.txt` `/llms-full.txt` `/rss.xml` · 공개 API `/api/prices` `/api/prices/{code}/history` `/api/calc` `/api/spot`

## 실행

```bash
npm install
cp .env.example .env      # JWT_SECRET, ADMIN_PW 등
npm start                 # http://localhost:3000  (관리자 /admin, 기본 admin / munkang1234!)
npm run smoke             # 런타임 스모크 테스트(임시 포트·임시 DB)
npm run images            # 로고 .ai → public/img (PyMuPDF·PIL 필요)
node scripts/capture.js before|after [url]   # 전후 스크린샷
```

첫 실행 시 `data/seed/*.json`으로 시세 6종목(14일 이력)·제품 20개·주제 24개·4주 계획·가이드 4편·공지 1건을 시드합니다(비어 있을 때만). 시드 시세는 2026-09-15 국제시세 환산 추정치이므로 **관리자에서 실제 고시가로 갱신**해야 합니다.

## 배포 (Railway)

1. GitHub 저장소 연결 → Railway 새 프로젝트(Nixpacks, Node 22, chromium 포함).
2. **Volume 추가 → 마운트 경로 `/data`** (없으면 재배포마다 DB 초기화).
3. 환경변수: `DATA_DIR=/data`, `JWT_SECRET`, `ADMIN_ID`, `ADMIN_PW`, `SITE_URL=https://<도메인>`, 선택 `ANTHROPIC_API_KEY`(또는 OPENAI/GEMINI), `INBLOG_API_KEY`, `NAVER_SITE_VERIFICATION`, `GOOGLE_SITE_VERIFICATION`, `GA_MEASUREMENT_ID`.
4. 임시 도메인(*.up.railway.app)은 X-Robots-Tag noindex 자동. 정식 도메인 연결 후 관리자 → 설정에서 사이트 URL 변경.
5. `deploy-railway.bat`: CLI 로그인 → 프로젝트 생성 → 볼륨 → 변수 → 배포를 순서대로 안내.

## 자동화

| 작업 | 시각(KST) | 내용 |
|---|---|---|
| 콘텐츠 자동발행 | 매일 09:00 · 15:00 | 첫 슬롯 = 오늘의 금시세 리포트(월요일은 주간 리포트, 템플릿+LLM 해설). 둘째 슬롯 = 가이드 45 / 제품 소개 30 / 동향 25 로테이션. 발행 즉시 인블로그 전송. LLM 키 없으면 리포트·제품 소개만 |
| 국제시세 조회 | 08:30 · 13:30 | XAU/XAG/XPT(USD/oz)+USDKRW → 참고 표시. 설정 ON이면 순금·22K·18K·14K·은·백금 시세 자동 계산 |
| 시세 스냅샷 | 매일 | 90일 추이·스파크라인용 이력 |
| 기술 감사 | 매일 07:00 | SEO·AEO·GEO 16개 항목 재점검 → 점수 |
| 주간 리포트 | 매주 킥오프 요일(화) 08:30 | 전후 스크린샷 캡처 + 계획 체크 + 콘텐츠·시세·제품·문의·방문·AI봇·감사 → HTML + DOCX |
| 월간 리포트 | 4주차 종료 다음 주 | 월간 종합 |

멱등: `gen_runs(run_date, slot)` UNIQUE. 실패 시 같은 날 3회 재시도.

## 가격 로직

- 시세: `quotes` (code au999/au916/au750/au585/pt999/ag999, 원/돈). 전일 대비는 값이 바뀔 때 `prev_buy`로 보존.
- 계산기: 매입가(원/g) = buy/3.75 → × 중량(g).
- 제품: `(판매시세/g × 순중량 + 공임) × (1 + 마진%)`, 100원 단위 반올림, 적용 시세 기준시각 표기. `price_fixed`가 있으면 고정가.
- 국제시세 환산: USD/oz ÷ 31.1035 × USDKRW × 3.75. 자동 계산 시 매입 = 환산 × (1−매입 스프레드), 순금 판매 = 환산 × (1+판매 스프레드).

## 구조

```
server.js            엔트리(보안 헤더·정적·SEO 파일·별칭 301·라우트·자체감사 렌더러)
db.js                SQLite 스키마(DATA_DIR/munkang.db)
lib/                 layout(SEO 레이아웃·JSON-LD·우측 상담 버튼) seo quotes(시세·계산·제품가) spot(국제시세) providers(LLM) inblog scheduler report audit analytics screenshot settings auth util
lib/content/         generate(생성 파이프라인) templates(금시세 리포트·제품 소개 템플릿)
routes/              pages-main(홈·시세·계산기·제품) pages-info(매입·구매·가이드·FAQ·예약·후기·유튜브·소개·키워드 허브) pages-content(블로그·공지) api admin
public/              css/js, admin SPA, img(로고 .ai에서 생성)
data/seed/           quotes products topics plan faq articles · screenshots/before(착수 전 채널 캡처)
scripts/             seed smoke capture make-images.py
docs/                인블로그 세팅 가이드 · 운영 인수인계
```
