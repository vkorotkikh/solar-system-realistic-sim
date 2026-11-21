// The action applier is the last check before the agent changes the app (epic issue C11).
import { describe, expect, it } from 'vitest';
import { applyAgentActions, type AgentApp } from './agentActions';
import replies from './agentReplies.fixture.json';

function recordingApp(names: Record<string, string> = { 'moon-jupiter-europa': 'Europa' }) {
  const calls: unknown[][] = [];
  const app: AgentApp = {
    focus: (bodyId, follow) => { calls.push(['focus', bodyId, follow]); return names[bodyId] ?? null; },
    setDate: (isoDate) => { calls.push(['setDate', isoDate]); },
    setLayer: (layer, on) => { calls.push(['setLayer', layer, on]); },
  };
  return { app, calls };
}

describe('applyAgentActions', () => {
  it('applies the backend\'s three actions in order and says what it did', () => {
    const { app, calls } = recordingApp();
    expect(applyAgentActions(replies.actions.actions, app)).toEqual([
      'The camera follows Europa.',
      'The date is set to 2027-09-08 and the clock is paused.',
      'Asteroid belt switched off.',
    ]);
    expect(calls).toEqual([
      ['focus', 'moon-jupiter-europa', true],
      ['setDate', '2027-09-08'],
      ['setLayer', 'asteroid_belt', false],
    ]);
  });

  it('says when the app cannot show the place', () => {
    const { app } = recordingApp({});
    expect(applyAgentActions([{ type: 'focus_on', place_id: 'vulcan', follow: false }], app))
      .toEqual(['Skipped a camera move: the app cannot show that place.']);
  });

  it.each([
    [{ type: 'set_speed', value: 100 }],
    [{ type: 'focus_on', place_id: 'mars', follow: 'yes' }],
    [{ type: 'focus_on', place_id: 42, follow: true }],
    [{ type: 'set_date', date: '2027-02-30' }],
    [{ type: 'set_date', date: '20270908' }],
    [{ type: 'set_date', date: '1989-12-31' }],
    [{ type: 'set_date', date: '2050-01-02' }],
    [{ type: 'set_layer', layer: 'sun', on: true }],
    [{ type: 'set_layer', layer: 'moons', on: 1 }],
    [null],
    ['focus_on'],
  ])('skips %j without touching the app', (action) => {
    const { app, calls } = recordingApp({ mars: 'Mars' });
    expect(applyAgentActions([action], app)).toEqual(['Skipped an action the app does not allow.']);
    expect(calls).toEqual([]);
  });

  it('applies nothing when the actions are not a list', () => {
    const { app, calls } = recordingApp();
    expect(applyAgentActions({ type: 'set_layer', layer: 'moons', on: true }, app)).toEqual([]);
    expect(calls).toEqual([]);
  });
});
