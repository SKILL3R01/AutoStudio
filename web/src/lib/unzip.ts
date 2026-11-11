/** Minimal zip reader (stored + deflate entries) using the browser's DecompressionStream. Reads only; never runs anything. */
export interface ZipEntry {
  name: string;
  size: number;
  read: () => Promise<Uint8Array>;
}

export async function readZip(data: Blob | ArrayBuffer | Uint8Array): Promise<ZipEntry[]> {
  const buf = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data instanceof Uint8Array ? data : new Uint8Array(data);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // End of central directory: scan back from the end (comment up to 64 KB).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) (eocd = i), (i = -1);
  if (eocd < 0) throw new Error('Not a zip file');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true), local = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen)).replace(/\\/g, '/');
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const read = async () => {
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const raw = buf.subarray(start, start + csize);
      if (method === 0) return raw;
      if (method !== 8) throw new Error(`Unsupported compression in ${name}`);
      const s = new Blob([raw.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(s).arrayBuffer());
    };
    out.push({ name, size, read });
  }
  return out;
}
