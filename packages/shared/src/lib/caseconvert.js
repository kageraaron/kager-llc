function splitWords(input) {
    return input
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .split(/[\s_\-./\\]+/)
        .map(w => w.toLowerCase())
        .filter(Boolean);
}

export function convertCase(input) {
    if (!input.trim()) return null;
    const words = splitWords(input);
    if (!words.length) return null;

    const title = w => w.charAt(0).toUpperCase() + w.slice(1);

    return {
        camel:          words[0] + words.slice(1).map(title).join(''),
        pascal:         words.map(title).join(''),
        snake:          words.join('_'),
        screamingSnake: words.join('_').toUpperCase(),
        kebab:          words.join('-'),
        titleCase:      words.map(title).join(' '),
        lower:          words.join(' '),
        upper:          words.join(' ').toUpperCase(),
        dot:            words.join('.'),
        path:           words.join('/'),
    };
}
