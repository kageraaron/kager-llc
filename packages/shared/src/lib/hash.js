export async function hashText(text, algorithm = 'SHA-256') {
    const data = new TextEncoder().encode(text);
    const buffer = await crypto.subtle.digest(algorithm, data);
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}
