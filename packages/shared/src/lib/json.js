export function formatJSON(input, indent = 2) {
  try {
    const obj = JSON.parse(input);
    return { data: JSON.stringify(obj, null, parseInt(indent)), error: null };
  } catch (e) {
    return { data: null, error: e.message };
  }
}
