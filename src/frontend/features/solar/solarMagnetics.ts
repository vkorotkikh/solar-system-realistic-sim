// @ts-nocheck
import {
    AdditiveBlending,
    BufferGeometry,
    CanvasTexture,
    Color,
    Float32BufferAttribute,
    Group,
    Line,
    LineBasicMaterial,
    Vector3
} from 'three';

// Potential Field Source Surface (PFSS) visualization generator
// Traces magnetic field lines out to the source surface (2.5 R_sun)

const SOURCE_SURFACE_R = 2.5;

/**
 * Calculates a simplified, analytical potential magnetic field vector at position (x, y, z)
 * using a mix of dipole and quadrupole terms scaled by solar activity.
 */
function computeMagneticField(x, y, z, activity) {
    const r2 = x * x + y * y + z * z;
    const r = Math.sqrt(r2);
    if (r < 0.0001) return new Vector3(0, 1, 0);

    // Phase 7B: Solar dipole tilt (~10-30° at solar max)
    // Rotate input coordinates around X-axis before dipole computation
    const tiltAngle = 0.2 * activity; // ~12° at solar max
    const cosT_tilt = Math.cos(tiltAngle);
    const sinT_tilt = Math.sin(tiltAngle);
    // Tilted coordinates for dipole only
    const xTilt = x;
    const yTilt = y * cosT_tilt - z * sinT_tilt;
    const zTilt = y * sinT_tilt + z * cosT_tilt;

    // Convert tilted coords to spherical for dipole
    const rTilt = Math.sqrt(xTilt * xTilt + yTilt * yTilt + zTilt * zTilt);
    const thetaTilt = Math.acos(zTilt / rTilt);
    const phiTilt = Math.atan2(yTilt, xTilt);

    // Convert original coords to spherical for quadrupole + octupole
    const theta = Math.acos(z / r);
    const phi = Math.atan2(y, x);

    const cosT = Math.cos(thetaTilt);
    const sinT = Math.sin(thetaTilt);

    // Dipole component (using tilted coords)
    const b0_dipole = 1.0;
    const br_dip = 2 * b0_dipole * cosT / (r * r2);
    const bt_dip = b0_dipole * sinT / (r * r2);

    // Quadrupole component (ℓ=2, using original coords)
    const b0_quad = 0.5 * activity;
    const cosT_orig = Math.cos(theta);
    const sinT_orig = Math.sin(theta);
    const cos2T = Math.cos(2 * theta);
    const sin2T = Math.sin(2 * theta);
    const br_quad = 0.5 * b0_quad * (3 * cosT_orig * cosT_orig - 1) / (r2 * r2);
    const bt_quad = b0_quad * sin2T / (r2 * r2);

    // Phase 7C: Octupole component (ℓ=3, activity-dependent complexity)
    // Breaks simple bar-magnet symmetry, adds current-sheet crossings
    const b0_oct = 0.25 * activity * activity; // only significant at high activity
    const cosT3 = cosT_orig * cosT_orig * cosT_orig;
    const br_oct = b0_oct * (5 * cosT3 - 3 * cosT_orig) / (r2 * r2 * r);
    const bt_oct = b0_oct * (1.5 * sin2T * cosT_orig) / (r2 * r2 * r);

    // Combine all harmonics
    const br = br_dip + br_quad + br_oct;
    const bt = bt_dip + bt_quad + bt_oct;
    const bp = 0; // Purely axisymmetric

    // Transform back to Cartesian (using tilted basis for dipole consistency)
    const bx = sinT * Math.cos(phiTilt) * br + cosT * Math.cos(phiTilt) * bt - Math.sin(phiTilt) * bp;
    const by = sinT * Math.sin(phiTilt) * br + cosT * Math.sin(phiTilt) * bt + Math.cos(phiTilt) * bp;
    const bz = cosT * br - sinT * bt;

    return new Vector3(bx, by, bz).normalize();
}

/**
 * Traces a magnetic field line starting from a footpoint on the surface.
 */
function traceFieldLine(startX, startY, startZ, stepSize, maxSteps, activity) {
    let pos = new Vector3(startX, startY, startZ);
    const points = [pos.clone()];
    let isOpen = false;
    let polarity = 0;

    // Initial field direction defines polarity at footpoint
    const initialB = computeMagneticField(pos.x, pos.y, pos.z, activity);
    polarity = initialB.dot(pos) > 0 ? 1 : -1;

    // Choose trace direction to go out (against or with field)
    const traceDirSign = polarity;

    for (let i = 0; i < maxSteps; i++) {
        // 4th order Runge-Kutta
        const k1 = computeMagneticField(pos.x, pos.y, pos.z, activity).multiplyScalar(traceDirSign);

        const p2 = pos.clone().addScaledVector(k1, stepSize * 0.5);
        const k2 = computeMagneticField(p2.x, p2.y, p2.z, activity).multiplyScalar(traceDirSign);

        const p3 = pos.clone().addScaledVector(k2, stepSize * 0.5);
        const k3 = computeMagneticField(p3.x, p3.y, p3.z, activity).multiplyScalar(traceDirSign);

        const p4 = pos.clone().addScaledVector(k3, stepSize);
        const k4 = computeMagneticField(p4.x, p4.y, p4.z, activity).multiplyScalar(traceDirSign);

        // RK4 weighted sum: use addScaledVector to avoid in-place mutation of k1-k3
        const stepVec = new Vector3()
            .addScaledVector(k1, 1)
            .addScaledVector(k2, 2)
            .addScaledVector(k3, 2)
            .addScaledVector(k4, 1)
            .multiplyScalar(stepSize / 6);
        pos.add(stepVec);

        const r = pos.length();
        points.push(pos.clone());

        if (r >= SOURCE_SURFACE_R) {
            isOpen = true;
            break;
        } else if (r <= 1.0 && i > 5) { // Returned to surface
            isOpen = false;
            break;
        }
    }

    return { points, isOpen, polarity };
}

/**
 * Creates the PFSS magnetic field visualization group.
 */
export function createMagneticFieldLines(sunRadiusAu, activity = 0.5, numLines = 60) {
    const group = new Group();
    const maxSteps = 200;
    const stepSize = 0.05;

    const closedColor = new Color('#ffe8d6');
    const openPosColor = new Color('#42f57a'); // green
    const openNegColor = new Color('#f542e6'); // magenta

    for (let i = 0; i < numLines; i++) {
        // Seed footpoints uniformly on sphere using Fibonacci spiral or random
        const phi = Math.acos(1 - 2 * (i + 0.5) / numLines);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;

        const x = Math.sin(phi) * Math.cos(theta);
        const y = Math.sin(phi) * Math.sin(theta);
        const z = Math.cos(phi);

        const trace = traceFieldLine(x, y, z, stepSize, maxSteps, activity);

        // Discard very short loops
        if (!trace.isOpen && trace.points.length < 15) continue;

        const positions = new Float32Array(trace.points.length * 3);
        for (let p = 0; p < trace.points.length; p++) {
            // Scale up to AU
            positions[p * 3] = trace.points[p].x * sunRadiusAu;
            positions[p * 3 + 1] = trace.points[p].y * sunRadiusAu;
            positions[p * 3 + 2] = trace.points[p].z * sunRadiusAu;
        }

        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

        let lineColor = closedColor;
        let opacity = 0.15 + Math.random() * 0.1;
        if (trace.isOpen) {
            lineColor = trace.polarity > 0 ? openPosColor : openNegColor;
            opacity = 0.3 + Math.random() * 0.2;
        }

        const material = new LineBasicMaterial({
            color: lineColor,
            transparent: true,
            opacity: opacity,
            blending: AdditiveBlending,
            depthWrite: false
        });

        const line = new Line(geometry, material);
        // Store original opacity for animation
        line.userData.baseOpacity = opacity;
        line.userData.phaseOffset = Math.random() * Math.PI * 2;
        group.add(line);
    }

    return group;
}

/**
 * Creates a procedural grayscale magnetogram texture.
 */
export function createMagnetogramTexture(size = 512, activity = 0.5) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size / 2;
    const ctx = canvas.getContext('2d');

    // Fill with neutral gray (zero magnetic field)
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add small salt-and-pepper noise for quiet sun network
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const val = 127 + (Math.random() - 0.5) * 15;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
        data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    // Active regions (bipolar pairs)
    const numRegions = Math.round(1 + activity * 12);

    for (let r = 0; r < numRegions; r++) {
        const lon = Math.random() * canvas.width;
        // Spörer's law (latitudes ~10 to 35 deg)
        const sign = r % 2 === 0 ? 1 : -1;
        const latDeg = sign * (10 + Math.random() * 25);
        const latY = canvas.height * (0.5 - latDeg / 180);

        const sizeFactor = (0.5 + Math.random() * 1.5) * (15 * (size / 512));

        // Positive patch (white)
        const posGrad = ctx.createRadialGradient(lon - sizeFactor * 0.6, latY, 0, lon - sizeFactor * 0.6, latY, sizeFactor);
        posGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        posGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = posGrad;
        ctx.beginPath();
        ctx.arc(lon - sizeFactor * 0.6, latY, sizeFactor, 0, Math.PI * 2);
        ctx.fill();

        // Negative patch (black)
        const negGrad = ctx.createRadialGradient(lon + sizeFactor * 0.6, latY, 0, lon + sizeFactor * 0.6, latY, sizeFactor);
        negGrad.addColorStop(0, 'rgba(0, 0, 0, 0.9)');
        negGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = negGrad;
        ctx.beginPath();
        ctx.arc(lon + sizeFactor * 0.6, latY, sizeFactor, 0, Math.PI * 2);
        ctx.fill();

        // Wrap around longitude if needed
        if (lon - sizeFactor * 2 < 0 || lon + sizeFactor * 2 > canvas.width) {
            const lonWrap = lon < canvas.width / 2 ? lon + canvas.width : lon - canvas.width;
            const pGrad = ctx.createRadialGradient(lonWrap - sizeFactor * 0.6, latY, 0, lonWrap - sizeFactor * 0.6, latY, sizeFactor);
            pGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
            pGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = pGrad;
            ctx.beginPath();
            ctx.arc(lonWrap - sizeFactor * 0.6, latY, sizeFactor, 0, Math.PI * 2);
            ctx.fill();

            const nGrad = ctx.createRadialGradient(lonWrap + sizeFactor * 0.6, latY, 0, lonWrap + sizeFactor * 0.6, latY, sizeFactor);
            nGrad.addColorStop(0, 'rgba(0, 0, 0, 0.9)');
            nGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = nGrad;
            ctx.beginPath();
            ctx.arc(lonWrap + sizeFactor * 0.6, latY, sizeFactor, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    const texture = new CanvasTexture(canvas);
    return texture;
}

/**
 * Updates the field lines animation (breathing effect).
 */
export function updateMagneticFieldLines(group, timeSec) {
    if (!group || !group.visible) return;

    for (const line of group.children) {
        if (!line.userData) continue;
        const base = line.userData.baseOpacity ?? 0.2;
        const phase = line.userData.phaseOffset ?? 0;

        // Slow pulsation
        const pulse = Math.sin(timeSec * 0.5 + phase) * 0.3 + 0.7; // 0.4 to 1.0 variation

        if (line.material) {
            line.material.opacity = base * pulse;
        }
    }
}
