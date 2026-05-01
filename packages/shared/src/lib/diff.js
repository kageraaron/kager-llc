function lcs(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }
    const result = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
            result.unshift({ type: 'equal', value: a[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            result.unshift({ type: 'added', value: b[j - 1] });
            j--;
        } else {
            result.unshift({ type: 'removed', value: a[i - 1] });
            i--;
        }
    }
    return result;
}

export function computeDiff(original, modified) {
    const aLines = original.split('\n');
    const bLines = modified.split('\n');
    const hunks = lcs(aLines, bLines);
    const added = hunks.filter(h => h.type === 'added').length;
    const removed = hunks.filter(h => h.type === 'removed').length;
    const equal = hunks.filter(h => h.type === 'equal').length;
    return { hunks, added, removed, equal };
}
