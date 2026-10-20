/** A whiteboard over four desks, in `currentColor`. */
export function Icon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M6 4.5h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <g fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="4" y="9" width="6.5" height="4.5" rx="1.2" />
        <rect x="13.5" y="9" width="6.5" height="4.5" rx="1.2" />
        <rect x="4" y="16" width="6.5" height="4.5" rx="1.2" />
        <rect x="13.5" y="16" width="6.5" height="4.5" rx="1.2" />
      </g>
    </svg>
  );
}
