# GEMINI 開發規範與注意事項

當 AI 助理（Gemini）在此專案進行開發、修改或執行任何任務時，必須嚴格遵守以下規範：

## 1. 語言規範
* **所有的文字都必須使用繁體中文**：包括文件的內容、說明檔、代碼註解、思考過程（Thinking Process）、顯示的訊息以及與使用者的對答等等，請一律使用繁體中文。

## 2. 終端命令規範
* **優先使用 PowerShell 7.x**：如果在任務中需要執行 PowerShell 指令，請務必使用系統中最新的 `pwsh`（PowerShell 7.x）版本，以確保最佳的 UTF-8 字元相容性，避免亂碼。

## 3. 檔案編碼規範
* **所有檔案儲存格式必須為 UTF-8 with BOM**：所有新增、修改或處理的文件與程式檔案，皆須確保使用 **UTF-8 加上 BOM** 的編碼格式儲存。
* **避免文字形式的 \uFEFF**：請直接以編碼格式（BOM 位元組 `0xEF, 0xBB, 0xBF`）寫入，檔案開頭**不得**出現 `\uFEFF` 轉義字串。

## 4. 檔案編碼確保機制 (強制轉檔)
* **自動編碼驗證**：在新增或編輯檔案後，請務必執行以下 PowerShell 指令，強制將編輯的檔案轉換為 UTF-8 with BOM 格式，避免編輯器工具遺漏 BOM 標記：
  ```powershell
  pwsh -Command "$content = Get-Content -Raw -Encoding utf8 '檔案路徑'; Set-Content -Path '檔案路徑' -Value $content -Encoding utf8BOM"
  ```

## 5. 自動化 Git 提交與推送
* **自動 Git Commit 與 Push**：每次進行任何檔案修改、新增、或版本更新完成後，必須自動執行 `git add`、`git commit` 以及 `git push` 上傳至遠端倉庫。
* **Commit 註解規範**：Commit 訊息（Commit Message）必須使用繁體中文撰寫，內容應簡短、清晰地摘要本次修改的具體內容。

