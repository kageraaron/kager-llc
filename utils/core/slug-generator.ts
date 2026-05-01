export interface SlugOptions {
  separator?: string;
  lowercase?: boolean;
  maxLength?: number;
  truncateAtWord?: boolean;
  allowUnicode?: boolean;
  removeArticles?: boolean;
}

export function generateSlug(text: string, options: SlugOptions = {}): string {
  const {
    separator = '-',
    lowercase = true,
    maxLength,
    truncateAtWord = true,
    allowUnicode = false,
    removeArticles = false,
  } = options;

  let result = text.trim();

  if (removeArticles) {
    result = result.replace(/^(a|an|the)\s+/i, '');
  }

  if (allowUnicode) {
    result = result.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  } else {
    result = transliterate(result);
  }

  if (lowercase) {
    result = result.toLowerCase();
  }

  const escapedSeparator = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const charClass = allowUnicode ? '\\p{L}' : 'a-z0-9';
  const regex = new RegExp(`[^${charClass}${escapedSeparator}\\s]`, allowUnicode ? 'gu' : 'g');
  result = result.replace(regex, '');

  result = result.replace(/\s+/g, separator);

  result = result.replace(new RegExp(`${escapedSeparator}+`, 'g'), separator);

  result = result.replace(new RegExp(`^${escapedSeparator}|${escapedSeparator}$`, 'g'), '');

  if (maxLength && result.length > maxLength) {
    if (truncateAtWord) {
      const truncated = result.slice(0, maxLength);
      const lastSep = truncated.lastIndexOf(separator);
      result = lastSep > 0 ? truncated.slice(0, lastSep) : truncated;
    } else {
      result = result.slice(0, maxLength);
    }
  }

  return result;
}

function transliterate(text: string): string {
  const charMap: Record<string, string> = {
    'a': 'a', 'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a', 'æ': 'ae',
    'c': 'c', 'ç': 'c',
    'e': 'e', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'i': 'i', 'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
    'n': 'n', 'ñ': 'n',
    'o': 'o', 'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ø': 'o',
    's': 's', 'ß': 'ss',
    'u': 'u', 'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
    'y': 'y', 'ý': 'y', 'ÿ': 'y',
    'z': 'z', 'ž': 'z',
    'œ': 'oe',
  };

  return text
    .normalize('NFD')
    .split('')
    .map((char) => charMap[char.toLowerCase()] ?? char)
    .join('')
    .replace(/[^a-z0-9\s-]/gi, '');
}

export function generateUniqueSlug(
  baseText: string,
  existingSlugs: Set<string>,
  options: SlugOptions = {},
  maxAttempts: number = 100
): string {
  let slug = generateSlug(baseText, options);
  if (!existingSlugs.has(slug)) return slug;

  for (let i = 1; i <= maxAttempts; i++) {
    const numberedSlug = `${slug}${options.separator ?? '-'}${i}`;
    if (!existingSlugs.has(numberedSlug)) return numberedSlug;
  }

  const timestamp = Date.now().toString(36);
  return `${slug}${options.separator ?? '-'}${timestamp}`;
}

export function slugToTitle(slug: string, separator: string = '-'): string {
  return slug
    .split(separator)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function validateSlug(slug: string, options: { separator?: string; maxLength?: number } = {}): { valid: boolean; errors: string[] } {
  const { separator = '-', maxLength } = options;
  const errors: string[] = [];

  if (slug.length === 0) {
    errors.push('Slug cannot be empty');
    return { valid: false, errors };
  }

  const escapedSep = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^[a-z0-9]([a-z0-9${escapedSep}]*[a-z0-9])?$`);
  if (!pattern.test(slug)) {
    errors.push(`Slug can only contain lowercase letters, numbers, and "${separator}"`);
  }

  if (slug.startsWith(separator) || slug.endsWith(separator)) {
    errors.push(`Slug cannot start or end with "${separator}"`);
  }

  if (slug.includes(separator.repeat(2))) {
    errors.push('Slug cannot contain consecutive separators');
  }

  if (maxLength && slug.length > maxLength) {
    errors.push(`Slug exceeds maximum length of ${maxLength}`);
  }

  return { valid: errors.length === 0, errors };
}

export interface SlugSuggestions {
  primary: string;
  alternatives: string[];
  seoOptimized: string;
}

export function generateSlugSuggestions(
  title: string,
  options: SlugOptions = {}
): SlugSuggestions {
  const primary = generateSlug(title, options);

  const stopWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
  const seoFriendly = title
    .split(/\s+/)
    .filter((word) => !stopWords.has(word.toLowerCase()))
    .join(' ');
  const seoOptimized = generateSlug(seoFriendly, { ...options, maxLength: 60 });

  const alternatives = [
    generateSlug(title, { ...options, separator: '_' }),
    generateSlug(title, { ...options, removeArticles: true }),
    generateSlug(title, { ...options, maxLength: 40, truncateAtWord: true }),
  ].filter((s) => s !== primary);

  return { primary, alternatives, seoOptimized };
}
