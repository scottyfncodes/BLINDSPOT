"""
BLINDSPOT surface textures. Run: python3 tools/textures.py
Every texture is seamless (periodic noise built in the frequency domain) and
authored at "lit" brightness: the game's darkness pass makes them night.
512 px covers TILE_M metres (see src/render/materials.ts).
"""
import numpy as np
from PIL import Image, ImageFilter
import os, sys

N = 512
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'tex')
rng = np.random.default_rng(1931)

def fbm(beta=2.0, lo=1.0, seed=None):
    g = np.random.default_rng(seed) if seed is not None else rng
    w = g.standard_normal((N, N))
    f = np.fft.fftfreq(N)[:, None] ** 2 + np.fft.fftfreq(N)[None, :] ** 2
    f[0, 0] = 1
    amp = 1 / np.power(f, beta / 2)
    amp[0, 0] = 0
    k = np.sqrt(f) * N
    amp[k < lo] = 0
    out = np.real(np.fft.ifft2(np.fft.fft2(w) * amp))
    out -= out.min(); out /= out.max()
    return out

def specks(density, size=1, seed=None):
    g = np.random.default_rng(seed)
    m = (g.random((N, N)) < density).astype(float)
    if size > 1:
        img = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(size))
        m = np.asarray(img) / 255.0
    return m

def tint(v, c0, c1):
    c0 = np.array(c0, float); c1 = np.array(c1, float)
    return v[..., None] * (c1 - c0) + c0

def blob_mask(count, rmin, rmax, seed, soft=0.6):
    """Soft periodic blobs (stains, puddles)."""
    g = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:N, 0:N]
    m = np.zeros((N, N))
    warp = fbm(2.2, seed=seed + 7) * 0.5 + 0.75
    for _ in range(count):
        cx, cy, r = g.random() * N, g.random() * N, g.uniform(rmin, rmax)
        dx = np.minimum(abs(xx - cx), N - abs(xx - cx)); dy = np.minimum(abs(yy - cy), N - abs(yy - cy))
        d = np.sqrt(dx * dx + dy * dy) / (r * warp)
        m = np.maximum(m, np.clip((1 - d) / soft, 0, 1))
    return m

def patches(seed, cover, beta=2.6, soft=0.08):
    """Irregular periodic patches: oil, damp, grime. cover is roughly the fraction covered."""
    n = fbm(beta, lo=2, seed=seed)
    t = np.quantile(n, 1 - cover)
    return np.clip((n - t) / soft, 0, 1)

def soften(m, r=1.2):
    return np.asarray(Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))) / 255.0

def lines_grid(step, width, offset=0):
    yy, xx = np.mgrid[0:N, 0:N]
    gx = ((xx + offset) % step) < width
    gy = ((yy + offset) % step) < width
    return (gx | gy).astype(float)

def save(name, rgb):
    rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    Image.fromarray(rgb, 'RGB').save(os.path.join(OUT, name + '.webp'), quality=84, method=6)
    print(name, os.path.getsize(os.path.join(OUT, name + '.webp')))

# --- Terrazzo concourse: 1.5 m slabs (256 px), aggregate chips, worn path ---------
def terrazzo():
    base = fbm(1.4, seed=1) * 0.25 + fbm(2.4, seed=2) * 0.75
    rgb = tint(base, (118, 108, 94), (150, 140, 124))
    # per-slab tone
    slab = 256
    g = np.random.default_rng(3)
    tones = g.uniform(-10, 10, (2, 2))
    yy, xx = np.mgrid[0:N, 0:N]
    rgb += tones[yy // slab, xx // slab][..., None]
    for col, dens, sz, seed in [((206, 196, 176), 0.005, 3, 4), ((52, 48, 42), 0.004, 3, 5), ((140, 74, 52), 0.0015, 3, 6), ((176, 168, 152), 0.02, 1, 8)]:
        m = soften(specks(dens, sz, seed), 0.6) * 0.8
        rgb = rgb * (1 - m[..., None]) + np.array(col) * m[..., None]
    # brass inlay line around each slab, then dark grout
    inlay = lines_grid(slab, 6, 3) - lines_grid(slab, 3, 4) * 0
    rgb = rgb * (1 - inlay[..., None] * 0.55) + np.array((160, 128, 70)) * inlay[..., None] * 0.55
    grout = lines_grid(slab, 2, 0)
    rgb = rgb * (1 - grout[..., None] * 0.7) + np.array((48, 44, 40)) * grout[..., None] * 0.7
    # grime
    grime = patches(9, 0.35, soft=0.4)
    rgb *= (1 - grime[..., None] * 0.08)
    save('terrazzo', rgb)

# --- Platform concrete: fine grain, expansion joints every 2 m, oil and gum -----
def platform():
    grain = fbm(2.8, seed=11) * 0.6 + fbm(1.6, seed=12) * 0.4
    rgb = tint(grain, (104, 100, 92), (132, 127, 118))
    rgb += (specks(0.06, 1, 13) * 14)[..., None] - (specks(0.06, 1, 14) * 14)[..., None]
    joints = lines_grid(256, 2, 0)
    rgb = rgb * (1 - joints[..., None] * 0.6)
    rgb *= (1 - patches(17, 0.4, soft=0.3)[..., None] * 0.12)
    gum = soften(specks(0.00025, 5, 16), 1.0)
    rgb = rgb * (1 - gum[..., None] * 0.6) + np.array((70, 66, 62)) * gum[..., None] * 0.6
    save('platform', rgb)

# --- Asphalt: aggregate, cracks, a tar patch -----------------------------------
def asphalt():
    a = fbm(3.0, seed=21) * 0.7 + fbm(1.5, seed=22) * 0.3
    rgb = tint(a, (44, 43, 41), (66, 64, 60))
    rgb += (specks(0.08, 1, 23) * 22)[..., None]
    # cracks: random walks, periodic
    g = np.random.default_rng(24)
    crack = np.zeros((N, N))
    for _ in range(7):
        x, y = g.random() * N, g.random() * N
        ang = g.random() * np.pi * 2
        for _ in range(g.integers(120, 380)):
            ang += g.normal(0, 0.12)
            x = (x + np.cos(ang)) % N; y = (y + np.sin(ang)) % N
            crack[int(y), int(x)] = 1
    crack = soften(crack, 0.7) * 1.6
    rgb = rgb * (1 - np.clip(crack, 0, 1)[..., None] * 0.5)
    patch = patches(25, 0.12, beta=3.2, soft=0.02)
    rgb = rgb * (1 - patch[..., None] * 0.18)
    wet = patches(26, 0.25, soft=0.2) * 0.3
    rgb = rgb * (1 - wet[..., None]) + np.array((30, 30, 32)) * wet[..., None]
    save('asphalt', rgb)

# --- Paving slabs: 0.9 m-ish squares (128 px at 4 m tile) with chips -----------
def pavement():
    a = fbm(2.6, seed=31)
    rgb = tint(a, (92, 88, 82), (116, 112, 104))
    g = np.random.default_rng(32)
    yy, xx = np.mgrid[0:N, 0:N]
    tones = g.uniform(-14, 10, (4, 4))
    rgb += tones[yy // 128, xx // 128][..., None]
    joints = lines_grid(128, 3, 0)
    rgb = rgb * (1 - joints[..., None] * 0.65)
    rgb += (specks(0.04, 1, 33) * 12)[..., None]
    stain = patches(34, 0.15, soft=0.2)
    rgb *= (1 - stain[..., None] * 0.22)
    save('pavement', rgb)

# --- Ballast: packed gravel ----------------------------------------------------
def ballast():
    g = np.random.default_rng(41)
    pts = g.random((900, 2)) * N
    yy, xx = np.mgrid[0:N, 0:N].astype(float)
    d1 = np.full((N, N), 1e9); d2 = np.full((N, N), 1e9); idx = np.zeros((N, N), int)
    for i, (px, py) in enumerate(pts):
        dx = np.minimum(abs(xx - px), N - abs(xx - px)); dy = np.minimum(abs(yy - py), N - abs(yy - py))
        d = dx * dx + dy * dy
        closer = d < d1
        d2 = np.where(closer, d1, np.minimum(d2, d)); idx = np.where(closer, i, idx); d1 = np.where(closer, d, d1)
    edge = np.clip((np.sqrt(d2) - np.sqrt(d1)) / 4, 0, 1)
    tone = g.uniform(0.6, 1.0, len(pts))[idx]
    v = edge * tone
    rgb = tint(v, (30, 28, 26), (98, 92, 84))
    rust = patches(42, 0.3, soft=0.3) * 0.3
    rgb = rgb * (1 - rust[..., None]) + np.array((92, 60, 40)) * rust[..., None]
    save('ballast', rgb)

# --- Staff lino ----------------------------------------------------------------
def lino():
    a = fbm(1.8, seed=51)
    rgb = tint(a, (78, 86, 78), (92, 100, 90))
    scuff = patches(52, 0.3, beta=3.0, soft=0.2)
    rgb *= (1 - scuff[..., None] * 0.15)
    seams = lines_grid(256, 1, 0)
    rgb *= (1 - seams[..., None] * 0.4)
    save('lino', rgb)

# --- Tar and gravel roof -------------------------------------------------------
def roof():
    a = fbm(3.0, seed=61) * 0.6 + fbm(1.4, seed=62) * 0.4
    rgb = tint(a, (58, 56, 54), (84, 80, 76))
    rgb += (specks(0.12, 1, 63) * 18)[..., None]
    seams = lines_grid(170, 2, 0)
    rgb *= (1 - seams[..., None] * 0.3)
    pond = patches(64, 0.15, soft=0.15) * 0.3
    rgb = rgb * (1 - pond[..., None]) + np.array((40, 42, 46)) * pond[..., None]
    save('roof', rgb)

def cobble():
    src = '/home/user/gitcraft-out/materialcraft/bs_alley_cobble/bs-alley-cobble_basecolor.png'
    im = np.asarray(Image.open(src).convert('RGB')).astype(float)
    save('cobble', im * 0.95)

os.makedirs(OUT, exist_ok=True)
for f in [terrazzo, platform, asphalt, pavement, ballast, lino, roof, cobble]:
    f()
