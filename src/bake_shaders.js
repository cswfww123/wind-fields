// 烘焙用着色器。同一个地貌函数 biome(p) 分四遍输出：
//   0 布局（高度/水/地类）  1 密度（树/针叶/村/孤树）  2 运行时遮罩（风/水/浪/深）  3 上色（光照后的颜色 + 野花密度）
// 之后再过一遍通用的 Kuwahara（油画笔触）+ 野花点 + 纸纹。
import { GLSL_CONST } from './config.js';
import { NOISE } from './noise.js';
import { CURVES_GLSL } from './curves.js';
import { BIOME_COMMON } from './biome_common.js';
import { LAYOUT_GLSL, PACK_GLSL } from './field.js';

export const BAKE_VERT = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export function bakeFrag(biomeGLSL) {
  return /* glsl */ `
precision highp float;
precision highp int;
${GLSL_CONST}
uniform vec2 uSize;
uniform int uPass;
uniform sampler2D uOverlay;
${NOISE}
${CURVES_GLSL}
${LAYOUT_GLSL}
${PACK_GLSL}
${BIOME_COMMON}
${biomeGLSL}

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec2 p = vec2((uv.x - 0.5) * WORLD_W, (0.5 - uv.y) * LOOP);
  Ground g = biome(p);
  if (uPass == 0) {
    gl_FragColor = vec4(packH(g.h), g.water, (g.cls * 16.0 + 4.0 + 8.0 * step(0.5, g.alt)) / 255.0);
    return;
  }
  if (uPass == 1) {
    gl_FragColor = vec4(g.tree, g.conifer, g.village, g.lone);
    return;
  }
  vec4 ov = texture2D(uOverlay, uv);
  float keep = 1.0 - ov.a;
  if (uPass == 2) {
    gl_FragColor = vec4(g.wind * keep, g.water, g.shore, clamp(g.depth, 0.0, 1.0));
    return;
  }
  vec3 alb = mix(g.alb, ov.rgb, ov.a);
  vec3 n = mix(nAt(p, 0.6), vec3(0.0, 1.0, 0.0), g.water);
  float around = hAt(p + vec2(2.0, 0.0)) + hAt(p - vec2(2.0, 0.0)) + hAt(p + vec2(0.0, 2.0)) + hAt(p - vec2(0.0, 2.0));
  float cav = clamp((around * 0.25 - hAt(p)) * 0.35, 0.0, 0.3);
  float ao = g.ao * (1.0 - cav) * (0.92 + 0.08 * n.y);
  // 包裹光：背光坡不至于发黑；再加一点同色地面的反光（画面里阴影是暖的）
  float ndl = max(dot(n, SUN_DIR) + 0.35, 0.0) / (SUN_DIR.y + 0.35);
  vec3 lit = alb * (SKY_COL * ao + SUN_COL * ndl + alb * 0.22 * (1.0 - n.y)) * 0.9;
  lit = lit / (1.0 + 0.18 * max(lit - 0.85, 0.0));
  gl_FragColor = vec4(lit, g.flower * keep * (1.0 - g.water));
}
`;
}

// Kuwahara（8 扇区、半径 3 像素）：把细碎的噪声压成一笔一笔的色块，边界保持清楚
export const PAINT_FRAG = /* glsl */ `
precision highp float;
precision highp int;
${GLSL_CONST}
uniform sampler2D uSrc;
uniform vec2 uSize;
uniform vec3 uFlowers[6];
${NOISE}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec3 m[8];
  vec3 s[8];
  float wsum[8];
  for (int k = 0; k < 8; k++) { m[k] = vec3(0.0); s[k] = vec3(0.0); wsum[k] = 0.0; }
  vec4 center = texture2D(uSrc, px / uSize);
  for (int y = -3; y <= 3; y++) {
    for (int x = -3; x <= 3; x++) {
      vec2 o = vec2(float(x), float(y));
      float r2 = dot(o, o);
      if (r2 > 10.5) continue;
      vec3 c = texture2D(uSrc, (px + o) / uSize).rgb;
      vec3 c2 = c * c;
      float g = exp(-r2 / 9.0);
      if (r2 < 0.5) {
        for (int k = 0; k < 8; k++) { m[k] += c * 0.125; s[k] += c2 * 0.125; wsum[k] += 0.125; }
        continue;
      }
      vec2 d = o / sqrt(r2);
      for (int k = 0; k < 8; k++) {
        float a = float(k) * 0.7853982;
        float t = max(dot(d, vec2(cos(a), sin(a))), 0.0);
        t *= t; t *= t; t *= t;
        float w = t * g;
        m[k] += c * w; s[k] += c2 * w; wsum[k] += w;
      }
    }
  }
  vec3 acc = vec3(0.0);
  float aw = 0.0;
  for (int k = 0; k < 8; k++) {
    vec3 mu = m[k] / wsum[k];
    vec3 v = abs(s[k] / wsum[k] - mu * mu);
    float sd = (v.r + v.g + v.b) * 255.0;
    float w = 1.0 / (1.0 + pow(sd, 4.0));
    acc += mu * w;
    aw += w;
  }
  vec3 col = acc / aw;

  // 野花：抖动网格上的小色点，按地面亮度一起明暗
  vec2 uv = px / uSize;
  vec2 p = vec2((uv.x - 0.5) * WORLD_W, (0.5 - uv.y) * LOOP);
  float fd = center.a;
  if (fd > 0.02) {
    vec4 f = cellNear(p, 0.5, 777u);
    float r = 0.11 + 0.09 * f.z;
    float on = step(f.y, fd * 0.6) * smoothstep(r, r * 0.55, f.x);
    vec3 fc = uFlowers[int(f.z * 5.99)];
    float lum = dot(col, vec3(0.33));
    col = mix(col, fc * (0.55 + 0.75 * lum), on);
  }

  // 纸纹：极淡的颗粒
  float gr = hash2i(ivec2(px), 3u) - 0.5;
  col *= 1.0 + gr * 0.03;
  gl_FragColor = vec4(col, 1.0);
}
`;
