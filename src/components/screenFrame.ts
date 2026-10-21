/**
 * Every screen is laid out landscape, and held upright the whole page is
 * turned on its side with a transform. Screen rectangles and pointer positions
 * then point the wrong way for anything placed inside the page, so these turn
 * them back into the page's own frame.
 */

/** How far an element is turned on screen, in radians, by the transforms above it. */
export function screenAngle(node: Element | null): number {
  let angle = 0;
  for (let n = node; n; n = n.parentElement) {
    const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(n).transform);
    if (m) {
      const [a, b] = m[1].split(",").map(Number);
      angle += Math.atan2(b, a);
    }
  }
  return angle;
}

/**
 * A movement on screen in a turned element's own frame. Turned on its side,
 * the element's "up" is across the glass, and a movement has to be read that way.
 */
export function intoFrame(dx: number, dy: number, angle: number): { x: number; y: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}

/**
 * The centre of `rect`, a screen rectangle, as a point inside `box`, from its
 * top left corner. The two agree on where the box's own centre is however the
 * page is turned, so everything is measured from there.
 */
export function centreWithin(box: HTMLElement, rect: DOMRect, angle: number): { x: number; y: number } {
  const outer = box.getBoundingClientRect();
  const p = intoFrame(
    rect.left + rect.width / 2 - (outer.left + outer.width / 2),
    rect.top + rect.height / 2 - (outer.top + outer.height / 2),
    angle,
  );
  return { x: box.clientWidth / 2 + p.x, y: box.clientHeight / 2 + p.y };
}
