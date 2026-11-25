/**
 * The browser's side of the route-planning agent (backend/planner/agent, spec section 7.7).
 *
 * The backend stores nothing, so the conversation lives here for the session:
 * each prompt sends the earlier turns, the current plan and a short app state.
 */

import type { AgentLayer } from './agentActions';
import { planFor, type Shown } from './tripPresentation';

const CAPABILITIES_TIMEOUT_MS = 5_000;
const ASK_TIMEOUT_MS = 45_000; // the backend stops a prompt after 35 s
const MAX_MESSAGES = 40; // the backend's limit on one request
const MAX_TEXT_CHARS = 4_000; // and on one message
const MAX_BODY_BYTES = 24 * 1_024; // under the route's 32 KiB body limit

interface AgentMessage { role: 'user' | 'assistant'; text: string }
export interface AgentAppState { date: string | null; focused: string | null; layers: Record<AgentLayer, boolean> }
export interface AgentReply {
  reply: { kind: 'answer' | 'question'; text: string; options: string[] };
  show: Shown | null;
  actions: unknown[];
}

async function failure(response: Response): Promise<Error> {
  const payload = await response.json().catch(() => null) as { detail?: { message?: unknown } } | null;
  const message = payload?.detail?.message;
  return new Error(typeof message === 'string' ? message : `The planner answered with an error (${response.status}).`);
}

export function createAgentClient({ backendBaseUrl }: { backendBaseUrl: () => string }) {
  async function request(path: string, init: RequestInit, timeoutMs: number, signal: AbortSignal): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${backendBaseUrl()}${path}`, {
        ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error(error instanceof DOMException && error.name === 'TimeoutError'
        ? 'The planner took too long to answer.'
        : 'The planner backend could not be reached.');
    }
    if (!response.ok) throw await failure(response);
    return response.json();
  }

  return {
    /** Whether the backend has a model configured. */
    async enabled(signal: AbortSignal): Promise<boolean> {
      const payload = await request('/planner/capabilities', {}, CAPABILITIES_TIMEOUT_MS, signal) as {
        agent?: { enabled?: unknown };
      };
      return payload.agent?.enabled === true;
    },
    async ask(body: unknown, signal: AbortSignal): Promise<AgentReply> {
      return await request('/planner/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }, ASK_TIMEOUT_MS, signal) as AgentReply;
    },
  };
}

export type AgentClient = ReturnType<typeof createAgentClient>;

/** The conversation so far and what is shown, kept for the session. */
export function createAgentConversation(client: Pick<AgentClient, 'ask'>) {
  let history: AgentMessage[] = [];
  let shown: Shown | null = null;

  function body(text: string, app: AgentAppState) {
    const request = { messages: [...history, { role: 'user', text }], plan: planFor(shown), app };
    // Oldest turns go first, a question and its answer together, so the list still starts with the user.
    while (request.messages.length > 1 && (request.messages.length > MAX_MESSAGES
      || new TextEncoder().encode(JSON.stringify(request)).length > MAX_BODY_BYTES)) {
      request.messages.splice(0, 2);
    }
    return request;
  }

  return {
    /** Sends one prompt. A failed prompt leaves the conversation as it was. */
    async send(text: string, app: AgentAppState, signal: AbortSignal): Promise<AgentReply> {
      const reply = await client.ask(body(text, app), signal);
      history.push({ role: 'user', text }, { role: 'assistant', text: reply.reply.text.slice(0, MAX_TEXT_CHARS) });
      if (reply.show) shown = reply.show;
      return reply;
    },
    reset() {
      history = [];
      shown = null;
    },
  };
}

export type AgentConversation = ReturnType<typeof createAgentConversation>;
