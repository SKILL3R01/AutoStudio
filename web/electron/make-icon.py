"""Generates electron/icon.png (512×512): a purple rounded square with a white play triangle. Pure stdlib."""
import struct
import zlib
from pathlib import Path

S = 512


def inside_round_rect(x, y, r=110, m=16):
    x0, y0, x1, y1 = m, m, S - m, S - m
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def inside_triangle(x, y):
    a, b, c = (200, 150), (200, 362), (372, 256)
    def side(p, q):
        return (x - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (y - q[1])
    d1, d2, d3 = side(a, b), side(b, c), side(c, a)
    return not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0))


rows = bytearray()
for y in range(S):
    rows.append(0)
    for x in range(S):
        if inside_triangle(x, y):
            rows += bytes((255, 255, 255, 255))
        elif inside_round_rect(x, y):
            t = (x + y) / (2 * S)
            rows += bytes((int(139 - 60 * t), int(108 - 50 * t), int(255 - 40 * t), 255))
        else:
            rows += bytes((0, 0, 0, 0))


def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", S, S, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + chunk(b"IEND", b"")
out = Path(__file__).with_name("icon.png")
out.write_bytes(png)
print("wrote", out)
