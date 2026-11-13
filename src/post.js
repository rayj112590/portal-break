// Final screen pass: chromatic aberration, breach color grade,
// glitch lines on shift, damage vignette, scanlines.
import * as THREE from "three";

// Runs right after the scene render, before bloom. Replaces NaN/Infinity pixels and caps
// extreme highlights; otherwise one bad pixel gets blurred by bloom into a black screen.
export const SanitizeShader = {
  uniforms: { tDiffuse: { value: null }, uMax: { value: 12.0 } },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uMax;
    varying vec2 vUv;
    // Checks the exponent bits directly: some GPU drivers (Intel/ANGLE on D3D) compile
    // isnan()/isinf() away as "always false", so those can't be trusted.
    bool badFloat(float v) { return (floatBitsToUint(v) & 0x7f800000u) == 0x7f800000u; }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (badFloat(c.r) || badFloat(c.g) || badFloat(c.b)) c.rgb = vec3(0.0);
      c.rgb = max(c.rgb, vec3(0.0));
      float peak = max(c.r, max(c.g, c.b));
      // nothing in this game is legitimately brighter than ~100: values in the hundreds or
      // thousands are shading errors (they showed up as green specks), so treat them like NaN
      if (peak > 500.0) c.rgb = vec3(0.0);
      // otherwise scale the whole colour (not each channel) so bright pixels keep their hue
      else if (peak > uMax) c.rgb *= uMax / peak;
      gl_FragColor = vec4(c.rgb, 1.0);
    }`,
};

export const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uCA: { value: 0 },
    uBreach: { value: 0 },
    uDamage: { value: 0 },
    uGlitch: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime, uCA, uBreach, uDamage, uGlitch;
    varying vec2 vUv;
    float hash(float n) { return fract(sin(n) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      float line = floor(uv.y * 70.0 + floor(uTime * 24.0) * 13.0);
      if (hash(line) < uGlitch * 0.35) uv.x += (hash(line + 1.0) - 0.5) * 0.06 * uGlitch;
      vec2 d = uv - 0.5;
      float r = length(d);
      vec2 off = d * (0.003 + uCA * 0.02) * (0.4 + r);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 breachGrade = vec3(l * 1.25, l * 0.38, l * 0.55) + col * vec3(0.55, 0.25, 0.45);
      col = mix(col, breachGrade, uBreach * 0.4);
      col *= 0.99 + 0.01 * sin(uv.y * 1100.0);
      col *= 1.0 - smoothstep(0.45, 0.95, r) * 0.45;
      col += vec3(0.55, 0.0, 0.05) * uDamage * smoothstep(0.25, 0.75, r);
      gl_FragColor = vec4(col, 1.0);
    }`,
};
