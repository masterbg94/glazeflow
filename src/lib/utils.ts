export function formatCurrency(n: number, currency: string) {
  return new Intl.NumberFormat('sr-RS', { style: 'currency', currency }).format(n || 0);
}
