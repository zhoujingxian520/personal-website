@echo off
chcp 65001 >nul
cd /d "%~dp0"
set ASTRO_TELEMETRY_DISABLED=1
if not exist node_modules (
  call npm.cmd ci --no-audit --no-fund
  if errorlevel 1 goto failed
)
echo 请在浏览器打开 http://127.0.0.1:4321/
echo 修改 Markdown 文件后，浏览器会自动更新。关闭本窗口即可停止预览。
call npm.cmd run dev -- --port 4321
exit /b
:failed
echo 安装失败，请检查网络与 Node.js 是否可用。
pause
