export function generatePassword(length = 16, options = { upper: true, lower: true, numbers: true, symbols: true }) {
  const charsets = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    numbers: '0123456789',
    symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
  };
  
  let allowedChars = '';
  if (options.upper) allowedChars += charsets.upper;
  if (options.lower) allowedChars += charsets.lower;
  if (options.numbers) allowedChars += charsets.numbers;
  if (options.symbols) allowedChars += charsets.symbols;
  
  if (!allowedChars) return '';
  
  const array = new Uint32Array(length);
  window.crypto.getRandomValues(array);
  
  let password = '';
  for (let i = 0; i < length; i++) {
    password += allowedChars.charAt(array[i] % allowedChars.length);
  }
  return password;
}
