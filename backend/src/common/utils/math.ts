const TRUNCATION_PRECISION = 2;

export function truncateToPrecision(value: number, precision: number = TRUNCATION_PRECISION): number {
  const factor = Math.pow(10, precision);
  return Math.trunc(value * factor) / factor;
}

export function convertRawAmount(rawAmount: string, decimals: number): number {
  return Number(rawAmount) / Math.pow(10, decimals);
}
