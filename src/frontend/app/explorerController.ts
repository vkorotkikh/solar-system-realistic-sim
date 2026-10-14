export interface ExplorerBody { id: string; name: string; type: string }
export interface ExplorerControllerArgs {
  dom: { bodySearch: HTMLInputElement; bodyList: HTMLSelectElement; bodyMatchCount: HTMLElement; bodyInfo: HTMLElement;
    emptyState: HTMLElement; focusBody: HTMLButtonElement; followBody: HTMLButtonElement; clearFollow: HTMLButtonElement };
  bodies: ExplorerBody[];
  onInspect: (id: string) => void; onFocus: (id: string) => void; onFollow: (id: string) => void; onFree: () => void;
}
export function createExplorerController({ dom, bodies, onInspect, onFocus, onFollow, onFree }: ExplorerControllerArgs) {
  let preferred = dom.bodyList.value || bodies[0]?.id || '';
  function refresh() {
    const query = dom.bodySearch.value.trim().toLocaleLowerCase();
    const visible = bodies.filter(body => `${body.name} ${body.id} ${body.type}`.toLocaleLowerCase().includes(query));
    const options = dom.bodyList.ownerDocument.createDocumentFragment();
    for (const body of visible) {
      const option = dom.bodyList.ownerDocument.createElement('option');
      option.value = body.id; option.textContent = `${body.name} \u00b7 ${body.type.charAt(0).toUpperCase()}${body.type.slice(1)}`;
      options.appendChild(option);
    }
    dom.bodyList.replaceChildren(options);
    dom.bodyList.value = visible.some(body => body.id === preferred) ? preferred : visible[0]?.id || '';
    const count = `${visible.length} ${visible.length === 1 ? 'body' : 'bodies'}`;
    if (dom.bodyMatchCount.textContent !== count) dom.bodyMatchCount.textContent = count;
    dom.bodyList.disabled = dom.focusBody.disabled = dom.followBody.disabled = visible.length === 0;
    dom.bodyInfo.hidden = visible.length === 0; dom.emptyState.hidden = visible.length !== 0;
    if (visible.length) onInspect(dom.bodyList.value);
  }
  function setPreferredBody(id: string) {
    preferred = id;
    if ([...dom.bodyList.options].some(option => option.value === id)) dom.bodyList.value = id;
    onInspect(id);
  }
  const select = () => setPreferredBody(dom.bodyList.value);
  const focus = () => { if (dom.bodyList.value) { select(); onFocus(dom.bodyList.value); } };
  const follow = () => { if (dom.bodyList.value) { select(); onFollow(dom.bodyList.value); } };
  function onKey(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || !dom.bodySearch.value) return;
    event.preventDefault(); event.stopPropagation(); dom.bodySearch.value = ''; refresh();
  }
  dom.bodySearch.addEventListener('input', refresh); dom.bodySearch.addEventListener('keydown', onKey);
  dom.bodyList.addEventListener('change', select); dom.focusBody.addEventListener('click', focus);
  dom.followBody.addEventListener('click', follow); dom.clearFollow.addEventListener('click', onFree);
  refresh();
  return { refresh, setPreferredBody, dispose() {
    dom.bodySearch.removeEventListener('input', refresh); dom.bodySearch.removeEventListener('keydown', onKey);
    dom.bodyList.removeEventListener('change', select); dom.focusBody.removeEventListener('click', focus);
    dom.followBody.removeEventListener('click', follow); dom.clearFollow.removeEventListener('click', onFree);
  } };
}
