// 3D 立體方塊的純幾何映射（無 DOM）：facelet index ↔ (cubie 座標, 面法向)，
// 以及 WCA 轉動 → 轉層旋轉的規格。DOM 渲染在 cube3d.ts；本檔可單元測試
// （tests/cube3d-map.test.ts 以 CubieCube 轉動代數交叉驗證 18 個基本轉動）。
//
// 座標系（右手系，方塊座標）：x 由 L(-1) 到 R(+1)、y 由 D(-1) 到 U(+1)、z 由 B(-1) 到 F(+1)。
// facelet index 為 Kociemba URFDLB 順序（SPEC 3.2），每面 9 格 row-major。

export type Vec3 = readonly [number, number, number];

export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';
export const FACE_ORDER: readonly Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

/** 各面的外向法向量（方塊座標）。 */
export const FACE_NORMALS: Record<Face, Vec3> = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
};

/**
 * facelet index（0–53）→ 貼紙所在 cubie 座標與面法向。
 * 各面 row/col 與座標的關係由 Kociemba 面配置推得，並經 CubieCube 角/邊
 * facelet 表（C_FACELET/E_FACELET）交叉驗證。
 */
export function faceletToCubie(index: number): { pos: Vec3; normal: Vec3 } {
  const face = FACE_ORDER[Math.floor(index / 9)]!;
  const i = index % 9;
  const r = Math.floor(i / 3);
  const c = i % 3;
  let pos: Vec3;
  switch (face) {
    case 'U':
      pos = [c - 1, 1, r - 1];
      break;
    case 'R':
      pos = [1, 1 - r, 1 - c];
      break;
    case 'F':
      pos = [c - 1, 1 - r, 1];
      break;
    case 'D':
      pos = [c - 1, -1, 1 - r];
      break;
    case 'L':
      pos = [-1, 1 - r, c - 1];
      break;
    case 'B':
      pos = [1 - c, 1 - r, -1];
      break;
  }
  return { pos, normal: FACE_NORMALS[face] };
}

/** (cubie 座標, 面法向) → facelet index；法向非六面之一或座標不在該面時回傳 -1。 */
export function cubieToFacelet(pos: Vec3, normal: Vec3): number {
  const [x, y, z] = pos;
  const face = FACE_ORDER.find((f) => {
    const n = FACE_NORMALS[f];
    return n[0] === normal[0] && n[1] === normal[1] && n[2] === normal[2];
  });
  if (!face) return -1;
  let r: number;
  let c: number;
  switch (face) {
    case 'U':
      if (y !== 1) return -1;
      r = z + 1;
      c = x + 1;
      break;
    case 'R':
      if (x !== 1) return -1;
      r = 1 - y;
      c = 1 - z;
      break;
    case 'F':
      if (z !== 1) return -1;
      r = 1 - y;
      c = x + 1;
      break;
    case 'D':
      if (y !== -1) return -1;
      r = 1 - z;
      c = x + 1;
      break;
    case 'L':
      if (x !== -1) return -1;
      r = 1 - y;
      c = z + 1;
      break;
    case 'B':
      if (z !== -1) return -1;
      r = 1 - y;
      c = 1 - x;
      break;
  }
  return FACE_ORDER.indexOf(face) * 9 + r * 3 + c;
}

/**
 * 對向量做整數 90° 旋轉：繞單位軸 axis 右手旋轉 quarterTurns × (-90°)。
 * quarterTurns 對應 WCA 記法：1 = 順時針 90°（由該面外側看）、2 = 180°、-1（或 3）= 逆時針。
 * 註：WCA「順時針」= 由外向法向看向方塊，即右手系繞外向法向的 -90°。
 */
export function rotateVec(axis: Vec3, quarterTurns: number, v: Vec3): Vec3 {
  const theta = ((-quarterTurns % 4) + 4) % 4; // -90° 的次數，正規化到 0–3
  const cos = [1, 0, -1, 0][theta]!;
  const sin = [0, 1, 0, -1][theta]!;
  const [ax, ay, az] = axis;
  const [x, y, z] = v;
  const dot = ax * x + ay * y + az * z;
  const cx = ay * z - az * y;
  const cy = az * x - ax * z;
  const cz = ax * y - ay * x;
  // Rodrigues：v' = v·cosθ + (a×v)·sinθ + a(a·v)(1-cosθ)。「+ 0」把 -0 正規化成 0。
  return [
    x * cos + cx * sin + ax * dot * (1 - cos) + 0,
    y * cos + cy * sin + ay * dot * (1 - cos) + 0,
    z * cos + cz * sin + az * dot * (1 - cos) + 0,
  ];
}

export interface MoveRotation {
  face: Face;
  /** 轉層的旋轉軸 = 該面外向法向（方塊座標）。 */
  axis: Vec3;
  /** 順時針 90° 的次數：1（''）、2（'2'）、-1（"'"）。 */
  quarterTurns: number;
}

/** WCA 轉動字串（"R"、"U'"、"F2"）→ 轉層旋轉規格；未知字串回傳 null。 */
export function moveToRotation(move: string): MoveRotation | null {
  const face = move[0] as Face | undefined;
  if (!face || !FACE_ORDER.includes(face)) return null;
  const suffix = move.slice(1);
  const quarterTurns = suffix === '' ? 1 : suffix === '2' ? 2 : suffix === "'" ? -1 : 0;
  if (quarterTurns === 0) return null;
  return { face, axis: FACE_NORMALS[face], quarterTurns };
}

/** cubie 是否屬於某轉動的轉層（pos 在該面法向上的分量 = 1）。 */
export function inMoveLayer(pos: Vec3, rotation: MoveRotation): boolean {
  const n = rotation.axis;
  return pos[0] * n[0] + pos[1] * n[1] + pos[2] * n[2] === 1;
}

/**
 * 把一步轉動以「純幾何」套到 54 字元 facelets：轉層內每張貼紙旋轉到新位置。
 * 供測試與 CubieCube 代數交叉驗證；渲染層的顏色重繪也可直接用。
 */
export function applyMoveGeometric(facelets: string, move: string): string | null {
  if (facelets.length !== 54) return null;
  const rot = moveToRotation(move);
  if (!rot) return null;
  const out = facelets.split('');
  for (let i = 0; i < 54; i++) {
    const { pos, normal } = faceletToCubie(i);
    if (!inMoveLayer(pos, rot)) continue;
    const j = cubieToFacelet(
      rotateVec(rot.axis, rot.quarterTurns, pos),
      rotateVec(rot.axis, rot.quarterTurns, normal),
    );
    out[j] = facelets[i]!;
  }
  return out.join('');
}

// ---------------------------------------------------------------------------
// 陀螺儀姿態（gyro）：GAN quaternion → CSS 3D transform（demo，SPEC §5 ADR 2026-07-13）
// ---------------------------------------------------------------------------
//
// GAN quaternion 座標系（gan-web-bluetooth gan-cube-protocol.ts）：右手系，
// +X = Red(R 面)、+Y = Blue(B 面)、+Z = White(U 面)。
// 本檔方塊座標系：+X = R、+Y = U、+Z = F。兩者差一個固定基變換 C（繞 X 軸 -90°）：
//   GAN +X(R)  → ours +X          (1,0,0)
//   GAN +Y(B)  → ours -Z (B 面)   (0,0,-1)
//   GAN +Z(U)  → ours +Y (U 面)   (0,1,0)
// 旋轉 quaternion 在座標基變換下，向量部分跟著變換、純量不變：q_ours=(C·v, w)。

/** 單位四元數 [x, y, z, w]（w 為純量）。 */
export type Quat = readonly [number, number, number, number];

export const QUAT_IDENTITY: Quat = [0, 0, 0, 1];

/** Hamilton 乘積 a ⊗ b（先做 b 再做 a 的旋轉合成）。 */
export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** 單位四元數的逆 = 共軛（向量部取負）。 */
export function quatConjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

/** 正規化為單位四元數；零向量退回 identity。 */
export function quatNormalize(q: Quat): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  if (n === 0) return QUAT_IDENTITY;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** 把 GAN 座標系的姿態四元數轉到本檔方塊座標系（基變換 C：GAN +Y→-Z、+Z→+Y）。 */
export function ganQuatToCubeQuat(q: Quat): Quat {
  const [x, y, z, w] = q;
  // C·(x,y,z) = (x, z, -y)
  return [x, z, -y, w];
}

/**
 * 單位四元數 → 3×3 旋轉矩陣（row-major，右手系、方塊座標）。
 * 回傳 [m00,m01,m02, m10,m11,m12, m20,m21,m22]。
 */
export function quatToMatrix3(q: Quat): number[] {
  const [x, y, z, w] = quatNormalize(q);
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  return [
    1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy),
    2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx),
    2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy),
  ];
}

/**
 * 方塊座標系的姿態四元數 → CSS `matrix3d(...)` 字串。
 * CSS 的 Y 軸朝下（螢幕座標），故對 y-up 的旋轉矩陣做鏡射共軛 M_css = S·M·S，
 * S = diag(1,-1,1)（等效：所有含單一 y 索引的非對角項變號）。matrix3d 為 column-major。
 */
export function cubeQuatToCssMatrix(q: Quat): string {
  const m = quatToMatrix3(q);
  // S·M·S：y 列與 y 欄各變號一次 → 交叉項 m01,m10,m12,m21 變號，其餘不變。
  const r00 = m[0]!, r01 = -m[1]!, r02 = m[2]!;
  const r10 = -m[3]!, r11 = m[4]!, r12 = -m[5]!;
  const r20 = m[6]!, r21 = -m[7]!, r22 = m[8]!;
  // column-major 4×4（旋轉，無平移）。
  const c = [r00, r10, r20, 0, r01, r11, r21, 0, r02, r12, r22, 0, 0, 0, 0, 1];
  return `matrix3d(${c.map((n) => (Object.is(n, -0) ? 0 : Number(n.toFixed(6)))).join(', ')})`;
}

/**
 * GAN 姿態四元數 → CSS transform，含「校正基準」：顯示 baseline 的逆乘後的相對旋轉，
 * 故按下校正（把當前姿態設為 baseline）時方塊回正（identity）。
 */
export function ganQuatToCssTransform(current: Quat, baseline: Quat = QUAT_IDENTITY): string {
  const relGan = quatMultiply(current, quatConjugate(baseline));
  return cubeQuatToCssMatrix(ganQuatToCubeQuat(relGan));
}

/**
 * 視角 transform：orbit（拖曳/觸控環視）與 gyro 姿態的組合。
 *
 * - gyro 關閉：純 orbit（`rotateX(pitch) rotateY(yaw)`），與舊行為相同。
 * - gyro 開啟：orbit 疊在 gyro 姿態**外層**（CSS 左式先套 → 螢幕軸環視），實體方塊控制
 *   姿態、拖曳環視鏡頭，兩者獨立不打架（可拖去看背面）。pitch/yaw 皆為 0 時輸出與
 *   `ganQuatToCssTransform` 全等（校正回正不變式不受影響）。
 */
export function viewTransform(
  gyroMode: boolean,
  pitch: number,
  yaw: number,
  current: Quat,
  baseline: Quat = QUAT_IDENTITY,
): string {
  const orbit = `rotateX(${pitch}deg) rotateY(${yaw}deg)`;
  if (!gyroMode) return orbit;
  const gyro = ganQuatToCssTransform(current, baseline);
  return pitch === 0 && yaw === 0 ? gyro : `${orbit} ${gyro}`;
}
