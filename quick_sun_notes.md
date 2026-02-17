
// ── Sun Surface + Corona Dynamics ────────────────────────────────────────────
1614

1615
const SUN_SURFACE_VERTEX_SHADER = `
1616
varying vec2 vUv;
1617
varying vec3 vWorldPosition;
1618
varying vec3 vWorldNormal;
1619

1620
void main() {
1621
  vUv = uv;
1622
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
1623
  vWorldPosition = worldPosition.xyz;
1624
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
1625
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
1626
}
1627
`;
1628

1629
const SUN_SURFACE_FRAGMENT_SHADER = `
1630
uniform float time;
1631
uniform float activity;
1632
uniform sampler2D baseMap;
1633

1634
varying vec2 vUv;
1635
varying vec3 vWorldPosition;
1636
varying vec3 vWorldNormal;
1637

1638
float hash13(vec3 p) {
1639
  p = fract(p * 0.1031);
1640
  p += dot(p, p.yzx + 33.33);
1641
  return fract((p.x + p.y) * p.z);
1642
}
1643

1644
float noise3(vec3 p) {
1645
  vec3 i = floor(p);
1646
  vec3 f = fract(p);
1647
  vec3 u = f * f * (3.0 - 2.0 * f);
1648
  return mix(
1649
    mix(mix(hash13(i + vec3(0.0, 0.0, 0.0)), hash13(i + vec3(1.0, 0.0, 0.0)), u.x),
1650
        mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
1651
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x),
1652
        mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x), u.y),
1653
    u.z
1654
  );
1655
}
1656

1657
float fbm(vec3 p) {
1658
  float sum = 0.0;
1659
  float amp = 0.55;
1660
  float norm = 0.0;
1661
  for (int i = 0; i < 5; i++) {
1662
    sum += amp * noise3(p);
1663
    norm += amp;
1664
    p *= 2.02;
1665
    amp *= 0.5;
1666
  }
1667
  return sum / max(1e-6, norm);
1668
}
1669

1670
void main() {
1671
  vec3 normalDir = normalize(vWorldNormal);
1672
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
1673
  float limbWeight = pow(max(dot(normalDir, viewDir), 0.0), 0.42);
1674

1675
  float flowA = fbm(normalDir * 6.0 + vec3(time * 0.18, -time * 0.11, time * 0.07));
1676
  float flowB = fbm(normalDir * 13.0 + vec3(-time * 0.42, time * 0.24, -time * 0.16));
1677
  float granulation = fbm(normalDir * 56.0 + vec3(time * 1.65, -time * 1.25, time * 0.92));
1678
  float spotField = fbm(normalDir * 19.0 + vec3(time * 0.07, time * 0.03, -time * 0.05));
1679
  float spotMask = smoothstep(0.72, 0.92, spotField) * (0.35 + activity * 0.45);
1680

1681
  vec2 uvShift = vec2((flowA - 0.5) * 0.028, (flowB - 0.5) * 0.022);
1682
  vec3 baseTex = texture2D(baseMap, fract(vUv + uvShift + vec2(time * 0.008, 0.0))).rgb;
1683

1684
  float heatPattern = mix(flowA, flowB, 0.5);
1685
  float brightness = 0.62 + heatPattern * 0.35 + granulation * 0.22 - spotMask * 0.44;
1686
  brightness *= mix(0.78, 1.18, limbWeight);
1622

1688
  vec3 cool = vec3(1.0, 0.42, 0.06);
1689
  vec3 hot = vec3(1.0, 0.78, 0.22);
1690
  vec3 plasma = mix(cool, hot, clamp(brightness, 0.0, 1.0));
1691
  vec3 color = mix(plasma, baseTex * 1.2, 0.42);
1692
  color += vec3(0.95, 0.36, 0.08) * granulation * 0.18;
1693

1694
  gl_FragColor = vec4(color, 1.0);
1695
}
1696
`;
1697

1698
const SUN_CORONA_VERTEX_SHADER = `
1699
varying vec3 vWorldPosition;
1700
varying vec3 vWorldNormal;
1701

1702
void main() {
1703
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
1704
  vWorldPosition = worldPosition.xyz;
1705
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
1706
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
1707
}
1708
`;
1709

1710
const SUN_CORONA_FRAGMENT_SHADER = `
1711
uniform float time;
1712
uniform float activity;
1713
uniform vec3 coronaColor;
1714

1715
varying vec3 vWorldPosition;
1716
varying vec3 vWorldNormal;
1717

1718
float hash13(vec3 p) {
1719
  p = fract(p * 0.1031);
1720
  p += dot(p, p.yzx + 33.33);
1721
  return fract((p.x + p.y) * p.z);
1722
}
1723

1724
float noise3(vec3 p) {
1725
  vec3 i = floor(p);
1726
  vec3 f = fract(p);
1727
  vec3 u = f * f * (3.0 - 2.0 * f);
1728
  return mix(
1729
    mix(mix(hash13(i + vec3(0.0, 0.0, 0.0)), hash13(i + vec3(1.0, 0.0, 0.0)), u.x),
1730
        mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
1731
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x),
1732
        mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x), u.y),
1733
    u.z
1734
  );
1735
}
1736

1737
float fbm(vec3 p) {
1738
  float sum = 0.0;
1739
  float amp = 0.6;
1740
  float norm = 0.0;
1741
  for (int i = 0; i < 4; i++) {
1742
    sum += amp * noise3(p);
1743
    norm += amp;
1744
    p *= 2.1;
1745
    amp *= 0.52;
1746
  }
1747
  return sum / max(1e-6, norm);
1748
}
1749

1750
void main() {
1751
  vec3 normalDir = normalize(vWorldNormal);
1752
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
1753
  float ndotv = clamp(abs(dot(normalDir, viewDir)), 0.0, 1.0);
1754
  float limb = clamp(1.0 - ndotv, 0.0, 1.0);
1755
  float offLimb = smoothstep(0.78, 0.998, limb);
1756
  float rim = pow(offLimb, 1.8);
1757
  float turbulence = fbm(normalDir * 9.0 + vec3(time * 0.38, -time * 0.26, time * 0.19));
1758
  float burst = smoothstep(0.72, 0.95, turbulence);
1759
  float pulse = 0.78 + 0.22 * sin(time * 1.4 + turbulence * 6.8);
1760
  float alpha = (offLimb * 0.06 + rim * 0.09) * (0.26 + burst * (0.42 + activity * 0.32)) * pulse;
1761
  vec3 hotWhite = vec3(1.0, 0.96, 0.86);
1762
  vec3 color = mix(coronaColor * 0.8, hotWhite, 0.16 + burst * 0.36 + activity * 0.12);
1763
  gl_FragColor = vec4(color, alpha);
1764
}
1765
`;
1766

1767
function createSunGlow(sunDisplayRadius) {
1768
  const canvas = document.createElement('canvas');
1769
  canvas.width = 256;
1770
  canvas.height = 256;
1771
  const ctx = canvas.getContext('2d');
1772

1773
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
1774
  gradient.addColorStop(0, 'rgba(255, 246, 176, 0.4)');
1775
  gradient.addColorStop(0.12, 'rgba(255, 214, 102, 0.22)');
1776
  gradient.addColorStop(0.34, 'rgba(255, 170, 66, 0.09)');
1777
  gradient.addColorStop(0.68, 'rgba(255, 124, 42, 0.03)');
1778
  gradient.addColorStop(1, 'rgba(255, 82, 20, 0.0)');
1779

1780
  ctx.fillStyle = gradient;
1781
  ctx.fillRect(0, 0, 256, 256);
1782

1783
  const texture = new CanvasTexture(canvas);
1784
  const material = new SpriteMaterial({
1785
    map: texture,
1786
    transparent: true,
1787
    opacity: 0.42,
1788
    blending: AdditiveBlending,
1789
    depthWrite: false,
1790
    depthTest: false
1791
  });
1792

1793
  const glow = new Sprite(material);
1794
  glow.scale.setScalar(sunDisplayRadius * 9.1);
1795
  glow.userData.baseScaleMultiplier = 9.1;
1796
  glow.userData.baseOpacity = 0.42;
1797
  return glow;
1798
}
1799

1800
function createSunCoronaShell(geometry) {
1801
  const material = new ShaderMaterial({
1802
    vertexShader: SUN_CORONA_VERTEX_SHADER,
1803
    fragmentShader: SUN_CORONA_FRAGMENT_SHADER,
1804
    uniforms: {
1805
      time: { value: 0 },
1806
      activity: { value: 0.5 },
1807
      coronaColor: { value: new Color('#ffb877') }
1808
    },
1809
    transparent: true,
1810
    blending: AdditiveBlending,
1811
    depthWrite: false,
1812
    side: BackSide
1813
  });
1814
  const mesh = new Mesh(geometry, material);
1815
  mesh.userData.bodyId = 'sun-corona';
1816
  mesh.userData.surfaceScale = 1.032;
1817
  return mesh;
1818
}
1819

1820
function createSunEruptionLayer(sunDisplayRadius) {
1821
  const burstCount = 360;
1822
  const positions = new Float32Array(burstCount * 3);
1823
  const directions = new Float32Array(burstCount * 3);
1824
  const tangents = new Float32Array(burstCount * 3);
1825
  const speeds = new Float32Array(burstCount);
1826
  const phases = new Float32Array(burstCount);
1827
  const amplitudes = new Float32Array(burstCount);
1828

1829
  for (let i = 0; i < burstCount; i += 1) {
1830
    const u = Math.random() * 2 - 1;
1831
    const theta = Math.random() * TWO_PI;
1832
    const radial = Math.sqrt(Math.max(1e-6, 1 - u * u));
1833
    const dx = radial * Math.cos(theta);
1834
    const dy = radial * Math.sin(theta);
1835
    const dz = u;
1836

1837
    // Choose a stable reference axis for tangent generation.
1838
    const axisX = Math.abs(dz) > 0.78 ? 1 : 0;
1839
    const axisY = 0;
1840
    const axisZ = Math.abs(dz) > 0.78 ? 0 : 1;
1841

1842
    let tx = dy * axisZ - dz * axisY;
1843
    let ty = dz * axisX - dx * axisZ;
1844
    let tz = dx * axisY - dy * axisX;
1845
    const tangentLen = Math.hypot(tx, ty, tz);
1846
    if (tangentLen > 1e-9) {
1847
      tx /= tangentLen;
1848
      ty /= tangentLen;
1849
      tz /= tangentLen;
1850
    } else {
1851
      tx = 1;
1852
      ty = 0;
1853
      tz = 0;
1854
    }
1855

1856
    const base = i * 3;
1857
    directions[base] = dx;
1858
    directions[base + 1] = dy;
1859
    directions[base + 2] = dz;
1860
    tangents[base] = tx;
1861
    tangents[base + 1] = ty;
1862
    tangents[base + 2] = tz;
1863
    speeds[i] = 0.32 + Math.random() * 1.7;
1864
    phases[i] = Math.random() * TWO_PI;
1865
    amplitudes[i] = 0.04 + Math.random() * 0.22;
1866
    positions[base] = dx * sunDisplayRadius * 1.03;
1867
    positions[base + 1] = dy * sunDisplayRadius * 1.03;
1868
    positions[base + 2] = dz * sunDisplayRadius * 1.03;
1869
  }
1870

1871
  const geometry = new BufferGeometry();
1872
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
1873

1874
  const material = new PointsMaterial({
1875
    color: new Color('#ffbf74'),
1876
    size: sunDisplayRadius * 0.65,
1877
    transparent: true,
1878
    opacity: 0.34,
1879
    blending: AdditiveBlending,
1880
    depthWrite: false,
1881
    sizeAttenuation: true
1882
  });
1883

1884
  const points = new Points(geometry, material);
1885
  points.userData.bodyId = 'sun-eruptions';
1886
  points.userData.sunBursts = {
1887
    burstCount,
1888
    positions,
1889
    directions,
1890
    tangents,
1891
    speeds,
1892
    phases,
1893
    amplitudes,
1894
    baseRadius: sunDisplayRadius
1895
  };
1896
  points.renderOrder = 6;
1897
  return points;
1898
}
1899

1623
function setSunGlowScale(baseRadiusAu, pulse = 1) {
1901
  if (!sunGlowSprite) return;
1902
  const baseScaleMultiplier = sunGlowSprite.userData.baseScaleMultiplier ?? 9.1;
1903
  sunGlowSprite.scale.setScalar(baseRadiusAu * baseScaleMultiplier * pulse);
1624
  setSunGlowScaleImpl(sunGlowSprite, baseRadiusAu, pulse);
1625
}
1626

1627
function setSunEruptionBaseRadius(baseRadiusAu) {
1907
  if (!sunEruptionLayer) return;
1908
  const bursts = sunEruptionLayer.userData?.sunBursts;
1909
  if (!bursts) return;
1910
  const geometry = sunEruptionLayer.geometry;
1911
  if (!geometry || typeof geometry.getAttribute !== 'function') return;
1912
  const positionAttr = geometry.getAttribute('position');
1913
  if (!positionAttr) return;
1914

1915
  const radius = Math.max(1e-9, baseRadiusAu);
1916
  bursts.baseRadius = radius;
1917
  for (let i = 0; i < bursts.burstCount; i += 1) {
1918
    const base = i * 3;
1919
    bursts.positions[base] = bursts.directions[base] * radius * 1.03;
1920
    bursts.positions[base + 1] = bursts.directions[base + 1] * radius * 1.03;
1921
    bursts.positions[base + 2] = bursts.directions[base + 2] * radius * 1.03;
1922
  }
1923
  positionAttr.needsUpdate = true;
1924
  if (sunEruptionLayer.material?.isPointsMaterial) {
1925
    sunEruptionLayer.material.size = Math.max(0.0000035, radius * 0.65);
1926
  }
1628
  setSunEruptionBaseRadiusImpl(sunEruptionLayer, baseRadiusAu);
1629
}
1630

1929
function clearSunCoronalLoops() {
1930
  if (!sunCoronalLoopGroup) return;
1931
  for (const loop of sunCoronalLoopGroup.children) {
1932
    if (loop.geometry && typeof loop.geometry.dispose === 'function') {
1933
      loop.geometry.dispose();
1934
    }
1935
    disposeThreeMaterial(loop.material);
1936
  }
1937
  sunCoronalLoopGroup.clear();

  # more code #
  function clampUnit(value) {
  return Math.max(0, Math.min(1, value));
}

function lerpNumber(a, b, t) {
  return a + (b - a) * t;
}

function normalizeSolarFeatureSetFromState(physicsState, featureLimit = 220) {
  const sourceFeatures = physicsState?.corona?.features;
  if (!Array.isArray(sourceFeatures) || sourceFeatures.length === 0) return null;

  const safeLimit = Math.max(8, Math.min(2_048, Math.floor(Number(featureLimit) || 220)));
  const features = [];
  const featureById = new Map();
  for (let i = 0; i < sourceFeatures.length && features.length < safeLimit; i += 1) {
    const feature = sourceFeatures[i];
    const arcRaw = Array.isArray(feature?.arc) ? feature.arc : null;
    if (!arcRaw || arcRaw.length < 2) continue;

    const arc = [];
    for (const sample of arcRaw) {
      if (!Array.isArray(sample) || sample.length !== 3) continue;
      const x = Number(sample[0]);
      const y = Number(sample[1]);
      const z = Number(sample[2]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      arc.push([x, y, z]);
    }
    if (arc.length < 2) continue;

    const id = `${feature?.id ?? `feature-${i}`}`;
    if (featureById.has(id)) continue;
    const kind = `${feature?.kind ?? 'loop'}`.toLowerCase();
    const brightness = Math.max(0.05, Math.min(1, Number(feature?.brightness) || 0.35));
    const speedKms = Number(feature?.expansion_speed_kms);
    const speedFactor = Number.isFinite(speedKms) ? Math.max(0.06, Math.min(0.9, speedKms / 2_100)) : 0.2;
    const peakExtentRaw = Number(feature?.peak_extent_solar_radii);
    const peakExtent = Number.isFinite(peakExtentRaw) ? Math.max(1, peakExtentRaw) : 1.0;

    const normalized = {
      id,
      kind,
      brightness,
      speedFactor,
      peakExtent,
      arc
    };
    features.push(normalized);
    featureById.set(id, normalized);
  }

  if (features.length === 0) return null;
  const activityRaw = Number(physicsState?.activity_index);
  const epochRaw = Number(physicsState?.epoch_jd);
  return {
    features,
    featureById,
    activityIndex: Number.isFinite(activityRaw) ? clampUnit(activityRaw) : null,
    epochJd: Number.isFinite(epochRaw) ? epochRaw : simState.julianDate
  };
}

function sampleCoronalArcPoint(arc, phase) {
  if (!Array.isArray(arc) || arc.length === 0) return null;
  if (arc.length === 1) return arc[0];
  const t = Math.max(0, Math.min(0.999999, phase));
  const scaled = t * (arc.length - 1);
  const idx = Math.floor(scaled);
  const next = Math.min(arc.length - 1, idx + 1);
  const frac = scaled - idx;
  const p0 = arc[idx];
  const p1 = arc[next];
  if (!Array.isArray(p0) || !Array.isArray(p1) || p0.length !== 3 || p1.length !== 3) return null;
  const x = Number(p0[0]) + (Number(p1[0]) - Number(p0[0])) * frac;
  const y = Number(p0[1]) + (Number(p1[1]) - Number(p0[1])) * frac;
  const z = Number(p0[2]) + (Number(p1[2]) - Number(p0[2])) * frac;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return [x, y, z];
}

function sampleSolarFeatureEntryPoint(entry, phase, blendAlpha) {
  const fromWeight = Number(entry?.fromWeight);
  const toWeight = Number(entry?.toWeight);
  const hasFrom = Number.isFinite(fromWeight) ? fromWeight > 0.5 : true;
  const hasTo = Number.isFinite(toWeight) ? toWeight > 0.5 : true;
  const fromPoint = hasFrom ? sampleCoronalArcPoint(entry?.fromFeature?.arc, phase) : null;
  const toPoint = hasTo ? sampleCoronalArcPoint(entry?.toFeature?.arc, phase) : null;

  if (fromPoint && toPoint && hasFrom && hasTo) {
    return [
      lerpNumber(fromPoint[0], toPoint[0], blendAlpha),
      lerpNumber(fromPoint[1], toPoint[1], blendAlpha),
      lerpNumber(fromPoint[2], toPoint[2], blendAlpha)
    ];
  }
  return toPoint ?? fromPoint;
}

function solarFeatureEntryBrightness(entry, blendAlpha) {
  const fromBrightnessRaw = Number(entry?.fromFeature?.brightness);
  const toBrightnessRaw = Number(entry?.toFeature?.brightness);
  const fromBrightness = Number.isFinite(fromBrightnessRaw) ? Math.max(0, fromBrightnessRaw) : 0;
  const toBrightness = Number.isFinite(toBrightnessRaw) ? Math.max(0, toBrightnessRaw) : 0;
  const fromWeight = Number(entry?.fromWeight);
  const toWeight = Number(entry?.toWeight);
  const hasFrom = Number.isFinite(fromWeight) ? fromWeight > 0.5 : true;
  const hasTo = Number.isFinite(toWeight) ? toWeight > 0.5 : true;

  if (hasFrom && hasTo) {
    return lerpNumber(fromBrightness, toBrightness, blendAlpha);
  }
  if (hasTo) return toBrightness * blendAlpha;
  if (hasFrom) return fromBrightness * (1 - blendAlpha);
  return 0;
}

function buildSolarFeatureBlendView(nowMs = Date.now(), featureLimit = 220) {
  if (!solarPhysicsFeatureSetCurrent && !solarPhysicsFeatureSetTarget) {
    return { blendAlpha: 1, activityIndex: null, entries: [] };
  }

  if (!solarPhysicsFeatureSetCurrent && solarPhysicsFeatureSetTarget) {
    solarPhysicsFeatureSetCurrent = solarPhysicsFeatureSetTarget;
    solarPhysicsFeatureSetTarget = null;
  }
  if (!solarPhysicsFeatureSetCurrent) {
    return { blendAlpha: 1, activityIndex: null, entries: [] };
  }
  if (!solarPhysicsFeatureSetTarget) {
    const entries = solarPhysicsFeatureSetCurrent.features
      .slice(0, Math.max(8, Math.min(2_048, Math.floor(Number(featureLimit) || 220))))
      .map((feature) => ({
        id: feature.id,
        kind: feature.kind,
        fromFeature: feature,
        toFeature: feature,
        fromWeight: 1,
        toWeight: 1
      }));
    return {
      blendAlpha: 1,
      activityIndex: solarPhysicsFeatureSetCurrent.activityIndex,
      entries
    };
  }

  const safeLimit = Math.max(8, Math.min(2_048, Math.floor(Number(featureLimit) || 220)));
  const durationMs = Math.max(240, Number(solarPhysicsBlendDurationMs) || 900);
  const linearAlpha = clampUnit((nowMs - solarPhysicsBlendStartMs) / durationMs);
  const blendAlpha = linearAlpha * linearAlpha * (3 - 2 * linearAlpha);
  const currentSet = solarPhysicsFeatureSetCurrent;
  const targetSet = solarPhysicsFeatureSetTarget;
  const entries = [];
  const seen = new Set();

  for (const targetFeature of targetSet.features) {
    const fromFeature = currentSet.featureById.get(targetFeature.id) ?? targetFeature;
    entries.push({
      id: targetFeature.id,
      kind: targetFeature.kind,
      fromFeature,
      toFeature: targetFeature,
      fromWeight: currentSet.featureById.has(targetFeature.id) ? 1 : 0,
      toWeight: 1
    });
    seen.add(targetFeature.id);
    if (entries.length >= safeLimit) break;
  }

  if (entries.length < safeLimit) {
    for (const currentFeature of currentSet.features) {
      if (seen.has(currentFeature.id)) continue;
      entries.push({
        id: currentFeature.id,
        kind: currentFeature.kind,
        fromFeature: currentFeature,
        toFeature: currentFeature,
        fromWeight: 1,
        toWeight: 0
      });
      if (entries.length >= safeLimit) break;
    }
  }

  let activityIndex = currentSet.activityIndex;
  const currentActivity = Number(currentSet.activityIndex);
  const targetActivity = Number(targetSet.activityIndex);
  if (Number.isFinite(currentActivity) && Number.isFinite(targetActivity)) {
    activityIndex = lerpNumber(currentActivity, targetActivity, blendAlpha);
  } else if (Number.isFinite(targetActivity)) {
    activityIndex = targetActivity;
  }

  if (linearAlpha >= 1) {
    solarPhysicsFeatureSetCurrent = targetSet;
    solarPhysicsFeatureSetTarget = null;
    solarPhysicsBlendStartMs = nowMs;
    return {
      blendAlpha: 1,
      activityIndex: solarPhysicsFeatureSetCurrent.activityIndex,
      entries: solarPhysicsFeatureSetCurrent.features
        .slice(0, safeLimit)
        .map((feature) => ({
          id: feature.id,
          kind: feature.kind,
          fromFeature: feature,
          toFeature: feature,
          fromWeight: 1,
          toWeight: 1
        }))
    };
  }

  return {
    blendAlpha,
    activityIndex,
    entries
  };

  # more code from main.js that was removed #
  function materializeSolarFeatureSetFromBlendView(blendView) {
  if (!blendView || !Array.isArray(blendView.entries) || blendView.entries.length === 0) return null;
  const blendAlpha = clampUnit(Number(blendView.blendAlpha) || 0);
  const features = [];
  const featureById = new Map();

  for (const entry of blendView.entries) {
    const fromCount = entry?.fromFeature?.arc?.length ?? 0;
    const toCount = entry?.toFeature?.arc?.length ?? 0;
    const pointCount = Math.max(2, fromCount, toCount);
    const arc = [];

    for (let i = 0; i < pointCount; i += 1) {
      const phase = pointCount <= 1 ? 0 : i / (pointCount - 1);
      const sampled = sampleSolarFeatureEntryPoint(entry, phase, blendAlpha);
      if (!sampled) continue;
      arc.push(sampled);
    }
    if (arc.length < 2) continue;

    const brightness = solarFeatureEntryBrightness(entry, blendAlpha);
    if (brightness <= 0.002) continue;
    const speedFrom = Number(entry?.fromFeature?.speedFactor);
    const speedTo = Number(entry?.toFeature?.speedFactor);
    const speedFactor = Number.isFinite(speedFrom) && Number.isFinite(speedTo)
      ? lerpNumber(speedFrom, speedTo, blendAlpha)
      : (Number.isFinite(speedTo) ? speedTo : (Number.isFinite(speedFrom) ? speedFrom : 0.2));
    const peakFrom = Number(entry?.fromFeature?.peakExtent);
    const peakTo = Number(entry?.toFeature?.peakExtent);
    const peakExtent = Number.isFinite(peakFrom) && Number.isFinite(peakTo)
      ? lerpNumber(peakFrom, peakTo, blendAlpha)
      : (Number.isFinite(peakTo) ? peakTo : (Number.isFinite(peakFrom) ? peakFrom : 1.0));

    const normalized = {
      id: `${entry?.id ?? `feature-${features.length}`}`,
      kind: `${entry?.kind ?? 'loop'}`.toLowerCase(),
      brightness,
      speedFactor,
      peakExtent,
      arc
    };
    if (featureById.has(normalized.id)) continue;
    features.push(normalized);
    featureById.set(normalized.id, normalized);
  }

  if (features.length === 0) return null;
  return {
    features,
    featureById,
    activityIndex: Number.isFinite(Number(blendView.activityIndex))
      ? clampUnit(Number(blendView.activityIndex))
      : null,
    epochJd: simState.julianDate
  };

  function ensureSunCoronalLoop(index) {
  if (!sunCoronalLoopGroup) return null;
  if (sunCoronalLoopGroup.children[index]) return sunCoronalLoopGroup.children[index];

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3));
  const material = new LineBasicMaterial({
    color: new Color('#ffe8c2'),
    transparent: true,
    opacity: 0.15,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const loop = new Line(geometry, material);
  loop.renderOrder = 5;
  loop.frustumCulled = false;
  sunCoronalLoopGroup.add(loop);
  return loop;
}

function updateSunCoronalLoopsFromBlendView(blendView, sunRadiusAu) {
  if (!sunCoronalLoopGroup) return;
  const blendAlpha = clampUnit(Number(blendView?.blendAlpha) || 1);
  const sourceEntries = Array.isArray(blendView?.entries) ? blendView.entries : [];
  const filteredEntries = [];
  for (const entry of sourceEntries) {
    const kind = `${entry?.kind ?? 'loop'}`.toLowerCase();
    const peakFrom = Number(entry?.fromFeature?.peakExtent);
    const peakTo = Number(entry?.toFeature?.peakExtent);
    const peakExtent = Number.isFinite(peakFrom) && Number.isFinite(peakTo)
      ? lerpNumber(peakFrom, peakTo, blendAlpha)
      : (Number.isFinite(peakTo) ? peakTo : (Number.isFinite(peakFrom) ? peakFrom : 1.0));
    if (kind === 'cme' && peakExtent > 3.6) continue;
    filteredEntries.push(entry);
    if (filteredEntries.length >= 120) break;
  }

  for (let i = 0; i < filteredEntries.length; i += 1) {
    const entry = filteredEntries[i];
    const loop = ensureSunCoronalLoop(i);
    if (!loop) continue;

    const fromCount = entry?.fromFeature?.arc?.length ?? 0;
    const toCount = entry?.toFeature?.arc?.length ?? 0;
    const pointCount = Math.max(2, fromCount, toCount);
    const geometry = loop.geometry;
    let positionAttr = geometry.getAttribute('position');
    if (!positionAttr || positionAttr.count !== pointCount) {
      positionAttr = new Float32BufferAttribute(new Float32Array(pointCount * 3), 3);
      geometry.setAttribute('position', positionAttr);
    }

    const array = positionAttr.array;
    for (let p = 0; p < pointCount; p += 1) {
      const phase = pointCount <= 1 ? 0 : p / (pointCount - 1);
      const sampled = sampleSolarFeatureEntryPoint(entry, phase, blendAlpha);
      const base = p * 3;
      if (!sampled) {
        array[base] = 0;
        array[base + 1] = 0;
        array[base + 2] = 0;
        continue;
      }
      array[base] = sampled[0] * sunRadiusAu;
      array[base + 1] = sampled[1] * sunRadiusAu;
      array[base + 2] = sampled[2] * sunRadiusAu;
    }
    positionAttr.needsUpdate = true;
    geometry.setDrawRange(0, pointCount);

    const brightness = solarFeatureEntryBrightness(entry, blendAlpha);
    const kind = `${entry?.kind ?? 'loop'}`.toLowerCase();
    const color = kind === 'cme'
      ? '#ffb67f'
      : kind === 'plume'
        ? '#ffd7a7'
        : '#fff1d2';
    if (loop.material?.isLineBasicMaterial) {
      loop.material.color.set(color);
      const baseOpacity = kind === 'cme' ? 0.045 : 0.06;
      const gain = kind === 'cme' ? 0.18 : 0.31;
      loop.material.opacity = Math.max(0.025, Math.min(0.44, baseOpacity + brightness * gain));
    }
    loop.visible = brightness > 0.005;
  }

  for (let i = filteredEntries.length; i < sunCoronalLoopGroup.children.length; i += 1) {
    sunCoronalLoopGroup.children[i].visible = false;
  }

  varying vec3 vWorldNormal;
    ? clampUnit(blendedActivityRaw)
    : (Number.isFinite(backendActivityRaw) ? clampUnit(backendActivityRaw) : fallbackActivity);

  if (sunSurfaceMaterial?.uniforms) {
    sunSurfaceMaterial.uniforms.time.value = timeSec * 0.4;
    sunSurfaceMaterial.uniforms.activity.value = activity;
  }

  if (sunCoronaMaterial?.uniforms) {
    sunCoronaMaterial.uniforms.time.value = timeSec * 0.54;
    sunCoronaMaterial.uniforms.activity.value = activity;
    const coronaColor = sunCoronaMaterial.uniforms.coronaColor?.value;
    if (coronaColor?.isColor) {
      coronaColor.setRGB(1.0, 0.66 + activity * 0.14, 0.34 + activity * 0.1);
    }
  }

  # last bit of removed sun visuals code #
   const bursts = sunEruptionLayer?.userData?.sunBursts;
  if (!bursts) return;
  const geometry = sunEruptionLayer.geometry;
  if (!geometry || typeof geometry.getAttribute !== 'function') return;
  const positionAttr = geometry.getAttribute('position');
  if (!positionAttr) return;

  const blendedFeatures = Array.isArray(solarBlendView?.entries) ? solarBlendView.entries : [];
  if (blendedFeatures.length > 0) {
    const blendAlpha = clampUnit(Number(solarBlendView?.blendAlpha) || 1);
    bursts.baseRadius = sunRadiusAu;
    for (let i = 0; i < bursts.burstCount; i += 1) {
      const base = i * 3;
      const featureEntry = blendedFeatures[i % blendedFeatures.length];
      const sampledSpeed = Number(featureEntry?.toFeature?.speedFactor);
      const speedFactor = Number.isFinite(sampledSpeed) ? sampledSpeed : 0.2;
      const phase = (timeSec * speedFactor * 0.08 + i * 0.013 + bursts.phases[i] * 0.17) % 1;
      const sampled = sampleSolarFeatureEntryPoint(featureEntry, phase, blendAlpha);
      if (!sampled) {
        bursts.positions[base] = bursts.directions[base] * sunRadiusAu * 1.03;
        bursts.positions[base + 1] = bursts.directions[base + 1] * sunRadiusAu * 1.03;
        bursts.positions[base + 2] = bursts.directions[base + 2] * sunRadiusAu * 1.03;
        continue;
      }

      const brightness = solarFeatureEntryBrightness(featureEntry, blendAlpha);
      const radialBoost = 1 + brightness * 0.065;
      bursts.positions[base] = sampled[0] * sunRadiusAu * radialBoost;
      bursts.positions[base + 1] = sampled[1] * sunRadiusAu * radialBoost;
      bursts.positions[base + 2] = sampled[2] * sunRadiusAu * radialBoost;
    }
  } else {
    const plumeFactor = 0.45 + activity * 0.95;
    for (let i = 0; i < bursts.burstCount; i += 1) {
      const base = i * 3;
      const wave = Math.sin(timeSec * bursts.speeds[i] + bursts.phases[i]);
      const plume = Math.max(0, wave) * bursts.amplitudes[i] * plumeFactor;
      const swirl = Math.sin(timeSec * bursts.speeds[i] * 0.53 + bursts.phases[i] * 1.7) * bursts.amplitudes[i] * 0.36;
      const radius = bursts.baseRadius * (1.03 + plume);
      const tangentOffset = bursts.baseRadius * swirl;

      bursts.positions[base] = bursts.directions[base] * radius + bursts.tangents[base] * tangentOffset;
      bursts.positions[base + 1] = bursts.directions[base + 1] * radius + bursts.tangents[base + 1] * tangentOffset;
      bursts.positions[base + 2] = bursts.directions[base + 2] * radius + bursts.tangents[base + 2] * tangentOffset;
    }
  }
  positionAttr.needsUpdate = true;
  if (sunEruptionLayer.material?.isPointsMaterial) {
    sunEruptionLayer.material.opacity = Math.max(0.1, 0.14 + activity * 0.27);
    sunEruptionLayer.material.size = Math.max(0.0000024, bursts.baseRadius * (0.28 + activity * 0.2));
  }