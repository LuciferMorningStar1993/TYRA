// Formatos numéricos según la configuración regional del dispositivo.

export function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value);
}

export function formatCurrency(amount: number, currency = 'MXN'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
}
