export type UuidVersion = 'v1' | 'v4' | 'v7';

export interface UuidOptions {
  version?: UuidVersion;
  count?: number;
}

export function generateUuid(options: UuidOptions = {}): string {
  const { version = 'v4' } = options;
  switch (version) {
    case 'v4':
      return generateUuidV4();
    case 'v7':
      return generateUuidV7();
    case 'v1':
      return generateUuidV1();
    default:
      return generateUuidV4();
  }
}

export function generateUuidBatch(count: number, version: UuidVersion = 'v4'): string[] {
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(generateUuid({ version }));
  }
  return result;
}

function generateUuidV4(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

function generateUuidV7(): string {
  const bytes = new Uint8Array(16);
  const timestamp = Date.now();

  bytes[0] = (timestamp / 0x10000000000) & 0xff;
  bytes[1] = (timestamp / 0x100000000) & 0xff;
  bytes[2] = (timestamp / 0x1000000) & 0xff;
  bytes[3] = (timestamp / 0x10000) & 0xff;
  bytes[4] = (timestamp / 0x100) & 0xff;
  bytes[5] = timestamp & 0xff;

  crypto.getRandomValues(new Uint8Array(bytes.buffer, 6, 10));
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return bytesToUuid(bytes);
}

function generateUuidV1(): string {
  const timestamp = BigInt(Date.now()) * 10000n + 122192928000000000n;
  const bytes = new Uint8Array(16);

  bytes[0] = Number((timestamp >> 24n) & 0xffn);
  bytes[1] = Number((timestamp >> 16n) & 0xffn);
  bytes[2] = Number((timestamp >> 8n) & 0xffn);
  bytes[3] = Number(timestamp & 0xffn);
  bytes[4] = Number((timestamp >> 32n) & 0xffn);
  bytes[5] = Number((timestamp >> 40n) & 0xffn);

  crypto.getRandomValues(new Uint8Array(bytes.buffer, 6, 10));
  bytes[6] = (bytes[6] & 0x0f) | 0x10;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return bytesToUuid(bytes);
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function isValidUuid(uuid: string): boolean {
  const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return pattern.test(uuid);
}

export function getUuidVersion(uuid: string): UuidVersion | null {
  if (!isValidUuid(uuid)) return null;
  const versionChar = uuid.split('-')[2][0];
  switch (versionChar) {
    case '1': return 'v1';
    case '4': return 'v4';
    case '7': return 'v7';
    default: return null;
  }
}

export function extractUuidTimestamp(uuid: string): Date | null {
  const version = getUuidVersion(uuid);
  if (version !== 'v1' && version !== 'v7') return null;

  const hex = uuid.replace(/-/g, '');
  const timestampHex = hex.slice(0, 12);
  const timestampMs = parseInt(timestampHex, 16);

  if (version === 'v1') {
    const unixTimestamp = (BigInt(timestampMs) - 122192928000000000n) / 10000n;
    return new Date(Number(unixTimestamp));
  }

  return new Date(timestampMs);
}
