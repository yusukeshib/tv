const formatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatViews(count: number | null | undefined): string {
  return count == null ? "" : `${formatter.format(count)} views`;
}
