/** A month block, in `currentColor` so it follows the button's states. */
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
        x="3.5"
        y="5"
        width="17"
        height="15.5"
        rx="3"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
      />
      <path
        d="M3.5 9.5h17M8 3.5v3M16 3.5v3"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
      />
      <rect x="10.6" y="12.6" width="2.8" height="2.8" rx="0.8" fill="currentColor" />
    </svg>
  );
}
