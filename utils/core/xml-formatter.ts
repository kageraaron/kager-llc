export interface XmlFormatOptions {
  indentSize?: number;
  indentChar?: ' ' | '\t';
  selfClosingSpace?: boolean;
  preserveComments?: boolean;
}

export function formatXml(xml: string, options: XmlFormatOptions = {}): string {
  const { indentSize = 2, indentChar = ' ', selfClosingSpace = true, preserveComments = true } = options;
  const indent = indentChar.repeat(indentSize);
  let formatted = '';
  let depth = 0;
  let i = 0;

  xml = xml.replace(/>\s*</g, '><').trim();

  while (i < xml.length) {
    if (xml[i] === '<') {
      const commentEnd = xml.indexOf('-->', i);
      if (xml.slice(i, i + 4) === '<!--' && commentEnd !== -1 && preserveComments) {
        formatted += '\n' + indent.repeat(depth) + xml.slice(i, commentEnd + 3);
        i = commentEnd + 3;
        continue;
      }

      const tagEnd = xml.indexOf('>', i);
      if (tagEnd === -1) {
        formatted += xml.slice(i);
        break;
      }

      const tag = xml.slice(i, tagEnd + 1);
      const isClosing = tag.startsWith('</');
      const isSelfClosing = tag.endsWith('/>') || isVoidElement(tag);
      const isDeclaration = tag.startsWith('<?');
      const isDoctype = tag.toUpperCase().startsWith('<!DOCTYPE');

      if (isClosing) {
        depth--;
        formatted += '\n' + indent.repeat(Math.max(0, depth)) + tag;
      } else if (isDeclaration || isDoctype) {
        formatted += '\n' + indent.repeat(depth) + tag;
      } else {
        formatted += '\n' + indent.repeat(depth) + tag;
        if (!isSelfClosing) {
          depth++;
        }
      }

      i = tagEnd + 1;
    } else {
      const nextTag = xml.indexOf('<', i);
      const text = xml.slice(i, nextTag === -1 ? undefined : nextTag);
      const trimmedText = text.trim();
      if (trimmedText) {
        formatted += '\n' + indent.repeat(depth) + trimmedText;
      }
      i = nextTag === -1 ? xml.length : nextTag;
    }
  }

  return formatted.trim() + '\n';
}

function isVoidElement(tag: string): boolean {
  const voidElements = [
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
  ];
  const match = tag.match(/<\s*\/?(\w+)/);
  return match ? voidElements.includes(match[1].toLowerCase()) : false;
}

export function minifyXml(xml: string): string {
  return xml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface XmlValidationError {
  line: number;
  column: number;
  message: string;
}

export function validateXml(xml: string): XmlValidationError[] {
  const errors: XmlValidationError[] = [];
  const stack: string[] = [];
  const lines = xml.split('\n');
  let lineNum = 0;
  let colNum = 0;

  const tagRegex = /(<\/?)([\w-]+)([^>]*)\/?>/g;
  let match;

  while ((match = tagRegex.exec(xml)) !== null) {
    const isClosing = match[1] === '</';
    const tagName = match[2];
    const isSelfClosing = match[0].endsWith('/>');
    const isVoid = isVoidElement(`<${tagName}`);

    lineNum = xml.slice(0, match.index).split('\n').length;
    colNum = match.index - xml.slice(0, match.index).lastIndexOf('\n');

    if (isClosing) {
      if (stack.length === 0) {
        errors.push({ line: lineNum, column: colNum, message: `Unexpected closing tag </${tagName}>` });
      } else if (stack[stack.length - 1] !== tagName) {
        errors.push({
          line: lineNum,
          column: colNum,
          message: `Expected </${stack[stack.length - 1]}> but found </${tagName}>`,
        });
      } else {
        stack.pop();
      }
    } else if (!isSelfClosing && !isVoid) {
      stack.push(tagName);
    }
  }

  for (const unclosed of stack) {
    errors.push({ line: lines.length, column: 0, message: `Unclosed tag <${unclosed}>` });
  }

  return errors;
}

export function xmlToJson(xml: string): Record<string, unknown> | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) return null;
    return elementToJson(doc.documentElement);
  } catch {
    return null;
  }
}

function elementToJson(element: Element): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const attr of Array.from(element.attributes)) {
    result[`@${attr.name}`] = attr.value;
  }

  if (element.childNodes.length === 1 && element.childNodes[0].nodeType === Node.TEXT_NODE) {
    const text = element.textContent?.trim();
    if (text) return text as unknown as Record<string, unknown>;
  }

  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const childJson = elementToJson(el);
      const tag = el.tagName;
      if (result[tag]) {
        if (!Array.isArray(result[tag])) {
          result[tag] = [result[tag]];
        }
        (result[tag] as unknown[]).push(childJson);
      } else {
        result[tag] = childJson;
      }
    } else if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent?.trim();
      if (text) result['#text'] = text;
    }
  }

  return result;
}
