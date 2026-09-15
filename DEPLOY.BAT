@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title 문강금은 홈페이지 배포
echo ============================================================
echo  문강금은 홈페이지 배포 - GitHub main 푸시
echo  Railway가 GitHub에 연결돼 있어 푸시하면 자동으로 배포됩니다.
echo  폴더: %CD%
echo ============================================================
echo.

where git >nul 2>&1 || (echo [오류] git이 없습니다. https://git-scm.com 설치 후 다시 실행하세요. & pause & exit /b 1)

echo [1/3] 변경 사항
git status --short
echo.
set /p MSG=커밋 메시지 - Enter 누르면 자동 메시지:
if "!MSG!"=="" set MSG=deploy: %date% %time:~0,5%
git add -A
git -c user.name="zzangusz-art" -c user.email="zzangusz@gmail.com" commit -m "!MSG!" >nul 2>&1 && (echo 커밋 완료: !MSG!) || (echo 새 변경 없음 - 기존 커밋만 푸시합니다)
echo.

echo [2/3] GitHub 푸시 - zzangusz-art/munkang-gold-site main
set TOKEN=
for /f "delims=" %%t in ('gh auth token 2^>nul') do set TOKEN=%%t
set REMOTE=origin
if not "!TOKEN!"=="" set REMOTE=https://zzangusz-art:!TOKEN!@github.com/zzangusz-art/munkang-gold-site.git
git push "!REMOTE!" main
if errorlevel 1 (
  echo.
  echo [오류] 푸시 실패. 원격에 새 커밋이 있으면 먼저 받아온 뒤 다시 푸시합니다...
  git pull --rebase "!REMOTE!" main
  git push "!REMOTE!" main
  if errorlevel 1 (echo [오류] 푸시에 다시 실패했습니다. 위 메시지를 확인하세요. & pause & exit /b 1)
)
echo 푸시 완료
echo.

echo [3/3] Railway 자동 배포 진행 중 - 보통 2~4분
echo  운영 주소: https://munkang-gold-site-production.up.railway.app
echo  상태 확인: https://munkang-gold-site-production.up.railway.app/healthz
echo  빌드 로그는 Railway 대시보드 - easygoing-nature - munkang-gold-site - Deployments
echo.
pause
