/**
 * A magnifier over a plus. Everything is `currentColor`, so the icon inherits
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
      <circle
        cx="10.5"
        cy="10.5"
        r="6.25"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
      />
      <path
        d="M15.2 15.2 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
      />
      <path
        d="M10.5 7.6v5.8M7.6 10.5h5.8"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </svg>
  );
}
