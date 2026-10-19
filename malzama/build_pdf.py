"""Turn phone photos of the booklet pages into a clean, print-ready A4 PDF.

Each photo is located by its blue decorative frame, flattened (perspective +
page-curl correction), placed at a fixed position on a white A4 page, and the
paper is whitened while keeping the coloured headings/highlights.

Usage: python3 build_pdf.py raw_pages out_dir
"""
import glob
import os
import sys

import cv2
import img2pdf
import numpy as np

DPI = 300
PAGE_W, PAGE_H = 2480, 3508          # A4 @ 300 dpi
MX = 150                             # horizontal margin to the frame
FRAME_W = PAGE_W - 2 * MX
FRAME_H = int(FRAME_W * 1.385)       # frame aspect ratio of the original
MY = (PAGE_H - FRAME_H) // 2


def frame_mask(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s, v = cv2.split(hsv)
    m = ((h >= 92) & (h <= 114) & (s >= 60) & (v >= 45)).astype(np.uint8) * 255
    return m


def biggest_ring(mask):
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    m = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    h, w = mask.shape
    # the frame may break into separate sides; keep every long side-like piece
    keep = [i for i in range(1, n) if stats[i, 2] > 0.3 * w or stats[i, 3] > 0.3 * h]
    if not keep:
        keep = [max(range(1, n), key=lambda i: stats[i, 2] * stats[i, 3])]
    return np.isin(lab, keep).astype(np.uint8) * 255


def order(pts):
    pts = np.asarray(pts, np.float32)
    s, d = pts.sum(1), np.diff(pts, axis=1).ravel()
    return np.array([pts[s.argmin()], pts[d.argmin()], pts[s.argmax()], pts[d.argmax()]], np.float32)


def find_corners(ring):
    cnts, _ = cv2.findContours(ring, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    hull = cv2.convexHull(np.vstack(cnts))
    peri = cv2.arcLength(hull, True)
    for eps in np.linspace(0.005, 0.08, 40):
        ap = cv2.approxPolyDP(hull, eps * peri, True)
        if len(ap) == 4:
            return order(ap.reshape(4, 2))
    return order(cv2.boxPoints(cv2.minAreaRect(hull)))


def fit_edge(coords, vals, n, deg=3):
    ok = vals >= 0
    if ok.sum() < n * 0.3:
        return None
    x, y = coords[ok].astype(np.float64), vals[ok].astype(np.float64)
    for _ in range(3):                       # robust refit, drop outliers
        p = np.polyfit(x, y, deg)
        r = np.abs(np.polyval(p, x) - y)
        keep = r < max(3.0, 2.5 * np.median(r))
        x, y = x[keep], y[keep]
    return np.polyval(np.polyfit(x, y, deg), np.arange(n))


def flatten_curl(warped):
    """Straighten residual page curl using the four frame edges."""
    h, w = warped.shape[:2]
    m = biggest_ring(frame_mask(warped)) > 0
    band = int(0.08 * w)
    ys, xs = np.arange(h), np.arange(w)
    inner = slice(int(0.06 * h), int(0.94 * h))
    innerx = slice(int(0.06 * w), int(0.94 * w))

    def first(a):
        idx = a.argmax(1)
        return np.where(a.any(1), idx, -1)

    left = first(m[:, :band]).astype(float)
    right = first(m[:, ::-1][:, :band]).astype(float)
    top = first(m[:band, :].T).astype(float)
    bot = first(m[::-1, :][:band, :].T).astype(float)
    for arr, sl in ((left, inner), (right, inner), (top, innerx), (bot, innerx)):
        arr[:sl.start] = -1
        arr[sl.stop:] = -1

    L, R = fit_edge(ys, left, h), fit_edge(ys, right, h)
    T, B = fit_edge(xs, top, w), fit_edge(xs, bot, w)
    if any(e is None for e in (L, R, T, B)):
        return warped
    R = (w - 1) - R
    B = (h - 1) - B
    gx, gy = np.meshgrid(xs.astype(np.float32), ys.astype(np.float32))
    u, v = gx / (w - 1), gy / (h - 1)
    # source x for each target pixel: interpolate between curved left/right edges
    Lr, Rr = L[gy.astype(int)], R[gy.astype(int)]
    Tc, Bc = T[gx.astype(int)], B[gx.astype(int)]
    mapx = (Lr + u * (Rr - Lr)).astype(np.float32)
    mapy = (Tc + v * (Bc - Tc)).astype(np.float32)
    return cv2.remap(warped, mapx, mapy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def whiten(img):
    """Flatten lighting, push paper to pure white, keep inks and colours."""
    f = img.astype(np.float32)
    small = cv2.resize(f, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)
    bg = cv2.dilate(small, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    bg = cv2.medianBlur(bg.astype(np.uint8), 21).astype(np.float32)
    bg = cv2.GaussianBlur(bg, (0, 0), 8)
    bg = cv2.resize(bg, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_CUBIC)
    n = np.clip(f / np.maximum(bg, 1) , 0, 1.5)          # 1.0 == paper
    # levels: paper (and faint show-through) -> white, ink -> deep
    lo, hi = 0.30, 0.86
    n = np.clip((n - lo) / (hi - lo), 0, 1)
    n = n ** 1.35
    out = (n * 255).astype(np.uint8)
    # boost colour so red titles / yellow highlights / blue frame look printed
    hsv = cv2.cvtColor(out, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * 1.35, 0, 255)
    out = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    # remove remaining low-saturation light grey speckle (show-through)
    g = cv2.cvtColor(out, cv2.COLOR_BGR2GRAY)
    sat = cv2.cvtColor(out, cv2.COLOR_BGR2HSV)[..., 1]
    out[(g > 205) & (sat < 40)] = 255
    # gentle sharpening for crisp text
    blur = cv2.GaussianBlur(out, (0, 0), 1.2)
    return cv2.addWeighted(out, 1.5, blur, -0.5, 0)


def process(path):
    img = cv2.imread(path)
    ring = biggest_ring(frame_mask(img))
    c = find_corners(ring)
    pad = 12
    dst = np.array([[pad, pad], [FRAME_W + pad, pad], [FRAME_W + pad, FRAME_H + pad], [pad, FRAME_H + pad]], np.float32)
    H = cv2.getPerspectiveTransform(c, dst)
    warped = cv2.warpPerspective(img, H, (FRAME_W + 2 * pad, FRAME_H + 2 * pad),
                                 flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    warped = flatten_curl(warped)
    clean = whiten(warped)
    page = np.full((PAGE_H, PAGE_W, 3), 255, np.uint8)
    # keep only the framed area; everything outside is clean paper
    inner = clean[pad - 4:pad + FRAME_H + 4, pad - 4:pad + FRAME_W + 4]
    page[MY - 4:MY + FRAME_H + 4, MX - 4:MX + FRAME_W + 4] = inner
    redraw_thin_edges(page)
    return page


def redraw_thin_edges(page):
    """The top/bottom frame rules are hairlines that fade in photos; redraw them crisp."""
    band = page[MY + 200:MY + FRAME_H - 200, MX:MX + 120]
    hsv = cv2.cvtColor(band, cv2.COLOR_BGR2HSV)
    sel = (hsv[..., 1] > 120) & (hsv[..., 0] > 90) & (hsv[..., 0] < 115)
    color = tuple(int(c) for c in np.median(band[sel], axis=0)) if sel.sum() > 100 else (210, 170, 40)
    t = 7
    page[MY:MY + t, MX:MX + FRAME_W] = color
    page[MY + FRAME_H - t:MY + FRAME_H, MX:MX + FRAME_W] = color
    page[:MY, :] = 255
    page[MY + FRAME_H:, :] = 255


def main(src, out):
    os.makedirs(out, exist_ok=True)
    files = sorted(glob.glob(os.path.join(src, 'page_*.jpg')))
    pages = []
    for f in files:
        p = process(f)
        o = os.path.join(out, os.path.basename(f))
        cv2.imwrite(o, p, [cv2.IMWRITE_JPEG_QUALITY, 92])
        pages.append(o)
        print('ok', o)
    layout = img2pdf.get_layout_fun((img2pdf.mm_to_pt(210), img2pdf.mm_to_pt(297)))
    with open(os.path.join(out, 'malzama.pdf'), 'wb') as fh:
        fh.write(img2pdf.convert(pages, layout_fun=layout))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
