// Pointer handles support touch/pen/mouse; arrow buttons remain the keyboard alternative.
export function attachReorderHandle(handle, row, list, onMove) {
  let dragging = null;
  let frame = 0;
  const rows = () => [...list.children].filter((item) => item.matches('[data-reorder-row]'));
  const markTarget = (x, y) => {
    const candidates = rows();
    const target = candidates.find((item) => {
      const rect = item.getBoundingClientRect();
      return y >= rect.top && y <= rect.bottom && x >= rect.left && x <= rect.right;
    });
    if (target) dragging.target = candidates.indexOf(target);
    for (const item of candidates) item.classList.toggle('drop-target', item === target && item !== row);
  };
  const tick = () => {
    if (!dragging?.moved) return;
    const rect = list.getBoundingClientRect();
    const edge = 52;
    const top = Math.max(rect.top, 100);
    const bottom = Math.min(rect.bottom, innerHeight - 24);
    const delta = dragging.y < top + edge ? -12 : dragging.y > bottom - edge ? 12 : 0;
    if (delta) {
      if (list.scrollHeight > list.clientHeight) list.scrollTop += delta;
      else window.scrollBy(0, delta);
    }
    markTarget(dragging.x, dragging.y);
    frame = requestAnimationFrame(tick);
  };
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragging = { id: event.pointerId, from: rows().indexOf(row), target: rows().indexOf(row), x: event.clientX, y: event.clientY, startY: event.clientY, moved: false };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', (event) => {
    if (!dragging || event.pointerId !== dragging.id) return;
    dragging.x = event.clientX; dragging.y = event.clientY;
    if (!dragging.moved && Math.abs(dragging.y - dragging.startY) > 6) {
      dragging.moved = true;
      row.classList.add('is-dragging');
      frame = requestAnimationFrame(tick);
    }
    if (dragging.moved) markTarget(event.clientX, event.clientY);
  });
  const finish = (cancelled) => {
    if (!dragging) return;
    cancelAnimationFrame(frame);
    const { from, target, moved } = dragging;
    dragging = null;
    rows().forEach((item) => item.classList.remove('is-dragging', 'drop-target'));
    if (!cancelled && moved && from !== target) onMove(from, target);
  };
  handle.addEventListener('pointerup', () => finish(false));
  handle.addEventListener('pointercancel', () => finish(true));
  handle.addEventListener('lostpointercapture', () => finish(true));
}
