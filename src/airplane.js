import * as THREE from 'three';

/**
 * 创建一架适合俯视海岛场景的简洁白色单引擎螺旋桨飞机。
 * 模型完全由 Three.js 几何体生成，不需要外部模型或贴图。
 *
 * 坐标约定：飞机机头朝 +Z，机翼沿 X 轴展开。
 * @param {object} options
 * @param {number} [options.scale=1] 整体缩放
 * @param {number|string} [options.color=0xf7f7f1] 机身颜色
 * @returns {{ group: THREE.Group, update: (dt:number)=>void }}
 */
export function createAirplane(options = {}) {
  const scale = options.scale ?? 1;
  const bodyColor = options.color ?? 0xf7f7f1;
  const group = new THREE.Group();
  group.name = 'ProceduralIslandAirplane';
  const plane = new THREE.Group();
  group.add(plane);

  const paint = new THREE.MeshStandardMaterial({
    color: bodyColor, roughness: 0.62, metalness: 0.03
  });
  const wingPaint = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.66, metalness: 0.02
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x6fbdce, roughness: 0.24, metalness: 0.08
  });
  const darkGlass = new THREE.MeshStandardMaterial({
    color: 0x355a68, roughness: 0.3, metalness: 0.06
  });
  const propMaterial = new THREE.MeshStandardMaterial({
    color: 0x59636a, roughness: 0.45, metalness: 0.15
  });
  const accent = new THREE.MeshStandardMaterial({
    color: 0xe7e4dc, roughness: 0.7
  });

  function mesh(geometry, material, name, position, parent = plane) {
    const m = new THREE.Mesh(geometry, material);
    m.name = name;
    if (position) m.position.set(...position);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // 主机身：用多个圆滑段组合，机头朝 +Z。
  const fuselage = mesh(
    new THREE.CapsuleGeometry(0.105, 0.78, 5, 12),
    paint, 'Fuselage', [0, 0.035, -0.02]
  );
  fuselage.rotation.x = Math.PI / 2;
  fuselage.scale.set(0.9, 1, 1);

  // 机鼻圆锥，补出更清楚的前端轮廓。
  const nose = mesh(
    new THREE.ConeGeometry(0.105, 0.22, 16),
    paint, 'Nose', [0, 0.035, 0.49]
  );
  nose.rotation.x = Math.PI / 2;

  // 主翼：自定义梯形翼面，有厚度并略带后掠角。
  function makeWing(name, halfSpan, rootChord, tipChord, y, z, thickness) {
    const x0 = 0, x1 = halfSpan;
    const zFrontRoot = z + rootChord * 0.5;
    const zBackRoot = z - rootChord * 0.5;
    const zFrontTip = z + (rootChord - tipChord) * 0.5;
    const zBackTip = zFrontTip - tipChord;
    const verts = [
      [-x0,y+thickness/2,zFrontRoot], [x0,y+thickness/2,zBackRoot],
      [-x1,y+thickness/2,zBackTip],   [-x1,y+thickness/2,zFrontTip],
      [-x0,y-thickness/2,zFrontRoot], [x0,y-thickness/2,zBackRoot],
      [-x1,y-thickness/2,zBackTip],   [-x1,y-thickness/2,zFrontTip],
      [x0,y+thickness/2,zFrontRoot], [x1,y+thickness/2,zFrontTip],
      [x1,y+thickness/2,zBackTip],    [x0,y+thickness/2,zBackRoot],
      [x0,y-thickness/2,zFrontRoot],  [x1,y-thickness/2,zFrontTip],
      [x1,y-thickness/2,zBackTip],    [x0,y-thickness/2,zBackRoot]
    ];
    const indices = [
      0,1,2, 0,2,3, 4,6,5, 4,7,6,
      8,9,10, 8,10,11, 12,15,14, 12,14,13,
      0,4,5, 0,5,1, 3,2,6, 3,6,7,
      0,3,7, 0,7,4, 1,5,6, 1,6,2,
      8,12,13, 8,13,9, 11,10,14, 11,14,15
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts.flat(), 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const wing = mesh(geometry, wingPaint, name, null);
    return wing;
  }
  makeWing('MainWing', 1.02, 0.36, 0.19, 0.02, 0.02, 0.055);

  // 尾翼：水平安定面 + 垂直尾翼。
  makeWing('Tailplane', 0.36, 0.19, 0.12, 0.035, -0.43, 0.035);
  const fin = mesh(
    new THREE.BoxGeometry(0.045, 0.13, 0.28),
    paint, 'VerticalFin', [0, 0.105, -0.42]
  );
  fin.rotation.x = -0.12;

  // 驾驶舱：蓝青色玻璃舱罩。
  const canopy = mesh(
    new THREE.SphereGeometry(1, 16, 12),
    glass, 'CockpitCanopy', [0, 0.115, 0.13]
  );
  canopy.scale.set(0.073, 0.067, 0.17);

  // 前后舱窗，俯视时能看到清楚的深色小窗。
  for (const side of [-1, 1]) {
    const windowMesh = mesh(
      new THREE.SphereGeometry(1, 12, 8),
      darkGlass, `SideWindow${side}`, [side * 0.088, 0.075, -0.015]
    );
    windowMesh.scale.set(0.018, 0.028, 0.048);
  }

  // 两侧机翼上的简洁浅灰色条带，增加模型辨识度。
  for (const side of [-1, 1]) {
    const stripe = mesh(
      new THREE.BoxGeometry(0.13, 0.009, 0.09),
      accent, `WingStripe${side}`, [side * 0.64, 0.052, 0.055]
    );
    stripe.rotation.y = side * -0.08;
  }

  // 机头螺旋桨：两片细长桨叶，围绕机头轴旋转。
  const propeller = new THREE.Group();
  propeller.name = 'Propeller';
  propeller.position.set(0, 0.035, 0.61);
  plane.add(propeller);
  const hub = mesh(
    new THREE.SphereGeometry(0.035, 12, 10),
    propMaterial, 'PropellerHub', [0, 0, 0], propeller
  );
  hub.scale.set(0.85, 0.85, 0.65);
  for (let i = 0; i < 2; i++) {
    const blade = mesh(
      new THREE.BoxGeometry(0.042, 0.22, 0.018),
      propMaterial, `PropellerBlade${i}`, [0, i === 0 ? 0.105 : -0.105, 0], propeller
    );
    blade.rotation.z = i === 0 ? -0.12 : 0.12;
    blade.rotation.x = Math.PI / 2;
  }

  // 轻量起落架：从斜俯视角可见，纯俯视时不会过度抢眼。
  for (const side of [-1, 1]) {
    const strut = mesh(
      new THREE.CylinderGeometry(0.009, 0.012, 0.13, 8),
      propMaterial, `LandingStrut${side}`, [side * 0.24, -0.035, -0.12]
    );
    strut.rotation.z = side * -0.35;
    const wheel = mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.025, 12),
      darkGlass, `LandingWheel${side}`, [side * 0.27, -0.09, -0.13]
    );
    wheel.rotation.z = Math.PI / 2;
  }

  group.scale.setScalar(scale);
  let spin = 0;
  return {
    group,
    update(dt = 1 / 60) {
      spin += dt * 24;
      propeller.rotation.z = spin;
    }
  };
}
