@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   GlobeMap 本地预览启动中...
echo   浏览器打开: http://127.0.0.1:5173/
echo   关闭本窗口即停止服务。
echo.
start "" "http://127.0.0.1:5173/"
node server.cjs
pause
