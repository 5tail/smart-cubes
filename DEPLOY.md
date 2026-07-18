# DEPLOY.md — 展示頁自架部署指南

把 `demo/` 展示頁架到**自己的網站**（手動 build + 上傳靜態檔）的步驟。
以 `https://maru.tw/app/smartcubes` 為例；換成其他網域/路徑時，改「需要手工修改的文字」
一節列出的地方即可。

> GitHub Pages（https://5tail.github.io/smart-cubes/ ）**不適用本指南**——
> 那條路是 push main 後由 `.github/workflows/pages.yml` 自動 build + 部署，不用手動操作。

---

## 前提

- 你的網站必須是 **HTTPS**。Web Bluetooth 只在 secure context 下存在，
  http 頁面連 `navigator.bluetooth` 都沒有，展示頁會直接顯示不支援。
- 主機只要能放**靜態檔案**就夠（純前端、無後端、無資料庫）。
- 本機需要 Node.js 20+（build 用；主機上不需要 Node）。

## 步驟

### 1. 取得原始碼並安裝依賴

```bash
git clone https://github.com/5tail/smart-cubes && cd smart-cubes
npm install                # 根目錄依賴必裝：demo 會 bundle ../src，其中 import gan-web-bluetooth
cd demo && npm install
```

### 2. 以正確的 base 路徑 build

```bash
npm run build -- --base=/app/smartcubes/
```

產出在 `demo/dist/`。

**base 是最重要的一個參數**：所有 JS/CSS 資源網址都以它為前綴。填錯的症狀是
「開頁面一片白、console 一排 404」。規則：

| 部署位置 | `--base` 值 |
|---|---|
| `https://maru.tw/app/smartcubes` | `/app/smartcubes/` |
| 網域根目錄（如 `https://cube.example.com/`） | `/` |

頭尾都要斜線。用 CLI 參數覆寫即可，**不需要**改 `demo/vite.config.ts`
（那裡的 `/smart-cubes/` 是給 GitHub Pages 用的，請保留）。

### 3. 上傳

把 `demo/dist/` **裡面的內容**（`index.html`、`assets/` 等）上傳到伺服器上
對應 `https://maru.tw/app/smartcubes/` 的目錄——是內容，不是 `dist` 資料夾本身
（傳整個資料夾會變成 `…/smartcubes/dist/index.html`，路徑就對不上了）。

單頁、無前端路由，**不需要**任何 rewrite/fallback 規則；一般虛擬主機 FTP 丟上去即可。
nginx 自架的話一個靜態對應就好：

```nginx
location /app/smartcubes/ { alias /var/www/smartcubes/; }
```

### 4. 驗證

1. 開 `https://maru.tw/app/smartcubes/`：頁面完整呈現、瀏覽器 console 無 404。
2. 用桌機 Chrome/Edge 或 Android Chrome 按「連線」：能跳出藍牙裝置選擇視窗即部署成功
   （之後的方塊功能與部署無關）。

---

## 需要手工修改的文字

| # | 位置 | 改什麼 | 必要性 |
|---|---|---|---|
| 1 | build 指令的 `--base=/app/smartcubes/` | 換成你的實際子路徑（頭尾斜線） | **必改**，唯一必要項 |
| 2 | `demo/index.html` 的 `<title>` 與 `<h1>`（maru-smartcube） | 想換站名才改 | 選改 |
| 3 | `demo/index.html` 頁尾的 GitHub 連結（指向 5tail/smart-cubes） | 想指到自己的 fork 才改 | 選改 |

改了 2/3 記得重跑步驟 2 的 build。
（GPL-3.0 提醒：公開散佈修改版時，需以同授權提供對應原始碼，保留頁尾出處連結是最省事的做法。）

## 注意重點

- **快取設定**：`assets/` 內檔名帶 hash，可放長快取（如 `Cache-Control: max-age=31536000`）；
  `index.html` 請設 `no-cache`，否則日後更新版本，使用者會拿到舊頁面配新資源的殘局。
- **MAC 記憶跟著網域走**：localStorage 以 origin 隔離，之前在 github.io 記住的方塊 MAC
  不會帶到 maru.tw，每顆方塊在新站第一次連線後會重新記住，屬正常現象。
- **Chrome 實驗旗標是使用者端設定**（`chrome://flags/#enable-experimental-web-platform-features`，
  GAN/QiYi 自動抓 MAC 用），跟著瀏覽器不跟網站，部署端不用做任何事；
  沒開旗標的使用者會由頁面內建的 ⚡ 引導對話框自助設定。
- **瀏覽器支援**：桌機 Chrome/Edge、Android Chrome。iOS 全系不支援
  （WebKit 無 Web Bluetooth，平台限制，見 BACKLOG）；頁面會自動顯示不支援引導。

## 日後更新

repo 有新版時（看 [CHANGELOG.md](CHANGELOG.md) 決定要不要跟）：

```bash
git pull
npm install && cd demo && npm install     # 依賴有變時才需要，跑一次無害
npm run build -- --base=/app/smartcubes/
```

再重傳一次 `demo/dist/` 內容即可（先清掉主機上的舊 `assets/` 可避免殘檔堆積）。
