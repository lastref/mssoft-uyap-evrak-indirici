"""Generate simple PNG icons without external libraries.
Navy rounded square with a white down-arrow and tray."""
import struct, zlib, sys, os

NAVY = (31, 58, 104)
WHITE = (255, 255, 255)
SIZE = 128


def inside_rounded(x, y, s, r):
    # x,y in [0,s)
    cx = min(max(x, r), s - 1 - r)
    cy = min(max(y, r), s - 1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def in_arrow(x, y):
    # shaft
    if 54 <= x <= 73 and 26 <= y <= 66:
        return True
    # head: triangle apex (64,92), base y=62 from x=34..94
    if 62 <= y <= 92:
        half = (92 - y) * (30 / 30)
        if abs(x - 64) <= half:
            return True
    # tray
    if 30 <= x <= 97 and 100 <= y <= 109:
        return True
    return False


def render(s=SIZE, ss=4):
    # supersample
    big = s * ss
    px = []
    r = big * 0.19
    for y in range(big):
        row = []
        for x in range(big):
            fx, fy = x / ss, y / ss
            if not inside_rounded(x, y, big, r):
                row.append((0, 0, 0, 0))
            elif in_arrow(fx, fy):
                row.append(WHITE + (255,))
            else:
                row.append(NAVY + (255,))
        px.append(row)
    # downsample
    out = []
    for y in range(s):
        row = []
        for x in range(s):
            acc = [0, 0, 0, 0]
            for dy in range(ss):
                for dx in range(ss):
                    p = px[y * ss + dy][x * ss + dx]
                    a = p[3]
                    acc[0] += p[0] * a
                    acc[1] += p[1] * a
                    acc[2] += p[2] * a
                    acc[3] += a
            n = ss * ss
            if acc[3] == 0:
                row.append((0, 0, 0, 0))
            else:
                row.append((acc[0] // acc[3], acc[1] // acc[3], acc[2] // acc[3], acc[3] // n))
        out.append(row)
    return out


def scale(img, s):
    src = len(img)
    out = []
    for y in range(s):
        row = []
        for x in range(s):
            x0, x1 = x * src // s, max((x + 1) * src // s, x * src // s + 1)
            y0, y1 = y * src // s, max((y + 1) * src // s, y * src // s + 1)
            acc = [0, 0, 0, 0]
            n = 0
            for yy in range(y0, y1):
                for xx in range(x0, x1):
                    p = img[yy][xx]
                    acc[0] += p[0] * p[3]
                    acc[1] += p[1] * p[3]
                    acc[2] += p[2] * p[3]
                    acc[3] += p[3]
                    n += 1
            if acc[3] == 0:
                row.append((0, 0, 0, 0))
            else:
                row.append((acc[0] // acc[3], acc[1] // acc[3], acc[2] // acc[3], acc[3] // n))
        out.append(row)
    return out


def write_png(path, img):
    s = len(img)
    raw = b"".join(b"\x00" + b"".join(struct.pack("4B", *p) for p in row) for row in img)

    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    data = b"\x89PNG\r\n\x1a\n"
    data += chunk(b"IHDR", struct.pack(">IIBBBBB", s, s, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw, 9))
    data += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(data)


if __name__ == "__main__":
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    base = render()
    write_png(os.path.join(outdir, "icon128.png"), base)
    write_png(os.path.join(outdir, "icon48.png"), scale(base, 48))
    write_png(os.path.join(outdir, "icon16.png"), scale(base, 16))
    print("ok")
