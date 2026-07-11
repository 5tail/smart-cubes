import { describe, it, expect } from 'vitest';
import { CubieCube, moveCube, moveStringToIndex, SOLVED_FACELET } from '../src/utils/facelets.js';

// 期望值由 csTimer mathlib.CubieCube 在 Node 直接產生（同源 oracle），
// 另加代數不變量（逆轉還原、四轉還原、sexy×6 還原）做獨立正確性檢查。
function apply(seq: number[]): string {
  let a = new CubieCube();
  let b = new CubieCube();
  for (const m of seq) {
    CubieCube.cubeMult(a, moveCube[m]!, b);
    [a, b] = [b, a];
  }
  return a.toFaceCube();
}

describe('CubieCube 轉動代數', () => {
  it('solved cube 的 facelet 即 SOLVED_FACELET', () => {
    expect(new CubieCube().toFaceCube()).toBe(SOLVED_FACELET);
  });

  it('單步轉動符合 csTimer 產生的 facelet', () => {
    expect(apply([moveStringToIndex('U')])).toBe(
      'UUUUUUUUUBBBRRRRRRRRRFFFFFFDDDDDDDDDFFFLLLLLLLLLBBBBBB',
    );
    expect(apply([moveStringToIndex('R')])).toBe(
      'UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB',
    );
    expect(apply([moveStringToIndex('F')])).toBe(
      'UUUUUULLLURRURRURRFFFFFFFFFRRRDDDDDDLLDLLDLLDBBBBBBBBB',
    );
    expect(apply([moveStringToIndex("U'")])).toBe(
      'UUUUUUUUUFFFRRRRRRLLLFFFFFFDDDDDDDDDBBBLLLLLLRRRBBBBBB',
    );
  });

  it('多步序列 R U F\' 符合 csTimer 產生的 facelet', () => {
    const seq = ['R', 'U', "F'"].map(moveStringToIndex);
    expect(apply(seq)).toBe('UUUUUUURRBBBDRRDRRRDDRFFRFFDLLDDBDDBFFFLLFLLFLLLUBBUBB');
  });

  it('每一面：轉一步再逆轉一步回到 solved', () => {
    for (const face of 'URFDLB') {
      expect(apply([moveStringToIndex(face), moveStringToIndex(face + "'")])).toBe(SOLVED_FACELET);
    }
  });

  it('每一面：同向轉四次回到 solved', () => {
    for (const face of 'URFDLB') {
      const m = moveStringToIndex(face);
      expect(apply([m, m, m, m])).toBe(SOLVED_FACELET);
    }
  });

  it('sexy move (R U R\' U\') ×6 回到 solved', () => {
    const sexy = ['R', 'U', "R'", "U'"].map(moveStringToIndex);
    expect(apply([...sexy, ...sexy, ...sexy, ...sexy, ...sexy, ...sexy])).toBe(SOLVED_FACELET);
  });

  it('fromFacelet 與 toFaceCube round-trip', () => {
    const scrambled = apply(['R', 'U', "F'"].map(moveStringToIndex));
    const cube = new CubieCube();
    expect(cube.fromFacelet(scrambled)).toBe(cube);
    expect(cube.toFaceCube()).toBe(scrambled);
  });

  it('fromFacelet 對非法輸入回傳 -1', () => {
    expect(new CubieCube().fromFacelet('X'.repeat(54))).toBe(-1);
    expect(new CubieCube().fromFacelet(SOLVED_FACELET.slice(0, 53))).toBe(-1);
  });

  it('moveStringToIndex：合法/非法對應', () => {
    expect(moveStringToIndex('U')).toBe(0);
    expect(moveStringToIndex('U2')).toBe(1);
    expect(moveStringToIndex("U'")).toBe(2);
    expect(moveStringToIndex('B')).toBe(15);
    expect(moveStringToIndex('X')).toBe(-1);
    expect(moveStringToIndex('U3')).toBe(-1);
  });
});
