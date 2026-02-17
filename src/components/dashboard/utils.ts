export function formatTraffic(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : String(n);
}

export function formatNumber(n: number): string {
  return n.toLocaleString("da-DK");
}
