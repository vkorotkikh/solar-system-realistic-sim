// The card and the drawn route take their numbers from the planner's trip object (epic issue C11).
// The fixture is real agent output: backend/tests/test_planner_agent_fixture.py writes it.
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import replies from './agentReplies.fixture.json';
import { cardFor, planFor, routeFor, type Shown, type ShownPlan, type ShownTrip } from './tripPresentation';

const mars = replies.mars.show as unknown as ShownTrip;
const roundTrip = replies.marsRoundTrip.show as unknown as ShownTrip;
const moon = replies.moon.show as unknown as ShownTrip;
const plan = replies.plan.show as unknown as ShownPlan;

/** A stand-in for the model: a position that encodes which body and date were asked for. */
function sampler() {
  const asked: Array<[string, number]> = [];
  const positionAt = (bodyId: string, julianDate: number) => {
    asked.push([bodyId, julianDate]);
    return new Vector3(bodyId.length, julianDate, 0);
  };
  return { asked, positionAt };
}

describe('cardFor', () => {
  it('shows a one-way trip with the planner\'s own dates, time and delta-v', () => {
    const { trip } = mars;
    const [leave, arrive] = trip.legs[0].burns;
    expect(cardFor(mars)).toEqual({
      title: 'Earth to Mars',
      badge: 'cheapest',
      rows: [
        { label: 'Leave', value: trip.legs[0].depart.date },
        { label: 'Arrive', value: trip.legs[0].arrive.date },
        { label: 'Flight time', value: `${trip.total_days.toFixed(0)} days` },
        { label: 'Total delta-v', value: `${trip.total_delta_v_km_s.toFixed(2)} km/s` },
      ],
      lines: [
        `${leave.date}: burn ${leave.delta_v_km_s.toFixed(2)} km/s at Low Earth orbit, 200 km`,
        `${arrive.date}: burn ${arrive.delta_v_km_s.toFixed(2)} km/s at Low Mars orbit, 400 km`,
      ],
      notes: trip.approximations,
    });
    // Pinned once against the fixture, so a formatting slip cannot hide behind the same slip in the test.
    expect(cardFor(mars).rows.map((row) => row.value)).toEqual(['2026-11-12', '2027-09-12', '304 days', '5.76 km/s']);
  });

  it('shows a round trip\'s stay and its return date', () => {
    const card = cardFor(roundTrip);
    expect(card.rows.map((row) => row.label)).toEqual(['Leave', 'Back', 'Stay', 'Total time', 'Total delta-v']);
    expect(card.rows.map((row) => row.value)).toEqual([
      roundTrip.trip.legs[0].depart.date, roundTrip.trip.legs[1].arrive.date, '30 days', '852 days', '17.01 km/s',
    ]);
    expect(card.lines).toHaveLength(4);
  });

  it('shows a short flight to one decimal place', () => {
    expect(cardFor(moon).rows.find((row) => row.label === 'Flight time')?.value).toBe('5.0 days');
  });

  it('shows a plan\'s span and one line per trip', () => {
    const card = cardFor(plan);
    expect([card.title, card.badge]).toEqual(['Plan of 2 trips', '']);
    expect(card.rows).toEqual([
      { label: 'First departure', value: plan.plan.first_departure!.date },
      { label: 'Last arrival', value: plan.plan.last_arrival!.date },
    ]);
    const crew = plan.plan.trips.crew.chosen!;
    expect(card.lines).toHaveLength(2);
    expect(card.lines[1]).toBe(`crew: Earth to Mars: leave ${crew.legs[0].depart.date}, arrive `
      + `${crew.legs[0].arrive.date}, ${crew.total_delta_v_km_s.toFixed(2)} km/s`);
  });

  it('marks a plan with an unscheduled trip and repeats the planner\'s problem', () => {
    const broken: ShownPlan = {
      ...plan,
      plan: {
        ...plan.plan, status: 'incomplete',
        trips: { ...plan.plan.trips, crew: { status: 'not_searched' } },
        problems: [{ message: "'crew' waits for 'cargo', which has no trip in the plan." }],
      },
    };
    const card = cardFor(broken);
    expect([card.badge, card.lines[1], card.notes]).toEqual([
      'incomplete', 'crew: not scheduled', ["'crew' waits for 'cargo', which has no trip in the plan."],
    ]);
  });
});

describe('routeFor', () => {
  it('draws a leg from where its start is on the departure date to where its end is on the arrival date', () => {
    const { asked, positionAt } = sampler();
    const leg = mars.trip.legs[0];
    const { route, label, undrawn } = routeFor(mars, positionAt);
    expect(asked).toEqual([['earth', leg.depart.jd], ['mars', leg.arrive.jd]]);
    expect(route.bodyRoute).toEqual(['earth', 'mars']);
    expect(route.legs).toEqual([{
      fromId: 'earth', toId: 'mars',
      startPosition: new Vector3(5, leg.depart.jd, 0), endPosition: new Vector3(4, leg.arrive.jd, 0),
    }]);
    expect([label, undrawn]).toEqual([null, 0]); // the route display names a trip's bodies itself
  });

  it('draws both legs of a round trip', () => {
    const { route } = routeFor(roundTrip, sampler().positionAt);
    expect([route.bodyRoute, route.legs.length]).toEqual([['earth', 'mars', 'earth'], 2]);
  });

  it('draws every scheduled trip of a plan', () => {
    const { route, label, undrawn } = routeFor(plan, sampler().positionAt);
    expect([route.legs.length, label, undrawn]).toEqual([2, 'Route: plan of 2 trips', 0]);
  });

  it('counts a leg around a planet as not drawn, without asking for positions', () => {
    const { asked, positionAt } = sampler();
    const { route, undrawn } = routeFor(moon, positionAt);
    expect([route.legs, undrawn, asked]).toEqual([[], 1, []]);
  });

  it('counts a leg whose body has no position on its date as not drawn', () => {
    const { route, undrawn } = routeFor(mars, (bodyId) => (bodyId === 'mars' ? null : new Vector3()));
    expect([route.legs, undrawn]).toEqual([[], 1]);
  });
});

describe('planFor', () => {
  it('sends a shown plan back as it was asked, and a shown trip as a plan of one', () => {
    expect(planFor(null)).toBeNull();
    expect(planFor(plan)).toBe(plan.request);
    expect(planFor(mars as Shown)).toEqual({ trips: [{ key: 'trip', search: mars.request }] });
    expect(mars.request).toMatchObject({ from: 'earth', to: 'mars', trip: 'one_way' });
  });
});
