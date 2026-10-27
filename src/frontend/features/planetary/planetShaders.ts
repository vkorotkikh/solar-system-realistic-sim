// src/frontend/features/planetary/planetShaders.ts
import { ShaderMaterial, Color, Matrix4, Vector3 } from 'three';

const fbmGLSL = /* glsl */`
// Hash and noise functions for GLSL
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                dot(p2,x2), dot(p3,x3) ) );
}

float fbm(vec3 x, int octaves) {
    float v = 0.0;
    float a = 0.5;
    vec3 shift = vec3(100.0);
    for (int i = 0; i < 12; ++i) {
        if (i >= octaves) break;
        v += a * snoise(x);
        x = x * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

float ridgedNoise(vec3 p, int octaves) {
    float sum = 0.0;
    float amp = 0.5;
    float weight = 1.0;
    for(int i = 0; i < 12; i++) {
        if(i >= octaves) break;
        float n = abs(snoise(p));
        n = 1.0 - n;
        n *= n;
        n *= weight;
        weight = max(min(n * 2.0, 1.0), 0.0);
        sum += n * amp;
        amp *= 0.5;
        p *= 2.0;
    }
    return sum;
}
`;

export const planetVertexShader = /* glsl */`
${fbmGLSL}

uniform float uRadius;
uniform float uDisplacementScale;
uniform mat4 uPatchToCube;
uniform float uSkirtDepth;
attribute float aSkirt;
uniform int uPlanetType; // 0=Earth, 1=Moon, 2=Mars

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
varying float vHeight;
varying vec3 vSpherePosition;

float getElevation(vec3 p) {
    if (uPlanetType == 0) { // Earth
        float continents = fbm(p * 1.5, 6);
        float mountains = ridgedNoise(p * 4.0, 8);
        float detail = fbm(p * 12.0, 4);
        
        // Canyons
        float canyonMask = smoothstep(0.2, 0.4, fbm(p * 3.0, 4));
        float canyons = abs(snoise(p * 15.0));
        canyons = smoothstep(0.01, 0.05, canyons);
        
        float elevation = continents;
        // Oceans are flat and low
        if (elevation < 0.0) {
            return elevation * 0.1; 
        }
        elevation += mountains * 0.3 * smoothstep(0.1, 0.5, continents);
        elevation -= (1.0 - canyons) * 0.15 * canyonMask * smoothstep(0.2, 0.4, continents);
        elevation += detail * 0.02;
        return elevation;
    } 
    else if (uPlanetType == 1) { // Moon
        float base = fbm(p * 2.5, 6) * 0.2;
        float craters = fbm(p * 8.0, 4); // simplistic crater rim approximation
        float details = fbm(p * 20.0, 4) * 0.05;
        return base + abs(craters)*0.1 + details;
    } 
    else if (uPlanetType == 2) { // Mars
        float continents = fbm(p * 1.2, 7);
        float mountains = ridgedNoise(p * 3.0, 8);
        
        // Massive canyons (Valles Marineris style)
        float canyonMask = smoothstep(0.1, 0.6, snoise(p * 2.0));
        float canyons = abs(snoise(p * 6.0));
        canyons = smoothstep(0.05, 0.2, canyons);
        
        float elevation = continents + mountains * 0.4;
        elevation -= (1.0 - canyons) * 0.4 * canyonMask;
        elevation += fbm(p * 15.0, 5) * 0.03;
        return elevation;
    }
    return 0.0;
}

void main() {
    vUv = uv;
    
    // Orient and translate the patch onto its cube face BEFORE projection.
    // Face centres are nonzero cube points, including the two polar faces.
    vec3 cubePosition = (uPatchToCube * vec4(position, 1.0)).xyz;
    vec3 spherePos = normalize(cubePosition);
    vSpherePosition = spherePos;
    
    float elevation = getElevation(spherePos);
    vHeight = elevation;
    
    // Displace along the sphere normal
    vec3 displacedPos = spherePos * (uRadius + elevation * uDisplacementScale - aSkirt * uSkirtDepth);
    vPosition = displacedPos;
    
    // Calculate normals using finite differences
    float eps = 0.001;
    vec3 referenceAxis = abs(spherePos.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 t1 = normalize(cross(spherePos, referenceAxis));
    vec3 t2 = normalize(cross(spherePos, t1));
    
    vec3 pLeft = normalize(spherePos - t1 * eps);
    vec3 pRight = normalize(spherePos + t1 * eps);
    vec3 pDown = normalize(spherePos - t2 * eps);
    vec3 pUp = normalize(spherePos + t2 * eps);
    
    float hLeft = getElevation(pLeft);
    float hRight = getElevation(pRight);
    float hDown = getElevation(pDown);
    float hUp = getElevation(pUp);
    
    vec3 posLeft = pLeft * (uRadius + hLeft * uDisplacementScale);
    vec3 posRight = pRight * (uRadius + hRight * uDisplacementScale);
    vec3 posDown = pDown * (uRadius + hDown * uDisplacementScale);
    vec3 posUp = pUp * (uRadius + hUp * uDisplacementScale);
    
    vec3 dx = posRight - posLeft;
    vec3 dy = posUp - posDown;
    
    vNormal = normalize(cross(dx, dy));
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPos, 1.0);
}
`;

export const planetFragmentShader = /* glsl */`
uniform vec3 uColorBase;
uniform int uPlanetType;
uniform vec3 uLightDirection;
uniform vec3 uCameraPositionLocal;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
varying float vHeight;
varying vec3 vSpherePosition;

${fbmGLSL}

vec3 getEarthColor(float h, vec3 p, vec3 normal) {
    float lat = abs(p.y);
    
    // Ice caps
    if (lat > 0.85 + fbm(p*5.0, 3)*0.1) {
        return vec3(0.9, 0.95, 1.0);
    }
    
    if (h < 0.0) {
        // Deep ocean to shallow water
        return mix(vec3(0.01, 0.05, 0.2), vec3(0.05, 0.3, 0.5), smoothstep(-0.5, 0.0, h));
    } else {
        // Steeps are rocky
        float slope = 1.0 - max(0.0, dot(normal, normalize(p)));
        if (slope > 0.2) {
            return mix(vec3(0.4, 0.35, 0.3), vec3(0.2, 0.18, 0.15), smoothstep(0.2, 0.5, slope));
        }
        
        // Lowlands to highlands
        vec3 forest = vec3(0.1, 0.3, 0.1);
        vec3 plains = vec3(0.4, 0.5, 0.2);
        vec3 desert = vec3(0.7, 0.6, 0.4);
        vec3 snow = vec3(0.9, 0.9, 0.95);
        
        vec3 color = mix(forest, plains, smoothstep(0.0, 0.2, h));
        
        // Deserts based on latitude
        if (lat < 0.4 && lat > 0.2) {
            float arid = fbm(p*3.0, 3);
            color = mix(color, desert, smoothstep(0.2, 0.6, arid));
        }
        
        color = mix(color, vec3(0.3, 0.28, 0.25), smoothstep(0.3, 0.6, h)); // mountains
        color = mix(color, snow, smoothstep(0.65, 0.8, h)); // peaks
        return color;
    }
}

vec3 getMarsColor(float h, vec3 p, vec3 normal) {
    float lat = abs(p.y);
    // Ice caps
    if (lat > 0.92 + fbm(p*8.0, 3)*0.05) {
        return vec3(0.85, 0.9, 0.9);
    }
    
    vec3 rust = vec3(0.7, 0.3, 0.15);
    vec3 darkRock = vec3(0.3, 0.15, 0.1);
    vec3 lightDust = vec3(0.8, 0.5, 0.3);
    
    float slope = 1.0 - max(0.0, dot(normal, normalize(p)));
    
    vec3 col = mix(rust, lightDust, smoothstep(-0.2, 0.4, h));
    if (slope > 0.15) {
        col = mix(col, darkRock, smoothstep(0.15, 0.4, slope));
    }
    
    float stains = fbm(p * 15.0, 4);
    col = mix(col, darkRock, smoothstep(0.6, 0.9, stains) * 0.5);
    
    return col;
}

vec3 getMoonColor(float h, vec3 p, vec3 normal) {
    vec3 base = vec3(0.6, 0.6, 0.62);
    vec3 darkMaria = vec3(0.3, 0.3, 0.32);
    vec3 brightEjecta = vec3(0.8, 0.8, 0.85); // ray systems
    
    vec3 col = mix(darkMaria, base, smoothstep(-0.1, 0.1, h));
    
    float rays = fbm(p * 2.0, 3);
    col = mix(col, brightEjecta, smoothstep(0.7, 1.0, rays) * 0.4);
    
    float slope = 1.0 - max(0.0, dot(normal, normalize(p)));
    if (slope > 0.1) {
        col *= 0.8;
    }
    
    return col;
}

void main() {
    vec3 baseColor = uColorBase;
    
    if (uPlanetType == 0) {
        baseColor = getEarthColor(vHeight, vSpherePosition, vNormal);
    } else if (uPlanetType == 1) {
        baseColor = getMoonColor(vHeight, vSpherePosition, vNormal);
    } else if (uPlanetType == 2) {
        baseColor = getMarsColor(vHeight, vSpherePosition, vNormal);
    }
    
    // Micro-detail grit per pixel for extremely close zoom
    float grit = 0.0;
    if (uPlanetType == 0) {
        grit = snoise(vSpherePosition * 800.0) * 0.03 + snoise(vSpherePosition * 2000.0) * 0.015;
    } else if (uPlanetType == 1) {
        grit = snoise(vSpherePosition * 1200.0) * 0.05 + snoise(vSpherePosition * 3000.0) * 0.02;
    } else if (uPlanetType == 2) {
        grit = snoise(vSpherePosition * 1000.0) * 0.04 + snoise(vSpherePosition * 2500.0) * 0.02;
    }
    
    // Apply grit to base color
    baseColor *= (1.0 - abs(grit) * 2.0);

    // Simple lambertian lighting + ambient + micro normal perturbation
    vec3 lightDir = normalize(uLightDirection);
    
    // Fake normal perturbation based on grit 
    // We shift the normal slightly toward the tangent based on the noise derivative 
    // This gives a nice rocky self-shadowing effect without true tangents
    vec3 perturbedNormal = normalize(vNormal + (vSpherePosition * grit * 5.0));
    
    float diffuse = max(0.0, dot(perturbedNormal, lightDir));
    float ambient = 0.05;
    
    vec3 finalColor = baseColor * (diffuse + ambient);
    
    // Atmospheric scattering rim for Earth/Mars
    if (uPlanetType == 0 || uPlanetType == 2) {
        vec3 viewDir = normalize(uCameraPositionLocal - vPosition);
        float rim = 1.0 - max(0.0, dot(viewDir, normalize(vSpherePosition)));
        rim = smoothstep(0.6, 1.0, rim);
        vec3 atmosColor = uPlanetType == 0 ? vec3(0.3, 0.6, 1.0) : vec3(0.8, 0.4, 0.2);
        finalColor += atmosColor * rim * 0.4 * diffuse;
    }

    gl_FragColor = vec4(finalColor, 1.0);
}
`;

export function createPlanetShaderMaterial(planetId: string, radius: number): ShaderMaterial {
    let planetType = 0;
    let colorBase = new Color('#ffffff');
    let displacementScale = radius * 0.05; // 5% of radius max displacement

    if (planetId === 'earth') {
        planetType = 0;
        displacementScale = radius * 0.02; // Earth has relatively low mountains
    } else if (planetId === 'moon') {
        planetType = 1;
        displacementScale = radius * 0.04;
    } else if (planetId === 'mars') {
        planetType = 2;
        displacementScale = radius * 0.06; // Olympus Mons / Valles Marineris is huge
    }

    return new ShaderMaterial({
        vertexShader: planetVertexShader,
        fragmentShader: planetFragmentShader,
        uniforms: {
            uPatchToCube: { value: new Matrix4() },
            uSkirtDepth: { value: 0 },
            uCameraPositionLocal: { value: new Vector3() },
            uRadius: { value: radius },
            uDisplacementScale: { value: displacementScale },
            uPlanetType: { value: planetType },
            uColorBase: { value: colorBase },
            uLightDirection: { value: new Vector3(1, 0, 0) } // Overwritten per frame
        },
        wireframe: false
    });
}
