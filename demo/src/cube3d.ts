// 3D 立體方塊元件（純 CSS 3D transforms，零依賴 — SPEC §5 ADR 2026-07-13）。
// 依 SPEC「視覺化元件寫在 demo，不進套件」。
//
// 狀態模型（ADR）：`facelets` 事件為權威（setFacelets）；`move` 事件驅動轉層動畫
// 與本地預測（applyMove，CubieCube 代數）。權威與預測不符時以權威覆蓋（snap）。
//
// 座標轉換：方塊座標為右手系（y 朝上），CSS 3D 的 Y 軸朝下 —— 位置取 Y = -y，
// 旋轉則依鏡射共軛 R(v,θ) ↦ R((vx,-vy,vz), -θ) 轉成 rotate3d 參數。

import { CubieCube, moveCube, moveStringToIndex, SOLVED_FACELET } from '../../src/utils/facelets';
import { COLORS } from './cubeMap';
import {
  FACE_ORDER,
  FACE_NORMALS,
  cubieToFacelet,
  moveToRotation,
  inMoveLayer,
  viewTransform,
  QUAT_IDENTITY,
  type Vec3,
  type Quat,
} from './cube3dMap';

const CUBIE = 46; // px：單一 cubie 邊長
const TURN_MS = 130; // 單步轉層動畫時長
const MAX_QUEUE = 3; // 動畫積壓超過此數（快轉）→ 放棄動畫直接重繪

/** 各面貼紙的 CSS 朝向（把預設面向 +Z 的平面轉向該面外向法向）。 */
const FACE_CSS: Record<string, string> = {
  U: 'rotateX(90deg)',
  D: 'rotateX(-90deg)',
  F: '',
  B: 'rotateY(180deg)',
  R: 'rotateY(90deg)',
  L: 'rotateY(-90deg)',
};

interface CubieEl {
  pos: Vec3;
  el: HTMLDivElement;
  baseTransform: string;
}

export interface Cube3d {
  /** 權威狀態（facelets 事件）。與本地預測一致時忽略；不一致時取消動畫並覆蓋。 */
  setFacelets(facelets: string): void;
  /** move 事件：轉層動畫 + 本地預測。 */
  applyMove(move: string): void;
  /** gyro 事件：更新方塊姿態（僅 gyro 模式時會反映到畫面）。 */
  setOrientation(quaternion: Quat): void;
  /**
   * 切換 gyro 姿態模式：on 時方塊朝向由 setOrientation 驅動（當前姿態設為基準、環視角歸零）。
   * 拖曳/觸控環視兩種模式皆可用：gyro 模式下環視角疊在姿態外層（螢幕軸），可拖去看背面。
   */
  setGyroMode(on: boolean): void;
  /** 把當前姿態設為「正面」基準並歸零環視角（gyro 模式下按下即回正）。 */
  calibrate(): void;
}

/** 以 CubieCube 代數把一步轉動套到 facelets；輸入非法時回傳 null。 */
function applyMoveAlgebraic(facelets: string, move: string): string | null {
  const idx = moveStringToIndex(move);
  if (idx < 0) return null;
  const cc = new CubieCube().fromFacelet(facelets);
  if (cc === -1) return null;
  const next = new CubieCube();
  CubieCube.cubeMult(cc, moveCube[idx]!, next);
  return next.toFaceCube();
}

export function createCube3d(root: HTMLElement): Cube3d {
  root.classList.add('cube3d-scene');
  root.style.setProperty('--cubie', `${CUBIE}px`);
  root.title = '拖曳／觸控旋轉視角';
  const cubeEl = document.createElement('div');
  cubeEl.className = 'cube3d';
  root.appendChild(cubeEl);

  // --- 建 26 個 cubie（跳過看不見的中心 (0,0,0)），每個 cubie 6 面。 ---
  const cubies: CubieEl[] = [];
  const stickers: HTMLDivElement[] = []; // index = facelet index 0–53
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue;
        const pos: Vec3 = [x, y, z];
        const el = document.createElement('div');
        el.className = 'cubie';
        const baseTransform = `translate3d(${x * CUBIE}px, ${-y * CUBIE}px, ${z * CUBIE}px)`;
        el.style.transform = baseTransform;
        for (const face of FACE_ORDER) {
          const faceEl = document.createElement('div');
          faceEl.style.transform = `${FACE_CSS[face]} translateZ(${CUBIE / 2}px)`.trim();
          const idx = cubieToFacelet(pos, FACE_NORMALS[face]);
          if (idx >= 0) {
            faceEl.className = 'cubie-face cubie-sticker';
            stickers[idx] = faceEl;
          } else {
            faceEl.className = 'cubie-face cubie-inner';
          }
          el.appendChild(faceEl);
        }
        cubeEl.appendChild(el);
        cubies.push({ pos, el, baseTransform });
      }
    }
  }

  // --- 上色 ---
  let displayed = SOLVED_FACELET; // 目前畫面上的狀態
  let logical = SOLVED_FACELET; // 所有已收 move 套用後的狀態（本地預測）
  function paint(facelets: string): void {
    const valid = facelets.length === 54;
    for (let i = 0; i < 54; i++) {
      const ch = valid ? facelets[i]! : '?';
      stickers[i]!.style.background = COLORS[ch] ?? '#4a4f59';
    }
    displayed = facelets;
  }
  paint(displayed);

  // --- 方塊朝向：orbit（拖曳/觸控環視）+ gyro（陀螺儀姿態）可疊加 ---
  // gyro 關閉：純 orbit（pitch/yaw）。gyro 開啟：實體方塊控制姿態、拖曳環視鏡頭
  // （gyroPitch/gyroYaw 疊在姿態外層），兩組環視角獨立、切換模式互不污染。
  let pitch = -24;
  let yaw = -38;
  let gyroPitch = 0; // gyro 模式下的環視角（進入模式/校正時歸零 = 正面直視）
  let gyroYaw = 0;
  let gyroMode = false;
  let currentQuat: Quat = QUAT_IDENTITY; // 最新 gyro 姿態（GAN 座標系）
  let baselineQuat: Quat = QUAT_IDENTITY; // 校正基準（按「校正正面」時 = 當前姿態）
  function applyView(): void {
    cubeEl.style.transform = gyroMode
      ? viewTransform(true, gyroPitch, gyroYaw, currentQuat, baselineQuat)
      : viewTransform(false, pitch, yaw, QUAT_IDENTITY);
  }
  applyView();
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  root.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    root.setPointerCapture(e.pointerId);
  });
  root.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dYaw = (e.clientX - lastX) * 0.5;
    const dPitch = (e.clientY - lastY) * 0.5;
    if (gyroMode) {
      gyroYaw += dYaw;
      gyroPitch = Math.max(-90, Math.min(90, gyroPitch - dPitch));
    } else {
      yaw += dYaw;
      pitch = Math.max(-90, Math.min(90, pitch - dPitch));
    }
    lastX = e.clientX;
    lastY = e.clientY;
    applyView();
  });
  const endDrag = (): void => {
    dragging = false;
  };
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);

  // --- 轉層動畫佇列 ---
  const queue: string[] = [];
  let animating = false;
  let animGeneration = 0; // snap 時遞增，讓進行中的 rAF 迴圈自行終止

  function snapTo(facelets: string): void {
    animGeneration += 1;
    animating = false;
    queue.length = 0;
    for (const c of cubies) c.el.style.transform = c.baseTransform;
    paint(facelets);
  }

  function pump(): void {
    if (animating) return;
    const move = queue.shift();
    if (move === undefined) return;
    if (queue.length >= MAX_QUEUE) {
      // 快轉積壓：放棄動畫，直接跳到預測狀態。
      snapTo(logical);
      return;
    }
    const rot = moveToRotation(move);
    const after = applyMoveAlgebraic(displayed, move);
    if (!rot || after === null) {
      // 目前畫面不是合法狀態（例如初始未知）→ 略過動畫，等權威 facelets。
      pump();
      return;
    }
    animating = true;
    const gen = ++animGeneration;
    const layer = cubies.filter((c) => inMoveLayer(c.pos, rot));
    // 鏡射共軛：方塊座標繞 axis 轉 -90°×q ↦ CSS rotate3d((ax,-ay,az), +90°×q)。
    const [ax, ay, az] = rot.axis;
    const target = 90 * rot.quarterTurns;
    const start = performance.now();
    const step = (now: number): void => {
      if (gen !== animGeneration) return; // 已被 snap 取消
      const t = Math.min(1, (now - start) / TURN_MS);
      const eased = 1 - (1 - t) * (1 - t); // ease-out
      const angle = target * eased;
      for (const c of layer) {
        c.el.style.transform = `rotate3d(${ax}, ${-ay}, ${az}, ${angle}deg) ${c.baseTransform}`;
      }
      if (t < 1) {
        requestAnimationFrame(step);
        return;
      }
      for (const c of layer) c.el.style.transform = c.baseTransform;
      paint(after);
      animating = false;
      pump();
    };
    requestAnimationFrame(step);
  }

  return {
    setFacelets(facelets: string): void {
      if (facelets === logical) return; // 與本地預測一致：僅為確認，讓動畫自然播完
      logical = facelets;
      snapTo(facelets);
    },
    applyMove(move: string): void {
      const next = applyMoveAlgebraic(logical, move);
      if (next === null) return; // 尚無合法狀態可預測，等權威 facelets
      logical = next;
      queue.push(move);
      pump();
    },
    setOrientation(quaternion: Quat): void {
      currentQuat = quaternion;
      if (gyroMode) applyView();
    },
    setGyroMode(on: boolean): void {
      gyroMode = on;
      if (on) {
        baselineQuat = currentQuat; // 開啟即以當前姿態為正面基準
        gyroPitch = 0; // 環視角歸零：正面直視（拖曳後可再環視）
        gyroYaw = 0;
      }
      applyView();
    },
    calibrate(): void {
      baselineQuat = currentQuat;
      gyroPitch = 0; // 「回正」= 姿態基準 + 環視角一起歸正
      gyroYaw = 0;
      if (gyroMode) applyView();
    },
  };
}
