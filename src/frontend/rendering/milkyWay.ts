import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  RepeatWrapping,
  SphereGeometry,
  Vector3
} from 'three';

const TWO_PI = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;
const J2000_ECLIPTIC_OBLIQUITY_RAD = 23.439291111 * DEG_TO_RAD;
const COS_J2000_ECLIPTIC_OBLIQUITY = Math.cos(J2000_ECLIPTIC_OBLIQUITY_RAD);
const SIN_J2000_ECLIPTIC_OBLIQUITY = Math.sin(J2000_ECLIPTIC_OBLIQUITY_RAD);
// IAU 1958 galactic frame in J2000/ICRS realization (Hipparcos/ERFA constants).
const GALACTIC_TO_EQUATORIAL_M11 = -0.0548755604;
const GALACTIC_TO_EQUATORIAL_M12 = 0.4941094279;
const GALACTIC_TO_EQUATORIAL_M13 = -0.867666149;
const GALACTIC_TO_EQUATORIAL_M21 = -0.8734370902;
const GALACTIC_TO_EQUATORIAL_M22 = -0.44482963;
const GALACTIC_TO_EQUATORIAL_M23 = -0.1980763734;
const GALACTIC_TO_EQUATORIAL_M31 = -0.4838350155;
const GALACTIC_TO_EQUATORIAL_M32 = 0.7469822445;
const GALACTIC_TO_EQUATORIAL_M33 = 0.4559837762;

function bvToRgbUnit(bvValue) {
  const bv = Math.min(2.2, Math.max(-0.4, Number.isFinite(bvValue) ? bvValue : 0.65));
  let t;
  if (bv < 0.0) t = (bv + 0.4) / 0.4;
  else if (bv < 0.4) t = bv / 0.4;
  else if (bv < 1.5) t = (bv - 0.4) / 1.1;
  else t = (bv - 1.5) / 0.7;

  if (bv < 0.0) return [0.62 + 0.1 * t, 0.74 + 0.1 * t, 1.0];
  if (bv < 0.4) return [0.72 + 0.23 * t, 0.84 + 0.14 * t, 1.0];
  if (bv < 1.5) return [1.0, 0.98 - 0.3 * t, 0.95 - 0.62 * t];
  return [1.0, 0.68 - 0.2 * t, 0.33 - 0.08 * t];
}

function equatorialDegToUnit(raDeg, decDeg) {
  const ra = raDeg * DEG_TO_RAD;
  const dec = decDeg * DEG_TO_RAD;
  const cosDec = Math.cos(dec);
  return [
    cosDec * Math.cos(ra),
    cosDec * Math.sin(ra),
    Math.sin(dec)
  ];
}

function galacticUnitToEquatorial(xg, yg, zg) {
  return [
    GALACTIC_TO_EQUATORIAL_M11 * xg + GALACTIC_TO_EQUATORIAL_M12 * yg + GALACTIC_TO_EQUATORIAL_M13 * zg,
    GALACTIC_TO_EQUATORIAL_M21 * xg + GALACTIC_TO_EQUATORIAL_M22 * yg + GALACTIC_TO_EQUATORIAL_M23 * zg,
    GALACTIC_TO_EQUATORIAL_M31 * xg + GALACTIC_TO_EQUATORIAL_M32 * yg + GALACTIC_TO_EQUATORIAL_M33 * zg
  ];
}

function equatorialUnitToEcliptic(xEq, yEq, zEq) {
  return [
    xEq,
    COS_J2000_ECLIPTIC_OBLIQUITY * yEq + SIN_J2000_ECLIPTIC_OBLIQUITY * zEq,
    -SIN_J2000_ECLIPTIC_OBLIQUITY * yEq + COS_J2000_ECLIPTIC_OBLIQUITY * zEq
  ];
}

function eclipticUnitToEquatorial(xEcl, yEcl, zEcl) {
  return [
    xEcl,
    COS_J2000_ECLIPTIC_OBLIQUITY * yEcl - SIN_J2000_ECLIPTIC_OBLIQUITY * zEcl,
    SIN_J2000_ECLIPTIC_OBLIQUITY * yEcl + COS_J2000_ECLIPTIC_OBLIQUITY * zEcl
  ];
}

export function equatorialDegToCartesian(raDeg, decDeg, radius) {
  const [xEq, yEq, zEq] = equatorialDegToUnit(raDeg, decDeg);
  const [x, y, z] = equatorialUnitToEcliptic(xEq, yEq, zEq);
  return [
    x * radius,
    y * radius,
    z * radius
  ];
}

function galacticToCartesian(lRad, bRad, radius) {
  const cosB = Math.cos(bRad);
  const xg = cosB * Math.cos(lRad);
  const yg = cosB * Math.sin(lRad);
  const zg = Math.sin(bRad);
  const [xEq, yEq, zEq] = galacticUnitToEquatorial(xg, yg, zg);
  const [x, y, z] = equatorialUnitToEcliptic(xEq, yEq, zEq);
  return [x * radius, y * radius, z * radius];
}

function angularSeparationDeg(ax, ay, az, bx, by, bz) {
  const dot = Math.min(1, Math.max(-1, ax * bx + ay * by + az * bz));
  return (Math.acos(dot) * 180) / Math.PI;
}

function validateGalacticFrame() {
  const [gcX, gcY, gcZ] = galacticToCartesian(0, 0, 1);
  const [gcEqX, gcEqY, gcEqZ] = eclipticUnitToEquatorial(gcX, gcY, gcZ);
  const [gcExpectedX, gcExpectedY, gcExpectedZ] = equatorialDegToUnit(266.4051, -28.936175);
  const gcErrorDeg = angularSeparationDeg(gcEqX, gcEqY, gcEqZ, gcExpectedX, gcExpectedY, gcExpectedZ);

  const [ngpX, ngpY, ngpZ] = galacticToCartesian(0, Math.PI * 0.5, 1);
  const [ngpEqX, ngpEqY, ngpEqZ] = eclipticUnitToEquatorial(ngpX, ngpY, ngpZ);
  const [ngpExpectedX, ngpExpectedY, ngpExpectedZ] = equatorialDegToUnit(192.85948, 27.12825);
  const ngpErrorDeg = angularSeparationDeg(ngpEqX, ngpEqY, ngpEqZ, ngpExpectedX, ngpExpectedY, ngpExpectedZ);

  if (gcErrorDeg > 1e-2 || ngpErrorDeg > 1e-2) {
    console.warn(
      `[Milky Way frame] Verification failed: GC error ${gcErrorDeg.toExponential(2)} deg, ` +
      `NGP error ${ngpErrorDeg.toExponential(2)} deg`
    );
  }
}

function wrapRadians(angle) {
  const wrapped = angle % TWO_PI;
  return wrapped >= 0 ? wrapped : wrapped + TWO_PI;
}

function circularDistanceRadians(a, b) {
  const d = Math.abs(a - b) % TWO_PI;
  return Math.min(d, TWO_PI - d);
}

function gaussianByDistance(distance, sigma) {
  if (sigma <= 0) return 0;
  return Math.exp(-(distance * distance) / (2 * sigma * sigma));
}

function sampleGaussian(sigma = 1) {
  const u1 = Math.max(1e-8, Math.random());
  const u2 = Math.max(1e-8, Math.random());
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(TWO_PI * u2) * sigma;
}

function galacticLongitudeWeight(lRad) {
  const bulge = gaussianByDistance(circularDistanceRadians(lRad, 0), 0.33);
  const scutumCentaurus = gaussianByDistance(circularDistanceRadians(lRad, 0.42), 0.27);
  const cygnus = gaussianByDistance(circularDistanceRadians(lRad, 1.45), 0.31);
  const carina = gaussianByDistance(circularDistanceRadians(lRad, 5.05), 0.3);
  const anticenter = gaussianByDistance(circularDistanceRadians(lRad, Math.PI), 0.5);
  const density = 0.18 + bulge * 0.95 + scutumCentaurus * 0.48 + cygnus * 0.44 + carina * 0.4 + anticenter * 0.25;
  return Math.max(0.16, Math.min(1, density));
}

function createStandardMilkyWayLayer(radius) {
  const milkyCount = 34_000;
  const milkyPositions = new Float32Array(milkyCount * 3);
  const milkyColors = new Float32Array(milkyCount * 3);

  for (let i = 0; i < milkyCount; i++) {
    const l = Math.random() * TWO_PI;
    let b = sampleGaussian(0.095);
    b += 0.012 * Math.sin(2.1 * l + 0.4);
    b = Math.max(-0.52, Math.min(0.52, b));

    const r = radius * (0.9 + Math.random() * 0.1);
    const [x, y, z] = galacticToCartesian(l, b, r);
    milkyPositions[i * 3] = x;
    milkyPositions[i * 3 + 1] = y;
    milkyPositions[i * 3 + 2] = z;

    const laneDark = gaussianByDistance(Math.abs(b), 0.034);
    const latFalloff = Math.exp(-Math.abs(b) / 0.25);
    const intensity = (0.28 + 0.72 * Math.random()) * latFalloff * (1 - 0.35 * laneDark);
    milkyColors[i * 3] = intensity * 0.84;
    milkyColors[i * 3 + 1] = intensity * 0.89;
    milkyColors[i * 3 + 2] = intensity * 0.98;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(milkyPositions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(milkyColors, 3));

  const layerGroup = new Group();
  const points = new Points(
    geometry,
    new PointsMaterial({
      size: 0.55,
      vertexColors: true,
      transparent: true,
      opacity: 0.33,
      blending: AdditiveBlending,
      sizeAttenuation: true,
      depthTest: true,
      depthWrite: false
    })
  );
  const haze = new Points(
    geometry,
    new PointsMaterial({
      color: new Color('#cad5e2'),
      size: 1.5,
      transparent: true,
      opacity: 0.045,
      blending: AdditiveBlending,
      sizeAttenuation: true,
      depthTest: true,
      depthWrite: false
    })
  );

  layerGroup.add(points);
  layerGroup.add(haze);
  layerGroup.userData.mode = 'standard';
  return layerGroup;
}

function createEnhancedMilkyWayLayer(radius) {
  const layerGroup = new Group();
  const milkyCount = 76_000;
  const milkyPositions = new Float32Array(milkyCount * 3);
  const milkyColors = new Float32Array(milkyCount * 3);
  const componentThresholdA = 0.57;
  const componentThresholdB = 0.87;

  for (let i = 0; i < milkyCount; i++) {
    const selector = Math.random();

    let l;
    let b;
    let bulgeMix = 0;

    if (selector > componentThresholdB) {
      l = wrapRadians(sampleGaussian(0.24));
      b = sampleGaussian(0.17);
      bulgeMix = 1;
    } else {
      const latSigma = selector < componentThresholdA ? 0.055 : 0.125;
      let accepted = false;
      l = Math.random() * TWO_PI;
      for (let attempts = 0; attempts < 8; attempts++) {
        l = Math.random() * TWO_PI;
        if (Math.random() <= galacticLongitudeWeight(l)) {
          accepted = true;
          break;
        }
      }
      if (!accepted) {
        l = Math.random() * TWO_PI;
      }

      b = sampleGaussian(latSigma);
    }

    b += 0.021 * Math.sin(2.0 * l + 0.45);
    b += 0.009 * Math.sin(5.0 * l - 1.05);
    b = Math.max(-0.62, Math.min(0.62, b));

    const lonWeight = galacticLongitudeWeight(l);
    const bulgeWeight = gaussianByDistance(circularDistanceRadians(l, 0), 0.36);

    const laneCenter = 0.012 * Math.sin(1.35 * l + 0.6);
    const laneWidth = 0.026 + 0.017 * bulgeWeight;
    const laneAbsorption = gaussianByDistance(Math.abs(b - laneCenter), laneWidth);
    const dustFactor = 1 - 0.62 * laneAbsorption * (0.32 + 0.68 * lonWeight);

    const r = radius * (0.88 + Math.random() * 0.12);
    const [x, y, z] = galacticToCartesian(l, b, r);
    milkyPositions[i * 3] = x;
    milkyPositions[i * 3 + 1] = y;
    milkyPositions[i * 3 + 2] = z;

    const latFalloff = Math.exp(-Math.abs(b) / 0.22);
    const intensity = (0.14 + 0.52 * Math.random()) * (0.3 + 0.54 * lonWeight) * latFalloff * dustFactor;

    const warmMix = Math.min(1, 0.15 + 0.78 * bulgeWeight + 0.4 * bulgeMix);
    const coolMix = 1 - warmMix;
    const rCol = intensity * (0.86 + 0.3 * warmMix);
    const gCol = intensity * (0.88 + 0.16 * warmMix);
    const bCol = intensity * (0.95 - 0.28 * warmMix + 0.12 * coolMix);

    milkyColors[i * 3] = rCol;
    milkyColors[i * 3 + 1] = gCol;
    milkyColors[i * 3 + 2] = bCol;
  }
  const milkyGeometry = new BufferGeometry();
  milkyGeometry.setAttribute('position', new Float32BufferAttribute(milkyPositions, 3));
  milkyGeometry.setAttribute('color', new Float32BufferAttribute(milkyColors, 3));
  const milkyPoints = new Points(
    milkyGeometry,
    new PointsMaterial({
      size: 1.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.48,
      blending: AdditiveBlending,
      sizeAttenuation: false,
      depthTest: true,
      depthWrite: false
    })
  );
  layerGroup.add(milkyPoints);

  const milkyHaze = new Points(
    milkyGeometry,
    new PointsMaterial({
      color: new Color('#cfd8e6'),
      size: 2.45,
      transparent: true,
      opacity: 0.045,
      blending: AdditiveBlending,
      sizeAttenuation: false,
      depthTest: true,
      depthWrite: false
    })
  );
  layerGroup.add(milkyHaze);

  layerGroup.userData.mode = 'enhanced';
  return layerGroup;
}

function createCatalogStarField(starsCatalog, radius = 18_000) {
  const baseLayers = [
    { maxMag: 2.0, size: 2.2, opacity: 0.96 },
    { maxMag: 4.2, size: 1.45, opacity: 0.82 },
    { maxMag: Infinity, size: 0.95, opacity: 0.56 }
  ];

  const groupedPositions = baseLayers.map(() => []);
  const groupedColors = baseLayers.map(() => []);

  for (const entry of starsCatalog) {
    const [raDeg, decDeg, mag, bv] = entry;
    if (!Number.isFinite(raDeg) || !Number.isFinite(decDeg) || !Number.isFinite(mag)) continue;

    const layerIndex = baseLayers.findIndex((layer) => mag <= layer.maxMag);
    if (layerIndex < 0) continue;

    const r = radius * (0.92 + Math.random() * 0.08);
    const [x, y, z] = equatorialDegToCartesian(raDeg, decDeg, r);
    const [cr, cg, cb] = bvToRgbUnit(bv);
    groupedPositions[layerIndex].push(x, y, z);
    groupedColors[layerIndex].push(cr, cg, cb);
  }

  const group = new Group();
  const baseLayerPoints = [];
  for (let i = 0; i < baseLayers.length; i++) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(groupedPositions[i], 3));
    geometry.setAttribute('color', new Float32BufferAttribute(groupedColors[i], 3));
    const points = new Points(
      geometry,
      new PointsMaterial({
        size: baseLayers[i].size,
        vertexColors: true,
        transparent: true,
        opacity: baseLayers[i].opacity,
        blending: AdditiveBlending,
        sizeAttenuation: false,
        depthWrite: false
      })
    );
    baseLayerPoints.push(points);
    group.add(points);
  }

  const standardMilky = createStandardMilkyWayLayer(radius);
  const enhancedMilky = createEnhancedMilkyWayLayer(radius);
  enhancedMilky.visible = false;
  group.add(standardMilky);
  group.add(enhancedMilky);

  group.userData.starCount = starsCatalog.length;
  group.userData.baseLayers = baseLayerPoints;
  group.userData.standardMilky = standardMilky;
  group.userData.enhancedMilky = enhancedMilky;
  return group;
}

function createSurveyMilkyWaySphere(surveyTexture, radius = 19_000) {
  // 2MASS all-sky maps are distributed in sky-view orientation where galactic longitude
  // increases to the left; mirror U so the map follows the right-handed galactic basis.
  surveyTexture.wrapS = RepeatWrapping;
  surveyTexture.repeat.x = -1;
  surveyTexture.offset.x = 1;
  surveyTexture.needsUpdate = true;

  const geometry = new SphereGeometry(radius, 96, 64);
  const material = new MeshBasicMaterial({
    map: surveyTexture,
    color: new Color('#ffffff'),
    side: BackSide,
    transparent: true,
    opacity: 0.82
  });

  const sphere = new Mesh(geometry, material);
  const localXAxisWorld = new Vector3(...galacticToCartesian(0, 0, 1));
  const localYAxisWorld = new Vector3(...galacticToCartesian(0, Math.PI * 0.5, 1));
  const localZAxisWorld = new Vector3(...galacticToCartesian(-Math.PI * 0.5, 0, 1));
  const surveyToWorldMatrix = new Matrix4().makeBasis(
    localXAxisWorld,
    localYAxisWorld,
    localZAxisWorld
  );
  sphere.setRotationFromMatrix(surveyToWorldMatrix);
  sphere.visible = false;
  sphere.renderOrder = -50;
  return sphere;
}

export function createMilkyWayRenderer({
  scene,
  starsCatalog,
  surveyTexture,
  starsRadius = 18_000,
  surveyRadius = 19_000,
  devMode = Boolean(import.meta.env?.DEV)
}) {
  if (devMode) {
    validateGalacticFrame();
  }

  const backgroundStars = createCatalogStarField(starsCatalog, starsRadius);
  scene.add(backgroundStars);

  const surveyMilkySphere = createSurveyMilkyWaySphere(surveyTexture, surveyRadius);
  scene.add(surveyMilkySphere);

  function applyMilkyWayAppearance({ useSurvey = false, useEnhanced = false, onModeChange = null } = {}) {
    const mode = useSurvey ? 'survey' : useEnhanced ? 'enhanced' : 'standard';

    const baseLayers = backgroundStars.userData.baseLayers ?? [];
    const standardMilky = backgroundStars.userData.standardMilky;
    const enhancedMilky = backgroundStars.userData.enhancedMilky;

    for (const layer of baseLayers) {
      layer.visible = mode !== 'survey';
    }
    if (standardMilky) {
      standardMilky.visible = mode === 'standard';
    }
    if (enhancedMilky) {
      enhancedMilky.visible = mode === 'enhanced';
    }
    surveyMilkySphere.visible = mode === 'survey';

    if (typeof onModeChange === 'function') {
      onModeChange(mode);
    }
  }

  return {
    backgroundStars,
    surveyMilkySphere,
    applyMilkyWayAppearance
  };
}
