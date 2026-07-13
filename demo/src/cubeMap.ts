// 2D 展開圖：把 Kociemba URFDLB 54 字元 facelets 畫成方塊淨圖。
// 依 SPEC「2D 展開圖元件寫在 demo，不進套件」。

// 標準 WCA 配色（U 白、R 紅、F 綠、D 黃、L 橙、B 藍）。2D/3D 元件共用。
export const COLORS: Record<string, string> = {
  U: '#ffffff',
  R: '#b71234',
  F: '#009b48',
  D: '#ffd500',
  L: '#ff5800',
  B: '#0046ad',
};

// facelets 切片順序（每面 9 格）與各面在 12×9 淨圖網格上的左上角 [row, col]（0-based）。
const FACES: ReadonlyArray<{ key: string; row: number; col: number }> = [
  { key: 'U', row: 0, col: 3 },
  { key: 'R', row: 3, col: 6 },
  { key: 'F', row: 3, col: 3 },
  { key: 'D', row: 6, col: 3 },
  { key: 'L', row: 3, col: 0 },
  { key: 'B', row: 3, col: 9 },
];

const SOLVED =
  'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

/**
 * 把 facelets 字串渲染進 root。非 54 字元則畫成問號灰格（未知狀態）。
 */
export function renderFacelets(root: HTMLElement, facelets: string): void {
  const valid = facelets.length === 54;
  root.replaceChildren();

  FACES.forEach(({ key, row, col }, faceIndex) => {
    for (let i = 0; i < 9; i++) {
      const ch = valid ? facelets[faceIndex * 9 + i]! : '?';
      const cell = document.createElement('div');
      cell.className = 'sticker';
      cell.style.gridRowStart = String(row + Math.floor(i / 3) + 1);
      cell.style.gridColumnStart = String(col + (i % 3) + 1);
      cell.style.background = COLORS[ch] ?? '#4a4f59';
      cell.title = `${key}${i}: ${ch}`;
      root.appendChild(cell);
    }
  });
}

export function renderSolved(root: HTMLElement): void {
  renderFacelets(root, SOLVED);
}
