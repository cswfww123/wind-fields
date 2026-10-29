// 所有着色器集中在这里：
//  - 云：程序化 fbm 云团（同一份代码同时产出「云」和「地上云影」）
//  - 合成：把 3D 场景渲染结果按「撕纸/水彩边」遮罩贴到纸面上

const NOISE = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.02 + 7.3;
    a *= 0.5;
  }
  return v;
}
`;

export const cloudVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const cloudFragment = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uSeed;
uniform float uOpacity;
uniform float uShadow;
uniform vec3  uShade;
uniform vec2  uCloudCenter;   // 云片在世界里的中心（xz）
uniform float uCloudSize;     // 云片边长（世界单位）
uniform vec4  uWake[12];      // xy = 飞机经过的世界坐标, z = 半径, w = 强度
uniform float uWakeActive;    // 0 = 这片云离航迹很远，直接跳过循环

${NOISE}

// 云影只需要形状，用更便宜的噪声
float fbm3(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = p * 2.02 + 7.3;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  vec2 q = p * vec2(1.0, 1.12);
  vec2 world = uCloudCenter + vec2(p.x, -p.y) * uCloudSize * 0.5;

  // 飞机航迹：先算影响，再用它扰动云的噪声坐标（形成湍流）
  float hole = 0.0;
  float push = 0.0;
  vec2 turb = vec2(0.0);
  if (uWakeActive > 0.5) {
  for (int i = 0; i < 12; i++) {
    vec4 w = uWake[i];
    if (w.w <= 0.002) continue;
    vec2 d = world - w.xy;
    float dist = length(d);
    // 空洞边缘做出不规则的「被推开」轮廓
    float ang = atan(d.y, d.x);
    float lobed = 1.0 + 0.16 * sin(ang * 3.0 + w.x * 0.7) + 0.10 * sin(ang * 5.0 + w.y);
    float infl = smoothstep(w.z * lobed, w.z * 0.30 * lobed, dist) * w.w;
    hole = max(hole, infl);
    push += infl;
    turb += normalize(d + vec2(1e-4)) * infl;
  }
  }

  vec2 qq = q + turb * 0.085;

  float t = uTime * 0.018;
  float detail;
  if (uShadow > 0.5) {
    detail = fbm3(qq * 1.30 + vec2(uSeed * 3.1 + t, uSeed * 7.7 - t * 0.7));
  } else {
    float n1 = fbm(qq * 0.95 + vec2(uSeed * 3.1 + t, uSeed * 7.7 - t * 0.7));
    float n2 = fbm(qq * 2.30 - vec2(t * 1.6, uSeed * 2.3));
    detail = n1 * 0.72 + n2 * 0.28;
  }

  float r = length(q);
  float shape = r + (0.5 - detail) * 1.06;

  // 被飞机推开的云：中间掏空，四周挤得更厚（边缘外扩）
  shape -= clamp(push, 0.0, 1.2) * 0.12;

  float a = smoothstep(0.84, 0.62, shape);
  float core = smoothstep(0.72, 0.40, shape);
  a *= 1.0 - clamp(hole, 0.0, 1.0) * 0.97;

  if (uShadow > 0.5) {
    gl_FragColor = vec4(0.26, 0.27, 0.30, a * 0.22 * uOpacity);
    return;
  }

  // 云就是纯白：边缘的半透明让底下的赤土透上来，自然形成暖色的晕
  vec3 col = vec3(1.0) * (0.982 + 0.03 * detail);
  col = mix(col, vec3(0.965, 0.975, 0.99), (1.0 - core) * 0.25);
  gl_FragColor = vec4(col, a * uOpacity);
}
`;

export const compositeVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const compositeFragment = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene;
uniform vec2  uRes;
uniform vec2  uCenter;
uniform float uHalf;
uniform float uTime;
uniform float uReveal;
uniform vec3  uPaper;

${NOISE}

void main() {
  vec2 px = vUv * uRes;
  vec2 d2 = abs(px - uCenter) - vec2(uHalf);
  float d = max(d2.x, d2.y);            // >0 在纸外，<0 在纸内

  // 撕纸边：低频决定大的缺口，高频决定纸纤维的毛刺
  float n1 = fbm(px / 58.0 + 3.7);
  float n2 = fbm(px / 13.0 - 11.2);
  float n3 = fbm(px / 3.1 + 41.0);
  float n4 = fbm(px / 3.4 + 7.0);
  float edge = d + (n1 - 0.5) * 16.0 + (n2 - 0.5) * 4.2 + (n3 - 0.5) * 1.4;

  float mask = smoothstep(1.1, -1.1, edge + (n4 - 0.5) * 2.4);

  // 纸纤维：边缘外侧 10px 内、按噪声断断续续的白色丝絮
  float fiber = smoothstep(5.0, -2.0, edge) * smoothstep(0.42, 0.68, n4);
  mask = max(mask, fiber);

  // 纸：极浅的暖白 + 细纸纹 + 极淡的外侧晕影
  vec3 paper = uPaper * (0.995 + 0.012 * fbm(px / 210.0));
  paper *= 1.0 - 0.008 * smoothstep(0.0, 90.0, edge);

  vec3 scene = texture2D(tScene, vUv).rgb;

  // 颜料在纸边沉积：更暗、更饱和一点
  float rim = smoothstep(-7.0, 0.0, edge);
  scene *= mix(1.0, 0.965, rim);
  scene = mix(scene, scene * scene * 1.03, rim * 0.30);

  vec3 col = mix(paper, scene, mask * uReveal);

  // 手绘感：只留一点暖调和极轻的去饱和，不加暗角（暗角会把画面压暗）
  col *= vec3(1.045, 1.022, 0.99);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 0.965);
  col = mix(col, vec3(1.0, 0.995, 0.982), 0.03);
  col *= 1.06;

  // 纸外散落的纤维点
  vec2 cell = floor(px / 2.0);
  float h = hash21(cell + 91.7);
  float speck = step(0.9968, h) * step(0.0, edge) * step(edge, 30.0);
  col = mix(col, uPaper * 0.86, speck * uReveal);

  // 颗粒
  float grain = hash21(px + 13.0) - 0.5;
  col += grain * 0.013;

  gl_FragColor = vec4(col, 1.0);
}
`;
