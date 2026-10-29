// 四个地貌共用的 GLSL：地面数据结构、地类编码、草地底色、不规则田块网格。
export const BIOME_COMMON = /* glsl */ `
#define CL_MEADOW 0.0
#define CL_FOREST 1.0
#define CL_FIELD 2.0
#define CL_ROAD 3.0
#define CL_WATER 4.0
#define CL_SAND 5.0
#define CL_ROCK 6.0
#define CL_YARD 7.0
#define CL_ORCHARD 8.0

struct Ground {
  float h;        // 地表高度（水面处 = 水面高度 0）
  vec3 alb;       // 底色（水面处 = 透过水看到的河床颜色）
  float water;    // 0..1
  float depth;    // 水深
  float shore;    // 岸边白浪
  float wind;     // 草/稻对风的响应
  float tree;     // 树林密度
  float conifer;  // 其中针叶树比例
  float village;  // 村落（JS 按它摆房子）
  float lone;     // 孤树
  float flower;   // 野花
  float cls;
  float ao;
  float alt;      // 树种开关：0 = 默认树种，1 = 场景的第二树种（JS 读 cls 的低 4 位）
};

Ground ground0() {
  Ground g;
  g.h = 0.0; g.alb = vec3(0.5); g.water = 0.0; g.depth = 0.0; g.shore = 0.0;
  g.wind = 0.0; g.tree = 0.0; g.conifer = 0.0; g.village = 0.0; g.lone = 0.0;
  g.flower = 0.0; g.cls = CL_MEADOW; g.ao = 1.0; g.alt = 0.0;
  return g;
}

// 草地底色：大块明暗 + 中尺度色斑 + 枯黄的草窝 + 顺风方向拉长的细纹
vec3 grass(vec2 p, vec3 lit, vec3 deep, vec3 dry) {
  float big = wf(p, 8.0, 4, 11u);
  float mid = wf(p, 36.0, 3, 12u);
  float fine = wf(p * vec2(1.0, 3.0), 96.0, 2, 13u);
  vec3 c = mix(deep, lit, smoothstep(0.22, 0.78, big * 0.6 + mid * 0.4));
  c = mix(c, dry, smoothstep(0.6, 0.86, wf(p + 17.0, 14.0, 3, 14u)) * 0.55);
  return c * (0.94 + 0.12 * fine);
}

// 散点（石子、碎光）：cell 必须整除 LOOP
float speck(vec2 p, float cell, float r, float prob, uint seed) {
  vec4 c = cellNear(p, cell, seed);
  return step(c.y, prob) * smoothstep(r, r * 0.55, c.x);
}

// 不规则田块：坐标先轻微扭曲（田埂顺着地势弯），按行切，每行再按随机宽度切。
// rowH 必须整除 LOOP。返回 (到田埂距离, id, id2, 列号)，center = 田块中心
vec4 fieldGrid(vec2 p, float rowH, float colW, uint seed, out vec2 center) {
  vec2 q = warp2(p, 4.0, 6.0, seed);
  float per = LOOP / rowH;
  float ry = floor(q.y / rowH);
  float fy = q.y - ry * rowH;
  float rw = wrapi(ry, per);
  float off = hash2i(ivec2(int(rw), 7), seed) * colW * 3.0;
  float cw = colW * (0.6 + 0.9 * hash2i(ivec2(int(rw), 9), seed));
  float cx = floor((q.x + off) / cw);
  float fx = q.x + off - cx * cw;
  ivec2 ci = ivec2(int(cx), int(rw));
  float id = hash2i(ci, seed + 5u);
  float id2 = hash2i(ci, seed + 6u);
  float edge = min(min(fy, rowH - fy), min(fx, cw - fx));
  center = vec2((cx + 0.5) * cw - off, (ry + 0.5) * rowH) + (p - q);
  return vec4(edge, id, id2, cx);
}
`;
