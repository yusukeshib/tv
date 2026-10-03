import * as stylex from "@stylexjs/stylex";

// Material 3 dark surface/type roles, with a white TV focus ring.
// Shared values only: no theme engine or additional component library.
export const theme = stylex.defineVars({
  surface: "#141218",
  surfaceContainerLow: "#1d1b20",
  onSurface: "#e6e0e9",
  onSurfaceVariant: "#cac4d0",
  outlineVariant: "#49454f",
  focus: "#ffffff",
  gutter: { default: "48px", "@media (max-width: 900px)": "24px" },
  cardGap: { default: "24px", "@media (max-width: 900px)": "16px" },
  cardInset: "16px",
  railInset: "12px",
  sectionGap: "24px",
  pageInset: "32px",
  radius: "12px",
  headlineSmall: "24px",
  headlineSmallLine: "32px",
  titleMedium: "16px",
  titleMediumLine: "24px",
  bodyMedium: "14px",
  bodyMediumLine: "20px",
});
