export const round2 = (n: number): number => {
  if (n === null || n === undefined || isNaN(n as any)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

export const approxZero = (n: number, epsilon: number = 0.005): boolean => {
  return Math.abs(n) < epsilon;
};

export const formatMoney = (n: number, locale: string = 'es-DO'): string => {
  const value = round2(Number(n) || 0);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};
