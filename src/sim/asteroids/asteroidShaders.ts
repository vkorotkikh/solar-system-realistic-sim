// WebGL Shaders for calculating Keplerian orbits purely on the GPU.

/**
 * We inject custom logic into the standard Three.js MeshStandardMaterial vertex shader.
 * This ensures the asteroids still react correctly to lighting, shadows, and PBR textures,
 * while having their world positions dynamically calculated based on Julian Date and Orbital Elements.
 *
 * Each instance gets custom `InstancedBufferAttribute`s:
 * - aOrbitParams1: vec4(aAu, e, iRad, ascendingNodeRad)
 * - aOrbitParams2: vec3(argPeriapsisRad, meanAnomalyRad, periodDays)
 * - aSpinParams: vec4(spinAxisX, spinAxisY, spinAxisZ, spinPhaseOffs)
 */

export const ASTEROID_VERTEX_SHADER_INJECTIONS = {
    header: `
// Custom Attributes for GPU Kepler Propagation
attribute vec4 aOrbitParams1; // x = a (AU), y = e, z = i (rad), w = Omega (rad)
attribute vec3 aOrbitParams2; // x = omega (rad), y = M0 (rad), z = period (days)
attribute vec4 aSpinParams;   // xyz = spin axis (normalized * rate), w = initial phase

uniform float uTimeDays;     // Current Julian Date - Epoch
uniform float uViewScaleAu;  // Scale factor for rendering

// Mean anomaly to Eccentric Anomaly (Newton-Raphson approximation)
float solveKepler(float M, float e) {
    float E = M;
    // 5 iterations is generally enough for low-mid eccentricity (e < 0.8)
    for(int i = 0; i < 5; i++) {
        float f = E - e * sin(E) - M;
        float fPrime = 1.0 - e * cos(E);
        E -= f / fPrime;
    }
    return E;
}

// Axis-Angle Rotation Matrix
mat3 rotationMatrix(vec3 axis, float angle) {
    axis = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;
    
    return mat3(
        oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,
        oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,
        oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c
    );
}
  `,

    main: `
    // 1. Unpack Orbital Elements
    float a = aOrbitParams1.x;
    float e = aOrbitParams1.y;
    float currentI = aOrbitParams1.z;
    float Omega = aOrbitParams1.w;
    
    float omega = aOrbitParams2.x;
    float M0 = aOrbitParams2.y;
    float period = aOrbitParams2.z;

    // 2. Mean Anomaly at current time
    float n = (2.0 * 3.14159265359) / period;
    float M = M0 + n * uTimeDays;
    
    // 3. Solve Kepler's Equation for Eccentric Anomaly
    float E = solveKepler(M, e);
    
    // 4. True Anomaly & Radius in orbital plane
    float cosE = cos(E);
    float sinE = sin(E);
    
    // Position in orbital plane
    float x_orb = a * (cosE - e);
    float y_orb = a * sqrt(1.0 - e*e) * sinE;

    // 5. Rotate to 3D ecliptic space using Perifocal coordinate transformation
    float cosOmega = cos(Omega);
    float sinOmega = sin(Omega);
    float cosomega = cos(omega);
    float sinomega = sin(omega);
    float cosi = cos(currentI);
    float sini = sin(currentI);

    float Px = cosOmega * cosomega - sinOmega * sinomega * cosi;
    float Py = sinOmega * cosomega + cosOmega * sinomega * cosi;
    float Pz = sinomega * sini;

    float Qx = -cosOmega * sinomega - sinOmega * cosomega * cosi;
    float Qy = -sinOmega * sinomega + cosOmega * cosomega * cosi;
    float Qz = cosomega * sini;

    vec3 orbitPos = vec3(
        x_orb * Px + y_orb * Qx,
        x_orb * Py + y_orb * Qy,
        x_orb * Pz + y_orb * Qz
    );

    // 6. Handle Local Spin
    float spinRate = length(aSpinParams.xyz);
    vec3 spinAxis = aSpinParams.xyz / (spinRate + 1e-8);
    float currentAngle = aSpinParams.w + spinRate * uTimeDays * 50.0; // multiplier for visual spin
    mat3 spinMat = rotationMatrix(spinAxis, currentAngle);

    // Apply spin to the base vertex geometry
    vec3 spunVertex = spinMat * position.xyz;
  `,

    // Replace standard position assignment
    project_vertex: `
    // The instanceMatrix still contains the base scale
    // So we apply standard instanceMatrix, but override the translation component
    // We construct the final world position by adding the Kepler orbit position
    vec4 localPosition = instanceMatrix * vec4( spunVertex, 1.0 );
    
    // Add the astronomical orbit position
    // We divide by AU_in_KM scaling logic usually handled CPU side, assuming orbitPos is in AU
    // uViewScaleAu maps AU distances directly to WebGL coordinates.
    vec3 finalPos = localPosition.xyz + (orbitPos * uViewScaleAu);

    vec4 mvPosition = viewMatrix * vec4( finalPos, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
  `
};

export function patchAsteroidMaterial(material, uniforms) {
    material.onBeforeCompile = (shader) => {
        // Inject Uniforms
        shader.uniforms.uTimeDays = uniforms.uTimeDays;
        shader.uniforms.uViewScaleAu = uniforms.uViewScaleAu;

        // Inject Header (Attributes and functions)
        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            '#include <common>\n' + ASTEROID_VERTEX_SHADER_INJECTIONS.header
        );

        // Inject Main body calculation
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            ASTEROID_VERTEX_SHADER_INJECTIONS.main
        );

        // Inject final assignment mapping
        shader.vertexShader = shader.vertexShader.replace(
            '#include <project_vertex>',
            ASTEROID_VERTEX_SHADER_INJECTIONS.project_vertex
        );
    };
}
