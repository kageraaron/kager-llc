export function encodeBase64(str) {
  try {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
  } catch (e) {
    return 'Error: Invalid characters';
  }
}

export function decodeBase64(str) {
  try {
    return decodeURIComponent(atob(str).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
  } catch (e) {
    return 'Error: Invalid Base64 string';
  }
}
