/** A die showing five, drawn in `currentColor` so it follows the button's states. */
export function Icon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="3.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
      />
      <circle cx="8.6" cy="8.6" r="1.3" fill="currentColor" />
      <circle cx="15.4" cy="8.6" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
      <circle cx="8.6" cy="15.4" r="1.3" fill="currentColor" />
      <circle cx="15.4" cy="15.4" r="1.3" fill="currentColor" />
    </svg>
  );
}
