// ../../../../../../tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/wt-notice/src/constants.ts
var AU_KM = 1495978707e-1;
var AU_M = AU_KM * 1e3;
var DAY_SECONDS = 86400;
var DAY_MILLISECONDS = DAY_SECONDS * 1e3;
var TAI_MINUS_UTC_STEPS = [
  [Date.UTC(1972, 0, 1), 10],
  [Date.UTC(1972, 6, 1), 11],
  [Date.UTC(1973, 0, 1), 12],
  [Date.UTC(1974, 0, 1), 13],
  [Date.UTC(1975, 0, 1), 14],
  [Date.UTC(1976, 0, 1), 15],
  [Date.UTC(1977, 0, 1), 16],
  [Date.UTC(1978, 0, 1), 17],
  [Date.UTC(1979, 0, 1), 18],
  [Date.UTC(1980, 0, 1), 19],
  [Date.UTC(1981, 6, 1), 20],
  [Date.UTC(1982, 6, 1), 21],
  [Date.UTC(1983, 6, 1), 22],
  [Date.UTC(1985, 6, 1), 23],
  [Date.UTC(1988, 0, 1), 24],
  [Date.UTC(1990, 0, 1), 25],
  [Date.UTC(1991, 0, 1), 26],
  [Date.UTC(1992, 6, 1), 27],
  [Date.UTC(1993, 6, 1), 28],
  [Date.UTC(1994, 6, 1), 29],
  [Date.UTC(1996, 0, 1), 30],
  [Date.UTC(1997, 6, 1), 31],
  [Date.UTC(1999, 0, 1), 32],
  [Date.UTC(2006, 0, 1), 33],
  [Date.UTC(2009, 0, 1), 34],
  [Date.UTC(2012, 6, 1), 35],
  [Date.UTC(2015, 6, 1), 36],
  [Date.UTC(2017, 0, 1), 37]
];

// ../../../../../../tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/wt-notice/src/frontend/features/solar/solarPhysicsClient.ts
function formatSeconds(ms) {
  return `${Number((ms / 1e3).toFixed(1))}`;
}

// ../../../../../../tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/wt-notice/src/frontend/features/solar/solarDataStatus.ts
function formatUtcMinute(ms) {
  return `${new Date(ms).toISOString().slice(11, 16)} UTC`;
}
function failureReason(failure, input) {
  switch (failure.kind) {
    case "timeout":
      return `solar server did not answer within ${formatSeconds(input.timeoutMs)} s`;
    case "busy":
      return "solar server busy, HTTP 503";
    case "server-timeout":
      return "solar server ran out of compute time, HTTP 503";
    case "rate-limited":
      return "solar server rate limit reached, HTTP 429";
    case "http":
      return `solar server error, HTTP ${failure.httpStatus ?? "unknown"}`;
    case "server-error":
      return "solar server failed without a readable reply, likely an internal error";
    case "blocked":
      return input.pageOrigin ? `solar server does not allow this page's origin ${input.pageOrigin} (CORS)` : "solar server does not allow this page's origin (CORS)";
    case "unreachable":
      return `solar server not reachable at ${input.backendBaseUrl}`;
    case "invalid-response":
      return "solar server sent an invalid response";
    case "network":
    default:
      return `network error contacting ${input.backendBaseUrl}`;
  }
}
function describeForcing(payload) {
  const assimilation = payload?.data_assimilation;
  const mode = typeof assimilation?.mode === "string" ? assimilation.mode : null;
  if (!mode || mode === "synthetic") return "synthetic forcing, no observations";
  const forcing = `${mode.replace(/_/g, "-")} forcing`;
  const blendWeight = Number(assimilation?.blend_weight);
  if (assimilation?.applied === true && Number.isFinite(blendWeight)) {
    return `${forcing}, observations blended ${Math.round(blendWeight * 100)}%`;
  }
  return assimilation?.live_data_available === true ? `${forcing}, observations not applied` : `${forcing}, observations unavailable`;
}
function aiaLabel(channel) {
  const wavelength = channel.replace(/^aia_0*/i, "");
  return wavelength ? `AIA ${wavelength}` : "AIA";
}
function describeObservationImage(input) {
  const parts = [];
  if (input.displayedImageChannel) parts.push(`${aiaLabel(input.displayedImageChannel)} image`);
  if (input.failedImageChannel && input.failedImageChannel !== input.displayedImageChannel) {
    parts.push(`${aiaLabel(input.failedImageChannel)} image failed to load`);
  }
  return parts.map((part) => `; ${part}`).join("");
}
function failureFamily(kind) {
  switch (kind) {
    case "timeout":
    case "busy":
    case "server-timeout":
    case "rate-limited":
      return "slow";
    case "blocked":
      return "blocked";
    case "unreachable":
    case "network":
      return "unreachable";
    default:
      return "server-error";
  }
}
var FAMILY_ANNOUNCEMENTS = {
  slow: "solar server too slow or busy",
  blocked: "solar server does not allow this page's origin",
  unreachable: "solar server not reachable",
  "server-error": "solar server error"
};
function describeSolarDataStatus(input) {
  const hasBackendState = input.lastSuccessMs > 0 && input.payload !== null;
  if (input.lastFailure) {
    const reason = failureReason(input.lastFailure, input);
    if (hasBackendState) {
      return {
        state: "stale",
        text: `Sun: backend state from ${formatUtcMinute(input.lastSuccessMs)} (refresh failing: ${reason})`,
        announcementKey: "stale",
        announcement: "Sun data: backend updates failing, showing the last backend state."
      };
    }
    const family = failureFamily(input.lastFailure.kind);
    return {
      state: "error",
      text: `Sun: procedural fallback (${reason})`,
      announcementKey: `error:${family}`,
      announcement: `Sun data unavailable: ${FAMILY_ANNOUNCEMENTS[family]}. Showing the procedural Sun.`
    };
  }
  if (hasBackendState) {
    return {
      state: "backend",
      text: `Sun: backend solar model (${describeForcing(input.payload)}${describeObservationImage(input)}) \xB7 updated ${formatUtcMinute(input.lastSuccessMs)}`,
      announcementKey: "backend",
      announcement: "Sun data: backend solar model connected."
    };
  }
  return {
    state: "connecting",
    text: "Sun: procedural fallback (connecting to solar model server)",
    announcementKey: "connecting",
    announcement: null
  };
}
function renderSolarDataStatus(element, status) {
  if (!element) return;
  if (element.textContent === status.text && element.dataset.solarState === status.state) return;
  element.textContent = status.text;
  element.title = status.text;
  element.dataset.solarState = status.state;
}
var SolarDataAnnouncer = class {
  element;
  announcedKey;
  pendingKey;
  constructor(element) {
    this.element = element;
    this.announcedKey = null;
    this.pendingKey = null;
  }
  /** Returns true when the status was announced. */
  observe(status) {
    if (status.announcementKey === this.announcedKey) {
      this.pendingKey = null;
      return false;
    }
    if (status.announcement === null) return false;
    const switchingFailure = status.state === "error" && this.announcedKey?.startsWith("error:") === true;
    if (switchingFailure && this.pendingKey !== status.announcementKey) {
      this.pendingKey = status.announcementKey;
      return false;
    }
    this.announcedKey = status.announcementKey;
    this.pendingKey = null;
    if (this.element) this.element.textContent = status.announcement;
    return true;
  }
};
export {
  SolarDataAnnouncer,
  describeSolarDataStatus,
  renderSolarDataStatus
};
