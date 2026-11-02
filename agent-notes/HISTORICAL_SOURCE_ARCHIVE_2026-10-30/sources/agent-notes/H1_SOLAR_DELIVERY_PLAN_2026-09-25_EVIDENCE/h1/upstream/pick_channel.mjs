// ../../../../../../tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/upstream/pick_channel_entry.ts
import { readFileSync } from "node:fs";

// ../../../../../../tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/wt-h1/src/frontend/features/solar/solarObservationTexture.ts
var DEFAULT_AIA_CHANNEL_PRIORITY = ["aia_193", "aia_211", "aia_171", "aia_094", "aia_304"];
function pickAiaObservationChannel(physicsState, preferredOrder = DEFAULT_AIA_CHANNEL_PRIORITY, overrideChannel = null) {
  const sdoAia = physicsState?.data_assimilation?.sources?.sdo_aia;
  if (!sdoAia || typeof sdoAia !== "object") return null;
  const channels = sdoAia?.channels;
  if (!channels || typeof channels !== "object") return null;
  const visualizationPreferred = `${sdoAia?.visualization?.preferred_channel ?? ""}`.toLowerCase();
  const orderedChannels = [];
  if (overrideChannel && overrideChannel !== "auto") {
    orderedChannels.push(overrideChannel.toLowerCase());
  }
  if (visualizationPreferred && !orderedChannels.includes(visualizationPreferred)) orderedChannels.push(visualizationPreferred);
  for (const channel of preferredOrder) {
    const normalized = `${channel ?? ""}`.toLowerCase();
    if (!normalized || orderedChannels.includes(normalized)) continue;
    orderedChannels.push(normalized);
  }
  for (const channel of Object.keys(channels)) {
    const normalized = `${channel ?? ""}`.toLowerCase();
    if (!normalized || orderedChannels.includes(normalized)) continue;
    orderedChannels.push(normalized);
  }
  for (const channel of orderedChannels) {
    const entry = channels[channel];
    if (!entry || typeof entry !== "object") continue;
    const imageId = entry?.image_id;
    const tileUrl = entry?.tile_url;
    if (typeof imageId !== "string" || !imageId) continue;
    if (typeof tileUrl !== "string" || !tileUrl) continue;
    return {
      channel,
      imageId,
      imageDate: typeof entry?.image_date === "string" ? entry.image_date : null,
      tileUrl
    };
  }
  return null;
}
function buildAiaProxyTextureUrl(baseUrl, channel, imageId = null) {
  const base2 = `${baseUrl ?? ""}`.trim().replace(/\/+$/, "");
  const normalizedChannel = `${channel ?? ""}`.trim().toLowerCase();
  if (!base2 || !normalizedChannel) return null;
  const query = new URLSearchParams({ channel: normalizedChannel });
  if (imageId) {
    query.set("image_id", `${imageId}`);
    query.set("v", `${imageId}`);
  }
  return `${base2}/solar/realtime/aia-tile?${query.toString()}`;
}

// ../../../../../../tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/upstream/pick_channel_entry.ts
var payload = JSON.parse(readFileSync(process.argv[2], "utf8"));
var base = process.argv[3] ?? "http://127.0.0.1:8072";
var sel = pickAiaObservationChannel(payload, void 0, null);
var url = sel ? buildAiaProxyTextureUrl(base, sel.channel, sel.imageId) : null;
console.log(JSON.stringify({ selection: sel, proxyUrl: url }, null, 1));
for (const ov of ["aia_193", "aia_171"]) {
  const s = pickAiaObservationChannel(payload, void 0, ov);
  console.log("override", ov, JSON.stringify(s), s ? buildAiaProxyTextureUrl(base, s.channel, s.imageId) : null);
}
