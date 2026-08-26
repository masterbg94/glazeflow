export function classNames(...classes: (string | null | undefined | false)[]) {
  return classes.filter(Boolean).join(' ');
}

export function formatCurrency(n: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n || 0);
}
