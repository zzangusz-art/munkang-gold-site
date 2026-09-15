@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title 문강금은 홈페이지 배포
echo ============================================================
echo  문강금은 홈페이지 - 배포 ^(GitHub 푸시 + Railway 배포^)
echo  폴더: %CD%
echo ============================================================
echo.

where git >nul 2>&1 || (echo [오류] git이 없습니다. https://git-scm.com 설치 후 다시 실행하세요. & pause & exit /b 1)
where railway >nul 2>&1 || (echo [오류] Railway CLI가 없습니다. 설치: npm i -g @railway/cli & pause & exit /b 1)

echo [1/4] 변경 사항 확인
git status --short
echo.
set /p MSG=커밋 메시지 ^(Enter = 자동 메시지^):
if "!MSG!"=="" set MSG=deploy: %date% %time:~0,5%
git add -A
git -c user.name="zzangusz-art" -c user.email="zzangusz@gmail.com" commit -m "!MSG!" >nul 2>&1 && (echo 커밋 완료: !MSG!) || (echo 변경 없음 - 커밋 생략)
echo.

echo [2/4] GitHub 푸시 ^(zzangusz-art/munkang-gold-site main^)
set TOKEN=
for /f "delims=" %%t in ('gh auth token 2^>nul') do set TOKEN=%%t
if "!TOKEN!"=="" (
  git push origin main
) else (
  git push "https://zzangusz-art:!TOKEN!@github.com/zzangusz-art/munkang-gold-site.git" main
)
if errorlevel 1 (echo [경고] GitHub 푸시 실패. Railway 배포는 계속 진행합니다.) else (echo 푸시 완료)
echo.

echo [3/4] Railway 로그인 확인
railway whoami >nul 2>&1
if errorlevel 1 (
  echo Railway 로그인이 필요합니다. 브라우저 창이 열립니다...
  railway login
  if errorlevel 1 (echo [오류] 로그인 실패 & pause & exit /b 1)
)
railway status >nul 2>&1
if errorlevel 1 (
  echo 이 폴더가 Railway 프로젝트에 연결돼 있지 않습니다. 프로젝트를 선택하거나 새로 만듭니다...
  railway init
  if errorlevel 1 (echo [오류] 프로젝트 연결 실패 & pause & exit /b 1)
  echo 영구 볼륨 /data 추가 ^(없으면 재배포마다 DB 초기화^)
  railway volume add --mount-path /data
  for /f "delims=" %%i in ('powershell -NoProfile -Command "[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')"') do set JWT=%%i
  railway variables --set "DATA_DIR=/data" --set "JWT_SECRET=!JWT!" --set "ADMIN_ID=admin" --set "ADMIN_PW=munkang1234!" --set "NODE_ENV=production" --set "SITE_URL=https://www.munkanggold.com" >nul
  echo 기본 환경변수 설정 완료 ^(관리자 admin / munkang1234! - 첫 로그인 후 변경^)
)
echo.

echo [4/4] Railway 배포 시작 ^(빌드 2~4분^)
railway up --detach
if errorlevel 1 (echo [오류] 배포 실패. 위 메시지를 확인하세요. & pause & exit /b 1)
echo.
for /f "delims=" %%d in ('railway domain 2^>nul') do set DOMAIN=%%d
echo 배포가 시작됐습니다. 진행 상황: railway logs  /  대시보드: railway open
if not "!DOMAIN!"=="" echo 접속 주소: !DOMAIN!
echo 정식 도메인 연결 전 임시 주소^(*.up.railway.app^)는 검색엔진 noindex 처리됩니다.
echo.
pause
