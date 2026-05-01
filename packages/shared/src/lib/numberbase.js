const BASE_RANGES = {
    2:  { min: 0, max: 0xFFFFFFFF, chars: /^[01]+$/ },
    8:  { min: 0, max: 0xFFFFFFFF, chars: /^[0-7]+$/ },
    10: { min: -2147483648, max: 4294967295, chars: /^-?\d+$/ },
    16: { min: 0, max: 0xFFFFFFFF, chars: /^[0-9a-fA-F]+$/ },
};

export function parseBaseInput(str, base) {
    const s = str.trim().replace(/\s/g, '');
    if (!s) return null;
    const info = BASE_RANGES[base];
    if (!info || !info.chars.test(s)) return null;
    const n = parseInt(s, base);
    if (!Number.isFinite(n) || n < info.min || n > info.max) return null;
    return n;
}

export function convertBases(n) {
    const u = n >>> 0;
    return {
        decimal: String(n),
        binary:  u.toString(2),
        octal:   u.toString(8),
        hex:     u.toString(16).toUpperCase(),
        bits8:   u.toString(2).padStart(8,  '0').slice(-8),
        bits16:  u.toString(2).padStart(16, '0').slice(-16),
        bits32:  u.toString(2).padStart(32, '0').slice(-32),
    };
}
