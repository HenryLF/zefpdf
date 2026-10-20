/** The reader's pages, found by attribute: module class names are hashed. */
function pages(el: HTMLElement) {
  return [...el.querySelectorAll<HTMLElement>("[data-page]")];
}

/** Scroll offset of every page top, in the scroller's coordinates. */
export function pageTops(el: HTMLElement) {
  const top = el.getBoundingClientRect().top;
  return pages(el).map(
    (p) => el.scrollTop + (p.getBoundingClientRect().top - top),
  );
}
