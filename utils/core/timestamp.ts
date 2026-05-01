export function epochToDate(epoch: string | number): Date | null {
    let ts = typeof epoch === 'string' ? parseInt(epoch, 10) : epoch;
    if (isNaN(ts)) return null;
    if (ts < 100000000000) ts *= 1000;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
}

export function dateToEpoch(dateStr: string): { seconds: number; milliseconds: number } | null {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const ms = d.getTime();
    return {
        seconds: Math.floor(ms / 1000),
        milliseconds: ms
    };
}

export function formatRelativeTime(date: Date): string {
    const now = Date.now();
    const diff = date.getTime() - now;
    const absDiff = Math.abs(diff);
    const seconds = Math.floor(absDiff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const years = Math.floor(days / 365);
    let label: string;
    if (years > 0) label = years + ' year' + (years > 1 ? 's' : '');
    else if (days > 0) label = days + ' day' + (days > 1 ? 's' : '');
    else if (hours > 0) label = hours + ' hour' + (hours > 1 ? 's' : '');
    else if (minutes > 0) label = minutes + ' minute' + (minutes > 1 ? 's' : '');
    else label = seconds + ' second' + (seconds !== 1 ? 's' : '');
    return diff >= 0 ? 'in ' + label : label + ' ago';
}