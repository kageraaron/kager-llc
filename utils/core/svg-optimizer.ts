export interface SvgOptimizeOptions {
  removeWhitespace?: boolean;
  removeComments?: boolean;
  removeMetadata?: boolean;
  removeDesc?: boolean;
  removeDefs?: boolean;
  shortenIds?: boolean;
  precision?: number;
  convertColors?: boolean;
  removeUnusedDefs?: boolean;
}

export interface SvgOptimizeResult {
  original: string;
  optimized: string;
  originalSize: number;
  optimizedSize: number;
  savingsPercent: number;
  removedElements: string[];
}

export function optimizeSvg(svg: string, options: SvgOptimizeOptions = {}): SvgOptimizeResult {
  const {
    removeWhitespace = true,
    removeComments = true,
    removeMetadata = true,
    removeDesc = true,
    removeDefs = false,
    shortenIds = true,
    precision = 3,
    convertColors = true,
    removeUnusedDefs = true,
  } = options;

  let result = svg;
  const removedElements: string[] = [];

  if (removeComments) {
    const commentCount = (result.match(/<!--[\s\S]*?-->/g) || []).length;
    if (commentCount > 0) removedElements.push(`${commentCount} comment(s)`);
    result = result.replace(/<!--[\s\S]*?-->/g, '');
  }

  if (removeMetadata) {
    const metadataMatch = result.match(/<metadata[\s\S]*?<\/metadata>/gi);
    if (metadataMatch) {
      removedElements.push('metadata');
      result = result.replace(/<metadata[\s\S]*?<\/metadata>/gi, '');
    }
  }

  if (removeDesc) {
    const descCount = (result.match(/<desc[\s\S]*?<\/desc>/gi) || []).length;
    if (descCount > 0) removedElements.push(`${descCount} desc element(s)`);
    result = result.replace(/<desc[\s\S]*?<\/desc>/gi, '');
  }

  if (precision !== undefined) {
    result = result.replace(/(-?\d*\.?\d+)/g, (match) => {
      const num = parseFloat(match);
      if (isNaN(num)) return match;
      return parseFloat(num.toFixed(precision)).toString();
    });
  }

  if (convertColors) {
    const colorMap: Record<string, string> = {
      black: '#000',
      white: '#fff',
      red: '#f00',
      green: '#0f0',
      blue: '#00f',
      yellow: '#ff0',
      cyan: '#0ff',
      magenta: '#f0f',
      gray: '#808080',
      grey: '#808080',
    };
    for (const [name, hex] of Object.entries(colorMap)) {
      const regex = new RegExp(`(?<=[:;\\s=])${name}(?=[;\\s}"])`, 'gi');
      if (regex.test(result)) {
        result = result.replace(regex, hex);
        removedElements.push(`color "${name}" -> "${hex}"`);
      }
    }
  }

  if (shortenIds) {
    const idMap = new Map<string, string>();
    let idCounter = 0;
    const idRegex = /id="([^"]+)"/g;
    const idRefs: string[] = [];
    const refRegex = /(?:url\(#|href="#|xlink:href="#)([^"]+)"/g;

    let match;
    while ((match = idRegex.exec(result)) !== null) {
      idMap.set(match[1], `a${idCounter}`);
      idCounter++;
    }
    while ((match = refRegex.exec(result)) !== null) {
      idRefs.push(match[1]);
    }

    for (const [oldId, newId] of idMap) {
      result = result.replace(new RegExp(`id="${oldId}"`, 'g'), `id="${newId}"`);
      result = result.replace(new RegExp(`url\\(#${oldId}\\)`, 'g'), `url(#${newId})`);
      result = result.replace(new RegExp(`href="#${oldId}"`, 'g'), `href="#${newId}"`);
      result = result.replace(new RegExp(`xlink:href="#${oldId}"`, 'g'), `xlink:href="#${newId}"`);
    }

    if (idMap.size > 0) {
      removedElements.push(`${idMap.size} id(s) shortened`);
    }
  }

  if (removeDefs && !removeUnusedDefs) {
    const defsMatch = result.match(/<defs[\s\S]*?<\/defs>/gi);
    if (defsMatch) {
      removedElements.push('defs element(s)');
      result = result.replace(/<defs[\s\S]*?<\/defs>/gi, '');
    }
  }

  if (removeWhitespace) {
    result = result.replace(/>\s+</g, '><');
    result = result.replace(/\s+/g, ' ');
    result = result.replace(/\s*([=<>\/:"';])\s*/g, '$1');
  }

  result = result.trim();

  const originalSize = new Blob([svg]).size;
  const optimizedSize = new Blob([result]).size;
  const savingsPercent = originalSize > 0 ? Math.round((1 - optimizedSize / originalSize) * 100) : 0;

  return {
    original: svg,
    optimized: result,
    originalSize,
    optimizedSize,
    savingsPercent,
    removedElements,
  };
}

export function minifySvg(svg: string): string {
  return optimizeSvg(svg, {
    removeWhitespace: true,
    removeComments: true,
    removeMetadata: true,
    removeDesc: true,
    precision: 2,
    convertColors: true,
  }).optimized;
}

export function validateSvg(svg: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!svg.trim().startsWith('<svg')) {
    errors.push('SVG must start with <svg> tag');
  }

  const openSvg = (svg.match(/<svg[\s>]/gi) || []).length;
  const closeSvg = (svg.match(/<\/svg>/gi) || []).length;
  if (openSvg !== closeSvg) {
    errors.push(`Mismatched <svg> tags: ${openSvg} opening, ${closeSvg} closing`);
  }

  if (!svg.includes('xmlns=')) {
    errors.push('Missing xmlns attribute');
  }

  if (!svg.includes('viewBox=')) {
    errors.push('Missing viewBox attribute');
  }

  const tags = svg.match(/<(\w+)[\s/>]/g) || [];
  const selfClosing = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'use', 'stop']);

  for (const tag of tags) {
    const tagName = tag.match(/<(\w+)/)?.[1]?.toLowerCase();
    if (tagName && !selfClosing.has(tagName) && !tag.endsWith('/>') && !tag.includes('>')) {
      continue;
    }
  }

  return { valid: errors.length === 0, errors };
}

export function getSvgDimensions(svg: string): { width?: number; height?: number; viewBox?: { x: number; y: number; w: number; h: number } } {
  const result: { width?: number; height?: number; viewBox?: { x: number; y: number; w: number; h: number } } = {};

  const widthMatch = svg.match(/width="([^"]+)"/);
  const heightMatch = svg.match(/height="([^"]+)"/);
  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);

  if (widthMatch) result.width = parseFloat(widthMatch[1]);
  if (heightMatch) result.height = parseFloat(heightMatch[1]);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/[\s,]+/).map(Number);
    if (parts.length === 4) {
      result.viewBox = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
    }
  }

  return result;
}
