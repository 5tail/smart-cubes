// Adapted from csTimer (https://github.com/cs0x7f/cstimer), Copyright Chen Shuang, GPL-3.0
// 移植自 csTimer `src/js/lib/mathlib.js` 的 CubieCube（方塊狀態表示與轉動代數）。
// 只搬「協議層需要的部分」：cubie ↔ facelet 轉換、18 個基本轉動、轉動相乘。
// csTimer 用於解 Kociemba 的搜尋表、對稱群等一律不搬。
//
// 用途：MoYu driver 只在初始狀態拿到一次 facelet，之後每步轉動要靠這裡的
// CubieCube 代數重建當前 facelet；QiYi driver 每包都直接帶 facelet，用不到轉動代數，
// 但初始/驗證仍共用 SOLVED_FACELET 與 fromFacelet。

/* eslint-disable no-bitwise */

// SPEC 3.2 的 54 字元 facelet：Kociemba 順序 URFDLB，實心方塊。
export const SOLVED_FACELET = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

// 每個角/邊塊佔用的 facelet index（Kociemba 標準座標，csTimer 同源）。
const C_FACELET: readonly (readonly number[])[] = [
  [8, 9, 20], // URF
  [6, 18, 38], // UFL
  [0, 36, 47], // ULB
  [2, 45, 11], // UBR
  [29, 26, 15], // DFR
  [27, 44, 24], // DLF
  [33, 53, 42], // DBL
  [35, 17, 51], // DRB
];
const E_FACELET: readonly (readonly number[])[] = [
  [5, 10], // UR
  [7, 19], // UF
  [3, 37], // UL
  [1, 46], // UB
  [32, 16], // DR
  [28, 25], // DF
  [30, 43], // DL
  [34, 52], // DB
  [23, 12], // FR
  [21, 41], // FL
  [50, 39], // BL
  [48, 14], // BR
];
const CT_FACELET: readonly number[] = [4, 13, 22, 31, 40, 49]; // 六面中心

/**
 * 方塊的 cubie 表示：8 角 + 12 邊的排列與方向。
 * ca[i] = 位置 i 的角塊：低 3 bit 是編號、高位是方向（×8）。
 * ea[i] = 位置 i 的邊塊：>>1 是編號、&1 是翻轉。
 */
export class CubieCube {
  ca: number[] = [0, 1, 2, 3, 4, 5, 6, 7];
  ea: number[] = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];

  init(ca: readonly number[], ea: readonly number[]): this {
    this.ca = ca.slice();
    this.ea = ea.slice();
    return this;
  }

  // prod = a * b（角）。
  static cornMult(a: CubieCube, b: CubieCube, prod: CubieCube): void {
    for (let corn = 0; corn < 8; corn++) {
      const ori = ((a.ca[b.ca[corn]! & 7]! >> 3) + (b.ca[corn]! >> 3)) % 3;
      prod.ca[corn] = (a.ca[b.ca[corn]! & 7]! & 7) | (ori << 3);
    }
  }

  // prod = a * b（邊）。
  static edgeMult(a: CubieCube, b: CubieCube, prod: CubieCube): void {
    for (let ed = 0; ed < 12; ed++) {
      prod.ea[ed] = a.ea[b.ea[ed]! >> 1]! ^ (b.ea[ed]! & 1);
    }
  }

  // prod = a * b（角+邊）。prod 不得與 a、b 為同一物件。
  static cubeMult(a: CubieCube, b: CubieCube, prod: CubieCube): void {
    CubieCube.cornMult(a, b, prod);
    CubieCube.edgeMult(a, b, prod);
  }

  /** 由 54 字元 facelet 還原 cubie；非法輸入回傳 -1。 */
  fromFacelet(facelet: string): this | -1 {
    let count = 0;
    const f: number[] = [];
    const centers =
      facelet[4]! + facelet[13]! + facelet[22]! + facelet[31]! + facelet[40]! + facelet[49]!;
    for (let i = 0; i < 54; i++) {
      f[i] = centers.indexOf(facelet[i]!);
      if (f[i] === -1) return -1;
      count += 1 << (f[i]! << 2);
    }
    if (count !== 0x999999) return -1;
    for (let i = 0; i < 8; i++) {
      let ori = 0;
      for (; ori < 3; ori++) {
        if (f[C_FACELET[i]![ori]!] === 0 || f[C_FACELET[i]![ori]!] === 3) break;
      }
      const col1 = f[C_FACELET[i]![(ori + 1) % 3]!]!;
      const col2 = f[C_FACELET[i]![(ori + 2) % 3]!]!;
      for (let j = 0; j < 8; j++) {
        if (col1 === ~~(C_FACELET[j]![1]! / 9) && col2 === ~~(C_FACELET[j]![2]! / 9)) {
          this.ca[i] = j | ((ori % 3) << 3);
          break;
        }
      }
    }
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 12; j++) {
        if (f[E_FACELET[i]![0]!] === ~~(E_FACELET[j]![0]! / 9) && f[E_FACELET[i]![1]!] === ~~(E_FACELET[j]![1]! / 9)) {
          this.ea[i] = j << 1;
          break;
        }
        if (f[E_FACELET[i]![0]!] === ~~(E_FACELET[j]![1]! / 9) && f[E_FACELET[i]![1]!] === ~~(E_FACELET[j]![0]! / 9)) {
          this.ea[i] = (j << 1) | 1;
          break;
        }
      }
    }
    return this;
  }

  /** 由 cubie 產生 54 字元 facelet（Kociemba URFDLB）。 */
  toFaceCube(): string {
    const f: number[] = [];
    for (let i = 0; i < 54; i++) f[i] = i;
    for (let c = 0; c < 8; c++) {
      const j = this.ca[c]! & 0x7;
      const ori = this.ca[c]! >> 3;
      for (let n = 0; n < 3; n++) f[C_FACELET[c]![(n + ori) % 3]!] = C_FACELET[j]![n]!;
    }
    for (let e = 0; e < 12; e++) {
      const j = this.ea[e]! >> 1;
      const ori = this.ea[e]! & 1;
      for (let n = 0; n < 2; n++) f[E_FACELET[e]![(n + ori) % 2]!] = E_FACELET[j]![n]!;
    }
    for (let i = 0; i < 6; i++) f[CT_FACELET[i]!] = CT_FACELET[i]!;
    const ts = 'URFDLB';
    const out: string[] = [];
    for (let i = 0; i < 54; i++) out[i] = ts[~~(f[i]! / 9)]!;
    return out.join('');
  }
}

/**
 * 18 個基本轉動的 cubie（index = axis*3 + power）。
 * axis：0=U 1=R 2=F 3=D 4=L 5=B；power：0=順 90°、1=180°、2=逆 90°。
 * 對外表記法：`'URFDLB'[axis] + ' 2\''[power]`。
 */
export const moveCube: CubieCube[] = (() => {
  const mc: CubieCube[] = [];
  for (let i = 0; i < 18; i++) mc[i] = new CubieCube();
  mc[0]!.init([3, 0, 1, 2, 4, 5, 6, 7], [6, 0, 2, 4, 8, 10, 12, 14, 16, 18, 20, 22]); // U
  mc[3]!.init([20, 1, 2, 8, 15, 5, 6, 19], [16, 2, 4, 6, 22, 10, 12, 14, 8, 18, 20, 0]); // R
  mc[6]!.init([9, 21, 2, 3, 16, 12, 6, 7], [0, 19, 4, 6, 8, 17, 12, 14, 3, 11, 20, 22]); // F
  mc[9]!.init([0, 1, 2, 3, 5, 6, 7, 4], [0, 2, 4, 6, 10, 12, 14, 8, 16, 18, 20, 22]); // D
  mc[12]!.init([0, 10, 22, 3, 4, 17, 13, 7], [0, 2, 20, 6, 8, 10, 18, 14, 16, 4, 12, 22]); // L
  mc[15]!.init([0, 1, 11, 23, 4, 5, 18, 14], [0, 2, 4, 23, 8, 10, 12, 21, 16, 18, 7, 15]); // B
  for (let a = 0; a < 18; a += 3) {
    for (let p = 0; p < 2; p++) {
      CubieCube.cubeMult(mc[a + p]!, mc[a]!, mc[a + p + 1]!);
    }
  }
  return mc;
})();

/**
 * 由對外轉動表記字串（如 "R"、"U'"、"F2"）換算 moveCube 的 index。
 * 未知字串回傳 -1。
 */
export function moveStringToIndex(move: string): number {
  const axis = 'URFDLB'.indexOf(move[0]!);
  if (axis < 0) return -1;
  const suffix = move[1] ?? '';
  const power = suffix === '' ? 0 : suffix === '2' ? 1 : suffix === "'" ? 2 : -1;
  if (power < 0) return -1;
  return axis * 3 + power;
}
