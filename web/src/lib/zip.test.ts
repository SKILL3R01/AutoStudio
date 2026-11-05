import { describe, expect, it } from 'vitest';
import { crc32, zipFiles } from './zip';

describe('zip writer', () => {
  it('computes CRC-32 and writes a valid stored zip', async () => {
    expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926');
    const z = new Uint8Array(await (await zipFiles([{ name: 'a.txt', data: new TextEncoder().encode('hello') }, { name: 'b.txt', data: new Uint8Array([1, 2, 3]) }])).arrayBuffer());
    const dv = new DataView(z.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    expect(dv.getUint32(z.length - 22, true)).toBe(0x06054b50);
    expect(dv.getUint16(z.length - 22 + 10, true)).toBe(2);
    expect(z.length).toBe(30 + 5 + 5 + 30 + 5 + 3 + 46 + 5 + 46 + 5 + 22);
  });
});
