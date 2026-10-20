/**
 * A page turning clockwise. Everything is `currentColor`, so the icon inherits
 * the button's idle, hover and pressed colours rather than restating them.
 */
export function Icon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      {/* three quarters of a circle, opening at the top right */}
      <path
        d="M12 5a7 7 0 1 0 6.6 4.7"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
      />
      {/* the arrow head, pointing clockwise */}
      <path
        d="M13.6 3.1 18.9 5.4 16.6 10.7"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
