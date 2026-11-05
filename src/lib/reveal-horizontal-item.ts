/** Reveal a complete strip item without changing any ancestor's vertical scroll. */
export function revealHorizontalItem(strip: HTMLElement | null, item?: HTMLElement | null) {
  if (!strip || !item) return;
  const frame = strip.getBoundingClientRect();
  const target = item.getBoundingClientRect();
  if (target.left < frame.left || target.right > frame.right) {
    strip.scrollLeft += target.left - frame.left;
  }
}
