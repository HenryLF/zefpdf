/** An hourglass, in `currentColor` so it follows the button's states. */
export function Icon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M7 3.5h10M7 20.5h10M7.8 3.5v3.2L12 12l4.2-5.3V3.5M7.8 20.5v-3.2L12 12l4.2 5.3v3.2"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
