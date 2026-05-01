export interface CronPart {
  value: string;
  min: number;
  max: number;
  label: string;
  names?: string[];
}

export interface CronExpression {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
  toString: () => string;
}

export interface CronPreset {
  name: string;
  description: string;
  expression: string;
}

export const CRON_PRESETS: CronPreset[] = [
  { name: 'Every minute', description: '* * * * *', expression: '* * * * *' },
  { name: 'Every 5 minutes', description: '*/5 * * * *', expression: '*/5 * * * *' },
  { name: 'Every 10 minutes', description: '*/10 * * * *', expression: '*/10 * * * *' },
  { name: 'Every 15 minutes', description: '*/15 * * * *', expression: '*/15 * * * *' },
  { name: 'Every 30 minutes', description: '*/30 * * * *', expression: '*/30 * * * *' },
  { name: 'Every hour', description: '0 * * * *', expression: '0 * * * *' },
  { name: 'Every 2 hours', description: '0 */2 * * *', expression: '0 */2 * * *' },
  { name: 'Every 6 hours', description: '0 */6 * * *', expression: '0 */6 * * *' },
  { name: 'Every 12 hours', description: '0 */12 * * *', expression: '0 */12 * * *' },
  { name: 'Daily at midnight', description: '0 0 * * *', expression: '0 0 * * *' },
  { name: 'Daily at noon', description: '0 12 * * *', expression: '0 12 * * *' },
  { name: 'Daily at 9 AM', description: '0 9 * * *', expression: '0 9 * * *' },
  { name: 'Weekly (Sunday midnight)', description: '0 0 * * 0', expression: '0 0 * * 0' },
  { name: 'Weekly (Monday 9 AM)', description: '0 9 * * 1', expression: '0 9 * * 1' },
  { name: 'Every weekday at 9 AM', description: '0 9 * * 1-5', expression: '0 9 * * 1-5' },
  { name: 'Monthly (1st at midnight)', description: '0 0 1 * *', expression: '0 0 1 * *' },
  { name: 'Monthly (15th at noon)', description: '0 12 15 * *', expression: '0 12 15 * *' },
  { name: 'Yearly (Jan 1st)', description: '0 0 1 1 *', expression: '0 0 1 1 *' },
];

export const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const CRON_PARTS_CONFIG: CronPart[] = [
  { value: 'minute', min: 0, max: 59, label: 'Minute' },
  { value: 'hour', min: 0, max: 23, label: 'Hour' },
  { value: 'dayOfMonth', min: 1, max: 31, label: 'Day of Month' },
  { value: 'month', min: 1, max: 12, label: 'Month', names: MONTH_NAMES.slice(1) },
  { value: 'dayOfWeek', min: 0, max: 6, label: 'Day of Week', names: DOW_NAMES },
];

export function buildCronExpression(parts: { minute: string; hour: string; dayOfMonth: string; month: string; dayOfWeek: string }): CronExpression {
  return {
    minute: parts.minute || '*',
    hour: parts.hour || '*',
    dayOfMonth: parts.dayOfMonth || '*',
    month: parts.month || '*',
    dayOfWeek: parts.dayOfWeek || '*',
    toString: () => `${parts.minute || '*'} ${parts.hour || '*'} ${parts.dayOfMonth || '*'} ${parts.month || '*'} ${parts.dayOfWeek || '*'}`,
  };
}

export function describeCronExpression(expression: string): string {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return 'Invalid cron expression';

  const [minF, hrF, domF, monF, dowF] = parts;
  const pieces: string[] = [];

  if (minF === '*') {
    pieces.push('every minute');
  } else if (minF.startsWith('*/')) {
    pieces.push(`every ${minF.slice(2)} minutes`);
  } else if (minF.includes(',')) {
    pieces.push(`at minutes ${minF}`);
  } else if (minF.includes('-')) {
    pieces.push(`every minute from ${minF}`);
  } else {
    pieces.push(`at minute ${minF}`);
  }

  if (hrF !== '*') {
    if (hrF.startsWith('*/')) {
      pieces.push(`every ${hrF.slice(2)} hours`);
    } else if (hrF.includes(',')) {
      pieces.push(`at hours ${hrF}`);
    } else if (hrF.includes('-')) {
      pieces.push(`every hour from ${hrF}`);
    } else {
      pieces.push(`at hour ${hrF}`);
    }
  } else {
    pieces.push('every hour');
  }

  if (domF !== '*') {
    if (domF.startsWith('*/')) {
      pieces.push(`every ${domF.slice(2)} days of the month`);
    } else if (domF.includes(',')) {
      pieces.push(`on days ${domF} of the month`);
    } else if (domF.includes('-')) {
      pieces.push(`from day ${domF} of the month`);
    } else {
      pieces.push(`on day ${domF} of the month`);
    }
  }

  if (monF !== '*') {
    if (monF.startsWith('*/')) {
      pieces.push(`every ${monF.slice(2)} months`);
    } else {
      const monthNums = monF.split(',').flatMap((m) => {
        if (m.includes('-')) {
          const [start, end] = m.split('-').map(Number);
          return Array.from({ length: end - start + 1 }, (_, i) => start + i);
        }
        return parseInt(m, 10);
      });
      const monthNames = monthNums.filter((n) => n >= 1 && n <= 12).map((n) => MONTH_NAMES[n]);
      if (monthNames.length > 0) {
        pieces.push(`in ${monthNames.join(', ')}`);
      }
    }
  }

  if (dowF !== '*') {
    if (dowF.startsWith('*/')) {
      pieces.push(`every ${dowF.slice(2)} days of the week`);
    } else {
      const dowNums = dowF.split(',').flatMap((d) => {
        if (d.includes('-')) {
          const [start, end] = d.split('-').map(Number);
          return Array.from({ length: end - start + 1 }, (_, i) => start + i);
        }
        return parseInt(d, 10);
      });
      const dowNames = dowNums.filter((n) => n >= 0 && n <= 6).map((n) => DOW_NAMES[n]);
      if (dowNames.length > 0) {
        pieces.push(`on ${dowNames.join(', ')}`);
      }
    }
  }

  const result = pieces.join(', ');
  return result.charAt(0).toUpperCase() + result.slice(1);
}

export function isValidCronExpression(expression: string): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const validators = [
    (v: string) => isValidCronField(v, 0, 59),
    (v: string) => isValidCronField(v, 0, 23),
    (v: string) => isValidCronField(v, 1, 31),
    (v: string) => isValidCronField(v, 1, 12),
    (v: string) => isValidCronField(v, 0, 6),
  ];

  return parts.every((part, i) => validators[i](part));
}

function isValidCronField(field: string, min: number, max: number): boolean {
  const parts = field.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) return false;

    const [range, step] = trimmed.split('/');
    if (step !== undefined && (isNaN(parseInt(step, 10)) || parseInt(step, 10) < 1)) return false;

    if (range === '*') continue;
    if (range.includes('-')) {
      const [start, end] = range.split('-').map(Number);
      if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) return false;
    } else {
      const num = parseInt(range, 10);
      if (isNaN(num) || num < min || num > max) return false;
    }
  }
  return true;
}

export function getNextRuns(expression: string, count: number = 5, referenceDate?: Date): Date[] {
  if (!isValidCronExpression(expression)) return [];

  const parts = expression.trim().split(/\s+/);
  const minVals = parseCronFieldValues(parts[0], 0, 59);
  const hrVals = parseCronFieldValues(parts[1], 0, 23);
  const domVals = parseCronFieldValues(parts[2], 1, 31);
  const monVals = parseCronFieldValues(parts[3], 1, 12);
  const dowVals = parseCronFieldValues(parts[4], 0, 6);

  if (!minVals || !hrVals || !domVals || !monVals || !dowVals) return [];

  const runs: Date[] = [];
  const now = referenceDate || new Date();
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0);
  const maxIterations = 525600;

  for (let i = 0; i < maxIterations && runs.length < count; i++) {
    const month = cursor.getMonth() + 1;
    const day = cursor.getDate();
    const dow = cursor.getDay();
    const hour = cursor.getHours();
    const minute = cursor.getMinutes();

    if (monVals.includes(month) && domVals.includes(day) && dowVals.includes(dow) && hrVals.includes(hour) && minVals.includes(minute)) {
      runs.push(new Date(cursor));
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return runs;
}

function parseCronFieldValues(field: string, min: number, max: number): number[] | null {
  const vals = new Set<number>();
  const parts = field.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const [rangeStr, stepStr] = trimmed.split('/');
    const step = stepStr ? parseInt(stepStr, 10) : 1;
    if (isNaN(step) || step < 1) return null;

    let start: number, end: number;
    if (rangeStr === '*') {
      start = min;
      end = max;
    } else if (rangeStr.includes('-')) {
      const [a, b] = rangeStr.split('-').map(Number);
      if (isNaN(a) || isNaN(b)) return null;
      start = a;
      end = b;
    } else {
      const n = parseInt(rangeStr, 10);
      if (isNaN(n)) return null;
      start = n;
      end = n;
    }

    if (start < min || end > max || start > end) return null;
    for (let i = start; i <= end; i += step) {
      vals.add(i);
    }
  }

  return vals.size > 0 ? Array.from(vals).sort((a, b) => a - b) : null;
}
