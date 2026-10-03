@echo off
setlocal
set "ELECTRON_RUN_AS_NODE=1"
set "BEAM_RESOURCES_PATH=%~dp0.."
set "BEAM_CLI_BROWSER_ROOT=%~dp0..\beam-cli\browser"
"%~dp0..\..\Beam.exe" "%~dp0..\beam-cli\index.mjs" %*
exit /b %ERRORLEVEL%
