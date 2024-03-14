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

