export interface DiffResult {
  added: string[];
  removed: string[];
  unchanged: string[];
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
  oldLine?: number;
  newLine?: number;
}

export function diffText(oldText: string, newText: string): DiffResult {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const lcs = longestCommonSubsequence(oldLines, newLines);

  const result: DiffResult = {
    added: [],
    removed: [],
    unchanged: [],
    lines: [],
  };

  let oldIndex = 0;
  let newIndex = 0;
  let lcsIndex = 0;
  let oldLineNumber = 1;
  let newLineNumber = 1;

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (lcsIndex < lcs.length && oldLines[oldIndex] === lcs[lcsIndex] && newLines[newIndex] === lcs[lcsIndex]) {
      result.unchanged.push(oldLines[oldIndex]);
      result.lines.push({
        type: 'unchanged',
        text: oldLines[oldIndex],
        oldLine: oldLineNumber++,
        newLine: newLineNumber++,
      });
      oldIndex++;
      newIndex++;
      lcsIndex++;
    } else if (newIndex < newLines.length && (lcsIndex >= lcs.length || newLines[newIndex] !== lcs[lcsIndex])) {
      result.added.push(newLines[newIndex]);
      result.lines.push({
        type: 'added',
        text: newLines[newIndex],
        newLine: newLineNumber++,
      });
      newIndex++;
    } else {
      result.removed.push(oldLines[oldIndex]);
      result.lines.push({
        type: 'removed',
        text: oldLines[oldIndex],
        oldLine: oldLineNumber++,
      });
      oldIndex++;
    }
  }

  return result;
}

function longestCommonSubsequence(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

export function diffToHtml(diff: DiffResult): string {
  let html = '<div class="diff-output">';
  for (const line of diff.lines) {
    const escaped = escapeHtml(line.text);
    const lineNum = line.oldLine ?? line.newLine ?? '';
    const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
    html += `<div class="diff-line diff-${line.type}">`;
    html += `<span class="diff-line-number">${lineNum}</span>`;
    html += `<span class="diff-prefix">${prefix}</span>`;
    html += `<span class="diff-content">${escaped || '&nbsp;'}</span>`;
    html += '</div>';
  }
  html += '</div>';
  return html;
}

export function diffObjects<T extends Record<string, unknown>>(oldObj: T, newObj: T): Record<string, { old: unknown; new: unknown }> {
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  for (const key of allKeys) {
    const oldVal = oldObj[key];
    const newVal = newObj[key];
    if (oldVal !== newVal) {
      changes[key] = { old: oldVal, new: newVal };
    }
  }

  return changes;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function wordDiff(oldText: string, newText: string): DiffResult {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);
  const lcs = longestCommonSubsequence(oldWords, newWords);

  const result: DiffResult = { added: [], removed: [], unchanged: [], lines: [] };
  let oldIndex = 0;
  let newIndex = 0;
  let lcsIndex = 0;

  while (oldIndex < oldWords.length || newIndex < newWords.length) {
    if (lcsIndex < lcs.length && oldWords[oldIndex] === lcs[lcsIndex] && newWords[newIndex] === lcs[lcsIndex]) {
      result.unchanged.push(oldWords[oldIndex]);
      result.lines.push({ type: 'unchanged', text: oldWords[oldIndex] });
      oldIndex++;
      newIndex++;
      lcsIndex++;
    } else if (newIndex < newWords.length && (lcsIndex >= lcs.length || newWords[newIndex] !== lcs[lcsIndex])) {
      result.added.push(newWords[newIndex]);
      result.lines.push({ type: 'added', text: newWords[newIndex] });
      newIndex++;
    } else {
      result.removed.push(oldWords[oldIndex]);
      result.lines.push({ type: 'removed', text: oldWords[oldIndex] });
      oldIndex++;
    }
  }

  return result;
}
