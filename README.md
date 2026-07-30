# 文庫轉 epub

需要先安裝:
- `pandoc`
- `opencc`
- `iconv`

```bash
# 產生多個 config json，一冊一個檔案
# 存進 ./build 資料夾
# 必要時可以修改 json 檔案來調整封面/標題/輸出檔名...等
$ makeconfig.js [網址]

# 產生單一本書的 epub
# 存進 ./build 資料夾
$ wenku.js [config 路徑]

# 或者一次把所有 epub 產完
$ for file in build/*.json; do ./wenku.js "$file"; done
```

產生出來的 config JSON 檔案可以先手動調整過再跑後續轉換流程。

## 卷數編號

中文卷名（「第十一卷」）用字串排序會亂掉，所以 `makeconfig.js` 會自動把卷名轉成補零的阿拉伯數字，讓閱讀軟體照標題排序時順序正確：

| 卷名 | 輸出檔名 | epub 標題 |
| --- | --- | --- |
| 第一卷 | `書名-01.epub` | `書名 01` |
| 第十二卷 | `書名-12.epub` | `書名 12` |

卷名有多餘文字時只換掉數字部分（「第一卷 序章篇」→「01 序章篇」）；認不出數字的卷名（例如「短篇集」）維持原樣。

## 排版方向（直書／橫書）

可控制產生的 epub 是**中文直書**（垂直排版、由右至左翻頁）還是**橫書**（水平排版、由左至右翻頁），預設為橫書。

透過 config 的 `vertical` 欄位設定：

```json
{
  "outfile": "...",
  "vertical": true,   // true = 直書；false 或省略 = 橫書
  "metadata": { ... }
}
```

或用命令列參數覆蓋 config 設定（方便同一份 config 直接切換）：

```bash
$ ./wenku.js [config 路徑] --vertical     # 強制直書
$ ./wenku.js [config 路徑] --horizontal   # 強制橫書
```

直書時會額外套用 `style/vertical.css`（`writing-mode: vertical-rl`），並將 epub 的翻頁方向設為右到左。實際呈現效果依閱讀器對 EPUB3 直書的支援程度而定。

