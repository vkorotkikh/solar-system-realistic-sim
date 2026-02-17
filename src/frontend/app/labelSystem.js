import {
  CanvasTexture,
  Sprite,
  SpriteMaterial,
  Vector3
} from 'three';

export function createLabelSystemOps({ pointerTipOffsetNorm }) {
  function createLabelSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width * 0.5;
    const yBase = canvas.height * 0.78;
    ctx.strokeStyle = 'rgba(255, 188, 82, 0.95)';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, yBase - 38);
    ctx.lineTo(cx, yBase);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 170, 58, 0.95)';
    ctx.beginPath();
    ctx.moveTo(cx - 20, yBase - 4);
    ctx.lineTo(cx + 20, yBase - 4);
    ctx.lineTo(cx, yBase + 24);
    ctx.closePath();
    ctx.fill();

    ctx.shadowColor = 'rgba(0, 0, 0, 0.88)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#ffbe64';
    ctx.font = '700 62px Oxanium, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height * 0.34);
    ctx.shadowBlur = 5;
    ctx.fillStyle = '#ffd79f';
    ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height * 0.34);

    const texture = new CanvasTexture(canvas);
    const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new Sprite(material);
    sprite.scale.set(1.2, 0.32, 1);
    sprite.userData.aspect = canvas.width / canvas.height;
    sprite.userData.pointerTipOffsetNorm = pointerTipOffsetNorm;
    sprite.renderOrder = 11;
    return sprite;
  }

  function createLocatorHaloSprite() {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');

    const c = canvas.width / 2;
    const outer = 62;
    const inner = 42;
    const gradient = ctx.createRadialGradient(c, c, inner - 16, c, c, outer + 8);
    gradient.addColorStop(0, 'rgba(255, 185, 66, 0.0)');
    gradient.addColorStop(0.55, 'rgba(255, 185, 66, 0.16)');
    gradient.addColorStop(1, 'rgba(255, 185, 66, 0.0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255, 185, 66, 0.92)';
    ctx.beginPath();
    ctx.arc(c, c, inner, 0, Math.PI * 2);
    ctx.stroke();

    const texture = new CanvasTexture(canvas);
    const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new Sprite(material);
    sprite.visible = false;
    sprite.renderOrder = 10;
    return sprite;
  }

  function createInterstellarLabelSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 188;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = 'rgba(197, 225, 255, 0.96)';
    ctx.font = '600 50px Oxanium, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height * 0.4);

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(138, 198, 255, 0.88)';
    ctx.fillRect(canvas.width * 0.2, canvas.height * 0.72, canvas.width * 0.6, 3);

    const texture = new CanvasTexture(canvas);
    const material = new SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });
    const sprite = new Sprite(material);
    sprite.scale.set(1.6, 0.42, 1);
    sprite.renderOrder = 12;
    return sprite;
  }

  function worldUnitsPerPixelAt(distanceToCamera, camera, renderer) {
    const canvasHeight = Math.max(1, renderer.domElement.clientHeight || window.innerHeight);
    return (2 * distanceToCamera * Math.tan((camera.fov * Math.PI) / 360)) / canvasHeight;
  }

  const tempVecA = new Vector3();
  const tempVecB = new Vector3();

  function updateLocatorOverlays({
    dom,
    simState,
    labels,
    locatorHalos,
    bodyById,
    bodyNodes,
    camera,
    renderer,
    bodyRenderRadiusAu,
    localBodyEntries,
    localBodyRenderRadiusAu,
    labelPointerTipOffsetNorm
  }) {
    const locatorMode = Boolean(dom.toggleLocators?.checked);
    const labelsEnabled = Boolean(dom.toggleLabels?.checked);

    for (const entry of labels) {
      const body = bodyById.get(entry.bodyId);
      const node = bodyNodes.get(entry.bodyId);
      if (!body || !node) continue;

      node.getWorldPosition(tempVecA);
      const distance = Math.max(1e-6, camera.position.distanceTo(tempVecA));
      const unitPerPixel = worldUnitsPerPixelAt(distance, camera, renderer);
      const radius = bodyRenderRadiusAu(body, simState.useRealisticScale);
      const pixelRadius = radius / Math.max(unitPerPixel, 1e-9);

      const forceLocatorInRealistic = locatorMode && simState.useRealisticScale;
      const shouldShowLabel = labelsEnabled || forceLocatorInRealistic;

      const labelHeightPx = shouldShowLabel
        ? (forceLocatorInRealistic ? 28 : 21)
        : 0;
      const labelHeightWorld = labelHeightPx * unitPerPixel;
      const minHeightWorld = radius * (forceLocatorInRealistic ? 1.45 : 1.1);
      const maxHeightWorld = simState.useRealisticScale ? 0.16 : 2.0;
      const clampedHeight = Math.max(minHeightWorld, Math.min(maxHeightWorld, labelHeightWorld));
      const aspect = entry.sprite.userData.aspect ?? 4.0;
      const pointerTipNorm = entry.sprite.userData.pointerTipOffsetNorm ?? labelPointerTipOffsetNorm;

      entry.sprite.visible = shouldShowLabel;
      entry.sprite.scale.set(clampedHeight * aspect, clampedHeight, 1);

      const clearancePx = shouldShowLabel ? 16 : 8;
      const pointerTipWorld = clampedHeight * pointerTipNorm;
      const pointerTipTargetY = Math.max(radius * 2.25, unitPerPixel * (clearancePx + pixelRadius * 1.2));
      entry.sprite.position.set(0, pointerTipTargetY + pointerTipWorld, 0);
    }

    if (Array.isArray(localBodyEntries) && typeof localBodyRenderRadiusAu === 'function') {
      const showLocalLabels = Boolean(dom.toggleLabels?.checked);
      for (const entry of localBodyEntries) {
        if (!entry?.label || !entry?.body) continue;
        const radius = localBodyRenderRadiusAu(entry.body, simState.useRealisticScale);
        const pointerTipNorm = entry.label.userData.pointerTipOffsetNorm ?? labelPointerTipOffsetNorm;
        const pointerTipWorld = entry.label.scale.y * pointerTipNorm;
        entry.label.position.set(0, radius * 2.4 + 0.015 + pointerTipWorld * 0, 0);
        entry.label.visible = showLocalLabels;
      }
    }

    const halosByBodyId = new Map(locatorHalos.map((item) => [item.bodyId, item.sprite]));
    for (const [bodyId, haloSprite] of halosByBodyId.entries()) {
      const body = bodyById.get(bodyId);
      const node = bodyNodes.get(bodyId);
      if (!body || !node) continue;

      node.getWorldPosition(tempVecB);
      const distance = Math.max(1e-6, camera.position.distanceTo(tempVecB));
      const unitPerPixel = worldUnitsPerPixelAt(distance, camera, renderer);
      const radius = bodyRenderRadiusAu(body, simState.useRealisticScale);
      const pixelRadius = radius / Math.max(unitPerPixel, 1e-9);

      const haloVisible = Boolean(dom.toggleLocators?.checked) && pixelRadius < 1.35;
      haloSprite.visible = haloVisible;
      if (haloVisible) {
        const haloWorldSize = Math.max(unitPerPixel * 22, radius * 4.5);
        haloSprite.scale.set(haloWorldSize, haloWorldSize, 1);
        haloSprite.position.set(0, 0, 0);
      }
    }
  }

  return {
    createLabelSprite,
    createLocatorHaloSprite,
    createInterstellarLabelSprite,
    updateLocatorOverlays
  };
}
