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
