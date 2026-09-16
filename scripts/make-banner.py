# -*- coding: utf-8 -*-
"""매장 실사 사진 → 홈페이지 배너(히어로 배경·OG 이미지) 생성.

사용법:
    python scripts/make-banner.py "D:/사진/매장간판.jpg"

만들어지는 파일 (public/img/):
    hero.jpg         2400x1100  데스크톱 히어로 배경 (왼쪽 텍스트 영역이 어둡게 처리됨)
    hero-mobile.jpg  1200x1500  모바일 히어로 배경
    og.png           1200x630   카카오톡·검색 공유 썸네일 (로고 + 문구 합성)

원본은 public/img/source/ 에 보관해 재작업 시 다시 받지 않는다.
"""
import sys, os, shutil
from PIL import Image, ImageEnhance, ImageDraw, ImageFont, ImageFilter, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'public', 'img')
SRC_DIR = os.path.join(IMG, 'source')
GOLD = (233, 200, 118)
INK = (21, 19, 17)

FONT_CANDIDATES = [
    r'C:\Windows\Fonts\malgunbd.ttf', r'C:\Windows\Fonts\malgun.ttf',
    '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf',
]


def font(size, bold=True):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def grade(im):
    """따뜻한 간판 조명을 살리고 대비를 정리한다."""
    im = ImageEnhance.Color(im).enhance(1.12)
    im = ImageEnhance.Contrast(im).enhance(1.10)
    im = ImageEnhance.Brightness(im).enhance(0.96)
    return im


def cover(im, w, h, focus=0.5):
    """비율 유지하며 w×h를 채우도록 크롭. focus: 가로 크롭 기준점(0=왼쪽,1=오른쪽).

    원본이 작아 많이 확대해야 하면(저해상도 사진) 확대 배율에 비례해 살짝 흐리게 만들어
    픽셀 깨짐 대신 조명이 번지는 느낌으로 처리한다.
    """
    sw, sh = im.size
    scale = max(w / sw, h / sh)
    nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
    im = im.resize((nw, nh), Image.LANCZOS)
    if scale > 2:
        im = im.filter(ImageFilter.GaussianBlur(min(9.0, (scale - 1) * 0.55)))
    left = int((nw - w) * focus)
    top = int((nh - h) * 0.42)  # 간판이 위쪽에 있어 살짝 위를 남긴다
    return im.crop((left, top, left + w, top + h))


def grain(im, amount=6):
    """미세한 노이즈 — 확대·그라데이션에서 생기는 띠(밴딩)를 덮는다."""
    import random
    w, h = im.size
    small = Image.new('L', (w // 2, h // 2))
    rnd = random.Random(7)
    small.putdata([128 + rnd.randint(-amount, amount) for _ in range(small.width * small.height)])
    noise = small.resize((w, h), Image.BILINEAR).convert('RGB')
    return ImageChops.add(im, noise, 1.0, -128)  # 밝기는 그대로 두고 ±amount만 더한다


def linear_overlay(size, stops, horizontal=True):
    """stops: [(위치0~1, 알파0~255)] — 검정 그라데이션 마스크."""
    w, h = size
    mask = Image.new('L', (w if horizontal else 1, 1 if horizontal else h))
    px = mask.load()
    n = w if horizontal else h
    for i in range(n):
        t = i / max(1, n - 1)
        a = stops[0][1]
        for (p0, a0), (p1, a1) in zip(stops, stops[1:]):
            if p0 <= t <= p1:
                r = (t - p0) / max(1e-6, p1 - p0)
                a = a0 + (a1 - a0) * r
                break
            if t > p1:
                a = a1
        px[i if horizontal else 0, 0 if horizontal else i] = int(a)
    mask = mask.resize((w, h), Image.BILINEAR)
    layer = Image.new('RGB', (w, h), INK)
    return layer, mask


def vignette(im, strength=60):
    w, h = im.size
    mask = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((-w * 0.25, -h * 0.45, w * 1.25, h * 1.45), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(min(w, h) // 8)).point(lambda v: 255 - v)
    dark = Image.new('RGB', (w, h), (0, 0, 0))
    return Image.composite(Image.blend(im, dark, strength / 255), im, mask.point(lambda v: min(255, v)))


def extend_left(im, out_w, out_h, sign_center=0.36, target=0.63):
    """사진 왼쪽을 벽면 색으로 늘려 글자 자리를 만들고, 간판이 target 위치(가로 비율)에 오도록 자른다."""
    h = out_h
    w = max(1, int(im.width * h / im.height + 0.5))
    scale = w / im.width
    ph = im.resize((w, h), Image.LANCZOS)
    if scale > 2:
        ph = ph.filter(ImageFilter.GaussianBlur(min(7.0, (scale - 1) * 0.5)))
    pad = int(w * 0.75)
    canvas = Image.new('RGB', (w + pad, h), INK)
    strip = ph.crop((0, 0, max(2, int(w * 0.05)), h)).resize((pad, h), Image.LANCZOS)
    canvas.paste(strip.filter(ImageFilter.GaussianBlur(70)), (0, 0))
    canvas.paste(ph, (pad, 0))
    sc = pad + sign_center * w
    start = int(max(0, min(canvas.width - out_w, sc - target * out_w)))
    return canvas.crop((start, 0, start + out_w, h))


def hero_desktop(src):
    """데스크톱 히어로 배경 — 간판이 오른쪽에 오고, 왼쪽은 글자를 얹을 수 있게 비운다.
    어둡게 까는 그라데이션은 CSS가 얹으므로 여기서는 전체 밝기만 살짝 낮춘다."""
    w, h = 2400, 1100
    im = extend_left(grade(src), w, h, target=0.66)
    im = ImageEnhance.Brightness(im).enhance(0.86)
    top_layer, top_mask = linear_overlay((w, h), [(0.0, 120), (0.28, 30), (0.78, 40), (1.0, 130)], horizontal=False)
    im = Image.composite(top_layer, im, top_mask)
    return grain(vignette(im, 40))


def hero_mobile(src):
    """모바일 히어로 배경 — 세로 화면. 조명 분위기만 남기고 어둡게."""
    w, h = 1200, 1500
    im = cover(grade(src), w, h, focus=0.5)
    im = ImageEnhance.Brightness(im).enhance(0.9)
    layer, mask = linear_overlay((w, h), [(0.0, 150), (0.5, 120), (1.0, 95)], horizontal=False)
    return grain(Image.composite(layer, im, mask))


def og_image(src):
    """카카오톡·검색 공유 썸네일 — 사진 위에 로고와 문구를 얹는다(단독으로 쓰이므로 여기서 어둡게 처리)."""
    w, h = 1200, 630
    im = extend_left(grade(src), w, h, target=0.74)
    layer, mask = linear_overlay((w, h), [(0.0, 240), (0.42, 214), (0.72, 96), (1.0, 52)])
    im = grain(Image.composite(layer, im, mask).convert('RGB'))
    d = ImageDraw.Draw(im)
    y = 92
    logo_path = os.path.join(IMG, 'logo-white.png')
    if os.path.exists(logo_path):
        logo = Image.open(logo_path).convert('RGBA')
        lw = 288
        logo = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
        im.paste(logo, (84, y), logo)
        y += logo.height + 40
    d.text((84, y), '종로3가 금·은 매입·판매', font=font(56), fill=(255, 255, 255))
    y += 76
    d.text((84, y), '종로3가역 11번 출구 앞 · 매일 10:00–20:00', font=font(29), fill=GOLD)
    y += 52
    d.text((84, y), '30분 정밀 감정 · 현장 현금 지급 · 출장 매입', font=font(29), fill=(206, 200, 188))
    return im


def store_photo(src):
    """소개 페이지에 그대로 보여줄 매장 사진 — 과한 보정 없이 살짝만 정리."""
    w, h = 1400, 800
    im = cover(grade(src), w, h, focus=0.5)
    return grain(vignette(im, 22), 4)


def main():
    if len(sys.argv) < 2:
        print('사용법: python scripts/make-banner.py <사진 경로>'); sys.exit(1)
    path = sys.argv[1]
    if not os.path.exists(path):
        print('파일을 찾을 수 없습니다:', path); sys.exit(1)
    os.makedirs(SRC_DIR, exist_ok=True)
    kept = os.path.join(SRC_DIR, 'store' + os.path.splitext(path)[1].lower())
    if os.path.abspath(path) != os.path.abspath(kept):
        shutil.copy2(path, kept)
    src = Image.open(kept).convert('RGB')
    print('원본', src.size)
    out = [
        ('hero.jpg', hero_desktop(src), dict(quality=82, optimize=True, progressive=True)),
        ('hero-mobile.jpg', hero_mobile(src), dict(quality=80, optimize=True, progressive=True)),
        ('store.jpg', store_photo(src), dict(quality=84, optimize=True, progressive=True)),
    ]
    for name, im, kw in out:
        p = os.path.join(IMG, name)
        im.save(p, **kw)
        print(name, im.size, f'{os.path.getsize(p)//1024}KB')
    og = og_image(src)
    p = os.path.join(IMG, 'og.png')
    og.save(p, optimize=True)
    print('og.png', og.size, f'{os.path.getsize(p)//1024}KB')


if __name__ == '__main__':
    main()
