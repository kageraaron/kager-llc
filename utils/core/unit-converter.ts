export type UnitCategory = 'length' | 'weight' | 'temperature' | 'volume' | 'area' | 'speed' | 'time' | 'data' | 'angle';

export interface UnitInfo {
  name: string;
  abbr: string;
  toBase: (value: number) => number;
  fromBase: (value: number) => number;
}

export const UNITS: Record<UnitCategory, Record<string, UnitInfo>> = {
  length: {
    meter: { name: 'Meter', abbr: 'm', toBase: (v) => v, fromBase: (v) => v },
    kilometer: { name: 'Kilometer', abbr: 'km', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
    centimeter: { name: 'Centimeter', abbr: 'cm', toBase: (v) => v / 100, fromBase: (v) => v * 100 },
    millimeter: { name: 'Millimeter', abbr: 'mm', toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
    mile: { name: 'Mile', abbr: 'mi', toBase: (v) => v * 1609.344, fromBase: (v) => v / 1609.344 },
    yard: { name: 'Yard', abbr: 'yd', toBase: (v) => v * 0.9144, fromBase: (v) => v / 0.9144 },
    foot: { name: 'Foot', abbr: 'ft', toBase: (v) => v * 0.3048, fromBase: (v) => v / 0.3048 },
    inch: { name: 'Inch', abbr: 'in', toBase: (v) => v * 0.0254, fromBase: (v) => v / 0.0254 },
    nauticalMile: { name: 'Nautical Mile', abbr: 'nmi', toBase: (v) => v * 1852, fromBase: (v) => v / 1852 },
  },
  weight: {
    kilogram: { name: 'Kilogram', abbr: 'kg', toBase: (v) => v, fromBase: (v) => v },
    gram: { name: 'Gram', abbr: 'g', toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
    milligram: { name: 'Milligram', abbr: 'mg', toBase: (v) => v / 1000000, fromBase: (v) => v * 1000000 },
    pound: { name: 'Pound', abbr: 'lb', toBase: (v) => v * 0.453592, fromBase: (v) => v / 0.453592 },
    ounce: { name: 'Ounce', abbr: 'oz', toBase: (v) => v * 0.0283495, fromBase: (v) => v / 0.0283495 },
    ton: { name: 'Metric Ton', abbr: 't', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
    stone: { name: 'Stone', abbr: 'st', toBase: (v) => v * 6.35029, fromBase: (v) => v / 6.35029 },
  },
  temperature: {
    celsius: { name: 'Celsius', abbr: '°C', toBase: (v) => v, fromBase: (v) => v },
    fahrenheit: { name: 'Fahrenheit', abbr: '°F', toBase: (v) => (v - 32) * 5 / 9, fromBase: (v) => v * 9 / 5 + 32 },
    kelvin: { name: 'Kelvin', abbr: 'K', toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
  },
  volume: {
    liter: { name: 'Liter', abbr: 'L', toBase: (v) => v, fromBase: (v) => v },
    milliliter: { name: 'Milliliter', abbr: 'mL', toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
    gallon: { name: 'US Gallon', abbr: 'gal', toBase: (v) => v * 3.78541, fromBase: (v) => v / 3.78541 },
    quart: { name: 'US Quart', abbr: 'qt', toBase: (v) => v * 0.946353, fromBase: (v) => v / 0.946353 },
    pint: { name: 'US Pint', abbr: 'pt', toBase: (v) => v * 0.473176, fromBase: (v) => v / 0.473176 },
    cup: { name: 'US Cup', abbr: 'cup', toBase: (v) => v * 0.236588, fromBase: (v) => v / 0.236588 },
    fluidOunce: { name: 'US Fluid Ounce', abbr: 'fl oz', toBase: (v) => v * 0.0295735, fromBase: (v) => v / 0.0295735 },
    tablespoon: { name: 'Tablespoon', abbr: 'tbsp', toBase: (v) => v * 0.0147868, fromBase: (v) => v / 0.0147868 },
    teaspoon: { name: 'Teaspoon', abbr: 'tsp', toBase: (v) => v * 0.00492892, fromBase: (v) => v / 0.00492892 },
  },
  area: {
    squareMeter: { name: 'Square Meter', abbr: 'm²', toBase: (v) => v, fromBase: (v) => v },
    squareKilometer: { name: 'Square Kilometer', abbr: 'km²', toBase: (v) => v * 1000000, fromBase: (v) => v / 1000000 },
    squareFoot: { name: 'Square Foot', abbr: 'ft²', toBase: (v) => v * 0.092903, fromBase: (v) => v / 0.092903 },
    squareYard: { name: 'Square Yard', abbr: 'yd²', toBase: (v) => v * 0.836127, fromBase: (v) => v / 0.836127 },
    acre: { name: 'Acre', abbr: 'ac', toBase: (v) => v * 4046.86, fromBase: (v) => v / 4046.86 },
    hectare: { name: 'Hectare', abbr: 'ha', toBase: (v) => v * 10000, fromBase: (v) => v / 10000 },
    squareMile: { name: 'Square Mile', abbr: 'mi²', toBase: (v) => v * 2590000, fromBase: (v) => v / 2590000 },
  },
  speed: {
    metersPerSecond: { name: 'Meters per Second', abbr: 'm/s', toBase: (v) => v, fromBase: (v) => v },
    kilometersPerHour: { name: 'Kilometers per Hour', abbr: 'km/h', toBase: (v) => v / 3.6, fromBase: (v) => v * 3.6 },
    milesPerHour: { name: 'Miles per Hour', abbr: 'mph', toBase: (v) => v * 0.44704, fromBase: (v) => v / 0.44704 },
    knot: { name: 'Knot', abbr: 'kn', toBase: (v) => v * 0.514444, fromBase: (v) => v / 0.514444 },
    mach: { name: 'Mach', abbr: 'Ma', toBase: (v) => v * 343, fromBase: (v) => v / 343 },
    feetPerSecond: { name: 'Feet per Second', abbr: 'ft/s', toBase: (v) => v * 0.3048, fromBase: (v) => v / 0.3048 },
  },
  time: {
    second: { name: 'Second', abbr: 's', toBase: (v) => v, fromBase: (v) => v },
    millisecond: { name: 'Millisecond', abbr: 'ms', toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
    minute: { name: 'Minute', abbr: 'min', toBase: (v) => v * 60, fromBase: (v) => v / 60 },
    hour: { name: 'Hour', abbr: 'h', toBase: (v) => v * 3600, fromBase: (v) => v / 3600 },
    day: { name: 'Day', abbr: 'd', toBase: (v) => v * 86400, fromBase: (v) => v / 86400 },
    week: { name: 'Week', abbr: 'wk', toBase: (v) => v * 604800, fromBase: (v) => v / 604800 },
    month: { name: 'Month (avg)', abbr: 'mo', toBase: (v) => v * 2592000, fromBase: (v) => v / 2592000 },
    year: { name: 'Year (avg)', abbr: 'yr', toBase: (v) => v * 31557600, fromBase: (v) => v / 31557600 },
  },
  data: {
    byte: { name: 'Byte', abbr: 'B', toBase: (v) => v, fromBase: (v) => v },
    bit: { name: 'Bit', abbr: 'b', toBase: (v) => v / 8, fromBase: (v) => v * 8 },
    kilobyte: { name: 'Kilobyte', abbr: 'KB', toBase: (v) => v * 1024, fromBase: (v) => v / 1024 },
    megabyte: { name: 'Megabyte', abbr: 'MB', toBase: (v) => v * 1048576, fromBase: (v) => v / 1048576 },
    gigabyte: { name: 'Gigabyte', abbr: 'GB', toBase: (v) => v * 1073741824, fromBase: (v) => v / 1073741824 },
    terabyte: { name: 'Terabyte', abbr: 'TB', toBase: (v) => v * 1099511627776, fromBase: (v) => v / 1099511627776 },
    petabyte: { name: 'Petabyte', abbr: 'PB', toBase: (v) => v * 1125899906842624, fromBase: (v) => v / 1125899906842624 },
    kibibyte: { name: 'Kibibyte', abbr: 'KiB', toBase: (v) => v * 1024, fromBase: (v) => v / 1024 },
    mebibyte: { name: 'Mebibyte', abbr: 'MiB', toBase: (v) => v * 1048576, fromBase: (v) => v / 1048576 },
    gibibyte: { name: 'Gibibyte', abbr: 'GiB', toBase: (v) => v * 1073741824, fromBase: (v) => v / 1073741824 },
  },
  angle: {
    degree: { name: 'Degree', abbr: '°', toBase: (v) => v, fromBase: (v) => v },
    radian: { name: 'Radian', abbr: 'rad', toBase: (v) => v * (180 / Math.PI), fromBase: (v) => v * (Math.PI / 180) },
    gradian: { name: 'Gradian', abbr: 'gon', toBase: (v) => v * 0.9, fromBase: (v) => v / 0.9 },
    arcminute: { name: 'Arcminute', abbr: "'", toBase: (v) => v / 60, fromBase: (v) => v * 60 },
    arcsecond: { name: 'Arcsecond', abbr: '"', toBase: (v) => v / 3600, fromBase: (v) => v * 3600 },
    turn: { name: 'Turn', abbr: 'tr', toBase: (v) => v * 360, fromBase: (v) => v / 360 },
  },
};

export function convertUnit(
  category: UnitCategory,
  value: number,
  fromUnit: string,
  toUnit: string
): number | null {
  const units = UNITS[category];
  if (!units[fromUnit] || !units[toUnit]) return null;

  const baseValue = units[fromUnit].toBase(value);
  return units[toUnit].fromBase(baseValue);
}

export function getUnitList(category: UnitCategory): { key: string; name: string; abbr: string }[] {
  return Object.entries(UNITS[category]).map(([key, info]) => ({
    key,
    name: info.name,
    abbr: info.abbr,
  }));
}

export function getCategoryList(): UnitCategory[] {
  return Object.keys(UNITS) as UnitCategory[];
}

export function formatWithUnit(value: number, category: UnitCategory, unit: string): string {
  const info = UNITS[category]?.[unit];
  if (!info) return `${value}`;
  return `${value} ${info.abbr}`;
}
