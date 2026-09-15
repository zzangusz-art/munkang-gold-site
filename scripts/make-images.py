# -*- coding: utf-8 -*-
"""문강금은 로고(.ai) → 사이트용 이미지 생성.
   원본: ../../문강금은 로고.ai (다이아몬드 + '문강금은 MUNKANG GOLD', 어두운 배경 #3E3938)
   산출: public/img/logo.png(투명 배경·헤더/푸터용), logo-white.png(동일), mark.png·icon-*.png·favicon.ico(다이아몬드 마크), og.png(1200×630)
   텍스트·마크 배치는 눈대중 오프셋 없이 실측(bbox) 기준으로 계산한다."""
import os, sys, io
import fitz  # PyMuPDF
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'public', 'img')
os.makedirs(OUT, exist_ok=True)
AI = os.environ.get('LOGO_AI') or os.path.join(os.path.dirname(ROOT), '문강금은 로고.ai')
FONT_B = 'C:/Windows/Fonts/malgunbd.ttf'; FONT_R = 'C:/Windows/Fonts/malgun.ttf'
BG = (62, 57, 56); DARK = (21, 19, 17); GOLD = (201, 162, 39); GOLD_L = (232, 207, 122)

def render_ai(scale=6):
    doc = fitz.open(AI); page = doc[0]
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    return Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')

def key_out(im, bg=BG, tol=28):
    """배경색을 투명으로. 가장자리 안티앨리어싱은 배경과의 거리 비율로 알파를 준다."""
    im = im.convert('RGB'); w, h = im.size; out = Image.new('RGBA', (w, h)); src = im.load(); dst = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = src[x, y]; d = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
            if d <= tol: dst[x, y] = (0, 0, 0, 0)
            else:
                a = min(255, int((d - tol) * 255 / 90)) if d < tol + 90 else 255
                dst[x, y] = (r, g, b, a)
    return out

def content_bbox(im, bg=BG, tol=60):
    w, h = im.size; px = im.load(); x0 = y0 = 10 ** 9; x1 = y1 = -1
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y][:3]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > tol:
                x0 = min(x0, x); y0 = min(y0, y); x1 = max(x1, x); y1 = max(y1, y)
    return (x0, y0, x1 + 1, y1 + 1)

def font(path, size):
    try: return ImageFont.truetype(path, size)
    except Exception: return ImageFont.truetype(FONT_B, size)

def main():
    big0 = render_ai(6)                      # 283pt × 6 ≈ 1700px
    m = int(big0.width * .04); big = big0.crop((m, m, big0.width - m, big0.height - m))  # 아트보드 가장자리(흰 여백·테두리) 제외
    bb = content_bbox(big)                   # 로고 전체(다이아몬드+텍스트)
    logo_rgb = big.crop((bb[0] - 12, bb[1] - 12, bb[2] + 12, bb[3] + 12))
    logo = key_out(logo_rgb)
    # 헤더용 로고: 높이 236px(원본 비율 유지)
    ratio = 236 / logo.height; logo_hdr = logo.resize((int(logo.width * ratio), 236), Image.LANCZOS)
    logo_hdr.save(os.path.join(OUT, 'logo.png')); logo_hdr.save(os.path.join(OUT, 'logo-white.png'))
    # 다이아몬드 마크: 전체 bbox 좌측 25% 이내 컬럼만
    px = logo_rgb.load(); w, h = logo_rgb.size; xs = []; ys = []
    for y in range(h):
        for x in range(int(w * .28)):
            r, g, b = px[x, y]
            if abs(r - BG[0]) + abs(g - BG[1]) + abs(b - BG[2]) > 60: xs.append(x); ys.append(y)
    dbb = (min(xs), min(ys), max(xs) + 1, max(ys) + 1)
    dia = key_out(logo_rgb.crop(dbb))
    def mark(size):
        s = size * 4; im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        d.ellipse((0, 0, s - 1, s - 1), fill=BG + (255,))
        d.ellipse((int(s * .05), int(s * .05), int(s * .95), int(s * .95)), outline=GOLD + (255,), width=max(2, s // 44))
        target = int(s * .58); r2 = target / max(dia.width, dia.height); dd = dia.resize((max(1, int(dia.width * r2)), max(1, int(dia.height * r2))), Image.LANCZOS)
        im.paste(dd, ((s - dd.width) // 2, (s - dd.height) // 2), dd)
        return im.resize((size, size), Image.LANCZOS)
    for sz in (32, 180, 192, 512): mark(sz).save(os.path.join(OUT, f'icon-{sz}.png'))
    mark(64).save(os.path.join(OUT, 'mark.png'))
    mark(64).save(os.path.join(OUT, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
    # OG 1200×630: 로고 배경색 + 골드 글로우 + 로고 + 태그라인
    W, H = 1200, 630; og = Image.new('RGB', (W, H), BG)
    glow = Image.new('RGB', (W, H), BG); gd = ImageDraw.Draw(glow); gd.ellipse((720, -260, 1420, 440), fill=(92, 74, 30)); glow = glow.filter(ImageFilter.GaussianBlur(140))
    og = Image.blend(og, glow, .85); d = ImageDraw.Draw(og)
    lw = 620; lr = lw / logo.width; lg = logo.resize((lw, int(logo.height * lr)), Image.LANCZOS)
    og.paste(lg, ((W - lw) // 2, 130), lg)
    f1 = font(FONT_B, 40); t1 = '종로3가 금·은 매입·판매 · 오늘의 금시세 공개'
    l, t, r, b = d.textbbox((0, 0), t1, font=f1); d.text(((W - (r - l)) / 2 - l, 380 - t), t1, font=f1, fill=(255, 255, 255))
    f2 = font(FONT_R, 28); t2 = '30분 정밀 감정 · 현장 현금 지급 · 출장 매입 · 골드바·돌반지'
    l, t, r, b = d.textbbox((0, 0), t2, font=f2); d.text(((W - (r - l)) / 2 - l, 445 - t), t2, font=f2, fill=(217, 210, 194))
    f3 = font(FONT_R, 24); t3 = '종로3가역 11번 출구 앞 · 매일 10:00–20:00 · 010-5005-8636'
    l, t, r, b = d.textbbox((0, 0), t3, font=f3); d.text(((W - (r - l)) / 2 - l, 520 - t), t3, font=f3, fill=GOLD_L)
    d.rectangle((0, H - 10, W, H), fill=GOLD)
    og.save(os.path.join(OUT, 'og.png'), optimize=True)
    print('logo', logo_hdr.size, 'diamond', dia.size, 'written:', sorted(os.listdir(OUT)))

if __name__ == '__main__':
    main()
