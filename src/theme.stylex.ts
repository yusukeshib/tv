import * as stylex from "@stylexjs/stylex";

// Resolve Radix tokens inside Theme, not as CSS variable aliases on :root.
// Custom TV components share the same palette and type scale as Themes controls.
export const theme = stylex.defineConsts({
  surface: "var(--color-background)",
  surfaceContainerLow: "var(--gray-3)",
  onSurface: "var(--gray-12)",
  onSurfaceVariant: "var(--gray-11)",
  outlineVariant: "var(--gray-6)",
  focus: "#ffffff",
  cardInset: "var(--space-4)",
  railInset: "var(--space-3)",
  sectionGap: "var(--space-5)",
  pageInset: "var(--space-6)",
  radius: "var(--radius-4)",
  titleMediumLine: "var(--line-height-3)",
});

// TV geometry is independent of component sizing and remains responsive.
export const layout = stylex.defineVars({
  gutter: { default: "48px", "@media (max-width: 900px)": "24px" },
  cardGap: { default: "24px", "@media (max-width: 900px)": "16px" },
});
