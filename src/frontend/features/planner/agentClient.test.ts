// The browser keeps the conversation; each prompt sends it back with the plan and the app state (epic issue C11).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentClient, createAgentConversation, type AgentAppState, type AgentReply } from './agentClient';
import replies from './agentReplies.fixture.json';

const signal = new AbortController().signal;
const APP = { date: '2026-11-12', focused: 'earth', layers: { moons: true } } as unknown as AgentAppState;
const mars = replies.mars as unknown as AgentReply;
const question = replies.question as unknown as AgentReply;

/** A stand-in for the backend: records each request body and answers from a list. */
function scripted(...answers: Array<AgentReply | Error>) {
  const bodies: Array<{ messages: Array<{ role: string; text: string }>; plan: unknown; app: unknown }> = [];
  const ask = async (body: unknown) => {
    bodies.push(JSON.parse(JSON.stringify(body)));
    const next = answers.shift()!;
    if (next instanceof Error) throw next;
    return next;
  };
  return { bodies, conversation: createAgentConversation({ ask }) };
}

describe('createAgentConversation', () => {
  it('sends the earlier turns, the shown trip as the plan, and the app state', async () => {
    const { bodies, conversation } = scripted(question, mars, mars);
    await conversation.send('Earth to Europa', APP, signal);
    await conversation.send('The moon', APP, signal);
    await conversation.send('Make it a round trip', APP, signal);
    expect(bodies[0]).toEqual({ messages: [{ role: 'user', text: 'Earth to Europa' }], plan: null, app: APP });
    expect(bodies[1].plan).toBeNull(); // a question shows nothing
    expect(bodies[2].messages).toEqual([
      { role: 'user', text: 'Earth to Europa' },
      { role: 'assistant', text: question.reply.text },
      { role: 'user', text: 'The moon' },
      { role: 'assistant', text: mars.reply.text },
      { role: 'user', text: 'Make it a round trip' },
    ]);
    expect(bodies[2].plan).toEqual({ trips: [{ key: 'trip', search: mars.show!.request }] });
  });

  it('leaves the conversation as it was when a prompt fails', async () => {
    const { bodies, conversation } = scripted(new Error('The planner agent is busy. Retry shortly.'), mars);
    await expect(conversation.send('Earth to Mars', APP, signal)).rejects.toThrow('busy');
    await conversation.send('Earth to Mars', APP, signal);
    expect(bodies[1].messages).toEqual([{ role: 'user', text: 'Earth to Mars' }]);
  });

  it('keeps what is shown when a later reply shows nothing, and forgets everything on reset', async () => {
    const { bodies, conversation } = scripted(mars, replies.actions as unknown as AgentReply, mars, mars);
    await conversation.send('Earth to Mars', APP, signal);
    await conversation.send('Hide the asteroid belt', APP, signal);
    await conversation.send('When do we arrive?', APP, signal);
    expect(bodies[2].plan).toEqual({ trips: [{ key: 'trip', search: mars.show!.request }] });
    conversation.reset();
    await conversation.send('Earth to Mars', APP, signal);
    expect(bodies[3]).toEqual({ messages: [{ role: 'user', text: 'Earth to Mars' }], plan: null, app: APP });
  });

  it('drops the oldest turns to stay inside the backend\'s limits', async () => {
    const long: AgentReply = { ...question, reply: { ...question.reply, text: 'x'.repeat(5_000) } };
    const { bodies, conversation } = scripted(...Array.from({ length: 30 }, () => long));
    for (let turn = 0; turn < 30; turn += 1) await conversation.send(`prompt ${turn}`, APP, signal);
    const last = bodies[29];
    expect(new TextEncoder().encode(JSON.stringify(last)).length).toBeLessThanOrEqual(24 * 1_024);
    expect(last.messages.length).toBeGreaterThan(1); // some history survives
    expect(last.messages.length % 2).toBe(1); // whole turns were dropped
    expect([last.messages[0].role, last.messages[last.messages.length - 1]]).toEqual([
      'user', { role: 'user', text: 'prompt 29' },
    ]);
    expect(Math.max(...last.messages.map((message) => message.text.length))).toBe(4_000); // one message's limit

    const short: AgentReply = { ...question, reply: { ...question.reply, text: 'ok' } };
    const many = scripted(...Array.from({ length: 30 }, () => short));
    for (let turn = 0; turn < 30; turn += 1) await many.conversation.send(`prompt ${turn}`, APP, signal);
    expect(many.bodies[29].messages).toHaveLength(39); // at most 40, and an odd count starts with the user
  });
});

describe('createAgentClient', () => {
  afterEach(() => vi.unstubAllGlobals());
  const client = createAgentClient({ backendBaseUrl: () => 'http://backend.test' });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it('reads whether the agent is on', async () => {
    const fetchStub = vi.fn(async (_url: string) => json({ agent: { enabled: true, model: 'm', max_prompt_chars: 2_000 } }));
    vi.stubGlobal('fetch', fetchStub);
    expect(await client.enabled(signal)).toBe(true);
    expect(fetchStub.mock.calls[0][0]).toBe('http://backend.test/planner/capabilities');
    vi.stubGlobal('fetch', async () => json({ agent: { enabled: false, model: null } }));
    expect(await client.enabled(signal)).toBe(false);
    vi.stubGlobal('fetch', async () => json({ agent: { enabled: 'yes' } }));
    expect(await client.enabled(signal)).toBe(false); // only a real true turns it on
  });

  it('posts a prompt as JSON and returns the reply', async () => {
    const fetchStub = vi.fn(async (_url: string, _init: RequestInit) => json(mars));
    vi.stubGlobal('fetch', fetchStub);
    expect(await client.ask({ messages: [] }, signal)).toEqual(mars);
    const [url, init] = fetchStub.mock.calls[0];
    expect([url, init.method, init.body]).toEqual(['http://backend.test/planner/agent', 'POST', '{"messages":[]}']);
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('reports the backend\'s own message on an error, and says so when it cannot be reached', async () => {
    vi.stubGlobal('fetch', async () => json({ detail: { code: 'planner_agent_daily_limit', message: 'Come back tomorrow.' } }, 429));
    await expect(client.ask({}, signal)).rejects.toThrow('Come back tomorrow.');
    vi.stubGlobal('fetch', async () => new Response('bad gateway', { status: 502 }));
    await expect(client.ask({}, signal)).rejects.toThrow('The planner answered with an error (502).');
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
    await expect(client.ask({}, signal)).rejects.toThrow('The planner backend could not be reached.');
    vi.stubGlobal('fetch', async () => { throw new DOMException('timed out', 'TimeoutError'); });
    await expect(client.ask({}, signal)).rejects.toThrow('The planner took too long to answer.');
  });
});
