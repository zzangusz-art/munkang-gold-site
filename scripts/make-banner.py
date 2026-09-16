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
GOLD_D = (169, 134, 27)
INK = (21, 19, 17)
PAPER = (255, 255, 255)

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
    if LIGHT:
        return ImageEnhance.Contrast(im).enhance(1.03)
    im = ImageEnhance.Color(im).enhance(1.06 if DARK else 1.12)
    im = ImageEnhance.Contrast(im).enhance(1.04 if DARK else 1.10)
    im = ImageEnhance.Brightness(im).enhance(1.0 if DARK else 0.96)
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


def linear_overlay(size, stops, horizontal=True, color=None):
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
    layer = Image.new('RGB', (w, h), color or (PAPER if LIGHT else INK))
    return layer, mask


def vignette(im, strength=60):
    w, h = im.size
    mask = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((-w * 0.25, -h * 0.45, w * 1.25, h * 1.45), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(min(w, h) // 8)).point(lambda v: 255 - v)
    dark = Image.new('RGB', (w, h), (0, 0, 0))
    return Image.composite(Image.blend(im, dark, strength / 255), im, mask.point(lambda v: min(255, v)))


def extend_left_dark(im, out_w, out_h, sign_center=0.40, target=0.66):
    """어두운 실내 이미지용 — 왼쪽을 이미지의 어두운 톤으로 채우고 경계를 부드럽게 잇는다."""
    h = out_h
    w = max(1, int(im.width * h / im.height + 0.5))
    scale = w / im.width
    ph = im.resize((w, h), Image.LANCZOS)
    if scale > 2:
        ph = ph.filter(ImageFilter.GaussianBlur(min(5.0, (scale - 1) * 0.4)))
    pad = max(out_w - w + int(w * 0.18), int(w * 0.35))
    # 이미지 왼쪽 위/아래의 어두운 벽 색을 평균 내 채움색으로 쓴다
    sample = ph.crop((0, 0, max(4, int(w * 0.06)), h)).resize((1, 1), Image.BOX).getpixel((0, 0))
    fill = tuple(max(8, int(c * 0.72)) for c in sample[:3])
    canvas = Image.new('RGB', (w + pad, h), fill)
    # 사진 왼쪽 가장자리를 채움색으로 자연스럽게 녹인다
    feather = max(40, int(w * 0.10))
    edge = Image.new('L', (feather, 1))
    for x in range(feather):
        edge.putpixel((x, 0), int(255 * (x / max(1, feather - 1))))
    mask = Image.new('L', (w, h), 255)
    mask.paste(edge.resize((feather, h), Image.BILINEAR), (0, 0))
    canvas.paste(ph, (pad, 0), mask)
    sc = pad + sign_center * w
    start = int(max(0, min(canvas.width - out_w, sc - target * out_w)))
    return canvas.crop((start, 0, start + out_w, h))


def trim_corner(im, right_pct=0.13, bottom_pct=0.08):
    """오른쪽 아래 모서리(생성 이미지 워터마크 영역)를 잘라낸다."""
    w, h = im.size
    return im.crop((0, 0, int(w * (1 - right_pct)), int(h * (1 - bottom_pct))))


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


DARK = False  # 어두운(스튜디오풍) 이미지면 True — main()에서 --dark 로 켠다
LIGHT = False  # 흰 배경 사이트용 — main()에서 --light 로 켠다


def spread(im, out_w, out_h, target):
    return (extend_left_dark if DARK else extend_left)(im, out_w, out_h, target=target)


def panel(im, w, h, top_bias=0.5):
    """세로로 긴 패널용 — 가로를 꽉 채우고 남는 위아래는 벽면을 늘려 채운다(간판이 잘리지 않게)."""
    base = im.resize((w, max(1, int(im.height * w / im.width + 0.5))), Image.LANCZOS)
    if base.height >= h:
        return cover(im, w, h, 0.5)
    scale = w / im.width
    if scale > 2:
        base = base.filter(ImageFilter.GaussianBlur(min(5.0, (scale - 1) * 0.4)))
    pad = h - base.height
    top = int(pad * top_bias)
    edge = max(4, int(base.height * 0.07))
    canvas = Image.new('RGB', (w, h), PAPER if LIGHT else (0, 0, 0))
    def fill_block(box_h, src_box, at_y):
        if box_h <= 0: return
        if LIGHT:  # 밝은 벽은 단색으로 채워야 이음선이 안 보인다
            tone = base.crop(src_box).resize((1, 1), Image.BOX).getpixel((0, 0))
            canvas.paste(Image.new('RGB', (w, box_h), tone), (0, at_y))
        else:
            strip = base.crop(src_box).resize((w, box_h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(26))
            canvas.paste(ImageEnhance.Brightness(strip).enhance(0.9), (0, at_y))
    fill_block(top, (0, 0, w, edge), 0)
    fill_block(pad - top, (0, base.height - edge, w, base.height), top + base.height)
    # 늘린 벽면과 원본 경계가 보이지 않도록 위아래를 부드럽게 겹친다
    fade = max(40, int(base.height * (0.22 if LIGHT else 0.12)))
    m = Image.new('L', (1, base.height), 255)
    for y in range(fade):
        v = int(255 * (y / max(1, fade - 1)))
        m.putpixel((0, y), v)
        m.putpixel((0, base.height - 1 - y), v)
    canvas.paste(base, (0, top), m.resize((w, base.height), Image.BILINEAR))
    return canvas


def photo_on_wall(im, w, h, scale=0.6):
    """사진을 배경(벽 톤)과 같은 캔버스 위에 축소해 올린다 — 경계가 눈에 띄지 않게."""
    tone = im.crop((int(im.width * 0.02), int(im.height * 0.05), int(im.width * 0.16), int(im.height * 0.35))).resize((1, 1), Image.BOX).getpixel((0, 0))
    canvas = Image.new('RGB', (w, h), tone)
    tw = int(w * scale); th = max(1, int(im.height * tw / im.width))
    if th > h * 0.9:
        th = int(h * 0.9); tw = max(1, int(im.width * th / im.height))
    ph = im.resize((tw, th), Image.LANCZOS)
    # 사진 가장자리만 살짝 풀어 캔버스와 이어 붙인다(벽 톤이 같아 경계가 보이지 않는다)
    feather = max(16, int(min(tw, th) * 0.05))
    mask = Image.new('L', (tw, th), 255)
    ramp = Image.new('L', (feather, 1))
    for i in range(feather):
        ramp.putpixel((i, 0), int(255 * (i / max(1, feather - 1))))
    side = ramp.resize((feather, th), Image.BILINEAR)
    mask.paste(side, (0, 0)); mask.paste(side.transpose(Image.FLIP_LEFT_RIGHT), (tw - feather, 0))
    band = ramp.rotate(90, expand=True).resize((tw, feather), Image.BILINEAR)
    for box, strip in (((0, 0), band), ((0, th - feather), band.transpose(Image.FLIP_TOP_BOTTOM))):
        region = mask.crop((box[0], box[1], box[0] + tw, box[1] + feather))
        mask.paste(ImageChops.multiply(region, strip), box)
    canvas.paste(ph, ((w - tw) // 2, (h - th) // 2), mask)
    return canvas


def hero_desktop(src):
    """데스크톱 히어로 왼쪽 패널용 — 간판이 화면 왼쪽 절반을 채운다(글자는 오른쪽 어두운 면에 올라감)."""
    w, h = 1200, 1500  # 왼쪽 패널이 세로로 길다
    im = cover(grade(src), w, h, focus=0.2) if LIGHT else (panel(grade(src), w, h, 0.46) if DARK else cover(grade(src), w, h, focus=0.5))
    if not DARK:
        im = ImageEnhance.Brightness(im).enhance(0.88)
    return im if LIGHT else grain(vignette(im, 26))


def hero_mobile(src):
    """모바일 상단 간판 블록용 — 세로로 길게, 간판을 가운데."""
    w, h = 1200, 1400
    im = cover(grade(src), w, h, focus=0.22) if LIGHT else (panel(grade(src), w, h, 0.42) if DARK else cover(grade(src), w, h, focus=0.5))
    if not DARK:
        im = ImageEnhance.Brightness(im).enhance(0.9)
    return im if LIGHT else grain(vignette(im, 20))


def og_image(src):
    """카카오톡·검색 공유 썸네일 — 사진 위에 로고와 문구를 얹는다(단독으로 쓰이므로 여기서 어둡게 처리)."""
    w, h = 1200, 630
    im = cover(grade(src), w, h, focus=0.55) if LIGHT else spread(grade(src), w, h, 0.74)
    stops = [(0.0, 250), (0.44, 224), (0.72, 55), (1.0, 8)] if LIGHT else ([(0.0, 215), (0.42, 175), (0.72, 60), (1.0, 24)] if DARK else [(0.0, 240), (0.42, 214), (0.72, 96), (1.0, 52)])
    layer, mask = linear_overlay((w, h), stops)
    im = grain(Image.composite(layer, im, mask).convert('RGB'))
    d = ImageDraw.Draw(im)
    y = 92
    logo_path = os.path.join(IMG, 'logo-dark.png' if LIGHT else 'logo-word.png')
    if os.path.exists(logo_path):
        logo = Image.open(logo_path).convert('RGBA')
        lw = 250
        logo = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
        im.paste(logo, (84, y), logo)
        y += logo.height + 40
    d.text((84, y), '종로3가 금·은 매입·판매', font=font(56), fill=INK if LIGHT else (255, 255, 255))
    y += 76
    d.text((84, y), '종로3가역 11번 출구 앞 · 매일 10:00–20:00', font=font(29), fill=GOLD_D if LIGHT else GOLD)
    y += 52
    d.text((84, y), '정밀 감정 후 현장 현금 지급 · 골드바 · 주얼리', font=font(29), fill=(90, 84, 74) if LIGHT else (206, 200, 188))
    return im


def store_photo(src):
    """소개 페이지에 그대로 보여줄 매장 사진 — 과한 보정 없이 살짝만 정리."""
    w, h = 1400, 800
    im = cover(grade(src), w, h, focus=0.5)
    return grain(vignette(im, 22), 4)


def main():
    if len(sys.argv) < 2:
        print('사용법: python scripts/make-banner.py <사진 경로>'); sys.exit(1)
    global DARK, LIGHT
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    opts = [a for a in sys.argv[1:] if a.startswith('--')]
    DARK = '--dark' in opts
    LIGHT = '--light' in opts
    path = args[0]
    if not os.path.exists(path):
        print('파일을 찾을 수 없습니다:', path); sys.exit(1)
    os.makedirs(SRC_DIR, exist_ok=True)
    kept = os.path.join(SRC_DIR, ('store-light' if LIGHT else 'store-dark' if DARK else 'store') + os.path.splitext(path)[1].lower())
    if os.path.abspath(path) != os.path.abspath(kept):
        shutil.copy2(path, kept)
    src = Image.open(kept).convert('RGB')
    if DARK or LIGHT:
        src = trim_corner(src)  # 생성 이미지 워터마크 모서리 제거
    print('원본', src.size, '(dark 모드)' if DARK else '')
    out = [
        ('hero.jpg', hero_desktop(src), dict(quality=82, optimize=True, progressive=True)),
        ('hero-mobile.jpg', hero_mobile(src), dict(quality=80, optimize=True, progressive=True)),
    ]
    if '--keep-store' not in opts:
        out.append(('store.jpg', store_photo(src), dict(quality=84, optimize=True, progressive=True)))
    out += [
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
