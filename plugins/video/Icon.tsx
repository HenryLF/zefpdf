/** A screen with a play triangle, in `currentColor`. */
export function Icon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="3"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
      />
      <path d="M10 9v6l5-3z" fill="currentColor" />
    </svg>
  );
}
