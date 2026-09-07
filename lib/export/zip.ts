/**
 * A minimal ZIP writer, stored (uncompressed) entries only.
 *
 * The FBX export ships the model and its texture together, because that is what
 * both Mixamo and Blender want: Mixamo accepts a zip of FBX plus textures
 * directly, and Blender finds a texture sitting next to the FBX that references
 * it. A single bare .fbx would arrive with no skin.
 *
 * Stored rather than deflated: Node's zlib only offers raw deflate through an
 * async or sync call per entry, and the saving on an already-compressed PNG
 * plus a text FBX does not justify the extra moving parts. Every zip reader
 * handles stored entries.
 *
 * Format reference: PKWARE APPNOTE.TXT, sections 4.3.7, 4.3.12 and 4.3.16.
 */

const LOCAL_HEADER_SIG = 0x04034b50;
const CENTRAL_HEADER_SIG = 0x02014b50;
const END_OF_CENTRAL_SIG = 0x06054b50;
const VERSION_NEEDED = 20;

/** Standard CRC-32 table, built once. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** Converts a Date into the MS-DOS time and date pair ZIP uses. */
function dosDateTime(date: Date): { time: number; date: number } {
  // DOS timestamps start at 1980 and store seconds in two-second units.
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export function createZip(entries: ZipEntry[], modified = new Date()): Uint8Array {
  const { time, date } = dosDateTime(modified);
  const encoder = new TextEncoder();

  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const checksum = crc32(entry.data);
    const size = entry.data.byteLength;

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, LOCAL_HEADER_SIG, true);
    localView.setUint16(4, VERSION_NEEDED, true);
    localView.setUint16(6, 0, true); // flags
    localView.setUint16(8, 0, true); // method: stored
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, size, true); // compressed
    localView.setUint32(22, size, true); // uncompressed
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true); // extra field length
    local.set(nameBytes, 30);

    parts.push(local, entry.data);

    const centralEntry = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralEntry.buffer);
    centralView.setUint32(0, CENTRAL_HEADER_SIG, true);
    centralView.setUint16(4, VERSION_NEEDED, true); // version made by
    centralView.setUint16(6, VERSION_NEEDED, true); // version needed
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, size, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true); // extra
    centralView.setUint16(32, 0, true); // comment
    centralView.setUint16(34, 0, true); // disk number start
    centralView.setUint16(36, 0, true); // internal attributes
    centralView.setUint32(38, 0, true); // external attributes
    centralView.setUint32(42, offset, true);
    centralEntry.set(nameBytes, 46);

    central.push(centralEntry);
    offset += local.byteLength + size;
  }

  const centralSize = central.reduce((sum, part) => sum + part.byteLength, 0);

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, END_OF_CENTRAL_SIG, true);
  endView.setUint16(4, 0, true); // this disk
  endView.setUint16(6, 0, true); // disk with central directory
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true); // comment length

  const total =
    parts.reduce((sum, part) => sum + part.byteLength, 0) + centralSize + end.byteLength;

  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...parts, ...central, end]) {
    out.set(part, cursor);
    cursor += part.byteLength;
  }

  return out;
}
