import { Vector3 } from 'three';
import { AU_M, AU_KM, DAY_SECONDS, G_SI, MU_SUN_AU3_DAY2, auPerDayToKmPerSec } from '../../../constants.js';

function muAu3Day2FromMassKg(massKg) {
  const muSi = G_SI * massKg;
  return (muSi * DAY_SECONDS * DAY_SECONDS) / (AU_M * AU_M * AU_M);
}

function safeAngleBetween(a, b) {
  const denom = Math.max(1e-9, a.length() * b.length());
  const cosTheta = Math.min(1, Math.max(-1, a.dot(b) / denom));
  return Math.acos(cosTheta);
}

function computeHohmannLeg(model, fromId, toId, departureJd) {
  const fromAtDeparture = model.sampleBodyStateAt(fromId, departureJd);
  const toAtDeparture = model.sampleBodyStateAt(toId, departureJd);

  let r1 = fromAtDeparture.position.length();
  let r2 = toAtDeparture.position.length();

  // Light phasing refinement: one fixed-point iteration on destination radius.
  for (let i = 0; i < 2; i += 1) {
    const transferA = 0.5 * (r1 + r2);
    const tofDays = Math.PI * Math.sqrt((transferA ** 3) / MU_SUN_AU3_DAY2);
    const toAtArrival = model.sampleBodyStateAt(toId, departureJd + tofDays);
    r2 = toAtArrival.position.length();
  }

  const transferA = 0.5 * (r1 + r2);
  const tofDays = Math.PI * Math.sqrt((transferA ** 3) / MU_SUN_AU3_DAY2);
  const arrivalJd = departureJd + tofDays;

  const fromState = model.sampleBodyStateAt(fromId, departureJd);
  const toState = model.sampleBodyStateAt(toId, arrivalJd);

  const vCircular1 = Math.sqrt(MU_SUN_AU3_DAY2 / r1);
  const vCircular2 = Math.sqrt(MU_SUN_AU3_DAY2 / r2);
  const vTransfer1 = Math.sqrt(MU_SUN_AU3_DAY2 * (2 / r1 - 1 / transferA));
  const vTransfer2 = Math.sqrt(MU_SUN_AU3_DAY2 * (2 / r2 - 1 / transferA));

  const deltaVDepartureKmS = auPerDayToKmPerSec(Math.abs(vTransfer1 - vCircular1));
  const deltaVArrivalKmS = auPerDayToKmPerSec(Math.abs(vCircular2 - vTransfer2));

  const averageVelocity = toState.position.clone().sub(fromState.position).divideScalar(tofDays);
  const departureVelocityApprox = averageVelocity.clone();
  const arrivalVelocityApprox = averageVelocity.clone();

  return {
    fromId,
    toId,
    departureJd,
    arrivalJd,
    tofDays,
    pathLengthAu: Math.PI * transferA,
    transferSemiMajorAu: transferA,
    deltaVDepartureKmS,
    deltaVArrivalKmS,
    startPosition: fromState.position.clone(),
    endPosition: toState.position.clone(),
    departureVelocityApprox,
    arrivalVelocityApprox
  };
}

function evaluateAssist(model, body, incomingLeg, outgoingLeg) {
  if (!body) {
    return {
      assistGainKmS: 0,
      requiredTurnDeg: 0,
      maxTurnDeg: 0,
      feasible: false
    };
  }

  if (!body.massKg || !body.radiusKm) {
    return {
      assistGainKmS: 0,
      requiredTurnDeg: 0,
      maxTurnDeg: 0,
      feasible: true
    };
  }

  const encounterJd = incomingLeg.arrivalJd;
  const bodyState = model.sampleBodyStateAt(body.id, encounterJd);
  const bodyVelocity = bodyState.velocity;

  const vInfIn = incomingLeg.arrivalVelocityApprox.clone().sub(bodyVelocity);
  const vInfOut = outgoingLeg.departureVelocityApprox.clone().sub(bodyVelocity);

  const vInfMagnitudeAuDay = 0.5 * (vInfIn.length() + vInfOut.length());
  const vInfMagnitudeKmS = auPerDayToKmPerSec(vInfMagnitudeAuDay);
  const requiredTurn = safeAngleBetween(vInfIn, vInfOut);

  const muBody = muAu3Day2FromMassKg(body.massKg);
  const rpAu = (body.radiusKm + 300) / AU_KM;

  let maxTurn = 0;
  if (muBody > 0 && vInfMagnitudeAuDay > 1e-8) {
    const denominator = 1 + (rpAu * vInfMagnitudeAuDay * vInfMagnitudeAuDay) / muBody;
    maxTurn = 2 * Math.asin(Math.min(1, 1 / denominator));
  }

  const appliedTurn = Math.min(requiredTurn, maxTurn);
  const assistGainKmS = 2 * vInfMagnitudeKmS * Math.sin(appliedTurn / 2);

  return {
    assistGainKmS,
    requiredTurnDeg: (requiredTurn * 180) / Math.PI,
    maxTurnDeg: (maxTurn * 180) / Math.PI,
    feasible: requiredTurn <= maxTurn + 1e-6
  };
}

function scoreRoute(route, objective) {
  if (objective === 'max_assist') {
    return (
      route.totalAssistGainKmS * 4 -
      route.totalDeltaVKmS * 0.9 -
      route.totalPathLengthAu * 0.05 -
      route.totalTimeDays * 0.001 -
      route.turnDeficitPenalty * 2
    );
  }

  return (
    -route.totalPathLengthAu * 1.6 -
    route.totalDeltaVKmS * 0.4 -
    route.totalTimeDays * 0.002 +
    route.totalAssistGainKmS * 0.05 -
    route.turnDeficitPenalty * 1.5
  );
}

function generateAssistRoutes(startId, endId, assistPool, maxAssists) {
  const routes = [[startId, endId]];

  function backtrack(path, remainingDepth) {
    if (remainingDepth === 0) {
      routes.push([...path, endId]);
      return;
    }

    for (const candidate of assistPool) {
      if (candidate === startId || candidate === endId || path.includes(candidate)) {
        continue;
      }
      backtrack([...path, candidate], remainingDepth - 1);
    }
  }

  for (let assistCount = 1; assistCount <= maxAssists; assistCount += 1) {
    backtrack([startId], assistCount);
  }

  return routes;
}

export function planInterplanetaryRoute(model, bodyById, options) {
  const {
    fromId,
    toId,
    departureJd,
    objective = 'min_distance',
    maxAssists = 1,
    assistPool = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn']
  } = options;

  if (!bodyById.has(fromId) || !bodyById.has(toId) || fromId === toId) {
    return {
      best: null,
      alternatives: []
    };
  }

  const sanitizedAssistPool = Array.from(
    new Set(
      (Array.isArray(assistPool) ? assistPool : [])
        .filter((candidate) => typeof candidate === 'string')
        .map((candidate) => candidate.trim())
        .filter((candidate) => candidate.length > 0 && candidate !== fromId && candidate !== toId && bodyById.has(candidate))
    )
  );

  const routeBodies = generateAssistRoutes(fromId, toId, sanitizedAssistPool, maxAssists);
  const evaluatedRoutes = [];

  for (const bodyRoute of routeBodies) {
    const legs = [];
    let currentDeparture = departureJd;
    let routeValid = true;

    for (let i = 0; i < bodyRoute.length - 1; i += 1) {
      let leg;
      try {
        leg = computeHohmannLeg(model, bodyRoute[i], bodyRoute[i + 1], currentDeparture);
      } catch {
        routeValid = false;
        break;
      }
      if (!Number.isFinite(leg.arrivalJd) || !Number.isFinite(leg.departureJd) || leg.arrivalJd <= leg.departureJd) {
        routeValid = false;
        break;
      }
      legs.push(leg);
      currentDeparture = leg.arrivalJd;
    }

    if (!routeValid || legs.length === 0) {
      continue;
    }

    let totalAssistGainKmS = 0;
    let turnDeficitPenalty = 0;
    const assists = [];

    for (let i = 1; i < bodyRoute.length - 1; i += 1) {
      const assistBodyId = bodyRoute[i];
      const assistBody = bodyById.get(assistBodyId);
      const assist = evaluateAssist(model, assistBody, legs[i - 1], legs[i]);

      assists.push({
        bodyId: assistBodyId,
        ...assist
      });

      totalAssistGainKmS += assist.assistGainKmS;

      if (!assist.feasible) {
        const deficit = Math.max(0, assist.requiredTurnDeg - assist.maxTurnDeg);
        turnDeficitPenalty += deficit / 20;
      }
    }

    const totalPathLengthAu = legs.reduce((sum, leg) => sum + leg.pathLengthAu, 0);
    const totalTimeDays = legs[legs.length - 1].arrivalJd - legs[0].departureJd;

    let totalDeltaVKmS = 0;
    for (let i = 0; i < legs.length; i += 1) {
      totalDeltaVKmS += legs[i].deltaVDepartureKmS;
      if (i === legs.length - 1) {
        totalDeltaVKmS += legs[i].deltaVArrivalKmS;
      }
    }

    const route = {
      bodyRoute,
      legs,
      assists,
      objective,
      totalAssistGainKmS,
      totalDeltaVKmS,
      totalPathLengthAu,
      totalTimeDays,
      turnDeficitPenalty
    };

    route.score = scoreRoute(route, objective);
    evaluatedRoutes.push(route);
  }

  evaluatedRoutes.sort((a, b) => b.score - a.score);

  return {
    best: evaluatedRoutes[0] ?? null,
    alternatives: evaluatedRoutes.slice(1, 6)
  };
}

export function buildTransferCurvePoints(leg, segments = 72) {
  const start = leg.startPosition;
  const end = leg.endPosition;
  const distance = start.distanceTo(end);

  if (distance < 1e-6) {
    return [start.clone(), end.clone()];
  }

  const normal = start.clone().cross(end);
  if (normal.lengthSq() < 1e-10) {
    normal.set(0, 0, 1);
  }
  normal.normalize();

  const tangentStart = normal.clone().cross(start).normalize();
  const tangentEnd = normal.clone().cross(end).normalize();

  const controlScale = distance * 0.33;

  const c1 = start.clone().addScaledVector(tangentStart, controlScale);
  const c2 = end.clone().addScaledVector(tangentEnd, -controlScale);

  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const omt = 1 - t;

    const point = new Vector3()
      .addScaledVector(start, omt ** 3)
      .addScaledVector(c1, 3 * omt * omt * t)
      .addScaledVector(c2, 3 * omt * t * t)
      .addScaledVector(end, t ** 3);

    points.push(point);
  }

  return points;
}

export function describeRoute(route, bodyById) {
  if (!route) {
    return 'No feasible route could be evaluated for the selected settings.';
  }

  const routeNames = route.bodyRoute.map((bodyId) => bodyById.get(bodyId)?.name ?? bodyId).join(' -> ');
  const assistLines = route.assists.length
    ? route.assists
        .map((assist) => {
          const bodyName = bodyById.get(assist.bodyId)?.name ?? assist.bodyId;
          const feasibility = assist.feasible ? 'feasible' : 'turn-limited';
          return `${bodyName}: +${assist.assistGainKmS.toFixed(2)} km/s (${feasibility}, req ${assist.requiredTurnDeg.toFixed(1)} deg, max ${assist.maxTurnDeg.toFixed(1)} deg)`;
        })
        .join('\n')
    : 'None';

  return [
    `Route: ${routeNames}`,
    `Objective: ${route.objective}`,
    `Total time: ${route.totalTimeDays.toFixed(1)} days`,
    `Total transfer path: ${route.totalPathLengthAu.toFixed(2)} AU`,
    `Approx total delta-v: ${route.totalDeltaVKmS.toFixed(2)} km/s`,
    `Estimated gravity-assist gain: ${route.totalAssistGainKmS.toFixed(2)} km/s`,
    `Assist details:\n${assistLines}`
  ].join('\n');
}
