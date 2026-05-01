export type NumberBase = 2 | 8 | 10 | 16 | 32 | 36 | 64;

export interface BaseConversionResult {
  input: string;
  inputBase: number;
  outputs: Record<string, string>;
  decimal: string;
  isValid: boolean;
  error?: string;
}

export const BASE_INFO: Record<number, { name: string; prefix: string }> = {
  2: { name: 'Binary', prefix: '0b' },
  8: { name: 'Octal', prefix: '0o' },
  10: { name: 'Decimal', prefix: '' },
  16: { name: 'Hexadecimal', prefix: '0x' },
  32: { name: 'Base32', prefix: '' },
  36: { name: 'Base36', prefix: '' },
};

export function convertBase(value: string, fromBase: number, toBase: number): string | null {
  if (fromBase < 2 || fromBase > 36 || toBase < 2 || toBase > 36) {
    return null;
  }

  try {
    const cleaned = value.replace(/^[0-9a-z]+:/i, '').replace(/^0[xob]/i, '');
    const decimal = parseInt(cleaned, fromBase);
    if (isNaN(decimal)) return null;
    return decimal.toString(toBase);
  } catch {
    return null;
  }
}

export function convertAllBases(value: string, fromBase: NumberBase): BaseConversionResult {
  const cleaned = value.replace(/^[0-9a-z]+:/i, '').replace(/^0[xobq]/i, '').trim().toUpperCase();

  if (fromBase === 2 && !/^[01]+$/.test(cleaned)) {
    return { input: value, inputBase: fromBase, outputs: {}, decimal: '', isValid: false, error: 'Invalid binary number' };
  }
  if (fromBase === 8 && !/^[0-7]+$/.test(cleaned)) {
    return { input: value, inputBase: fromBase, outputs: {}, decimal: '', isValid: false, error: 'Invalid octal number' };
  }
  if (fromBase === 10 && !/^\d+$/.test(cleaned)) {
    return { input: value, inputBase: fromBase, outputs: {}, decimal: '', isValid: false, error: 'Invalid decimal number' };
  }
  if (fromBase === 16 && !/^[0-9A-F]+$/.test(cleaned)) {
    return { input: value, inputBase: fromBase, outputs: {}, decimal: '', isValid: false, error: 'Invalid hexadecimal number' };
  }

  const decimal = parseInt(cleaned, fromBase);
  if (isNaN(decimal)) {
    return { input: value, inputBase: fromBase, outputs: {}, decimal: '', isValid: false, error: 'Conversion failed' };
  }

  const outputs: Record<string, string> = {};
  const targetBases: NumberBase[] = [2, 8, 10, 16, 32, 36];

  for (const base of targetBases) {
    if (base === fromBase) continue;
    outputs[base.toString()] = decimal.toString(base).toUpperCase();
  }

  return {
    input: value,
    inputBase: fromBase,
    outputs,
    decimal: decimal.toString(10),
    isValid: true,
  };
}

export function isValidForBase(value: string, base: number): boolean {
  const cleaned = value.replace(/^[0-9a-z]+:/i, '').replace(/^0[xobq]/i, '').trim();
  if (cleaned === '') return false;

  const maxDigit = base <= 10 ? '0123456789'.slice(0, base) : '0123456789abcdefghijklmnopqrstuvwxyz'.slice(0, base);
  const pattern = new RegExp(`^[${maxDigit}]+$`, 'i');
  return pattern.test(cleaned);
}

export function detectBase(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.startsWith('0b') || trimmed.startsWith('0B')) return 2;
  if (trimmed.startsWith('0o') || trimmed.startsWith('0O')) return 8;
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) return 16;
  if (trimmed.startsWith('data:') || trimmed.startsWith('base64:')) return 64;

  const cleaned = trimmed.replace(/^0+/, '') || '0';
  if (/^[01]+$/.test(cleaned)) return 2;
  if (/^[0-7]+$/.test(cleaned)) return 8;
  if (/^\d+$/.test(cleaned)) return 10;
  if (/^[0-9a-fA-F]+$/.test(cleaned)) return 16;
  if (/^[0-9a-zA-Z+/]+=*$/.test(cleaned) && cleaned.length > 10) return 64;

  return 10;
}

export interface BitwiseOperation {
  name: string;
  symbol: string;
  description: string;
  fn: (a: number, b: number) => number;
}

export const BITWISE_OPS: BitwiseOperation[] = [
  { name: 'AND', symbol: '&', description: 'Bitwise AND', fn: (a, b) => a & b },
  { name: 'OR', symbol: '|', description: 'Bitwise OR', fn: (a, b) => a | b },
  { name: 'XOR', symbol: '^', description: 'Bitwise XOR', fn: (a, b) => a ^ b },
  { name: 'NOT', symbol: '~', description: 'Bitwise NOT (on first operand)', fn: (a) => ~a },
  { name: 'Left Shift', symbol: '<<', description: 'Left shift', fn: (a, b) => a << b },
  { name: 'Right Shift', symbol: '>>', description: 'Right shift', fn: (a, b) => a >> b },
  { name: 'Unsigned Right Shift', symbol: '>>>', description: 'Unsigned right shift', fn: (a, b) => a >>> b },
];

export function toBinaryString(num: number, bits: number = 32): string {
  return (num >>> 0).toString(2).padStart(bits, '0');
}

export function getBitAt(num: number, position: number): number {
  return (num >> position) & 1;
}

export function setBit(num: number, position: number): number {
  return num | (1 << position);
}

export function clearBit(num: number, position: number): number {
  return num & ~(1 << position);
}

export function toggleBit(num: number, position: number): number {
  return num ^ (1 << position);
}
