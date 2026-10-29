// 镜头与飞行：镜头以「呼吸」般忽快忽慢的速度向北推进，懒懒地跟着飞机左右；
// 飞机在画面中下方慢悠悠地画 S 形，转弯时压坡度；鼠标进画面就飞向鼠标所指的地方。
import * as THREE from 'three';

// 飞机飞在云顶之上，不跟云做碰撞交互
const PLANE_Y = 46;

const clamp = THREE.MathUtils.clamp;
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Rig {
  constructor(camera) {
    this.cam = camera;
    this.pitch = THREE.MathUtils.degToRad(52);
    this.dist = 158;
    this.halfFov = THREE.MathUtils.degToRad(15.5);
    this.fx = 0;
    this.fz = 0;
    this.vx = 0;
    this.vz = -4;
    this.t = 0;
    this.base = 4.0;
  }

  setMargin(m) {
    this.cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(this.halfFov) * m));
    this.cam.aspect = 1;
    this.cam.updateProjectionMatrix();
  }

  update(dt, followX) {
    this.t += dt;
    const t = this.t;
    const speed = this.base * (1 + 0.14 * Math.sin(t * 0.09) + 0.06 * Math.sin(t * 0.23 + 1.0));
    const px = this.fx;
    const tx = clamp(followX * 0.6, -14, 14);
    this.fx += (tx - this.fx) * (1 - Math.exp(-dt * 0.3));
    this.fz -= speed * dt;
    this.vx = (this.fx - px) / Math.max(dt, 1e-4);
    this.vz = -speed;
    const yaw = 0.04 * Math.sin(t * 0.043) + 0.02 * Math.sin(t * 0.11 + 2);
    const pitch = this.pitch + 0.015 * Math.sin(t * 0.061);
    const D = this.dist * (1 + 0.025 * Math.sin(t * 0.05 + 2.0));
    const h = D * Math.cos(pitch);
    this.cam.position.set(this.fx + Math.sin(yaw) * h, D * Math.sin(pitch), this.fz + Math.cos(yaw) * h);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(this.fx, 0, this.fz);
    this.cam.rotateZ(0.012 * Math.sin(t * 0.07));
    this.cam.updateMatrixWorld();
  }
}

export class Flight {
  constructor() {
    this.ray = new THREE.Raycaster();
    this.alt = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PLANE_Y);
    this.hit = new THREE.Vector3();
    this.reset(0, 0);
  }

  reset(fx, fz) {
    this.x = fx;
    this.z = fz + 30;
    this.y = PLANE_Y;
    this.heading = 0;
    this.speed = 4;
    this.bank = 0;
    this.t = Math.random() * 100;
    this.rollP = null;
    this.rollDir = 1;
    this.rollTimer = 16 + Math.random() * 14;
  }

  roll(dir) {
    if (this.rollP !== null) return;
    this.rollDir = dir;
    this.rollP = 0;
  }

  update(dt, rig, mouseNdc, camera) {
    this.t += dt;
    let tx = rig.fx + 13 * Math.sin(this.t * 0.043) + 5 * Math.sin(this.t * 0.107 + 1.3);
    let tz = rig.fz + 30 + 5 * Math.sin(this.t * 0.067 + 0.5);
    let gain = 0.22;
    if (mouseNdc) {
      this.ray.setFromCamera(mouseNdc, camera);
      if (this.ray.ray.intersectPlane(this.alt, this.hit)) {
        tx = this.hit.x;
        tz = this.hit.z;
        gain = 0.55;
      }
    }
    let vx = rig.vx * 0.5 + (tx - this.x) * gain;
    let vz = rig.vz + (tz - this.z) * gain;
    const sp = clamp(Math.hypot(vx, vz), 2.4, 11);
    const desired = Math.atan2(vx, -vz);
    const diff = wrapA(desired - this.heading);
    const maxTurn = 0.85 * dt;
    const turn = clamp(diff, -maxTurn, maxTurn);
    this.heading = wrapA(this.heading + turn);
    this.speed += (sp - this.speed) * (1 - Math.exp(-dt * 1.2));
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z -= Math.cos(this.heading) * this.speed * dt;
    this.x = clamp(this.x, rig.fx - 40, rig.fx + 40);
    const bankT = clamp((-turn / Math.max(dt, 1e-4)) * 0.9, -0.55, 0.55);
    this.bank += (bankT - this.bank) * (1 - Math.exp(-dt * 1.8));

    // 偶尔慢慢地翻一圈
    if (this.rollP === null) {
      this.rollTimer -= dt;
      if (this.rollTimer <= 0) this.roll(Math.random() < 0.5 ? 1 : -1);
    } else {
      this.rollP += dt / 3.0;
      if (this.rollP >= 1) {
        this.rollP = null;
        this.rollTimer = 18 + Math.random() * 24;
      }
    }
  }

  apply(holder) {
    let roll = 0, lift = 0, lat = 0;
    const p = this.rollP;
    if (p !== null) {
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      roll = this.rollDir * e * Math.PI * 2;
      lift = Math.sin(Math.PI * p) * 2.0;
      lat = -this.rollDir * Math.sin(Math.PI * p) * 2.4;
    }
    const rx = Math.cos(this.heading), rz = Math.sin(this.heading);
    holder.position.set(this.x + rx * lat, this.y + lift + 0.5 * Math.sin(this.t * 0.45), this.z + rz * lat);
    holder.rotation.order = 'YXZ';
    holder.rotation.y = -this.heading;
    holder.rotation.x = 0.03 * Math.sin(this.t * 0.45 + 1.2);
    holder.rotation.z = this.bank + roll;
  }

  shift(dz) {
    this.z += dz;
  }
}
