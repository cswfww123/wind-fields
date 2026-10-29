// 四个夏天的场景：同一套 2.5D 管线，只换地貌函数、曲线、色板、植被与小物件。
import { riverGLSL, riverCurves } from './biome_river.js';
import { fieldsGLSL, fieldsCurves } from './biome_fields.js';
import { desertGLSL, desertCurves } from './biome_desert.js';
import { seaGLSL, seaCurves } from './biome_sea.js';

// 树的色阶：[暗, 中, 亮, 高光]，每个场景给 4 套（树冠着色器按 pal 下标取）
const SUMMER = ['#2f5a3a', '#4f8a45', '#86b85a', '#cfe08a'];
const CEDAR = ['#22443a', '#335f45', '#58864f', '#9fbf72'];
const DEEP = ['#284c34', '#3f7440', '#6aa04e', '#b8d47a'];
const BUSH = ['#30563a', '#4e8644', '#7fb158', '#c2d985'];

const river = {
  id: 'river',
  name: '草原河流',
  title: '河湾以北',
  lines: ['水声低低的，草把风留在腰上。', '一条河，替你走完剩下的路。'],
  caption: '草原河流 · 听水实验',
  seed: 21,
  biome: riverGLSL,
  curves: riverCurves,
  flowers: ['#fbfaf2', '#f6e27a', '#f2a7b8', '#c7b6ea', '#f08a5d', '#9fd0f0'],
  flora: {
    palettes: [SUMMER, CEDAR, DEEP, BUSH],
    pal: [0, 2, 1, 0, 3],
    forestV: 1,
    loneV: 0,
    forest: [1.05, 1.5],
    lone: [1.6, 2.2],
    bush: [0.7, 1.1],
    loneP: 0.35,
    edgeBush: 0.35,
    yardTree: 0.7,
  },
  houses: {
    cell: 8,
    roads: [1, 2],
    walls: ['#f3ede0', '#efe6d2', '#8b6a4f', '#e9e2d0'],
    roofs: ['#3f6f8c', '#a5523f', '#4e5a63', '#2f7f7a', '#b9653c'],
  },
  overlay: { yard: '#d6c79f', soil: '#9c7650', crop: '#4f8a3a', path: '#d8c597' },
  animals: { herds: 7, cowShare: 0.45 },
  traffic: {
    cars: [
      { road: 1, z: -40, dir: 1, speed: 3.6, color: '#f2efe6' },
      { road: 1, z: 60, dir: -1, speed: 3.0, color: '#d9a441' },
      { road: 2, z: 10, dir: 1, speed: 2.4, color: '#7aa6b8', lane: 0 },
    ],
  },
  clouds: {
    count: 9, size: [5, 9], top: [40, 43], wind: [0.9, 0.5],
    lit: '#fffaf0', shade: '#c8d1e5', deep: '#929fc0',
  },
  fog: { color: '#d7e6ee', near: 150, far: 270, max: 0.42 },
  water: { sky: '#e9f5f4' },
  gust: '#eef3c6',
  hemiGround: '#a7c47e',
  grade: { glow: '#fff3d6', sat: 1.06 },
};

const SATO = ['#2c5a36', '#4d8c42', '#8cc05a', '#d4e68c'];
const SUGI = ['#1d3d34', '#2d5a43', '#4f7f4c', '#8fb06a'];
const KUSU = ['#24482f', '#3b6e3b', '#68a04a', '#b9d57c'];

const fields = {
  id: 'fields',
  name: '蓝金田野',
  title: '风过田野',
  lines: ['阡陌相接，河流环绕。', '一块田是蓝的，一块是金的。'],
  caption: '蓝金田野 · 换季实验',
  seed: 34,
  biome: fieldsGLSL,
  curves: fieldsCurves,
  flowers: ['#fbfaf2', '#f6e27a', '#f2a7b8', '#c7b6ea', '#f6f0a0', '#9fd0f0'],
  flora: {
    palettes: [SATO, SUGI, KUSU, BUSH],
    pal: [2, 0, 1, 0, 3],
    forestV: 1,
    loneV: 0,
    forest: [1.0, 1.45],
    lone: [1.9, 2.6],
    bush: [0.6, 1.0],
    loneP: 0.42,
    edgeBush: 0.3,
    yardTree: 0.8,
  },
  houses: {
    cell: 6,
    roads: [2, 3],
    walls: ['#efe8d6', '#e8dfc9', '#f4efe2', '#8a6f55'],
    roofs: ['#3d6d96', '#b4493a', '#4b5258', '#2f7f7a', '#c0603e', '#4f7f9e'],
  },
  overlay: { yard: '#d3c9a6', soil: '#9a7550', crop: '#4f8a3a', path: '#d4c79c' },
  traffic: {
    cars: [
      { kind: 'bus', road: 2, z: -30, dir: 1, speed: 2.8, color: '#f2ead2', band: '#5f9a6e' },
      { road: 2, z: 50, dir: -1, speed: 3.4, color: '#e9e4d6' },
      { road: 3, z: 0, dir: 1, speed: 2.0, color: '#f4f2ea', lane: 0 },
    ],
  },
  poles: { road: 2, side: -1, offset: 3.0 },
  clouds: {
    count: 8, size: [4.5, 8], top: [40, 43], wind: [0.8, 0.45],
    lit: '#fffaf0', shade: '#c6d0e6', deep: '#8f9dc2',
  },
  fog: { color: '#dbe9f0', near: 140, far: 270, max: 0.45 },
  water: { sky: '#e4f2f6' },
  gust: '#eef6cf',
  hemiGround: '#a5c77c',
  grade: { glow: '#fff1d0', sat: 1.08 },
};

const PINE = ['#2f4a2e', '#4b6b3a', '#7c9550', '#c4cf86'];
const CYPRESS = ['#1f3628', '#2f4f35', '#4e7045', '#8ea468'];
const OLIVE = ['#4f5f3e', '#72825a', '#9fae7e', '#d3dbb2'];
const WILLOW = ['#3a5c33', '#5e8a45', '#93b864', '#d2e39a'];
const SCRUB = ['#4a5a33', '#6c7d45', '#98a462', '#cfd495'];

const desert = {
  id: 'desert',
  name: '赤土荒野',
  title: '风过荒野',
  lines: ['云深处，风有了形状。', '掠过赤土，也掠过片刻的迷茫。'],
  caption: '赤土荒野 · 穿云实验',
  seed: 7,
  biome: desertGLSL,
  curves: desertCurves,
  flowers: ['#fbf6ea', '#f5d76e', '#e0523f', '#d9c2f0', '#e9893f', '#f7efc6'],
  flora: {
    palettes: [PINE, CYPRESS, OLIVE, WILLOW, SCRUB],
    pal: [0, 0, 1, 0, 4],
    forestV: 3,
    loneV: 3,
    forest: [1.25, 1.75],
    lone: [1.6, 2.2],
    bush: [0.55, 0.95],
    loneP: 0.22,
    edgeBush: 0.6,
    yardTree: 0.6,
    conifer: { s: [0.62, 0.8], sy: [1.9, 2.5] },
    alt: { v: 1, pal: 3, s: [0.95, 1.3], sy: [0.85, 1.1] },
    orchard: { cell: 3.2, v: 1, pal: 2, s: [0.58, 0.74], sy: [0.72, 0.88] },
  },
  houses: {
    cell: 6,
    roads: [1, 2],
    walls: ['#efe3cc', '#e6d4b4', '#f3ece0', '#d9c2a0'],
    roofs: ['#c2603d', '#b4553a', '#cf7348', '#a84f36'],
  },
  overlay: { yard: '#e0cba2', soil: '#a8603d', crop: '#6f8a3c', path: '#dcae7c' },
  animals: { herds: 4, cowShare: 0.0 },
  traffic: {
    cars: [
      { road: 1, z: -20, dir: 1, speed: 3.2, color: '#f1ece2' },
      { road: 1, z: 70, dir: -1, speed: 2.6, color: '#6f9bb0' },
    ],
  },
  clouds: {
    count: 9, size: [4.5, 8.5], top: [40, 43], wind: [1.0, 0.4],
    lit: '#fffaf0', shade: '#d6d4e2', deep: '#a7a2bf',
  },
  fog: { color: '#efe2cf', near: 140, far: 270, max: 0.45 },
  water: { sky: '#e6f1ec' },
  gust: '#fbefc2',
  hemiGround: '#d4a874',
  grade: { glow: '#fff0cf', sat: 1.05 },
};

const KUROMATSU = ['#1f3f33', '#2f5b40', '#557f4c', '#9cb874'];
const COAST = ['#2b5a36', '#4a8a42', '#80b85a', '#cbe28a'];
const BEACHB = ['#3b6038', '#5e8c4a', '#91b866', '#d0e09a'];

const sea = {
  id: 'sea',
  name: '碧海沙洲',
  title: '沙洲以南',
  lines: ['潮水退下去，留下一小块陆地。', '它安静得像一句没说完的话。'],
  caption: '碧海沙洲 · 退潮实验',
  seed: 52,
  biome: seaGLSL,
  curves: seaCurves,
  flowers: ['#fbfaf2', '#f6e27a', '#f2a7b8', '#c7b6ea', '#fbd38a', '#9fd0f0'],
  flora: {
    palettes: [KUROMATSU, COAST, CEDAR, BEACHB],
    pal: [0, 1, 2, 0, 3],
    forestV: 3,
    loneV: 3,
    forest: [1.15, 1.6],
    lone: [1.4, 1.9],
    bush: [0.6, 1.0],
    loneP: 0.3,
    edgeBush: 0.4,
    yardTree: 0.6,
    alt: { v: 1, pal: 1, s: [1.0, 1.4], sy: [0.85, 1.15] },
  },
  houses: {
    cell: 6,
    roads: [],
    walls: ['#f6f2e8', '#f1ebdc', '#efe6d4', '#f8f5ee'],
    roofs: ['#3f74a6', '#c4503e', '#2f8a86', '#e0a53e', '#4c5a66'],
  },
  overlay: { yard: '#e6dcc0', soil: '#a07c56', crop: '#5c9440', path: '#e2d6b6' },
  boats: 8,
  clouds: {
    count: 9, size: [4.5, 8.5], top: [40, 43], wind: [0.9, 0.5],
    lit: '#fffcf4', shade: '#cbd6ea', deep: '#94a6c8',
  },
  fog: { color: '#d8ebf1', near: 140, far: 270, max: 0.45 },
  water: { sky: '#e8f6f8' },
  gust: '#eef6d0',
  hemiGround: '#9cc8b8',
  grade: { glow: '#fff4da', sat: 1.06 },
};

const alias = (base, over) => ({ ...base, ...over });

export const scenes = [
  river,
  fields,
  desert,
  sea,
];
