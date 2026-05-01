export type CaseType =
  | 'sentence'
  | 'lower'
  | 'upper'
  | 'title'
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'kebab'
  | 'constant'
  | 'dot'
  | 'toggle'
  | 'inverse';

export interface CaseInfo {
  name: string;
  key: CaseType;
  description: string;
  example: string;
}

export const CASE_INFO: CaseInfo[] = [
  { name: 'Sentence case', key: 'sentence', description: 'First letter of sentence capitalized', example: 'Hello world example text' },
  { name: 'lower case', key: 'lower', description: 'All lowercase', example: 'hello world example text' },
  { name: 'UPPER CASE', key: 'upper', description: 'All uppercase', example: 'HELLO WORLD EXAMPLE TEXT' },
  { name: 'Title Case', key: 'title', description: 'First letter of each word capitalized', example: 'Hello World Example Text' },
  { name: 'camelCase', key: 'camel', description: 'First word lowercase, rest capitalized', example: 'helloWorldExampleText' },
  { name: 'PascalCase', key: 'pascal', description: 'All words capitalized', example: 'HelloWorldExampleText' },
  { name: 'snake_case', key: 'snake', description: 'Lowercase with underscores', example: 'hello_world_example_text' },
  { name: 'kebab-case', key: 'kebab', description: 'Lowercase with hyphens', example: 'hello-world-example-text' },
  { name: 'CONSTANT_CASE', key: 'constant', description: 'Uppercase with underscores', example: 'HELLO_WORLD_EXAMPLE_TEXT' },
  { name: 'dot.case', key: 'dot', description: 'Lowercase with dots', example: 'hello.world.example.text' },
  { name: 'tOGGLE cASE', key: 'toggle', description: 'Alternating case', example: 'hElLo WoRlD eXaMpLe' },
  { name: 'iNVERSE CASE', key: 'inverse', description: 'Swap upper and lower case', example: 'hELLO WORLD EXAMPLE TEXT' },
];

export function toSentenceCase(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-.\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^\w|[.!?]\s+\w)/g, (m) => m.toUpperCase())
    .replace(/(?<!^)[\w]+/g, (m, offset, str) => {
      const before = str.slice(0, offset);
      if (/[.!?]\s*$/.test(before)) return m.toLowerCase();
      return m;
    });
}

export function toLowerCase(text: string): string {
  return text.toLowerCase();
}

export function toUpperCase(text: string): string {
  return text.toUpperCase();
}

export function toTitleCase(text: string): string {
  const minorWords = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'yet', 'so', 'in', 'on', 'at', 'to', 'by', 'up', 'as', 'is', 'of', 'if']);

  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-.\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word, index, arr) => {
      const lower = word.toLowerCase();
      if (index === 0 || index === arr.length - 1) return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      if (minorWords.has(lower)) return lower;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

export function toCamelCase(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-.\s]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word, index) => {
      if (index === 0) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join('');
}

export function toPascalCase(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-.\s]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

export function toSnakeCase(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[_\-.\s]+/g, '_')
    .toLowerCase()
    .replace(/^_|_$/g, '')
    .replace(/_+/g, '_');
}

export function toKebabCase(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[_\-.\s]+/g, '-')
    .toLowerCase()
    .replace(/^-|-$/g, '')
    .replace(/-+/g, '-');
}

export function toConstantCase(text: string): string {
  return toSnakeCase(text).toUpperCase();
}

export function toDotCase(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, '$1.$2')
    .replace(/[_\-.\s]+/g, '.')
    .toLowerCase()
    .replace(/^\./g, '')
    .replace(/\.+/g, '.');
}

export function toToggleCase(text: string): string {
  let toggle = false;
  return text
    .split('')
    .map((char) => {
      if (/[a-zA-Z]/.test(char)) {
        const result = toggle ? char.toUpperCase() : char.toLowerCase();
        toggle = true;
        return result;
      }
      toggle = false;
      return char;
    })
    .join('');
}

export function toInverseCase(text: string): string {
  return text
    .split('')
    .map((char) => {
      if (char === char.toUpperCase()) return char.toLowerCase();
      if (char === char.toLowerCase()) return char.toUpperCase();
      return char;
    })
    .join('');
}

export function convertCase(text: string, caseType: CaseType): string {
  const converters: Record<CaseType, (text: string) => string> = {
    sentence: toSentenceCase,
    lower: toLowerCase,
    upper: toUpperCase,
    title: toTitleCase,
    camel: toCamelCase,
    pascal: toPascalCase,
    snake: toSnakeCase,
    kebab: toKebabCase,
    constant: toConstantCase,
    dot: toDotCase,
    toggle: toToggleCase,
    inverse: toInverseCase,
  };
  return converters[caseType]?.(text) ?? text;
}

export function convertAllCases(text: string): Record<CaseType, string> {
  const result: Partial<Record<CaseType, string>> = {};
  for (const info of CASE_INFO) {
    result[info.key] = convertCase(text, info.key);
  }
  return result as Record<CaseType, string>;
}
