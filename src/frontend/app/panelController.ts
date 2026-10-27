export interface PanelState { mobile: boolean; desktopOpen: boolean; mobileOpen: boolean }
export function derivePanelState(state: PanelState) {
  const open = state.mobile ? state.mobileOpen : state.desktopOpen;
  return { open, modal: state.mobile && open };
}
export interface PanelControllerArgs {
  app: HTMLElement; panel: HTMLElement; viewport: HTMLElement;
  toggle: HTMLButtonElement; close: HTMLButtonElement; backdrop: HTMLElement;
  breakpoint: MediaQueryList; onLayoutChange: () => void;
}
function rendered(element: HTMLElement): boolean {
  if (!element.getClientRects().length || element.closest('[hidden], [inert]')) return false;
  if (getComputedStyle(element).visibility !== 'visible') return false;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement && !parent.open && !parent.querySelector('summary')?.contains(element)) return false;
  }
  return true;
}
export function createPanelController({ app, panel, viewport, toggle, close, backdrop, breakpoint, onLayoutChange }: PanelControllerArgs) {
  const doc = panel.ownerDocument;
  const view = doc.defaultView;
  // WebKit can retain the old matches value until its queued change event.
  // A fresh query keeps an intervening action in the correct remembered state.
  const isMobile = () => view?.matchMedia(breakpoint.media).matches ?? breakpoint.matches;
  const state: PanelState = { mobile: isMobile(), desktopOpen: true, mobileOpen: false };
  let modal = false;
  let disposed = false;
  panel.tabIndex = -1;
  function destination() { return !close.disabled && rendered(close) ? close : panel; }
  function focusInside() { destination().focus({ preventScroll: true }); }
  function apply(moveFocus = false) {
    if (disposed) return;
    const active = doc.activeElement;
    const next = derivePanelState(state);
    // Both surfaces must remain rendered until focus has left the one being hidden.
    app.setAttribute('data-panel-focus-transition', '');
    modal = false;
    viewport.inert = false;
    viewport.removeAttribute('aria-hidden');
    if (next.open) { panel.inert = false; panel.setAttribute('aria-hidden', 'false'); }
    if (next.modal) { panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); }
    else { panel.removeAttribute('role'); panel.removeAttribute('aria-modal'); }
    if (next.open) {
      const validPanelFocus = active instanceof HTMLElement && panel.contains(active) && rendered(active) && !active.matches(':disabled');
      if ((next.modal && !validPanelFocus) || active === toggle || moveFocus) focusInside();
    } else if (panel.contains(active) || moveFocus) {
      toggle.focus({ preventScroll: true });
    }
    app.classList.toggle('panel-is-open', next.open);
    app.classList.toggle('panel-is-closed', !next.open);
    toggle.setAttribute('aria-expanded', String(next.open));
    close.setAttribute('aria-expanded', String(next.open));
    close.setAttribute('aria-label', state.mobile ? 'Close simulation controls' : 'Collapse simulation controls');
    if (!next.open) { panel.inert = true; panel.setAttribute('aria-hidden', 'true'); }
    modal = next.modal;
    if (modal) { viewport.inert = true; viewport.setAttribute('aria-hidden', 'true'); }
    app.removeAttribute('data-panel-focus-transition');
    onLayoutChange();
  }
  function setOpen(open: boolean) {
    state.mobile = isMobile();
    if (state.mobile) state.mobileOpen = open; else state.desktopOpen = open;
    apply(true);
  }
  const openPanel = () => setOpen(true);
  const closePanel = () => setOpen(false);
  const onBackdrop = () => { if (state.mobile) closePanel(); };
  const onBreakpoint = () => {
    const mobile = isMobile();
    if (state.mobile === mobile) return;
    state.mobile = mobile;
    apply();
  };
  const onFocus = (event: FocusEvent) => { if (modal && !panel.contains(event.target as Node)) focusInside(); };
  function onKey(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing) return;
    if (event.key === 'Escape' && derivePanelState(state).open) { event.preventDefault(); closePanel(); return; }
    if (event.key !== 'Tab' || !modal) return;
    const elements = [...panel.querySelectorAll<HTMLElement>('button,input,select,textarea,summary,a[href],[tabindex]')]
      .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && rendered(element));
    if (!elements.length) { event.preventDefault(); panel.focus(); return; }
    const active = doc.activeElement;
    if (event.shiftKey && (active === elements[0] || !elements.includes(active as HTMLElement))) {
      event.preventDefault(); elements[elements.length - 1].focus();
    } else if (!event.shiftKey && (active === elements[elements.length - 1] || !elements.includes(active as HTMLElement))) {
      event.preventDefault(); elements[0].focus();
    }
  }
  toggle.addEventListener('click', openPanel); close.addEventListener('click', closePanel);
  backdrop.addEventListener('click', onBackdrop); breakpoint.addEventListener('change', onBreakpoint);
  // A rapid round trip can coalesce away the media-query change event entirely.
  view?.addEventListener('resize', onBreakpoint);
  doc.addEventListener('keydown', onKey); doc.addEventListener('focusin', onFocus);
  apply();
  return { setOpen, dispose() {
    if (disposed) return;
    setOpen(false); disposed = true; modal = false;
    toggle.removeEventListener('click', openPanel); close.removeEventListener('click', closePanel);
    backdrop.removeEventListener('click', onBackdrop); breakpoint.removeEventListener('change', onBreakpoint);
    view?.removeEventListener('resize', onBreakpoint);
    doc.removeEventListener('keydown', onKey); doc.removeEventListener('focusin', onFocus);
    viewport.inert = false; viewport.removeAttribute('aria-hidden');
    panel.inert = false; panel.removeAttribute('aria-hidden'); panel.removeAttribute('aria-modal'); panel.removeAttribute('role');
  } };
}
