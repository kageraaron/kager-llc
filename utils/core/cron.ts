export function parseCronField(field: string, min: number, max: number): number[] | null {
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
        for (let i = start; i <= end; i += step) vals.add(i);
    }
    return vals.size > 0 ? Array.from(vals).sort((a, b) => a - b) : null;
}

export function describeCron(parts: string[]): string {
    const [minF, hrF, domF, monF, dowF] = parts;
    const pieces: string[] = [];
    const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    if (minF === '*') pieces.push('every minute');
    else if (minF.startsWith('*/')) pieces.push('every ' + minF.slice(2) + ' minutes');
    else pieces.push('at minute ' + minF);

    if (hrF !== '*') {
        if (hrF.startsWith('*/')) pieces.push('every ' + hrF.slice(2) + ' hours');
        else pieces.push('past hour ' + hrF);
    }

    if (domF !== '*') {
        if (domF.startsWith('*/')) pieces.push('every ' + domF.slice(2) + ' days');
        else pieces.push('on day ' + domF + ' of the month');
    }

    if (monF !== '*') {
        const mParsed = parseCronField(monF, 1, 12);
        if (mParsed) pieces.push('in ' + mParsed.map((m) => MONTH_NAMES[m]).join(', '));
    }

    if (dowF !== '*') {
        const dParsed = parseCronField(dowF, 0, 6);
        if (dParsed) pieces.push('on ' + dParsed.map((d) => DOW_NAMES[d]).join(', '));
    }

    return pieces.join(', ').replace(/^./, (c) => c.toUpperCase());
}

export function nextCronRuns(parts: string[], count = 5): Date[] {
    const minVals = parseCronField(parts[0], 0, 59);
    const hrVals = parseCronField(parts[1], 0, 23);
    const domVals = parseCronField(parts[2], 1, 31);
    const monVals = parseCronField(parts[3], 1, 12);
    const dowVals = parseCronField(parts[4], 0, 6);

    if (!minVals || !hrVals || !domVals || !monVals || !dowVals) return [];

    const runs: Date[] = [];
    const now = new Date();
    const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0);
    const limit = 525600; 

    for (let i = 0; i < limit && runs.length < count; i++) {
        if (monVals.includes(cursor.getMonth() + 1) &&
            domVals.includes(cursor.getDate()) &&
            dowVals.includes(cursor.getDay()) &&
            hrVals.includes(cursor.getHours()) &&
            minVals.includes(cursor.getMinutes())) {
            runs.push(new Date(cursor));
        }
        cursor.setMinutes(cursor.getMinutes() + 1);
    }
    return runs;
}