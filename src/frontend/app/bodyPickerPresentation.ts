export function createBodyPickerPresentation({ select, narrow, coarse }: { select: HTMLSelectElement; narrow: MediaQueryList; coarse: MediaQueryList }) {
  let collapsedForSession = false;
  let frame = 0;
  let disposed = false;
  function measure() {
    frame = 0;
    if (disposed) return;
    const collapsed = narrow.matches || coarse.matches || collapsedForSession;
    select.size = collapsed ? 1 : 6;
    if (collapsed || !select.options.length || !select.getClientRects().length || select.closest('[inert], [hidden]')) return;
    const details = select.closest('details');
    if (details && !details.open) return;
    const heights = [...select.options].slice(0, 6).map(option => option.getBoundingClientRect().height);
    if (heights.some(height => height < 44)) { collapsedForSession = true; select.size = 1; }
  }
  function refresh() { if (!disposed && !frame) frame = requestAnimationFrame(measure); }
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh);
  const options = new MutationObserver(refresh);
  resize?.observe(select); options.observe(select, { childList: true });
  const disclosure = select.closest('details'); disclosure?.addEventListener('toggle', refresh);
  narrow.addEventListener('change', refresh); coarse.addEventListener('change', refresh);
  refresh();
  return { refresh, dispose() {
    disposed = true; cancelAnimationFrame(frame); resize?.disconnect(); options.disconnect();
    disclosure?.removeEventListener('toggle', refresh); narrow.removeEventListener('change', refresh); coarse.removeEventListener('change', refresh);
  } };
}
