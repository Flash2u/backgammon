# Project Guidelines

## 1. 語言規範
* 所有的文字都必須使用繁體中文，包括文件的內容、說明檔以及思考的過程（Thinking Process）、顯示的訊息等等，請都要使用繁體中文。

## 2. 終端命令規範
* 如果有用到 PowerShell，請使用目前系統中最新的 PowerShell 7.x (pwsh) 版本，以確保最佳的 UTF-8 相容性。

## 3. 檔案編碼規範
* 所有的文件與程式檔案格式都要確保是 UTF-8 加上 BOM 的編碼格式，且檔案開頭不要出現這些字串 "\uFEFF"（直接以 BOM 位元組寫入而非字串）。

## 4. 自動化 Git 提交與推送
* **自動 Git Commit 與 Push**：每次進行任何檔案修改、新增、或版本更新完成後，必須自動執行 `git add`、`git commit` 以及 `git push`。
* **Commit 註解規範**：Commit 訊息（Commit Message）必須使用繁體中文撰寫，內容應簡短、清晰地摘要本次修改的具體內容。
