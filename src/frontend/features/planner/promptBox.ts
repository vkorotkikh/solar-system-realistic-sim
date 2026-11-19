/**
 * The prompt box: type a trip in plain words, read the planner's answer, see the trip.
 *
 * Its controls start disabled. Opening the section asks the backend whether
 * the agent is on (no model set means off), so a page that never opens it
 * sends nothing. Text from the model is only ever written as text, never as markup.
 */

import { applyAgentActions, type AgentApp } from './agentActions';
import type { AgentAppState, AgentConversation } from './agentClient';
import { cardFor, type Shown } from './tripPresentation';

const OFF = 'The trip assistant is off. To turn it on, start the backend with PLANNER_AGENT_MODEL set to a '
  + 'Claude model id and an Anthropic API key, then close and reopen this section.';
const SPEAKER = { user: 'You: ', assistant: 'Planner: ', note: '', error: 'Problem: ' } as const;

export interface PromptBoxArgs {
  dom: {
    section: HTMLDetailsElement; status: HTMLElement; log: HTMLElement; card: HTMLElement; form: HTMLFormElement;
    input: HTMLInputElement; send: HTMLButtonElement; clear: HTMLButtonElement;
  };
  /** Whether the backend has a model configured. */
  enabled: (signal: AbortSignal) => Promise<boolean>;
  conversation: AgentConversation;
  app: AgentApp;
  appState: () => AgentAppState;
  /** Draws what is shown and returns how many of its legs it could not draw. */
  drawRoute: (shown: Shown) => number;
  clearRoute: () => void;
  /** Listeners and requests end with this signal. */
  signal: AbortSignal;
}

export function createPromptBox({
  dom, enabled, conversation, app, appState, drawRoute, clearRoute, signal,
}: PromptBoxArgs): void {
  const document = dom.log.ownerDocument;
  let busy = false;

  function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function list(className: string, items: string[]): HTMLUListElement {
    const node = element('ul', className);
    node.append(...items.map((item) => element('li', '', item)));
    return node;
  }

  function say(kind: keyof typeof SPEAKER, text: string): HTMLElement {
    const line = element('p', `assistant-line assistant-line--${kind}`);
    if (SPEAKER[kind]) line.append(element('span', 'visually-hidden', SPEAKER[kind]));
    line.append(text);
    dom.log.append(line);
    line.scrollIntoView({ block: 'nearest' });
    return line;
  }

  function offer(options: string[]) {
    const row = element('div', 'assistant-options');
    for (const option of options) {
      const button = element('button', 'button button--secondary', option);
      button.type = 'button';
      button.addEventListener('click', () => void ask(option), { signal });
      row.append(button);
    }
    dom.log.append(row);
    row.scrollIntoView({ block: 'nearest' });
  }

  function showCard(shown: Shown, undrawn: number) {
    const card = cardFor(shown);
    const header = element('div', 'body-card__header');
    const titles = element('div');
    titles.append(element('p', 'body-card__eyebrow', shown.kind === 'trip' ? 'Planned trip' : 'Trip plan'),
      element('h3', '', card.title));
    header.append(titles);
    if (card.badge) header.append(element('span', 'type-badge', card.badge));
    const rows = element('dl');
    for (const { label, value } of card.rows) {
      const row = element('div');
      row.append(element('dt', '', label), element('dd', '', value));
      rows.append(row);
    }
    const notes = [...card.notes, ...(undrawn > 0 ? ['Legs around a planet are not drawn yet.'] : [])];
    const details = element('details', 'assistant-card__notes');
    details.append(element('summary', '', `Approximations and limits (${notes.length})`), list('', notes));
    dom.card.replaceChildren(header, rows, list('assistant-card__lines', card.lines), ...(notes.length ? [details] : []));
    dom.card.hidden = false;
  }

  async function ask(text: string) {
    if (busy || !text) return;
    busy = true;
    dom.send.disabled = true;
    for (const stale of dom.log.querySelectorAll('.assistant-options')) stale.remove();
    say('user', text);
    const waiting = say('note', 'Planning…');
    try {
      const reply = await conversation.send(text, appState(), signal);
      if (signal.aborted) return;
      waiting.remove();
      say('assistant', reply.reply.text);
      if (reply.reply.kind === 'question' && reply.reply.options.length) offer(reply.reply.options);
      if (reply.show) showCard(reply.show, drawRoute(reply.show));
      for (const note of applyAgentActions(reply.actions, app)) say('note', note); // a stopped prompt sends none
    } catch (error) {
      if (signal.aborted) return;
      waiting.remove();
      say('error', error instanceof Error ? error.message : 'The prompt failed.');
      if (!dom.input.value) dom.input.value = text; // ready to send again
    } finally {
      busy = false;
      // A stopped page has disabled its controls and dropped these listeners; leave them disabled.
      if (!signal.aborted) dom.send.disabled = false;
    }
  }

  dom.form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;
    const text = dom.input.value.trim();
    dom.input.value = '';
    void ask(text);
  }, { signal });

  dom.clear.addEventListener('click', () => {
    if (busy) return;
    conversation.reset();
    dom.log.replaceChildren();
    dom.card.replaceChildren();
    dom.card.hidden = true;
    clearRoute();
  }, { signal });

  function status(text: string) {
    dom.status.textContent = text;
    dom.status.hidden = !text;
  }

  let availability: 'unknown' | 'checking' | 'on' = 'unknown';
  /** Asks once per opening until the agent is on, so a backend restarted with a model is picked up. */
  async function check(): Promise<void> {
    if (!dom.section.open || availability !== 'unknown') return;
    availability = 'checking';
    status('Checking whether the trip assistant is on…');
    try {
      const on = await enabled(signal);
      if (signal.aborted) return;
      availability = on ? 'on' : 'unknown';
      status(on ? '' : OFF);
      if (on) dom.input.disabled = dom.clear.disabled = dom.send.disabled = false;
    } catch (error) {
      if (signal.aborted) return;
      availability = 'unknown';
      status(`${error instanceof Error ? error.message : 'The check failed.'} Close and reopen this section to try again.`);
    }
  }
  dom.section.addEventListener('toggle', () => void check(), { signal });
  void check();
}
