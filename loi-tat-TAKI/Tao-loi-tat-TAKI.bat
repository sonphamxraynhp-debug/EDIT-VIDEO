@echo off
setlocal
rem ==================================================================
rem  TAKI Agentic AI - tao loi tat tren man hinh (Desktop)
rem  Cach dung: bam dup vao file nay 1 lan.
rem  File se tu tim thu muc TAKI, chep ban chay "Mo-TAKI.bat" vao do
rem  va tao bieu tuong "TAKI Agentic AI" ngoai man hinh.
rem ==================================================================
if /i "%~1"=="run" goto run
if /i "%~n0"=="Mo-TAKI" goto run

:install
title Tao loi tat TAKI Agentic AI
echo.
echo  Dang tim thu muc TAKI Agentic AI tren may...
set "PROJ="
call :try "%~dp0."
call :try "C:\TAKI-Agentic-AI-Affiliate"
call :try "C:\taki-agentic-ai"
call :try "D:\TAKI-Agentic-AI-Affiliate"
call :try "D:\taki-agentic-ai"
call :try "%USERPROFILE%\TAKI-Agentic-AI-Affiliate"
call :try "%USERPROFILE%\taki-agentic-ai"
call :try "%USERPROFILE%\Desktop\TAKI-Agentic-AI-Affiliate"
call :try "%USERPROFILE%\Documents\TAKI-Agentic-AI-Affiliate"
call :try "%USERPROFILE%\Downloads\TAKI-Agentic-AI-Affiliate"
if not defined PROJ for /d %%D in ("%USERPROFILE%\Downloads\*" "%USERPROFILE%\Desktop\*" "C:\*") do call :try "%%~D\TAKI-Agentic-AI-Affiliate"

if defined PROJ goto found
echo.
echo  Khong tu tim thay thu muc TAKI (thu muc co file package.json).
echo  Mo thu muc do trong File Explorer, bam vao thanh dia chi, copy
echo  duong dan roi dan vao day (chuot phai = dan), sau do Enter:
echo.
set "INPUT="
set /p "INPUT=  Duong dan: "
if defined INPUT set "INPUT=%INPUT:"=%"
if defined INPUT call :try "%INPUT%"
if defined PROJ goto found
echo.
echo  [LOI] Thu muc nay khong phai TAKI Agentic AI (khong co package.json dung).
pause
exit /b 1

:found
echo  Tim thay: %PROJ%
if /i not "%~f0"=="%PROJ%\Mo-TAKI.bat" copy /y "%~f0" "%PROJ%\Mo-TAKI.bat" >nul
if errorlevel 1 (
  echo  [LOI] Khong chep duoc Mo-TAKI.bat vao thu muc TAKI.
  pause
  exit /b 1
)
set "SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$lines = Get-Content -LiteralPath $env:SELF | Where-Object { $_.StartsWith('::ICO:') } | ForEach-Object { $_.Substring(6) };" ^
  "Unblock-File -LiteralPath (Join-Path $env:PROJ 'Mo-TAKI.bat') -ErrorAction SilentlyContinue;" ^
  "[IO.File]::WriteAllBytes((Join-Path $env:PROJ 'taki.ico'), [Convert]::FromBase64String(($lines -join '')));" ^
  "$desk = [Environment]::GetFolderPath('Desktop');" ^
  "$sh = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desk 'TAKI Agentic AI.lnk'));" ^
  "$sh.TargetPath = (Join-Path $env:PROJ 'Mo-TAKI.bat');" ^
  "$sh.Arguments = 'run';" ^
  "$sh.WorkingDirectory = $env:PROJ;" ^
  "$sh.IconLocation = (Join-Path $env:PROJ 'taki.ico') + ',0';" ^
  "$sh.Description = 'Mo TAKI Agentic AI';" ^
  "$sh.Save();" ^
  "Write-Host ('  Da tao loi tat: ' + (Join-Path $desk 'TAKI Agentic AI.lnk'))"
if errorlevel 1 (
  echo  [LOI] Khong tao duoc loi tat. Chup man hinh cua so nay gui lai de duoc ho tro.
  pause
  exit /b 1
)
echo.
echo  XONG! Ngoai man hinh da co bieu tuong "TAKI Agentic AI".
echo  Bam dup vao bieu tuong do moi khi muon mo he thong.
echo.
pause
exit /b 0

:try
if defined PROJ exit /b 0
if not exist "%~1\package.json" exit /b 0
findstr /c:"dotaka-agentic" "%~1\package.json" >nul 2>nul || exit /b 0
set "PROJ=%~f1"
exit /b 0

rem ==================================================================
rem  Che do chay: mo TAKI (loi tat ngoai man hinh goi vao day)
rem ==================================================================
:run
cd /d "%~dp0"
title TAKI Agentic AI - DONG CUA SO NAY LA TAT HE THONG
set "WEB=5173"
set "API=8787"
if exist ".env" for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do (
  if /i "%%A"=="WEB_PORT" if not "%%B"=="" set "WEB=%%B"
  if /i "%%A"=="API_PORT" if not "%%B"=="" set "API=%%B"
)

rem Dang chay roi (pnpm dev hoac chay nen) thi chi mo trinh duyet
call :isup %WEB%
if not errorlevel 1 (
  start "" "http://localhost:%WEB%"
  exit /b 0
)
call :isup %API%
if not errorlevel 1 (
  start "" "http://localhost:%API%"
  exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo  [LOI] May chua co Node.js. Cai theo huong dan: winget install --id OpenJS.NodeJS.LTS -e
  pause
  exit /b 1
)
if not exist "node_modules" goto needsetup
set "PNPM=pnpm"
where pnpm >nul 2>nul || set "PNPM=npx --yes pnpm@12.8.1"

echo.
echo  Dang khoi dong TAKI Agentic AI... trinh duyet se tu mo khi san sang.
echo  DE NGUYEN CUA SO NAY khi dang dung. Dong cua so (hoac Ctrl+C) = tat he thong.
echo.
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command ^
  "for ($i = 0; $i -lt 300; $i++) { try { $null = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 ('http://localhost:' + $env:WEB + '/'); break } catch { if ($_.Exception.Response) { break } }; Start-Sleep -Seconds 1 };" ^
  "Start-Process ('http://localhost:' + $env:WEB)"
call %PNPM% dev
echo.
echo  He thong da tat.
pause
exit /b 0

:needsetup
echo.
echo  [CHUA CAI XONG] Thu muc nay chua chay buoc cai dat.
echo  Mo PowerShell trong thu muc %CD% va chay:
echo      node scripts/bootstrap.mjs --no-zlcrm
echo  Cai xong, bam lai bieu tuong TAKI ngoai man hinh.
pause
exit /b 1

:isup
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $null = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 ('http://localhost:%1/'); exit 0 } catch { if ($_.Exception.Response) { exit 0 }; exit 1 }"
exit /b %errorlevel%

rem ==================================================================
rem  Du lieu bieu tuong (khong sua phan duoi day)
rem ==================================================================
::ICO:AAABAAcAEBAAAAAAIADUAgAAdgAAABgYAAAAACAArQQAAEoDAAAgIAAAAAAgALwGAAD3BwAAMDAA
::ICO:AAAAIAA4CgAAsw4AAEBAAAAAACAA7A4AAOsYAACAgAAAAAAgAF8fAADXJwAAAAAAAAAAIABVPwAA
::ICO:NkcAAIlQTkcNChoKAAAADUlIRFIAAAAQAAAAEAgGAAAAH/P/YQAAAptJREFUeJxNk7trnXUYxz/P
::ICO:5b2ckyY1UUq81rbUQBGEBocQQQUHUdQIgnTwPxAnFwcJBYuC7qUduzmJt0EJQgahFkftoEPBtKFN
::ICO:qbT2NCfnfd/f73F4T0inZ/ry/T7fi6wTehbJZ1e2X5zxudeJbkbJWGRRBQMUMDRKVUrx3S5GP3+w
::ICO:uXh5nVAB+Gxl56OBz33poqVJYAguYAIW0yugOTAFJXdt2v3k/c1Hv5LPX7q7bOjvSiDRdgpi0jNL
::ICO:gsJ7MC0MDwu0Eda412VJl8erKpHerrRGou1MxF3EDLHCxeafNLMQcxVzEVtaq+3plcpz13WVFqEh
::ICO:a6rEwIRQEINeYoLBrPD8ezWSQTM8cdo58WbFibcq5o+5SApxlVoNwvZlC7iA5ODw48bxV0vqoeAO
::ICO:N39t+fPCmKsXx4z+6ihcsCBc6YF53yhgcjdYOGoMjygzC8K9vzPDR5Tbv7VoQHVIsOjJ1BUckA5o
::ICO:grISnlouOPZaSQQ8t1azcNxxhfwgkPYgFQHctHd78ZRx6p0Bz6wWDBYUAAKWztQsnakZbWVubjbc
::ICO:+H5Ccyv17wKuuY/qv2uJPy6N2dqYMP+sc/Ldirmjxs6VlhsbDePrieZWJt8PXKf9AHoPgK6B3e3M
::ICO:3vXEPz82eAEvfDjk6vkxd660DOcFN8HtoWIB7nEQnzsUrpQSjK5lugdBs5OZXVRMwTKoHLCrIuoq
::ICO:eyZEH6cgqZe1t53YudyS7uVpjafgPrUwiCJiohb2Q0Qjpbor0VmO5Ebq/s1p65u95ErSiGREsv52
::ICO:hZhDJx58JwBfv3z740M2+4WLmUng0uesQf/ztCtGPzQhxbgdfbr8y2PnZH/O375yZ7W24RuRJzOQ
::ICO:xEUfmjIomcIshlLtTvL9n05vHNlcJ/R/qHYIxOn3JboAAAAASUVORK5CYIKJUE5HDQoaCgAAAA1J
::ICO:SERSAAAAGAAAABgIBgAAAOB3PfgAAAR0SURBVHicjZbLa11VFMZ/a+19zr25edy8+jA1WIqNiQqV
::ICO:dlApQnTqQKQDB4II/gUORHDiJSCoOOjIqTMdlQ5E8YUKlqI4UGoRm9ZUmzZtQpsmTXpzH+ecvRyc
::ICO:+2humuKGxT77PL61zvettfYWAMNEEAN479nqgb44TGVpFnkHgUwc+fCtuXcd46wohaSR1RZePze6
::ICO:CFDBdA4J0gavHFsa7+sbel+wk4qNOlEUuibsvhYQDIeseeHzWrr6zmtnD96sUFGpYMrsjdFi2v/T
::ICO:QFSeqSXrQIYK9n8diIEqeHEy7IfZSjevkNWf++Psxys6h4RCUvxgMC7PVJu3G0JmTgSHSMeke62I
::ICO:qLTmlkUFEa8iEjLbSFYbQ/HgIVRPzTEX5MMTtyYCMu/FlyBtfbxLlIBTkNY976F515h+ucD65Yz1
::ICO:SxlxScwHNbOQmOpTijHjNRqwXvD7nIQmDD+q7H3CERqGk/w+KXiFQy8W2HckggaoIUYqRV8oOAtP
::ICO:+8w0ikQJDwBWwAmkdWPimYjyhGP51xTXD5bAgeMR068U2Xc0YnTKUz7ouHK6ztZ1M+dFPOJ9HOVi
::ICO:spuYChKMvU96Rh5zeN+iSOH2+YSfL6TMnhpk+VzC5U/rOA/OgxqoYL4NTO8ftNMvQKEkjE85Bg84
::ICO:SiOCpW2KhK1V49q3TdYupKT3DD8kHY0coO4hue00dzC03zE06YgHhOGDDkkN53OgvhFh6bsm1euB
::ICO:woDkkVsrgHbwKl1zLjcBLDFqK4HypBKV8i/GDnvqtwwahoQ8k7KaQZKLL/fr18q0DkXWhEbNUIPi
::ICO:oDA86Rid9UyfLIDl7xw+WcCasLmQUV3MSNYMBaI+0Fh2Omj/gWVQnlQeOxEzcdQzPuUZ2N923R0j
::ICO:U57j7+ZdqL4a2Pg74875lNVfEqr/ZKh2aaZXAzJINwP11UBtNdC4azsctEdyz2isGs07gWzDsMS6
::ICO:GlqX7m4WOdhaDlw802D+dJ24KAzsUQYfccy8WmTy+RiA27+nXPykRu1GRmMlEGp5MkR9EPVQ5Hs1
::ICO:cBEURwRtNe9001j+NyGKhckXcgdXv2hw84cm/fuUqCi4/pawodtO2g6yThbR7TeE/IkEcE4ojStb
::ICO:SxlJNadrcyGjNC5416VVsha4sC3Vd2TR9jqQThturASqS4G+MWFrMctrwLpNb0cNtTUw8M4sE7Ge
::ICO:CpZuFArNOmwupCTrSrZhxKMC4eF7hWCIWeYzkXkXkqpX34elqOiOjuoU1v/MKAyFDgC7gYOpqKSh
::ICO:0UxJ/9I3zo5dUzhTjsoq0FS272RiEJdg7beEW+cSolKuz46+1aE6JGPxsIjZl8e/33tJK1TUS/r2
::ICO:VrJ5ZbQwVnCIiAUTLIhYkGDBRYT6jSxsLabBxwQJFhQLKq3ZLAjBVIQ9hbG4mtxbCiJvGiadTf+z
::ICO:E1cnBovjH2HhJa864JDtHPcU0QM5J1Qd8lU92Xjr2I8TVytYzmaFis4xFwC+nl1/HO+nLSRxq/5o
::ICO:z51rt/0I44BY4iRoeunIN+X5HDM/tvwH/HPXsxSZTdkAAAAASUVORK5CYIKJUE5HDQoaCgAAAA1J
::ICO:SERSAAAAIAAAACAIBgAAAHN6evQAAAaDSURBVHicnZdNjBxHGYafr6q6Z3b2bzbr3Y0tJ2btOCE4
::ICO:BiVCoJhEBhQkiKVwWksRQpwQSHAB+cLJiXxBgpAD4gA3TpG84uJDLsixjcxfQBywcbADsWNns/HP
::ICO:enfGO7/dVR+Hnp7tGe+uLUpqdU9NV71vvd/3vVUtFNrJBbVHF8Xnv988rNXQwXT8khTfG2ebNtG7
::ICO:12FuakyTJvqt89XVrTD6Ey8snLSLi0f9iUM398Wm8n1R/arid0KwVgBVEcD0BhnAmOy52C/S+w9R
::ICO:ASzGWzG3rJFzSbL+62+f33VJj6uR1yX0CeSsTnzpk++VZPyNkquMet9GNcHIIIDpgWzWZ4bI5GOd
::ICO:OMp2hMQ3ul3f/Mmrf5j9RY4pCwtqFxfFnzh067vj0cxv2ukaaJoaESPCfasuTrxZ36akFBUIVsRW
::ICO:40ekltw9dvTs9BsnF9QKwIkvLM+7uPKeQSMNKT3wLYH/b0IQrFh1xhq0e/CbZ6b/ZQBMFP1w1E2U
::ICO:NCThYcFFtwa3Fnxb2f18xOgOgyaKiGBEjOK1YsckBH4MYI6jxiAvpb6thocHj0qCtQUiObgBY0G7
::ICO:sP+VMtV5i3bBRnlIxHR9U43w5be/riVTfuH6pMCcaiJikAeBWwO+pez/WszELkvo6sY7kq28s6JU
::ICO:poXZZx3TByJ8S0jrCikIKqqpCLKD1sqM0441JlIj5v7VbBVzAux7KSapK3ffSzEjG8rsfj5m35ES
::ICO:O78Y4crCge+U2f1ixNLZLtff7tK54zEREJDUGZPlQL92H5zVeKhUhdkDjun9FgkbfmAE7n3o+eBU
::ICO:m8tvtQFYuZDy79+2ufXnBN/Q7F3N5gNwFAD0QdluMomn9jtcWZh+0uLiDeUEaN0MNG4Els4kzL8c
::ICO:c/VUh/+81WZ0TrBO+mQBRnpzD2TxdqVmJEuuuYMRAFNPOCpTJottT0UbCSNVIR4RPj6X0FwKjM4K
::ICO:UXkDPFea/G4KJLar89x+5z7rAKjMGCb3FBJRJFMyBRcL1051WL/msZFAGAyx9GQw40Mr3BRcstoW
::ICO:YGRSmHnaQm+SHU878OAK8oqCddD6OODbWdyLi8wXtLUCktWyddkzCaQNpbkcGHvUMvqoRUM2wcwz
::ICO:lnRd6daU0NIM3GbjXannC0OJnD/3kzBnCCABfKKkSW44MDZjeOSJiJnPOB57IUIMfQK7DsUc/vk4
::ICO:K/9MWbvsad7wpDWFHhEXCya6HzxsWgUKcUWY2GmZ+pRl5inHjk9bpvY6ytVctB7RHuNoVJg/UmL+
::ICO:SAlNobHkqb3vqV1OufdfT+ujQPduGCi9XOlykYBIRmt8zvDUyyUePxQx8ZhluKkHKXSrApoREgdj
::ICO:eyxjeyw7X4xZvZCw/E6Xm2cTtK33yb8RgkLirH3g+dPPGrwbC+NzhuknLXMHHTPPRFT3WuIJ2TCM
::ICO:HnEF1q97alc8qxdTapdSGtc96VqWgK4sA5tWsQo2QiDZamwEJs7Kpnkr0PjIc/33XaIylMYMe79R
::ICO:4rkfVfpKrF3x/P34Op3bgaSeJaGLstjH45KBhaHNTMBqlgeGicHkEM1CYQSiGMoTQmUqM5a0rtw4
::ICO:3SVtaT8Hbv01YfViigiUJ4VyVYgqgnE94CK4MHByytUfNAgKe7wCvncFIRoVkppSvxr6M6xdSonH
::ICO:MgPCg/ie1xfsuXg6KuIMENjWikX6xEJTWb2UApk31N/3uEiyTYnBFQ6DD1g+vb1gYujFzcAHdkkD
::ICO:qxcSAO5d83RuhuywoQ8GHzC83IpdZywI6LBERfD+oAAuhtqV7Fhfu+wJLcWahwfPVTagwaiaaOdk
::ICO:3cDtyDjtnV43Bc+fXUloLQc6dwP1y+l9qj0YXNSJA/RuWm/cMUcXxRvkTMmMiKBhO/B8N9SWcufd
::ICO:lMZVj8vlfwjwjKyGiq1g4PyhvzzeMgA2cr/spHUfiROBsCl4oTJsLNw41aG9HHAlGTzKbQMOqk4M
::ICO:SWgTgn8TwJxcUPvq6ckrXjvHJuKqFREBTQWCoCqoivTuqKKqNlKtXUrUN4KK2fhv+KI/niBoahGd
::ICO:jquu6Ruvff6d2X/0P0zyz6TFwyvHyrb807Kt2K5vouoR0S3PCGaLQ+xwnxNHxVZIQptO2nz92dPT
::ICO:r/U/zei1/IPxd1+5+bmSjP0ADYcRP4sGu9V+Phx3u2mfBCf2thH5Y+L9r547Xf2boiZzjg1DoqgE
::ICO:wMUFjT9Zac6kTkw3tGWEzVt5i36AqilrHI2EeJ2V+XPSHsYA+B+WCrFQRZQRNwAAAABJRU5ErkJg
::ICO:golQTkcNChoKAAAADUlIRFIAAAAwAAAAMAgGAAAAVwL5hwAACf9JREFUeJzFmltsXEcZx3/fzJxd
::ICO:e+31xrc4SpTWCk1LlEubgpBaCinipfShEkIOCKniAfEWIaHCCze3FRJSK8RD4ZkH+kBjkEDAS1ua
::ICO:VrSqAAFKSuP03jRJ0zSxvb7v5cx8PJyzV+/a6ySCsUaec+bMnP//u803cxa6FEVl+pi6bv3/qzJ9
::ICO:7JSbRk23/o4Ap6bUyox4XiJ+8sjlAZ8fOGrEHAha2QWB2mwd/xswIf3f1m83G1drG4PDXTNEszZa
::ICO://fx50cWAU5OqT0+I74dq7TfqD04fc/lnTkz+G1EH3YS3RKZPowkAwSQ5nanukW/2aQfwGsZHyqX
::ICO:BZ4pVZd//o1X9nzQiUQLgdoDP/nsR1/OmMFfZMzA7opfJmgliBK6gYNtgO+duHEmMjmXp+LXFuJQ
::ICO:euRrL439qp1EnUAD/LUTfXboKR/K+FCKRcQaRG4muA2EuwpGVVS9M5EbsEOsxAuPffWl0UebSRiA
::ICO:qamT9viM+MfvvfpQnx16qupXfQilYMS4nsFvUdvV3otZGUSMGKchDqu+GBcyI9Mn77/2zeMz4k9O
::ICO:qQWQadQ8CvrTLy6NUPLnrESjIZRUxJjrVH3Hvs2ACyAGqIKxHeYSQdDgJFKBisT+4EN/3fH+oyCG
::ICO:YxhBVEvxd3JueMyHkt8WeOneT4/EjQFiKExabAZE28GDIMZrRXMu3++N/kAQPTiVyuaRI5cHRgaj
::ICO:tyObnQihopJo84YlvyWBtM8Y8GvKvT8c5OzT6yx/4HFZIflr9QknDg1+zWeifV95Lv+xARjPZ4/2
::ICO:2YFdIZRvCng0qZuFyvpYAY0hmzfsvT/D0F6LVsEY2TDGIBJCHAajwoCL4/sgdeKgeigyfbpZqOzJ
::ICO:bARCBfK7DHvudsQlxZjOc5jUdFwEoawUJg2ZQWHkkw6NwbrEHzYIQVBnjIro4ToBIzpuhBuONkbA
::ICO:l5WdBxz7H8gSyh0BIOlzlaJSmlNCCfbckwGFibscUU4ozymVeSVeU9DWOQAR1Z3QlErcDJsXAxpg
::ICO:7A7LrjsjXBYIncfuuNUyesCx87Bj9ICjsC9JNMaPRjz4mwILs5752ZiF12NW3vdoJZm/hrVWXE0N
::ICO:PZnNFsRQcBkY2+8Y3GXI77KsXwu4qE1IQH63ZfdnIsYPRwzuaWRDIpDfa8kOGTJDgpZh/VIgrmj9
::ICO:HUIjf3LNA6/HbKRpvMYwMGoY+YRFDIztt5y/5JGstGoCuPRyhQsvVMjkoG+H5a4TOSYfyLD4judv
::ICO:P15h7XKgupT4UDQgiS/pRg3UEsjrNxtp1FBWhict/SOJfHYecqjvHI0yA0L/iOD6DauXPB88WwaB
::ICO:K/+oMncmxhjo2yFkC9IxEGzUwHWaTU0aRkCrMHHY1W+OH3aJH+jGsYTGBNmCYeldT4hh8Y2YKJdG
::ICO:lLBxLG3tFg10JdLFbJrJQxL2Jo40thgjtzlyIyaJ6+3CqK2wmowrXQ1cO11l5YOAtZ1Jd3p/3Xuu
::ICO:y2zSayNADP07DKO3JwQ0QLYg7Ji0hNQBN4BvqsYI7/6uzPqVgM1IazrRoRrpoIFO4HoiJklc3zFp
::ICO:GZgwoKCpw40ddK0a6ABeFGwEV16p4tc0Sei2EB7p/Jv7QBe1tT9fs//xA7Yu/drz44ccxtXGdADf
::ICO:XDcDnoLXVOA1DWxrHagBN+l1c3TAw847owbD1DhHbndk+iVJD6KGxNvD6nY3Q62vMb3ZvLVJFZKQ
::ICO:WVlUykUlXleGb7PsPORong+F3IRh4lMRGkN1SakWFb+epAfGpPlOL+/vcH+jBtoG1SSsIbHxaiWR
::ICO:XiYnFG6xjO53TBxxjB10DO+zuP5k2pq2SIl/7ok8Kxc982dj5l6LKZ7zrF7wVJcUAtgMuIwgLjUN
::ICO:BQkNHM2l3Zy7+kCoQmVNESCbF4ZvtUwcdEwciRg74NiRbj56KcbB0KRlaNIy+WAWgNUPA4tvxMyd
::ICO:iVmcjVl5z1NZUIjB9YHrk4576Fq7ZSFrj0J4KOw23HpfxJ5PR4wfcORGN54tqW/MKO2iaX82XZQA
::ICO:xMDAbsPA7gy7v5BIIV5Vlt/3zP8r5uqrVZbeiOtgtyTQ/IBo0vAVZfVKoPiex0aJE+Z2mhaVim0A
::ICO:Uzaquw5em8Dbjf2VRWXtgmf5Hc/6hx6/GloOu7oFlDoB28bQGCjNK+88W+HtP5exkZAbFgp7LWO1
::ICO:FPgOx9Atth4iNysiNI7lgLWPAktveYpnY4pnk3S5cjXgS+kmp59kMesCvrsGpBFfrQM3JJg0+IYy
::ICO:zM3GXD0Tc+4kZAeE/G7DyO2JE48fdgzf4eo5e3NZuRiYO12lOOspzsasXfRUF7UeWm1GcP1CZjDF
::ICO:0iEHao9GLRpo9oEamdq+NrUojAUbSX1FVQ9L5z2Lb3ne+2MZ1yd86ekChX02WchSIiGGV7+7THE2
::ICO:xvUJ1iWAM4PSyO+1MWe7zW8WSls0sNUGPEFTN2UEiLKC9IN1QmlemT8bJzsrpU5i+bxn/XJI/IcG
::ICO:YEKr5rsC7wK+/UB524tIXUtBEskpzL8eN3SbMi3Oxvg0HOPT+K69zb9Zf13wtcZ2wSf9jZTYZWBh
::ICO:1qPaGmnmz8Rba7Ybhk3ev7UGegUP6WoqrF70rH+U2EZtg7/0ZpwseNeZ+3TV/qYa2Ab4WrUuyXWK
::ICO:b/r6hGsfBlYvBGxWborZtPSbbgSuA3xdKh4WmvygeC4mXtZ6AnijZtNJA+n2Kc0EbgB8bVNSnG0i
::ICO:8Fpcj+c0zd8R+LY1k4jCAFgxc4BeN/hECLisJKvqYhKCiq/HyZmQ3iSzSdsG1KBzdQ0EkbNeK/WF
::ICO:eLvg6zWC8rXA6gWPcZbV8439bXO5EfCoiqLi1P6noYGS/2c5Xp5zJiNC0wFvL+Cl8QIjoCVYesuz
::ICO:9LanshAwUe/gtgQPao0zy9XFsmr8MoA5deyUe/jvY0tizK9zLi9oCNsC33ydHpEsnotZOB0n15sB
::ICO:3LZZqR9yQwL6+6MvjF3SKbXmxZfuD4qKuOyT6/HScmQyRtDQs9k0VTTJJIunY668WMHlaE0ZbgA8
::ICO:qDqslPxaTHCPKyozgHkMCTNTmK8/P/ChhuqJnMsbERMgdHdq6QJAk4SvdCWw+p7HZWTLrLJX8AaJ
::ICO:hzMFW/Lr37/7haGzM1OY4zPiU9NqfGZ95tjVRwuZsem1eJGgPhbo/TNrOldtL32j4EFVwBvEjmSG
::ICO:Zb48/8u7/zJ6Qmu/JGh6ZwuJmWNz3+qz/T/Lmr78ul8iBO9F0jC7hU13NBcaRzFbmqLUyYsVa/Mu
::ICO:TzWUKmUt/ejoc6NPdP3Q3U7it5//eH+fG/ieajjeb3MFZ0xXcHWQW5DrVfIGUJR1v7pq1fyhHK88
::ICO:cfepidM6rUYek9CMdwOBZhIAfzq2sstYuUfFH9LgJ5QgzZlg3WyE+oe95okNG3/UIZ3upQ2HUyfm
::ICO:mhjOitpXDz+bu9COqacyjZra1/D/Zzk5pVanu//c5r91TePpNI1eKwAAAABJRU5ErkJggolQTkcN
::ICO:ChoKAAAADUlIRFIAAABAAAAAQAgGAAAAqmlx3gAADrNJREFUeJzNm1tsHNd5x3/fOTO7y+WdIilF
::ICO:cXSpLdmRLF+gthAUpLQQpDWCok0aUEWaIs1DmwIt8lIgRQMEWLNNgfQhQFEkQS8I2ie7ENGHFI6L
::ICO:1lZo2S2Qhzio1EiybNmyLF904Z1cci8z5+vDmVnuLnd5kZaCD7Bczux3znz//3c53zkzA1tuKoWx
::ICO:qaAwpgGobL3ffWtSGNNgakwD3YZ+WxBUOTOOOT0pcf3Z757Qrq6A3ALvAv1butjWpLbW+oEFFuhn
::ICO:H3EXla+8KMX638+Mqx2fxAmiG42zIQGFgpqJCXEAhePv57tyvU+LyK87rR43yB4R7XbOiSQDiawN
::ICO:mg4sgKHpvKz9Xy/Xqq9I+98MIGJUoGTE3DRiz6Oc1Tj+8Zf/e2AuJaLZeFsiIO34teM/yx/seviP
::ICO:Bf3TjOl60IjBaQWnEaqOevDNim4HVMvjNkStI0IEa0JCCRGgHBc/FDX/uFie+7s/+um+2Y1IaElA
::ICO:2mHixK1P5cLuf8ia7qMVt0wUl2MD6q8pgMpmVmoFflPg25UVEB/4TlHJmIzNB32U4+Ub1aj09S+9
::ICO:OvKjdiSsI6AwNhVMnDsV/eXJW1/Nmu5/MmKCalyMRMQIYtYpsIGV7lp2E+CbySqqohpnbC4IJUM5
::ICO:Xvzm6XMj35kamwpOnTsVtSUgZemZE7f+oC87/C+laEFR50TE3hOg+wi+QVbVGdD+7C67UJ351umX
::ICO:h/96akyDU+ekRkKanxgfP2NPT0r87U9Nn+gKun9YjhZjcPpRBi+byYoYFTGL1fmoJxj49uSp6d85
::ICO:dU6iM+NqqZMHVAoFZPE/b2SHbff5jMkfqsbF+KMMHkCUzfOPCKi6jMniNJ43ZvXIb/1k920vI2oA
::ICO:CmPYiQlxwzb/te5w6FA1Xo4+8uABm9kCeP9tKlpyPWHfUBSH3xREGSfNZ75q+u4JciUzcyU02Qdi
::ICO:LetOJryG47twewAcPHI6x1v/XiIug2keJwVfG0fVYlF0xcXhoS++2vNhATWmMPayBdGSTP9GV9j/
::ICO:iciV3Y5ne+GuwNdOxJDpEQ5/IUduwKARjTmhCbz/iDjiuC8c6A5M9XcBnhrDGHjKCxv5nMFoMs/v
::ICO:qNu76t27vRGIK8rAAUvvxw39ByxaUU+AtAZf66tI7CIFfRrgzuikmolzxF5AnnRaFRFku4C2I4vC
::ICO:8GGLmO2DT481gpFjAaj/1hjECEJ78Il+JtKyIProC09r9vTk6diAaGFMc8Be56poEk47AT614BO/
::ICO:30W2W7ziWwRvDBjrzxkLe34lBIGRx0JsRmrnjWGDmUFwGiHIcLk4OwpJHdBXXsiLaje4bQPasmxi
::ICO:ua4hw76TIT0jBq1qgye0A4+DaEWpzCvlOaV/v2Xo4QCAwUOW/oOWypxSWVCiFYV4vU41HVCsmKw1
::ICO:rhsgAKgEqLi12N8RyxuoVJRdD1rCvDD0UMCt8xFGkqSzAfggJ/Q9aBl5LGD3kyEjjwdken3HIC98
::ICO:5gd9zPwi4vZrVWYvRRTfc0TFNXJpGlNRnPGXDWhx8U6DTxOUxjB6xF9y5EjA5X+rA9p0ffAuvf8z
::ICO:GR7+Yo5dR2qq+qY1NGQHhb2fDtn76RCA+SsR15+vcOPFCq7URETjKE0ECL666jT4ROEgA3se95fc
::ICO:/Wjg84Bbb/maojHceKXCnf+N6P24YeiRgNHHAoaOhuQGpUZCeU6ZvRgx93rE7MWI5Xcd0bLDVWgJ
::ICO:XoDsOgKkteC9gk/HdlXoHjEMJ7Hbv8/Ss8ew/H6Mzawhbx5XK7By07F8I+bD/6lyUWDglwI++8M+
::ICO:Mr1CtKK8/CeLLLwZ+1CzYDPiE2Yb8PVeYGhqHQefElBRBg/42HUx2CzsOhQQJ1ZqBT7tazO+8MkO
::ICO:GnKDhqXrMfNX/IJu/s2YpXdicoNCdkAIewQbrgff/FlHQDuhewafElCF3cf8Ikxjn/ZGHrXg2DTv
::ICO:oMkn9iGqMUyfj0Bh5kIVV/W/awy4tf6tcDW3tgR0DHwCIAhh9xM+SaXV2uixgCDrf9903PSMgg3g
::ICO:zs8jEJh7PcYIa7lL2ujfhoiGEJCm/zsBvjb/DxqGD3sPkGQ1PnAwID9iWpbGjePKmn7qY3zpeszq
::ICO:bcfStRibSUjcBHzz+A0EtHWZe7F8ct5VlIH9ltygX2mIAXU+rgcPBriyNoRBO/CCt7SxEC0r1/+j
::ICO:THlWsUEdQW3ANxtlHQFmJ8DXCPDuDh64/8d/DR8N0MiXyJuCb/r97cmyJ89uDr5GUL35UwL66wU6
::ICO:CT75GAu7H28qZBLB0WMWE9CQB7YCXgSqS7qlmKeuz5ZCoJPgNYJcnzB0KGhxIRh4KKBrYG1htCXw
::ICO:qfLbsHyrHLOOgGaWOmF5jZSBgwE9e9bin7S/Qn7E0Lc/QCNFAtkUfE3fu7R8ej7TTADSmqWtghfW
::ICO:lqwmyfKuoqxMK7se9qZyafwnLc0Hg4csq9OKq/jEkI7RvGfQbKTtgIf139BqMbRV8JIkLllz9WhV
::ICO:ff0NZPuEvgOW/U8FHP58ttanvqXHD30+R3UJlq5HLN9wVBc0me4gSMvaxGPSXHEv4NOh1hHQSrB2
::ICO:LGubDagHXK0ompSyuX5h6MGA4YcDRo8FjBwN6P2ErXkDrLl/rSXHg4ctJ/+qG3Ww9G7M7KWIuUsx
::ICO:c5cilm/EVBf9Gt+GYLOCBNQWbvWkbAS+XSi19YCGeMOXmdVVxVXBWl/YjH4yYPSIBzv8SUvfA3Vo
::ICO:k6axB9ps/QYZxZfEFvoOWPoOWA58zv+28oFj4WrEzPmIuUsRxXcdlVmHVsEEycIn2Bx8u8s3zE0t
::ICO:YyWpsLJ9wsC+gD3HAkaPBgw/kiS2VoCTzmKoVX0bNREgkVNHzT/FQn6vIb83w8d+zaet8oxj/krM
::ICO:3P9FLFyOWL4WEy1qbZztlsItPQB8fGsE/fsMR347x8FTGXp2NwJWBy7yDBmzdcAbklF/CfXeoTGg
::ICO:fpbI7jLsPmnYfdKvK8qzyu1XK7z3fJmlN2MfHimBtDZqLZ/QwgNqndS72PJNx8//eZU3ni8zsN8y
::ICO:eiRg+Ihl6KGAbK80rOVhvQdst6XhkJKRflIIUVFZfidm7mLE4uWY5Wsx5RmHK6nPN23A1+eyth7Q
::ICO:QEJ6ItmQnL0aMX054uoLZcIcdI8aBg9aRo6GjB4LGDpk6dpl1nnAdnNAfTgAlGcdi1c94IXLMUtv
::ICO:RZTuKG7Fb3XZEEwotWS72cyQtvU7Qk0sNQxmwOYEyScyDlanleIHVW68UsWGPin277MMH/VJcfCw
::ICO:pfcBu60coA5WPoiZf93PAPOXfdIrzzq/Xkh2e2wI4WCipK53+c2mxZYe0LJDvXCyIZHuRdoQwqzU
::ICO:4ilaUe5cqHLrZ1WM9Su9vk9YBg5aHvlyjsHDgXft+rBIjuffiHnz2RLL1yKK7zs/7Wky7WWEsFv8
::ICO:zYp0ykvywnYLovrzresAaRxoo3lUWKvkhMQ6eUG6qRVGi9cibv60Stgj/PI3AlQb2U+P3/lRiavP
::ICO:lsjvEYwVMv1++6M2z7s14lvF8lYtD43XbySgxYBtwTeHCKxtW9WNZ7OG/KiycNVnxuakKMb3mb8S
::ICO:k98tBFnxNzWanuRpdttOlMKpqlvaEtsUfCsl8W5qrbB03bE64/e/NbmyOi+0etuxfD3GBFIDvh1A
::ICO:dwO+Xs91W2L3Cn5N1p8xAVTmfCb3yGn4XnjTl7o2aD9WJ8C3MnADAZsNfDfg034awcyFqJGApM2c
::ICO:r+645VsBT1vrabBT4MHv4QUwdzlqHDyhfv5y7Pfx6/PHDoBvdVynxkaA7gE8+C3xrLD4VkyUFC+a
::ICO:3AuozPuqzmalfQXXQfD1cus2RFrFyT2DTwgwIZSmHYtve19Py+X5KxHlabduT3AnwEsLuRoB/XVM
::ICO:dBJ8+r8RcCWYT8MgmQrmL0YNO8I7CZ46TPXNAIRRA+aOgk+bWJj9RUJA8kjX/MWowfo7Db5mEATj
::ICO:nwXxBJRWVssCJSPScfACSLK9tXg1xiUbGdUlZfFq7Iuf+i3xHQRPAl5xVUtQAjCKylcufKyIcDPw
::ICO:j5trR8ELtdtZqx84iu/5BLB0LaIy7TB1M8BOWx6UQCygs7tGB24BmJfH/OLTiJwPTEZFcZ0EX2Pe
::ICO:+rX8/CUfBnMXYlz9A447Dh6M4rI2i8DlfZOyqgU1tVlAxf2XoJK+A9BJ8DVZ9XEPMHe+uraGvw/g
::ICO:xf/RUEIM8hLAa8+/Zs1TyXOCucA+X6zOT4cmY4TWXnAv4NPpcOlqTFxWitdjTHpX936ABzUYu1Rd
::ICO:qFo1zwEc/83jsRFEC2NTwemXhhZE5fv5oE9Uneuo5QFxYAOhdNsx81pEZUb9833b3My4G/D+4+L+
::ICO:cEBi4uceOzvw9plxtTIhzgA8c+6pWFHJG/O3xWjuZsbkLKjrFPi0iYW4qLzzr6VaNXg/wCuqIRlZ
::ICO:jZZXY61OKCrjR3ztmWw3ik6OY75wbnDexdEfZkxWLCYG1U6AT/834qvA+QsRJtkL2GnwCcioN+y1
::ICO:ZS392a+e3fP25DhGkrfhaknw9KTEhbGp4PdeHf1xMVr4i77MYGjExmidJ9yDkvWKmmBj2c6BVxW0
::ICO:OpIdCucqs98//tLI30+NaVD/8lTDYmji3KmoMDYVfOmVkb9ZqM59Kx/0BqHJGMVFaf16t0rWK7rT
::ICO:lie5eWfFymA4FM5WFr/35Nmhr58ZV5smfRrlG1v68tTk2Mx41uS+1xXkR4vRAk7jyCiCiAgq619K
::ICO:2MADmuK9I7I1kpK7yopDUIMJ+sN+SvFKMdLozx9/ceAHhYKaZybQ5jdJWxJQT8KzJ+/s7cl2fUPg
::ICO:q122e8BpRKRlYo3wD1fLOiXXKSztwW4EfGuyisEQGEtGsmRMSDFaLlnMc1VX/M4TZ0ff8FhwtHiN
::ICO:ti0B9SQAvDBWfMAZNw58VomPgQ4L5EBrJLRUegPwm7n85rKa1PZULDJjMJeN4SdxrJNPnO1/A0DH
::ICO:1crdvDqbNkVlsunl6TMntKsnu7IrDGy+Qpmqq0h2o0HqWmaT37cyTjqGmoz2ZrK4qitF0jXzRN0L
::ICO:1GfG1V6cRCcQ12aY7bUCaqbGNNCC3sUdv/vTtLB9Hf8fJD+d/uMOCZYAAAAASUVORK5CYIKJUE5H
::ICO:DQoaCgAAAA1JSERSAAAAgAAAAIAIBgAAAMM+YcsAAB8mSURBVHic7X1rkFzHdd53uvvOa3dn37sA
::ICO:SRAERBLEiyBB6kWVtGDiOErpX5SFFEnlVCplKZVfUeKUEzmpxSph4iSulBInldh0leJSKlXBOpaV
::ICO:cpyoKBGAKDm2IsUESCxIACYIgCKIx753dh73dp/86Htn7szcee4sMLPaUwVsz719T5/b3+lz+nku
::ICO:sEM/10QPolAGP5Byu50IxPe7TLXVBcyAxeFp0MU7oPmJOT40N80EMltdbm8S08wMCGchAAAnYGZn
::ICO:wdhCxdiSlshgOjUFOXsOOkr4X39ucZCTQiQkc06v3jdrMOj/XQmlu4GSMs0xPURf/CEtRd2fmTqj
::ICO:cOKEmZ3tfMPpaOUHrf3kHOng2m98kvcYs/Y8iI5rLnyEgAQzDglAAlwUISwIAYCIuNZGmlAqhShc
::ICO:YvUzot2yqPp6azwYghSM8a5KodYUxS5A0HkJ+vG4jl9+8Rx5NhfT3DREuH43Sx1RgErgf30q8wiM
::ICO:93k2/FcBHIvLVEqSA8MuAIZn8rBQlAtBoQvNABu+FgY68n4I/DKlqHiXevcjeUeAX0/OemlHxEEg
::ICO:KOEAMNjw1jQRXZaQ/1MKfGv61YELQFDfc3Ry7uSmFWHTCjAzdUbNnnvRA4CXPr5wRIjY3xOEz8Zk
::ICO:Kq3ZhaezMKx1uPERFRvbllfqZpSqYV5qUYZGaSYDYgiAGSBBJB2RQEwkkfPWtCT5KgT/65OvDrwC
::ICO:AKenWU7PwWym89i2AjCYTgE0CzJff+HugbhM/Sqz98WY7I/l9SrYaI9ABGIBEDVVGU2AFE63Yp57
::ICO:gm/1+zPADIYhIpWU/TBswKxfAdx/OX12+PsAwDMsqM3+QVsKMD19Ws755udffGL5HwtSvxKTqcGs
::ICO:twRmo4lIUKgd74DfGvg18jKYDQBKOWmhTQHM/M2NzMo/+Bv/95GF09Ms2+kbtKwAM1OsZs+R97VP
::ICO:vrt7gEe+mZADfznrLYNZe0QkEbLgTVfQDvgtyQBmDYDSsVGR15krWTfzN7/0w8kf/dZz7Hzlp+Si
::ICO:BWpJAQItm/34+x9OyMHvKBHbnfVWPCLIoMXvgN8i3xbBL1cE48VlShGRV9DZv/O5c6Mvt+oOROMs
::ICO:lmamzqiTc6S//ok7JxNq8LtEtDvrLXuCSO2Af//BJwBEQuV1Vrs6r+Ii+dunTyzO0CyZM1NnFJqc
::ICO:bW0qU2D2Z1+4/dkBZ/z38noV2rhGkKjfm6+X3gG/LfCjrjGYBcOMJEblQuHeNz53dvyrZ6ZYBfMH
::ICO:9aihBZiZYTF7jryZj936SEL2v1zQ61obT++Avwm+HQQfAASImCCWCstuSqb/7n+bWvjlF8+Rd3qa
::ICO:JRpQXQswAxazAL/00dsTwklekORMFHRmp+Vvhm+HwaewoGAWEJxU/SJTWPjFkz/Y9Uqj0UFdC3B4
::ICO:GjQDEMvYt2IiNVHQGW8H/E3w3ULwCQCBiNnA1TlWIvmt01O3d108BJ4B18S55o1Ac9QLd/9hf2z4
::ICO:L+W8ZU+QKK4e7oDfIt8tBr94nUi4Jm9Sqn9SQPzu7CyZw9O1LX2kAszMsJieg/nnH7v9uCOSv5p1
::ICO:VwzsGL954coE7RGQtopvFPgUstzt8K0An8JpEjLjrXh9ztAvzk0tTJ+cI12rPxCpAIfn7RwuC/FP
::ICO:4rI/bdgzO0O9zrZ8aIA91KyfVsEP3ycAzCy08VgSvfRvP305Pn0IHDU0rFIAnmFxco7011+4e0CK
::ICO:xOdy3pLxZ/h2wG+Vb42WzxqIpwnJcQK7pZudAD8gQSTyOmP61dATe3Ijn6dZMjxdjXfVhbn5InZf
::ICO:i8tU3LDmUrE74G+25QsCvAxj1/MOHv9MAoWMgRBN8m0S/OJ9InJNjgniH53+2I0kTsNUWoEyBWAw
::ICO:nZwj/c8+eWe3IuezOW+V7cJOky9dFLRHQNoqvjXAJ788oxnjhxV2P+9ABBsVGvFtEXybJpHXWdOn
::ICO:0gdUvP8vEhGfrrACZT9OTUECgDDyiwmV7mPWutL3Nxa0R0DaKr51wAfsQr+KE0aeUhh6QiI5QjAe
::ICO:6ncI2wI/9JeZAfO3AcD2BUpU7gJOwExPn5bM5q9pLpTKb7bAHfDr5yXAFID0IxJD+yWcJGFwv4Ip
::ICO:cG15NgG+/0Pk9AYp4XzqD164/hDNkgnvyi4qAINpdpbMsZt/YZcg56inswCVK0jPgx/wexDgw/f/
::ICO:ecboYQWnzz4w8bSCdhFdf5ts+fYfkWFPJ2XfADvpjwDAXMgNFBPBRZLyo3GZSgXmv9mK7XbwmW3v
::ICO:+0FO8hAB0MDEsdJu/IljynYCueK5zZr9Ml5gAQEB8yIAjN8pZSkqwEX/oiT9YUkOEOou9jz4Boil
::ICO:CKlRgtEPBnz4cjhJYPxoSQGGDyokhq1cRV6dBB8AMciwBxAdZzCdOIHifoGSifcvaubjdvdumdWM
::ICO:Zt4D4JMA3Cxj8qjCE5+Ow80YCNkheVsAn8j6//7dEum9VgA2QHJEYGifgs4zRNFMdA58/4dwOQ8i
::ICO:HPjeL7yTDvcDqoaBApQMxiW9Dn7A07iMycMKe1+IgUB1zwZsBfgAIIT1/5PPOVAJAmsAbBV07KgC
::ICO:F2A7Ca3I0GxeAhgGBIpl3YQTum2PhjGYaJYMpq4NJdz0QdfkI7duhxn2AvjBD+kQxg8qjD3pD7sK
::ICO:AElYANrh2yL44byTz6qqG+PHFEhtHfgEIm08E5eptAs+BOAHc9MQmIMuswAJLQiAoohDG+UMOyRc
::ICO:kN4i8EkAxgVSI4SRD0moJGFkn4L2h133w+wLAZACjLb+f/SwKsoWvPfwQYV4mgDP5hWixGSz4Iev
::ICO:SxJEoLLzoFFzw0X0exp8sv90gTG8TyE1al91ZL+EcYvWtjW+jcAPAJcWYPaAwjqjsMzwsoyxIw76
::ICO:dodOxJEdnSRHBMaPKbgbNm9hjcGerySyXFmalpei8zKVTwTVPB3c6+AHf00BmHxagXxV33Vc4eLv
::ICO:tcG3FvhkAQJbwN0Cw7iAdIDUuMDkhxQe+mgM488oDO2TEBU1Tr4ifOKlfqxc01h408OdP/OwcMFD
::ICO:fsFAFwCpABknCMfPzwBC+34bgV+PIhVgO4AfkBDArtC4e/KIQiJdPhxsF3wY27HTBUBIIDlCGDmg
::ICO:MPmsg4c+6mDoCd+0N0EyQRg5qDByUOGJaaCwyli5qnHvgoeFCy6Wr2jkbhtoX7lUgqx1qJS3Vsuv
::ICO:lN2nKgUIP9ir4BdfWgOxfsLwY/64j4G+cYHUmMDa+wYyhuoJmMp0LfAZcFKE0UPKLux82MHgPom+
::ICO:yXKvygbF2ieqZFLOj7mUN5YmjB9XGD+uACTgrjGW3vawcN7D0iWNlSse3JVSL7Ye+FWyhyhyQ0jU
::ICO:y9dj2I3ggwBdAAb3SAz4fpeNNaXjT4XG3fX41jH7YEDGgPTDAuNHFYb2V4PfSXIGCAOPSow96yC9
::ICO:X9qp5LBsTYJf2eLrRgjpWfBhTb+bZ0wcURB+LzzIM/mMwuU/zNePF1ALfKA4fs8vMa5+J4/Lv59H
::ICO:vN8H6LDC8OMSY0cUBvdLqERzLqBoIXxiDazd0Fia17h33sXSvMb6TQ13nUEAVNLvE4QEbKXOAop2
::ICO:Ab3c8hFyXwB2PaOq8k4+rRDrA4xpA/xwWllTTWQBW73mYeltDzCAkyT07RYYPqAwcUxh7KhVCBmP
::ICO:VgidY6xc01h8w8O9Cx7WbhhkfMABa21kjJAYssKx8d3XJsD3X6GCWozM0Y3gA7bFxwcIE/64W4Ss
::ICO:c/oRieSoQG6BQQ7KJ4SaBR/2OXDJiqg4QSVtmg2QuWWwdj2P69/NQyjC5HGFE/8ubaeifSaB3/8/
::ICO:v7aO919zi8ykYwGPD/oZ/b4Em5AMLYBfK4BAXafVq+BDADoPDD5a8v+BWWBjzefI/ogJoVbAj5CX
::ICO:GXazpz/NK2NALC2QGBZwkoSFNzUyt0wJEbbvkVs0uHfeg5MixIcI8TRBxclmC/ErK7fFlk8V10NV
::ICO:VU6tMKx3H3hA4MO+lHEZQ4/ZcTeHKo/9Sp98VpXvxNkk+NFpAhs7P0AS8LKMxYv2uB6bklxLb2kU
::ICO:1hikbN5IwMPpTZr9MNUfBdRIdzP45OdhUxr/hxUgeH78kIJUKA3RWpGhmfs19u3fPR86vu/Lde+8
::ICO:Z/cqNMW3BRnqyBtQTQvQDJNuBB/w1/+TdrdN+LlwenCvRGLInxDqtLxRS7oGEDHC4kWvOM0buILF
::ICO:N1yoyr5IJN8WZKgjb5hq9gF6FXw7/2/X3YcelWXPBhmZgdSYwFBoP96Wgg9/M2gMWL9psP6+7QeQ
::ICO:ALL3DFavaTs66LDZ76gL6AXwg7w6zxg/qOy6u0FVTbCxlT9x1O7Ha3REq2l5G53YkXaK9/aPS25g
::ICO:7V2DwjIXl6ej+bYgQ4S8bbmAWg92Nfh+ftal8T9HjH8CnhNPq7Lh4VaCb4WxawYLF0oKsDjv1t+r
::ICO:2CGz35ILaNW8dAv4gJ3cifVF+//KvEP7JGJ9VNYBa0veJrdx2aEhYemShpe1mrnwumfnBaL8/xaA
::ICO:Xznxs6l5AKC7wCcC2AWSowLpRyL8f0D+8m3/bon0HgmTR1VlNy1vK3v4/LmBjVsamZ8ZGBdYvlLD
::ICO:/28B+FF10fY8QJhhV4DvP6cLjJH9CioZ7f8DMgYQChg/oqBdLjuf17S87WzgFICbAZYve1i7rpG9
::ICO:YyD8EUCJbwsyNCtvjXpobj9AHYbdAn7wLLt2sYeoeq4/ioYfl8Xp1ZbkbXf3rm/ql+Y1dJbBBZQv
::ICO:Sm0R+MzRddHeamAXgg/Yl5QxYPJYbf9fWdb4EYVYsmKOvVG5mzmuxYDTR7j7ExfLbxFUCkCgqPex
::ICO:5QdUd0NIPYbdBr7d/m23YY083rwCpPdK9O+WWL9lN4g0noxpH/zAAogYsHHL2D5BItz8tw78WlXR
::ICO:2iigW8H3eeg8Y+yAQmygvv8PHmJjt1aNHqq/U7iY7tShDYbdzqXQ9pJuO+BHVUfzo4AuBj/gwy4w
::ICO:dqj2+L+SgjwjT8qysXhkGZ0+sRN8COY+gt+UAtQyrx0Tbov4gm2vfuTJOsO/CgryjBxSxbn4yDK2
::ICO:4LgWhS7cL7Mf1SYau4AeAJ8IMB6QGKGiBWhJAZ5Q6JsU0dPCPQ4+VaQbTgSVPdgL4Pv8ggMgyRFh
::ICO:TXsTCgDyVw4HCAN7IwI1bAPww9cIQGXw4M5MBbeSdwuUioS1AONH7QGQynF9XQr3A8Jh27YZ+LUo
::ICO:WgF8dekF8IOEkM2N/6vIzzvxrCodtNjG4NfdFj4IwKM6W6VbFS5C0I6ZfX9DhRCAdu0G0NGDrStA
::ICO:sR/wlEJiwAZsEv58QLARsxPyPmjwqeJ3QJt2AfcLfCKAJIrBHbwcw11j5JYZ3gZj8pjTmv8PMWcG
::ICO:EiMCY884cLOwBzRXGDrvx0nwy61nGbsd/FpUZgFWAPS3wHDLwKdQZftbob08wxTs/dgAYeRxhfSj
::ICO:EpPHlD2Zs08WD4C2SkFZn3ipH6vXNO694WHlzzUW5zXW39MorNjDGCIGSGUPWBOheJyr7vGyLgI/
::ICO:ShGqXECwIfV+gl8JuPEAzz9lK4SdOx/erzB+yB6yGD9swRcNP4fQGqnQAU2gdDpnMTidc0lj47ZV
::ICO:CNalvfukSrIH+/x7AXygzdXATYNP9nx+sErFLuC5toULCSSGCWNPKUwedTDxtMLgXonBRyWoAvCm
::ICO:D142SxUHNEkC6X0S6X0Sj30mBtZA9q7B8tv29M7imx7W3tUoLNvz/MI/xi0dFPccBErxoMGvNTEa
::ICO:uRhUj3kr4Id/Uwhw4wKFPMN4gIoDyWG7gWPyqIPJYwpjT6nIg5YcfPeCYIMmdPosJlXLzqGOIEkg
::ICO:tUsgtSuGh6ZiAIDsbYO16xpLlzQWzrtYvaqRu2esMitAOGRPIQeyhvmVF13zGrD5ll+rfURagFou
::ICO:oFnwKQAIdk1eFwBTYBhtd8amxgVGn3Cw62mFyWMKw/uVPfNWKUcl4B02+c1QpZJxKDgDSSA5KZCc
::ICO:FJj4iAMgAdc/179wwcPSRQ+ZGxob72vonOUlY/ZQZ9F9NVAIoPNmP0xNu4B6hQSAg2yL0QU7M8fa
::ICO:HpJMPyQwuFdi8ojCrmMKI49HB04oAu6HRHkQgDciIgAhuYouw281Tpowdlxh7LitWp1jrF3TWHrT
::ICO:w+J5DyuXNfILptixlDF7XqCoEGF+2Dz4wd/ABTQ8Hh6cV2jkCoJ00EPXBasEThIY2C0xdkBh9zGF
::ICO:yaMKwxHHpIOjUWUdwC4EvBFV9T0q+hEyQRg6qDB0UGHftFWI7AcGSxc1li64WLmkkbmpUVhiG7/A
::ICO:sc+Q7Bz4QZpQPRVcd0dQw0L8KBmThxUm/H/phwWGHpVwUvUBp4o9eNuGKvsREQrR/5hE/2MSez4T
::ICO:g3GBjZ9prF21irAyr7F6xYO3Wh2pbTPgs59oKkBEUwX65l7FgfQegZEPSYw9KTG4p7oZF8EPHt6W
::ICO:yNcgCgHApUMpAQkH6H9MwukniBhBbwDZW7qoAJ0APyxHJbW+JSxI+IccskuMS9/OY34uB5UkDOyW
::ICO:mDhkgzJOHFEYfVIhPkBVhZd18LaZUlSOHCqtgrfOyLynsXTBw+IFDxvXNTI3DNx1uztZhqN/oEPg
::ICO:1xgHtu8C/B9SASpt44qzATZuG1y9mcfVP7IdnL4JgeG9EiNP2g5gMMTb8jH9/aLKuYOI4Wlh2e8I
::ICO:nvew+IaL9T+3Pt/LMIS0VkDECIlR/6WbGRlEpOu1/I7NAwAon+QJKsAnGfNDmMFezy0x3vvAxc0f
::ICO:uXjDn+QZ2isxtM8OAccPK/TvFpGdxK5UiCjAQ7KxBtZvaqxfty18+aKHzHsGhSUDk/cni2IEcoD4
::ICO:MBV5gktWcavMflMuoGGBVP9+8CLBXIJQgHKoOAmkc8CdNzx88P88vP3fbYyd1JjA6AGrEBNHFQb2
::ICO:SMT6q8WtnBe4H1Q57q8058Ewb/FND2tXNZYvaWTe09AZ26sXjo1VrBIESqFs/aAIeId7+0GiEfhA
::ICO:qy6gAfiRwvkvHCgESTtyCHgFsXRWrufxzv/Kw0kREiOEkQ8pTDxt5/6H9ivEh+j+TgX7slaO+wvL
::ICO:jNVrGovn7UTPeniih0rBnJwBKvpertHCgfsH/uZdQDvgR90PKiMkKMWAhO82jAHyi4z3PijgxrlC
::ICO:cap44BGB8SMOxvy1gXTE2sCmqaJ1B3P/K5f9AI2+Oc+HzLmd6iWohM/CH/FwKBRQI2savr5VLb9W
::ICO:+2jOBXQK/BqCUoXboGCVza/Bwhrj7gUPt3/qgQQQ6yMMPCIxelBh/BmFwX32I0yy2Zh8NUjnbOte
::ICO:u2Zw73W7+pe7rVFYLa3+iQpzHvbf4ZbWbD+qqbwR6c2Y/TA1ngreavCj7oetBPyOk1NSCDbAyjse
::ICO:Fi95uPoH9rmHPxnDp35joKoVN0OBif6TX1vHB6+5FkgDyLjtnTv9pbIrAW+rHu5zywdKjavhRFCZ
::ICO:yXgQ4EelKxSCUBGTzwPuXvCQWzRIjolqu1uP/NnJ3ILBoh+qjVSo4vxOYMe2yT0A8MPppnYFh594
::ICO:4ODXuFaMyWcI5BC8NcbivC7da5LCodpcP1Sb5YtSNM4OyAs8ePCBJgNEdE3Lb3Q/tHvXeMDSFb+b
::ICO:3YICBHkXznulEPIV779dwI8yitUHQ3oQ/OBY2NK8W525EQlrBYqh2lqRodm8XQo+0OBwaNvCIVrQ
::ICO:LQEfANj2CZYu2x578AWPhhT4/3sG636otvD2re0OPtBgW3gvgF+0AI4Fcu168/2AIM/auwb5FS4d
::ICO:1+6UvF0GfnMuYDPC1RB0S8EP0oRi0CUATVsAAFi+5HU+YmgPgA+06QK6DnzAmnMB3PuzFvoBfp6F
::ICO:8y5kne8Itixvj4AP1LAA9Zh3JfiA7QfECEtvaehcE/0AX2HcNcbq1SZCtTYrb5eCTxXXA+psrOAH
::ICO:BT6AIAZf5pbG+g27fFevHxDcW7mikbsbEaqtHXm7FPx61LlYwQ8Q/OJ9AZg8sHKtiX5A2P8X0LT/
::ICO:7zXwKy16awEimi2wC8AvEgP3Xncrr1aT/+DKFa/ud4SbkqGLwS+7FmESNj0P0C3gE4IFHMLSRQ/G
::ICO:Re1NI77/1znG8ryGjFFD/78dwQc2OQ/QTeAHf6UDbHxgUFgJLchXUOD/168bZG/pYnzAluXtFfAj
::ICO:0gG1Hyu4C8EHw8bkX2Ysv1VnQsi/tvimBy9bshTbEnyq5hum9lxAN4IfpMm6gnuv+wufUQrgP7B4
::ICO:3q3r/7cF+BXXK6l1F9DN4APFhaGVy151Bv8+CRtVdOXt2v5/O4IfpQituYBuBx/wA0YT1m/46/s1
::ICO:JoRydxn5u8ae5a/w/z8v4AOtuIAeAB8AyJ8Qyt4xWLlS3Q8IQsgtvelZBZFN8t2G4APNuoBeAT/4
::ICO:jwBTsJM8ACItwNIFt6qytjP4VHE9oDIFyHpE5PeJexZ8oBiNe+VKdT8gCCq5fNGz/t/U4BWktwH4
::ICO:pd8EEuWY+2ATz8ywOB7fswo2lx2KAwD3JPgo9QOW5ysWhvwQ8hu3DNZvNvF9gG0Avv3LLIWivMmu
::ICO:6by5DAAX56xdLGrDKQAvniOPCWvCGgHuRfAB+CuD9pj1+s3SwlDgCTLv2qNbxcigUXy3DfiWBIgM
::ICO:a29lY3kVAE6hQgHOni1ag0tCKFDp8E77wpUJen/ApyDtf0F87Z3QwlCwA/gNr3hyJ5LvNgOfGBwT
::ICO:MTD43WEsbTAzkb/3qaoTKEn8BOBKy9gz4JfdZ2AxvDDkB5JefMOtvfy73cAHQATjCAcEXHj+p8+7
::ICO:OFnCvWQBTtjukNTuH+d0piBJiGYF7UrwDSDihOV5z34m3j/GnV80yFzTULHyDaAhUTsr7wMGHwCY
::ICO:QWBAGHEWAM7eKWUrKsDsLBkGk1y88642hWsxEScGm54EHyh+rDlz09gPNPk3Vt+ywRnCG0BDonZW
::ICO:3i4AHwAECbGhNwpE7h8DpcYOVLiAs1OQJ+ePFIjwhzGZAnEpYy+BH6RJAl6GkXlXF68vvu77/zDg
::ICO:2xh8YtYpmYLHhde//f3/cJVnWMzOUrQCnDjnuwFB38zpdY/IzpP1IvhFMsDSG34/gIHVKx6EQsn/
::ICO:b2fwYXtzjoiRgPidWcyaoLMfUNkPAhmeYfGFM6MXXZN/LSkHCFyMy9Fz4JN/XmDxvG317pq1BjLw
::ICO:/9sffHZETKx5Kwva3fg2g+nEOehQtupRwNy8XybzP+Vg5qTZF+km8FGaENq4acAGWL+ukfO/1dtx
::ICO:kPxEt4Dv/9X9aoC0cf/98+cevodpCKqIF1alACfnSPMMiy/9YPxM1ls/26fSMmwFahbYZeADvgVQ
::ICO:QH7BIHNDY/UtDzqPsq1i2xV8BrNDjlxzVxeTiP0mgwlzpT5dQJGLQUUrIMwpZq8YCqG2oF0IfugC
::ICO:u8DCT1wsX9I2Jm+zy7/Nyttl4Ptp3acGyIP7bw59f3AhqvVXPlNGPM2S5kj/l6k7vzvsjP/SSuGe
::ICO:J0iongLfF8/kGQOPK3gZRu5O9B6AtuXtQvDBxqRUv8iajSvOz94/cnj6sIdZcJQC1N4PMAfDMywI
::ICO:7t/PeKvvxGVKgk35sLDbwQfsDqE4IfOujdJdNgLYrLzdCL5d+DGatRZsfunI/JGCzRMdK7TOySD7
::ICO:wBfPPXzP8za+QGBIUsRg7hnwQ+ngOz/b3OyDAD3sDKqsl/mVY98b+xOeZkmhcX8l1f949CwZnmb5
::ICO:hR/u/tOcWf+KIxMkITym8oWirgY/+NHJc/9dCj4zuwNqSC3ml15+/tWJb5yZYkVzVNWBD1PjLWFz
::ICO:pH/ruZ84Xzi36+Wsuzo7HB92CKSjNlx3Lfid5NvF4I/HR5x1b+17z3x/5Ms8w6JyzB9FTQVc/cpP
::ICO:n/POTLH6/GsTswuFpW8kZZ8SEAw2pllBd8CvcW2T4Ps7Hby0M+SsuuvfzfP653mGxalZoJbfDxM1
::ICO:ylBW1AwLmiUzN7Xwy0k18NueycM1eS2o9AG3HfBb4LtZ8NkYkKDR2DCtuCsvP/3K0JcBgFFa729E
::ICO:LYVcplkyZ6ZYTZ8bfXldL30awK1+Z1iCWTNHrxzugF/j2ibAZ7/VJ1W/SIi4Xi2sfvXpV4a+zDMs
::ICO:ZsCR4/1a1JIFCOj0NMuTc6T/6wvXH0rFR34nJhJ/xbCHvM5oAhFRaa6t2QrYAb8xL38Eph1yVEr1
::ICO:I+9lL+aR+8qzr4z+yFpnMFoAv7KMlihQAgD4/ReX/3qMYl9zRPyIZ/LI66z2X1TYT0lUFLgDfit8
::ICO:GcwMu7Aj+9UANvTGHWb9m5d+duNfnZw/Uggm7dAGta0AvmR0CqBZkDl96M1YbHLPlxTkV2MycQRg
::ICO:5PQGjPE0CEwMAkHYSo1QCmyiYiPA3zTfGuBvJd9gZCWYDAjMzCSIZFL2wREOcjp7mxj/aVWv/ceP
::ICO:v7rrNlDql6FN2pQCBBS2BqcPvRkbmNz3aZf13yLwiwnVNyAgYeCiYPIAGMa4ppnYu01V8LZp+Qwp
::ICO:HCFAiIkYFDkgABm97gnIHyuS/3nFW/kfReCnWdIcQsFs26OOKIAlptPTECdDpuiPpjKPQMoPMxc+
::ICO:ZcgcN6wPCRZOXCYGRWhJbrNmv/K+9ZeldNP8/P863vKbAJ8gkPXWN4hEXpG8QsBFIvUaBP3pkf+d
::ICO:mA+e42mWmINppaNXjzqoAAFZRZg+BK40Tad/YXEw4SrHCO9QghzpVcSubvj5khbzKtjo2A86b/GB
::ICO:OhRXCWSxcXU8ObK27zu0HL7HYMI0RCeBvy80gxlxeprlmSlWM+D79JWfbUHEfr3xzNbW2xZYgNrE
::ICO:/mGjuenW5h9+Xuji3Ck+hVORy7Y7tENbQv8fHBP3uDMjoQsAAAAASUVORK5CYIKJUE5HDQoaCgAA
::ICO:AA1JSERSAAABAAAAAQAIBgAAAFxyqGYAAD8cSURBVHic7Z1rkBzXdd//53b3PPYF7AJYALRkSwAf
::ICO:EqTIBBciQFkUCFuSKYEgq1xeKHqmHJfIVDlkKs8PSVwgYidVjuOyE9tJSDlJVWTF8W5KlkiBoiJK
::ICO:ICglYilYgpJJUJEUkAQpUcS+X/Pq7nvy4XbP9sx2z/TMdM/MLu6pIhd752z32d7+nXvvueeeC2jR
::ICO:okWLFi1atGjRokWLFi1atGjRomVbC/XagO4JE0P9wtxrU7T0vRDounhNtp0DYDABwAMTM+aE1/bT
::ICO:oQk+e4GcHpqlZQvKIxMXLfWvCYwegJychgS2l3PY6g6AGIzTkxAfvALxwAzZUYpnjr85NFY0xELC
::ICO:BoyFtC1EtGvpjcT9WywAGDSZbxjZTR99klai9M4fZ/OHazN0/8yEA2xth7AlHQCD6YGJGfPRmSOb
::ICO:gP/83Tzy2vyKhYx7vwEj67LNBM4S6LNERkZC1vzSYQ8g6qFQEyV/ehHr51u5VxNd0UiXItrbtCGJ
::ICO:a0TqRjzTdq8b9bdodE1iyIyRE2VZ/A6A7wgAQ+YurNvz30EZzwLAp7+7u8Y5nD/O5uw4eHIacqs5
::ICO:gy3kAJimJiFOTws3OIv//N088trSwvsGcmNHC5XFoxkj+0sVWcKgOTbiv1AEoOSsgAOvREcvLEW0
::ICO:d3rdpHUThj9V3Zjwp2mD386QyIgBWCIDAiAIWLWXIZlXGLIiID7HxKsGzM9ZKJZOX9i75l/nzHE2
::ICO:H74Ad6s4gr53AAymh4/DCM7h//2HeHyhMP+bBoy7DJE55sjyyHBmFBW3DFsWQSBI6ThMYAJ5PTOb
::ICO:wR66PhhIga9c97VGl1rQReOXMFVdakG3TRui9FvWpXSuGyZxdAkAM6QgkqqFAZAlhAECYdAcAYOx
::ICO:VlleA8nCkDHyn0r2+tOGKP9v3xkwmKYnIU5PkxthSl9I3zqAevDP3P7DEcvYdUfeGvz7Lrt3WCI3
::ICO:ItlBRRYAlmCwTQwBglAwUtiIEkDnw/6+6TWj2mP0/KnbEFc34WF/aroEAMzqn+QwMxnCNAmEIWsE
::ICO:6/YqXDhzkPJPfo52/emJCzQH+I5gWpyePt2XjqDvHMAm8I8tjWUMfojAv2WQudsy8ig7q2CWDgNE
::ICO:BEEhr72Gv4c2xNXdUvCH6SqHAGYXRIZFGcoYA3BlecWA+b8l23/0608PfQ3oX0fQRw6A6Uwd+FlT
::ICO:PgjGQ3lrdKzsrEJyhZkhiUgg/P0BoOHvqQ1xdbc8/JvbGMzEcAUJM2cMQsKFYPGkZP6jX386X3UE
::ICO:OAOis/70orfSFw5gapINf67kg8+Mhwas0bGyswIpbYcJBtW9Nl15MTT8yetuQ/jr2piZJYPFoDlC
::ICO:7DkCN+AIHpm4aN0/M+H0OljYBw6ACSCexKRx2y/92W9LuH93wBrdVfLARwj4gIa/pl3D33P4I9uZ
::ICO:Xd8RSLggGF8rOat/8Ilndn8dAPgMi16OBnrmAKYm2XhxGnwWJP/1ncUPC6J/mDGyH163l/0IviEi
::ICO:Rvka/kC7hr9v4Q+2MbMLMA1Zo6LgrLgA/+5c4c0/fvD/HJp/ZOKi9UBITks3pCcO4Mzx8+bZCyec
::ICO:SUwZh9//4b/KiIFTgETJXbUBMlOJ4Leiq+FPXvc6hj/YJlm6ggxjyNoJ2y0tlJy1z3ziW+PnzoDF
::ICO:wwB3e0oQlkSWqpw5w+LshRPO7xz72Qdvv/O+r+aM4VMlZ8UtOWsuQVga/pi6Gv4tBb8vgoQBSF61
::ICO:F2wGjxmG+aX/cdfKGRyHIBBPTbLR4McTl66NABhMDwN0FiR/7/1r94DwJZOyRtFZdojIbGaQhj/Q
::ICO:ruHfcvCHtrNkIsG7smNivrx4brX808989tl3LwSD4mlLVxzAGbAAHgaO3yWy7uEvWiJ/ynEL0mWH
::ICO:iUTV42n4Y+hq+LcF/BttDAbsrDFgCcbCurv26U8+M/7EIxNsNdrclpSkPgWYnGTjLEhennyYMs6t
::ICO:Xxowd5yqOKuuC1do+FvU1fBvM/jVdwSyyk7BlXDHBo3Bxz5/5xsnH5ghW00H0u2jU7365CQb09Pk
::ICO:/v1jL4ztNm74r4PW6Mk1e94mkBXHCA1/oF3Dvw3hr21nltIUGRhkSNd1f+3Xn9nxeNrBwdQcwCSm
::ICO:jGmcdv/F+659NGsMfZ6AsYpbcImoJsih4Y+hq+Hf9vD7IlmySSbnjAFRkYXHv8/P/9rZCyccBlMa
::ICO:TiAVBzA5ycahabBxx+xHM+bAlwA2HLes4W9HV8N/3cC/IQxidkeyu41VZ+nciLnzY68szFTSyBxM
::ICO:PAZwBiymp8l9Y2ImZxjWXwJsuBr+9nQ1/Ncd/ASAQAAJY7myUN6V2Xly0Z7/Rw/MHLH/3Y0/ykRc
::ICO:qm1J2AEwAQ9jEmz8Qu7Gv7Qom3PdsgsNv4Y/bRvitG0B+De+IYCQWays2Hkx8I//253XTv69H99c
::ICO:3qhTmIwkOAVgOnP8aQO4Cxln6UsD1s6Thcq8hr8dXQ2/ht9rY0g2KUMmGe6yvXLfp7+1/1ySeQKJ
::ICO:jQDUVt4TjmHPfnHQ2nly3Z63Nfwa/tRtiNO2BeHf+EyQI23psEM7rR1fnjq+8P7T0+SeOX7eRAKS
::ICO:yAjAX+47e+z1U4PZ8cfKzpoNsF7qa1VXw6/hj9BlsDNkDJslWfjWqNzxywBwVwK1BzseARw/ft6c
::ICO:nib3d46++f4Ba+yLjlN0GLLGO2n4Y+hq+DX8DXQFyFx3VtxBc+TOWZr/4okL5Dx9HB3vG+jQATDd
::ICO:BVUJ1TQz/4rINF22Edy/r+GPoavh1/DH0CUSxqq95AyZI6e+8IE3Tp24QE6nm4c6cgCTkxBnL5xw
::ICO:THv2izlzx50lZ9mF3tjTmq6GX8PfwnUZbJTdkrPD2vnF6Q8s3PniIXS0g7BtB1Ad+t9x7QMD1uip
::ICO:grNk69z+FnU1/Br+Fq8rQOSyDZNMk4h/5+xZksB0hAXNpU0HwDQ+Psu//yEeNITxu8xSgmX1Whr+
::ICO:GLoafg1/G9dVn5G5bq+6OTN/fOoDs/eenj7tTmGqrVFAWw7g/okZc3r6tFtaW/jHQ5mxO0vuanW9
::ICO:X8MfQ1fDr+Hv9LrE5EqXTWH+xdSxpbHTmJRccxxMPGnDATA9OnPEOXNsacwQ9OC6vSIBmLENb9DW
::ICO:ka6GP3ndbQo/pWFDXN0k4FctwmXbGTKH82ZOPggQPzox03JuQMsO4H51E7aE82De2jnmsuPqMl4x
::ICO:dTX8fQE/UD3SIxkb4uomBr9qY7BZdAsg0ENTx66OPTBzxGl1FNCiA/B7/6tjgsRDJWeVyTtzrxXD
::ICO:E9XV8Cevu03hD4qZbQxjq9ftNvzqK5HLjjNk7Rgzc0MPAmh5FNCSA/B7/6wYeDBv7RyT7DhhNfub
::ICO:GZ6YroY/ed1tDD8R4JYZI78g8LYPZ1BZZoiI0Fm/w+8Lg82is8aizVFACw6A6dGZI/aZY1fHQOKh
::ICO:srPKAId6Gw1/oF3D3x/wAxAGYBcYb/tQFjfek4U1SGB38w9tFfhVW2ejgNgO4P6JGXNykg2TBh9q
::ICO:1Ptr+APtGv6+gb/6bwMwTGDXO0wYGc8BtGpDXN2U4ffbGWwWnDUI4KGp96/seWBmIvYoIKYDYHp0
::ICO:ZsI59CIMIvlbFWcdHNL7a/gD7Rr+/oKfALcCDOwxcOAjOUibsXfChFvZ+P23IvzqK5HLjj1ijY5l
::ICO:DfeTDCDuKCCWA5iahACIMzsXj+bMoRGXbVcf1NlAV8PfX/D7IoFMjiAEICzC7kMm7IKKA2xV+KvC
::ICO:LGxZgYTzEQLx6IErsc4bjDkCmMYjE2wR5O8KMjLMtdfW8AfaNfx9Cb8wAHuNceBkBtYQAQzsepeJ
::ICO:/BhB2pt/YEvBD4CIjJJbcAfM4Q9/8c65D5+ePu3G2SMQwwEwnZ4+7c6Za2NEdKzsrIMIDdN+Nfw9
::ICO:tCGu7nUEPwAQA2QA1pCoKuy7zYIZMw4Qy4Zewe99ZbC0RJYNw7x7apKNxSszTfluqvCIN5cQovw3
::ICO:B8wxgyFt/zfV8AfaNfz9Cz8B0gayOwgHPqrqajID7DLGDzePA8SyocfwA9VgILnsfGLPNOiBmSN2
::ICO:s2BgEwfANHrgivyDY1fzTHTS4bLBzIISNjyyXcOfvO71Bj/U7+yUgX3vtZAZEmAJsAsYWcKuQyac
::ICO:AoManMGzFeD3DXHZkQNGfmzxAwsfAoBpTDdkvOkI4PT0aXdlZcVlyOO2LNUM/5sZGNWu4e+R7nUI
::ICO:PwCQATgFxq53mhCmgt+vVrnrkIncGIFD4gCxbOgb+H2Y2RkwBywh6HYAePHQoYZxgIYOYNLzHtmR
::ICO:/b+cMQZcsJS65w+0a/j7Hn6QGv7nxlRvDyj4/eexNyIOEMuGPoI/IEbRLYNAR6eOXc3j8rsa5gQ0
::ICO:dACHfO8h+GjeHMgz2Kl/lTT8PbQhThtdx/B7wi5gZAj7blN1av3noaYCjD11cYBY1+0z+P12hloO
::ICO:BNxfwcqKexbUcDmwgQNgwuV3Of/2bs4COFp2SwCQbplvDX9iuszh4HfThpZ0U4KfCJAVYO9hE+wy
::ICO:qivYFB4HiHXdPoXfF8muzIkBNz++/wTQOA7QcARwFiRLK3MZInzQlmUAnF7VHw1/Mrr+clcu/Ap9
::ICO:Z2+gIQ0bhD//P2TCyNbm/ofFAZqOlvocfgIRQ7oDVj4vBd0FAIsTB9pzAABQKFeyBFEgEPwt1Br+
::ICO:HtrQqI0AaTPyo4SDv5JBaaV2t1vf2RtoSMMGf/mvfv4f/BxQcYCwfQGbrtvn8PttRASXGUJS0z0B
::ICO:kQ7AX//P5rKfzVs7Rlx27FQKf2j4E9MlAlwb2P83LBz8YAbZIYJ04R0z13/2pgm/LyzV/H9v3fw/
::ICO:+Dm7jL3N4gBbBH7AzwdYhyT5d778vrmhRvkAzTOFJOUIgqhNYxq2a/gT1RUG4JQYYwcM/NwRC2QQ
::ICO:uEEIaDvDTwBIAG6Jsec9dfP/gJIfBxhrFAfYQvD7/2AwCJSrlI3O8gAk2GnkYTX8XbAhThsB0gHy
::ICO:YwK732GCJfCWIybc8uZer+f2dgF+IDAiusNS83+5+Yd84Me8OICsjwNsQfgD/3T3DNkNDxFtmgko
::ICO:QDkg/PgxDX8XbIipCwKk15vte48FEsD4uzZ2u/WNvV2CH6S2/w7uFfiFD6r037DqP/VxALghH3bD
::ICO:3k51N8MPAolV5HMRlwMQ4QAYTA/MHLF/731zQxB8f9FZQ331Hw1/F2yIq0teb1cBbjhsAsQAA+OH
::ICO:1G43N5Dldl3A74sEzCxgRqyI+OLHAar7AgRtWfjVt359gJEhgvNZILo+QMMRQMEhAqsRQM2oqF3D
::ICO:NfzJ6/rP1Ct3NX7IrL7wN0xsRLep1/Z2Gf6N7b9ZmFmCdKIvWBMHKHLtSkGX7G1bt8G7ShAkQa2P
::ICO:AOquKAE0XALU8PdId2OsB2kDA2OEcW+5y9/ttv/WzdHtrtvbo9EHidrtv1FSGwcQ1ThAX/yNG7XF
::ICO:eFcNahQGbqEmYEc9iIY/ed26D9gFzAzhhgm13MVS9Wo3HLbglBhU95fe1vCTyv4bGBc4cDILIHz+
::ICO:H9QHvDhAloAIZPrqfYjxrjbxewBiOgANf5dsiKtbbyup+f/++nRXqFFAnCBgyzbEaesy/CRUwU+Q
::ICO:iv4bGcDIRvxwnfhxgN1/w4CzrhymMFF1nH31PiQEP9DCCKB+HUDD3yPdkA/8ctd7AumuPvTvuC+H
::ICO:wT0CTkVddDvAT/CeA3mQGgpgZ51RuCar1X9u/LVc4/l/4IL+iGn/MQsiSwADhWsS9jpXRwTC9G/e
::ICO:YafYiW6C8APemX6NRPf8XbAhrm7IB366az4w/w8GsYwsYOYAe722PVV704KflGMjVj08M1BeUr11
::ICO:bgfh5+7IYMcBE+O3mtj9bhPCoqqTaCa+zttPZvG2j2Qx/4KD2ecdLF9xcG3GATtAcZaRGfGuaSl7
::ICO:qunDvPXgB2I4gLg30PCnrBsGv/dVumqpy5//+72jdNQRWDefzOL//PsiBnZ7vWGa9iYMPwn1n3QA
::ICO:doDSkiJtcFzAyALv+nQemUHg7R/NIjfa5mn3ATHz6s77jlrYd1Q9T3uVsfgDBz/7roPXnirDKQHF
::ICO:axLMgDWk6mMblueMAw6h2e8Wpz1N+IEWHEDUkGfTjTX8yes2gN+f/7/1mDf/F3UF2wnIDInuZAMm
::ICO:AD8JQPjAS8ApMpwSIzsskN9FeNen87AGgYMnc2p0k6+9gnQ8p9HohW0m7K2iSDUysIYJ4++1MP5e
::ICO:C4f+dg6yDLx8rgynwHjlXBluOdwhwLtGO8+hpq0D+Ju5xJYcQNN2DX/yuk3AJaHy//cfVhFs6QDk
::ICO:/VX9OMAt92Tx/T8vorLK6rOI4Wo34Q/+HYShgJM24BYZTpGRGxUwLMINxyzsPGhi760m9rzH3AQ8
::ICO:u6qzFQKxh/tNhdRzr66c+A6BPYeTB275pFpev+VTmx2C9ByCMAEjR9WAIuRmh9Dw+YR82Orfrdnh
::ICO:ALEeFyE8GVjDn7JuzF5bGADc8HRtABAZdSgmqDW7otoTgR+eTQyUiup38OfxOw+Y2HvYxK5DJjJD
::ICO:DYAHGhbzTEx8hwBUQfBBDnMIbgl49Yky5i7ZmP2eA7aB4psSRo7UVMGgeI64Q/jjSOwgINddVMOf
::ICO:sm4c+L3h/9AegXfcp17A+iU/fxh7wxELrzxtwxhUPVli9rYx7AdU7zry8waMDOHn78rAGiC87Vcy
::ICO:yO3ePF0JDuu7Anwj8X9f/zmHOAQzD9z8yRxu+ngOlRXG8g8dzP+1g7XXXCy86EJWGJUlL+Mw6m/R
::ICO:BfiBNoKAm26g4U9eN2bPT4DKd89FrHeTCpwZFmHPO0386IkKsiO1W4S7Db/fi5IB3HA0g8ww4T2/
::ICO:kQ/9AT9gWXVqPSU/QrzhMQnlBKSzMQ0hAWR3EsZvtzB+u4XZizYywzZWX3UxO+uonAWuvVTtP0K/
::ICO:jWxr1B4lna0CaPiT140JP6DAKCwyfvEzG+vd9XNgv6fac6juGKxOl63ahd/7h6wAL36hCCLgB/+9
::ICO:BCMH3Hgqi8wg4eA94QE+IKEgX6dS1+tXawh4oxOnyJAV4JXHypA2Y+Gyg9mLDhiAs8owcio2gDBH
::ICO:nDD8iQYBNfwp67YAv99OQkX5oxT9a+6fUOWvnZIKBPYM/kBDbodqdSsMpww8/x+VQ7j85yUYWeDA
::ICO:yRysAeDgqRzIADJDtMnBdcUhBFYF/GkIsPHVKTJkGXjFCwS+GlwZkGp0ZmRVMDA7qsDnLvT8cR5H
::ICO:7CCghj9l3VbhJ2+/+x6Bm+9pnO/up7nuO2zi1Qs2MtbmOEBse5OA32vzk2j8njO/i0Csshor68Dz
::ICO:/6GgRgh/UYJbAvYeMVWiTyBAmIpDqFsGBKFmVaAe+OBSIFg5KpCCncgbKXi9feQ5hD2AH2hhBFAN
::ICO:Amr4k9dto+cH1Itl5tSe90ghLw6QJew5ZOLHX90cB4htb4Lw14g/pHa89yzgEMBAZUXNV157uoKX
::ICO:v1pGblRAmIS9EyZ2HlQOYSzCIbQldcDba4zFlxxce86BYQFXHttY6oO39l8DvAe5v2LR9Dn0CH6g
::ICO:1VRgDX/yum3CLwygvMi4pcH8v/pzwTjAaG0cILa9acEf1h5wCACqS2bWICEzTGBHVT9+/UIFrzxZ
::ICO:6xB2HDSx57CF3e8yICyCkYm4YYQ4RbWZav4FB3PPO1gJpAKXFiWESbAGAsP5APAIAB/7OfQQfqCV
::ICO:IKCGP3ndNuGvtjWZ/9ffZ/8RC5lhQmWFq8lCfQd/WJtPVSCRhkSIQ3jGxitfqyC3S4Bt4N2/mcOh
::ICO:v5WHdJsnCPkO9JVzZVz6wyLMHFCakzDzVJ2/D4yLmuy+4HC+rd+tx/ADcXcDKkfX3zCFfNjX9nYC
::ICO:P6ko+uAegZuazP+D4pTU1mB/Orcl4G8gLAOjBINgDRIGxoUa3LjAj/+qDKfMCv7oPKnqMp5bZvzs
::ICO:WRuyzCBSwFuDVJ0KSMeDnmuv14/w++Y1AzxORaCOjemK7vUCv98WZ/4f+AHpAJkBws33ZGGvbq4R
::ICO:EHqvPoI/1ksvN3IHDEs5SbccccH6awlAGIT5v3aRGaTqtZrlTPQj/IACm9A8FTh2QZBOjEld9zqD
::ICO:XxhAZZ1x870x97sHfjgzJDZVBwq911aCv76AJ6v058I1iZfPKQ8gGxTH9ldErj1nq/TkOM+nXXv7
::ICO:YNgflIYOYCzw7zgFQTT8TXST6Pm9f0hXLe3FfQP8Hv/Ge7IY3CPgVjYuuK3g94QBQALOmmw8/MfG
::ICO:XH7hsoPyAqu9/k2G+P0MfytOoa0N1H3zYlyv8NtAbpSw/7C3/7+Fv6KZBYycl9QSdq9tAD+goM4M
::ICO:EV5+ogK3URzAS0t2y4yFl1yYA9Q0uLdd4AfacAB982Jcj/B74hcA3R9x3l3UhasFQu7NwV4PiQNs
::ICO:E/irbQJwS83jAP78f+6SAyOzMSXYDvB3HgQMXLxvXozrGP5GBUBjCampQ/CY7OCN+uKZNWuLAz+r
::ICO:oqDF2cZxgJr5f4WrSUjbAf44/UJDB7DQxk1bNUbD39p1wwqAxh33+VOFfYct5IIJQdsN/oCwBOwG
::ICO:cYBm8/+O7O1z+IEYIwANf5u6KcAfLAC6J6QAaDPxbdp3m9oYFDwssy+eWbO2FuGXXhzglag4QN38
::ICO:3xqg2rMBO7F3C8APtLAKkLQxGv7WrwsE5v8TLcz/gz/vbQzae5sJpwII6pNn1qytjbP6CPASfFQS
::ICO:VOh9/fX/uvl/R/ZuEfiBhIKAUe0a/mRt8Of/+zqa/6uNQbsPmXAKHDqC6Lvn2+ZBnX4coPCmxGtP
::ICO:VQDUxQE82Gcvbcz/O7Z3C8EPJBAEbNUYDX/7NpABVNqc/1evFVUgJAV7E9Ht8JReZpUV+LNnVZIP
::ICO:CWwq6DF3yUZ5sXb+vx3gJyS4ChAlGn6vPWX4QRsHgLYz/69exrtgNQ7Q6YaWNHUTOKKbpaq+M/99
::ICO:F8KgzTkTDJBB1crEbdvbZ/D7snVTgTX8m9o7nf9Xr+PFAcYDJwf33fNNAH5fhFBVh649ZwPwQGeA
::ICO:TBUAfPnxMqxBAtztA3/cVyPRVQANf3o2dDz/D1zYPwdvn3dysIh4C7YD/MTqGK/ygqrNB9Ru43XL
::ICO:KlmoEQnbFX6gH1OBNfzhvZi3/r+7g/l/vciQk4Mb2bDl4Pe+sguYA4TFl1wVBzA2nMAr58oozUpV
::ICO:OKTVMmlbHH6g31KBNfzhuuSt/492Nv/3xYf+5ntzmzYGJWJvu7opwA94gcAMMHfJqcYBGADY2ywk
::ICO:499vq8BfrQfQhPD+SQXW8DftxTLDhP1HOpv/B8U/OTi0PHUTuxLXTQn+aptRGwcQXgLQq09UYA3R
::ICO:pjThrQy//32cdyTxIGBUu4a/c11hRCe0tCS0sTHo4MksKmtqKrBd4Ye3FFheYCxe3jgeOWr+v9Xh
::ICO:B+J3EL1PBdbwN9UVBlBeZdx8TxaZgRYKgDQTAizv5OBtC7/X7scBFl5y4RRVHQV//i8C8//rCX4g
::ICO:wSBgpDGNdDX8sXVFzAKgcaVaIORkFkP7hdoyG7j2doIfqI0DEKnvnTUZv+TXNoQf6GUqsIY/ni5t
::ICO:FAC9sYUCoHFFWBsnBzeyK6p9K8Bf/d4AZIWx8II6gODVc2r+H7X+v5XhjztR7E0qsIY/ti4BrRUA
::ICO:bUFYKgew74gFt4zuJQT1AP6aOMBLqoC/U0BkNaWtDH9Qz//1JiKu1f1UYA1/S7rCAMprjBtPZlsr
::ICO:ANpMyNsYZBF2vVNtDOpKTkAv4Pfa1EYoYP2nLl7+chnleRm6/3+7wA80TwWOfTZgbGMa6Wr429KN
::ICO:ewBIq+LnEuwKOTm4kW1bEX7AO0ptgPCTb1aw+rI69CNy++8Whr/RNeqle6nAGv62npnbxgEgcSW4
::ICO:Mcio2xgUZdtWhb/6vVcfYP6vbYgsunJEdy/gTzwG0NSYRroa/rZ1/QNAjYTn/8Hrs8vYe3hjY1CU
::ICO:bVsd/qA5Zo7CRzrbAP5WJP1UYA1/27rCUCfT3pT0/D9wM79AyNghE3YhhYSgfoPf+xq6/LcN4e9t
::ICO:VWANfyJ/bCuF+X/1+n4c4J3q5GCuKxASZVdU+1aAP7Rtm8EfxWu9pJcKrOHvSJcIkGVgaH868//g
::ICO:fQC1FJgZjpcTH9Wu4U9Zt4WeP66kkwqs4e9YF1C2uWVWqaopi1vavAyo4e+SDXF0W4C/FYeQfCqw
::ICO:hj8RXSLAKaueWZhovwBIMyG1McgaIBy4J4vKanQcoJG9G99o+BPXTQl+IOlUYA1/Yrp+AdDdh0wY
::ICO:VjIFQBoKbZwcrOHvkg1xdFOEH0gyFVjDn+jLKR0gv0uV7wbQUQGQZuIP/Q+c3Hxy8Cbboto0/Mnr
::ICO:dgg/oVtVgTX8ieuybOMA0A7F8E4Ors8f1fD3QDcB+IFuVAXW8Ceu62erdVwANK5QoEBI3cnBGv4e
::ICO:6KY87A9KUwcQpaDhT0mXvMo/CRcAjSWksgKli3hFQjT8yesmAH8rr0r7qwAa/lTg9wuA5sa6M/+v
::ICO:3tp7E/bUnxxca17gGw1/4rpdhh9odxVAw58K/L74B4Ds6+L837/H3sObTwyqM0/Dn4ZuCvAT0kgF
::ICO:1vCnBj8B1QNA9nZr/h8Qf2PQnkYbgzT8yeum1PPH6TdaCwJq+FOFH0Dt+n/X5/9qY9CuwMnBGv6U
::ICO:dVOCP27PHj8VWMOfOvygjQNAuzn/r97eu9fYIRO5MW9jUPVDDX/iuin2/MnWA9Dwpw+/L7L78/+q
::ICO:Sd699nonB0MCEKThT0M3RfhbkeYOQMOf/rBfAMJUX511xp73dH/+74sfB9j9HlUfIGgbBY32bY+4
::ICO:joa/gW6fwA/0qipwGrpbAX4CINQ6v+FVY2QJ2OuMwjUJYjUHv+EOS83/ZYObpSG0cXLw/jssiKw6
::ICO:RK94TcJZVw6JHTVVEKb3zGM+dw2/19Zl+JsBHqsoaCPpiwfdr/B7jcIAwIDrAJBAqcCQDiM/KiAs
::ICO:ws8dszB60MTeW03sebdZXZMXHf91Whf/nm8/mcXbPpLF/AsOZp93sHzFwZszDowcofCGBBiwhghE
::ICO:qrQ4CIC/dBhVaBPN2zX8ydjg++b+qgqchm4/wR8AnhhwbdWjlpcYEMDguICZBX7xN/JwHWD/bSZ2
::ICO:vdNEZqib3Xw8MfPKpn1HLew7quIR9hqDXeDKV8pwCoyXz5XhltUIAQz1ewQcAvsHbrR67HYruhr+
::ICO:jqSpA+iLhxel22P4CVBzYwHVw9vqyKnK4gbwRg54z9/KwxoEbjqZUyfy5jdfTTretSKG1T0RVr8P
::ICO:SzUysDxH9Y5P5tTXT+XgltUZe1EOgbExZWCJyC5Jw5+sDXFXAdoaZPbFg+4R/D7w7Hjz9yKrU3UC
::ICO:PfxNn8nDGgBuuicceOkC4FrgezHcbyqk7KuenuO9VX5w0swTzDxwi+cQbvlUDrIMvOw5hFfOlSEr
::ICO:KsZRvKbq8BtZqgYWWar/NPzp2tBIWn7t+uJBdxF+4QEvPeCdIsMpbszff+GohT2HTJAJ3HJfDkYm
::ICO:AnjvWkA6tf26It6vVc1NCHEICDiEmz+RAwGYf8HB3PMOVq44uDbjgB01SjDyBDNLKjBqbow2mk4b
::ICO:NPyxdRMLAkaNTLcD/OT/z++VPeDh9fC2B7xhEd5yzMLYQRN7D5vYc8hEZjhkOL9dgG8mTRyCNagU
::ICO:9h61sDcQR1i87GD2knIIczMOXM8hkEmwBjyHEIgjAAD5DkHD37FuUBIPArZqTM/g976pBuy8KjiO
::ICO:B/yA18O/xYvQ72sEvFevf9sD30yiHEJdHGH8dgvjtwccwksOZp9zYFjAK4/VxhH8lQbKINwhhJsQ
::ICO:q/16hx9IOAjYqjFdhT8AvB+wAwPFRZXsMrRfwC0Bb7nDwtiB5sD3/fy9H8R3CHVxhE0O4b0Wxt+r
::ICO:HMKNH1dxhFe9OMJVP7A4W+cQ/KVHuTHi0PBvtHU9CNjImI5124G/vof3IvQlD/jqkpwXsLvlVE4d
::ICO:wqmBT1co2iEQbcQRbvLiCDd9KgdZ8RzCOuO1J8pwS0BxTgIuILIqcUnUBRYDtwszIcq0znT7BP5W
::ICO:JJEgYFR7N+EnIHRJrhwA3vCAzwwAN9+TgxlzSU4Dn6KEOARgc2Dxpk/UOYTHy2BHxRPmLzmQgcBi
::ICO:qEPwYzzRZsRqi9TdgvADCQQBWzUmSfjjLMnd4vXwN3tLclaTCL0GvscSFUeodwifylV/xF5jLF12
::ICO:MO+tNMwHVhrMPEFkCWDAqIsj+NfezvBv3VTgkA/ql+Rsb0luwI/QH7Uw7i3JvcNbkmsG/HUbsNsq
::ICO:0sghMEBeHGHP7Rb2BAKLvkNY9VYazByh+IYEe3EEEGDUrTQ0cghR7f0Kv99hb7lU4GAmnBDq31FL
::ICO:cm89ZmGXF6Efv96X5K4XqXcIQDWOABntENgFXvNSmF9/QgUWy9dqHYKw1PsX2yH0KfytSH+kAgcD
::ICO:dtjIoS+tM9jdWJJ7q7cGv78R8HpJ7voTL46AusBi0CEAwEEvsHijl8L8+hMqsBjqEIBqCjPqAotA
::ICO:f8PvhTtiSV+kArtlZW65qD4cGhcwc8DE385D2sANt5nY8069JKclpoQ4BGADYiNPMPLAAS+weDDE
::ICO:IcgK4KwxSgtSBRUtgAwCmb0Bui3d4DOIkJ6nApMAdv68ATNLePtdGViDhJvvzoIMIKuB15KENAks
::ICO:1juEt39MfV35kYOF5x0UXnex9KILWWHYywwY2NTF9h38XoNoEgToaSowsyqM8dY7MsgOESZ+Mx96
::ICO:LVWlxhuS+X/ETic/Wq5f8R2CUO+gdNT3wlCfWSNKYddhC7smLMxftGEN21h/1cX8jKOKufCmy4Xd
::ICO:IlZ7WvBHZUsGpaepwEIAsgI8//kiiIAX/kcJTonx1tstjB00sP+wVZ3rU91QJmz5TouWSAmkJfux
::ICO:AX+q4L9brreM/BMv6ej1cyrpyC0z3HWGkQOMHNWE1vsW/gjdeml7AN2x4bTxNbdTfWOvM4iAly9U
::ICO:8KMnvR13JuGGCbMa/Nv7bhMMIDNYe9WwLbZarmOpG+b7w/9gbMBeY6z8wMH8cw7IBF5/vAxZBkp1
::ICO:wUBhAsYoVZcefeln+BMLAnbDcH/ZRXhDq8wgITtMkA4gbcarFyr48ZNl5HYKZAYJRga45Z5cwwQf
::ICO:oE+LbGhJR6KA974660ph6UU1r18NJAyVFyVEYCdiZpSq1yKPpoYnJTVo66puCz2/L71JBQ75gICa
::ICO:P2J1X7hQ20oznkOorCml7/5pASSA732+BCMLvPO+HFxvxWC3t2JQHyCsXyLUTmELC28ezgMbwPvD
::ICO:eT+y/5oX2XfXGZWljQxBEkB+XBU/9Z1HdcdhRFe6XeAHWnQAqcLfQIIbPHyoB3YTwIBdYNhrwHf/
::ICO:uADpbkwb9nvThuCuvk0OQccRtoaEZP/VL/UFk33cQLJPcDhPUA4iPy5qOhl2Nt+y39f56xuidBNL
::ICO:BW54THiMNqA1+COv670MwcgtGYA5pt4I6QCuzbh6oYL/92S56hD23WZW04SjKvf419XThh5Lk+E8
::ICO:sJHuuxDI/ze8dF9/2zDIG84TaioWyxDgg7Id4Pdf38RSgcNK1Hcd/jBh9b4E52hCAEZg2uDajKvP
::ICO:VPDy1ysgAbzwBTVtuOmeHDIDwE2BrcBh04aqQ2hoiJa2Jc5wvgJc9XYALgV2AFYWN4bzssLIesD7
::ICO:70O1MnGIhL5n2wD+VqQ7qcApwd9It2ba4DkEGkZ12lBZB2a8OMIL/60EpwTsf6+JUa8YyO5Dqly3
::ICO:njYkLC0O553CRg2A0pxUR6dnUTN/r1YbJsQK1kW1bxf4I0IXoZJ+KnAP4A+ToEMgQ71rlhdHqKyo
::ICO:Mt5Xn67gylfVtIG8OELwwA5go86dL9ohNJEWhvP+dl5/916hfji/U1UDCubmSyfwyDs5kGQbwd+K
::ICO:pJsK3Afwh+rWxRHIUm1G3fLj1QsVXPGWHy1v+fHGkzlYg+rrlqrx3y2pK/lVP5x3ihxZ0KOyuFEp
::ICO:2A4ZzsON37Np+JX0ripwv8If1lC3/AgogIP5CPYaowLguf9QABHworf8ePCkyke48VQOZCB82rBd
::ICO:lx9Din76w3mqG85f9YbzVwMlvShQ0qvZcD6192Ebwx/nNUsnFXgrwd9At8YhmN60YRfVxBEueQ7h
::ICO:pb8owS0Be4+Y2HlAlQ3fFRFHYK8n23IOoUF2XRD4pcvqHIDlQHS+fjif2+m9zTGG8xp+pAI/kEYq
::ICO:8DaBf5PUTxu82gUDnkOorKiCc689XcHLX91Yfhy/TQUUyQRuvHdj+TF4D3ZVL9p304a6gp1R2XUL
::ICO:L6j5+/LLav7uZ9f5JwHVR+cJm4N1QJffh20Of29Sgbcr/GHtXoHJqkPw0pitwLTBtRmvP1PBq1+v
::ICO:QAjgB97y4wEvjnAgEEfoF+ZrpG447xS5pmT3q97RX846o7K8UZCzml0XKMhZza6LvlWstkR0tzn8
::ICO:rUhyqcDXE/xhbb7LlYAMxBGUQ1A9qT9teN6bNlz+fAlmFjh4bw7SAcZvU9MGEuHBxW6KW2SwBBYu
::ICO:O5h7zoGIOrQDyvk1zK5rp9ZeWroa/hpJJhX4eoe/UXvQIXjThrw3bXC8NObn/7QA6TAGdgk4ZeC2
::ICO:fzCAm39dOYVuFzxhRwH9yrkyvv+HRYgsUJ6v3SzjD+cRGMY3za5roV3Dj0TgJzRfBWj2eVNFDX8L
::ICO:uqz+YydQ4MQCcqOEwXEBkKqP8LNnHbhlrp5x0DVhAELtf3/zWRtumSEEMDAukB0ltVxqeMP5COD7
::ICO:EiZcn/ADaacCa/g70/Wj6v76tiBYg8Dc9x1Vf67bDgBq2iIMwvxfu7AG1R547iTBph90rzP4W5Gm
::ICO:IwA97O+yrgDcCuPaczaAzfClKt69Zp+zIf0RSJ3Qpn+EfhvZ1nXd6xD+VpxC7ClAzQ00/MnrEgGs
::ICO:DqsoLzAWLqsxdthyWVri32vxsoPKAqsDOMPW4zX8yev2AH6gDQeg4U9BN/BQ2QXMAcLCSy5cm9Wa
::ICO:ezdGAQyQoeb/iy+5MAcoPBNPw5+8borwJxYEJGj4U9ENPFSCGvIbWeDajA1pI3QYnpp48/+5Sw5E
::ICO:BpuX7zT8yeumCH+c0UCs14sirtbzhxfWtoXhrwqr/Hi2Iy6chgTn/xXeyPrzP9fwJ6/bY/iBuCMA
::ICO:DX/yug3hB9bfkHj5XBnAxpbjNCU4/y8vsDoJx596aPiT1+0D+IE4qcAa/uR1o+APtjFQWZO9nf/H
::ICO:/Nv3xfPV8DfUjZLWg4AttGv4Q9piwC9dta34lScqKhmn7iSaVCQw/zey4ffr2+er4W+o20hacgA9
::ICO:f3hhbdsM/qoIeKfSRNwsSfHn/5dssD//18P+5HW7DD+hG6nAMdtS0d2u8DMgMkBpVuLKYyUA6cYB
::ICO:/P3488/bKC81WP9H47au62r4m7Y1SwWOvQoQNgLV8MfUbQX+QJv09gt0RRgq/bgu76Bvn6+Gv6Fu
::ICO:XGk/FbiXutscfgCABMwcYfZSyhuDvMq8bpnx6uNllf/fYO9+XzxfDX/LulHSXipwCzfV8Ld3XWbA
::ICO:yABz33MhjM2nIyctblnFHKA2Jfbv89Xwt6zbSBJZBdDwh7R1AH/13wYgU94Y5Pf2V58oozQrYQQy
::ICO:AKPsatau4UffwJ9sKnCHxmj4W7guq1oBXdkYxIC9JiMjRn3xfDX8iekGJX4qcErGaPij22s2BpVT
::ICO:2BgUmP+/9kQF1hB1drJOWroa/sR066XtmaWGP6QtQfgJUGnBGajNOSnGAYLz/2Z2RbVr+LHl4Afa
::ICO:XAXQ8Ie0JQ2//28vDjB7Kfk4QP38P3QHYAPbGrUloqvhT0w3Svo3FVjDvxEHWGTMeQ6gaWZHq8KA
::ICO:s8bVZKAou6LaNfzYsvAD/ZoKrOHfEAaEAZBBqcz/nQLj6rkyrGECWj1KOy1dDX8iuoStmAqs4a8R
::ICO:dtXZAi8/XlaBwIQ3Bhk5appmrOGPaO9z+IGtlgqs4Q9vT2NjkL8BaMaGvcoQESnHGv6I9j6Gv+bD
::ICO:JoT3Tyqwhj+8PbAx6FWvQEgS+QD+NZZecmAvbt4A1La97epq+JPXbegdlPRHKrCGv2E7AYBUJ+8m
::ICO:MvwPFABZCikAGmWbhh/bCn6gH1KBNfxN29kFrGGqHsqZSBxAAGQQ5usKgCZhr4Y/RRvi6AaY6u9U
::ICO:YA1/S7rSVUG7jsWDfa6uAGgcG5q1a/hTtCGOLoW0NZDepQJr+FvSJQOwVxmzF718gA5GAP5wf/kl
::ICO:VQDUn/9r+CPatyn8QK9SgTX8rel6CUGVRcbiSx1uDAqZ/0et/2v4sa3hB5o4gLFmN43RruFPSNcF
::ICO:rAHCYhIbg7z5/9wlp/vbfzX8yeu2CT/Q7VRgDX/buuwtB/obg9oeu3mwzz8XKAAa0wYNf5dtiKPb
::ICO:AfxAN1OBNfwd69ZvDGpnBBBc/y83OgA0hm0a/hRtiKMbA/5EVwHitmv4U9BlgLyNQfP+zsBWNwZ5
::ICO:839ph6//a/ixbeAn77+OU4GpgZKGv8u6SWwMEoC0gbkZGyJwAIiGH9sG/lYk1gig7X0AGv5EdeEC
::ICO:1hDh1a90tjFI2urwUX/pT8OPbQV/K04hvVRgDX86uh1sDPKH+689UUbhDVkzAmjJhji6Gv7kdROG
::ICO:H0grFVjDn5quvzHo6hNtbgxiwPEOHdU9P7Y9/N1PBdbwp6Mb/FCqKj4tDf/rCoBmQgqAJmKvhj95
::ICO:3TbhjzMaSDYVWMOfjm7wQ29j0NU2Nwa5ZUCGFABNxF4Nf/K6KfX8sfU0/CnZEFc34oda3RgUnP/X
::ICO:FwBtakOMdg1/Crop9vy+NHcAvHm1WcPfJV0Kb69uDJppMSHIm//X/0U1/F22IY5uAvAzGODGqQAN
::ICO:HUDWFQSiQQ68YRr+LulGwO8nBFUWGUtxNwYF5v+v1x0AouHvsg1xdBOAX4JhEEFADEZcAkCEAyAQ
::ICO:nwGLN5bnSgz+ZkbkAIbU8HdJNwp+X7yNQcstbgxK/ABQDX/yusn0/GzCEOt2sUwC3wSAKzNXQkcC
::ICO:kSOAGyZmjL/345vLDP5mVmQhiGovoOFPR7cZ/EC1TuDcJUdlBTaZyFXn/4+XkjsAVMOfvG4C8Pti
::ICO:kGGUnELpu2//8XkAmMRkaw6geiFQnuvfFg1/Orox4Pfb/I1B8y1sDCIjerqg4U/Rhji6CcJPUPN/
::ICO:EoJv/78HW58C1FyMRd4gdcngHfvq4UW1bVP4azYGPd9kYxADJNT8f+GSAzNHsYKAkTZo+JPXTRB+
::ICO:XxgMYgy6VuPD5CIdwGh1ziC/WXQKZcAQIHWxvnp4UW3bFX5fvI1BIs7GIK8AyML33FjLf5E2aPiT
::ICO:100YfgJAIJkTWTDwzWvmXInBgkChb0mkA/DnDIXCrvMluV4xhDo6oq8eXlTbdocfUIHAQcLVZicG
::ICO:BQqAxCkAGmmDhj953RTg90TmzSxA4vxHn7y5PDMxE3HsS4wpwCgWBwhG5NaTvnvQ1wP8vsTYGNRK
::ICO:AdBIGzT8yeumBz8AgiMlC0gzQr0qkQ6AQPzIxEXr9MzoCoH/bNAcAYGc1o3pou51Aj8B1ZWA4qzE
::ICO:a1Ebg1ooABppg4Y/ed0U4WcwGySsVXtl3c2ZjwDAxMyEE/GjcVKGiQFaYsiaAWbfPejrCf7g93Jj
::ICO:d1+o+PP/kANAmtqg4U9eN9WeX4mAgGRZXF0tliJ+LKDbQO73PIcty/95zVleF2RYAHPfPejrFH6/
::ICO:QMjrT1TC4wB18/+WDgDV8Cev2xX4yRm2hgCi/3TXhfH1ixMXragAoNKPIcUFoyhZFijSFA1/LN0k
::ICO:4felQRwgOP+vhBQAjbRBw5+8bhfgJwAEAjNcgJcage9LQwfgxwF+6/L4usn0haGQOEBShrelex3D
::ICO:T0DNycFXH1ejvWocIDD/X27lAFANf/K6XYKfwQyQtWwvcokq/wVoPP8H4qwCHJiQBGICf7XsFisE
::ICO:UfMzGv4YumnAHxDpInx432D+r+Hvkm6X4AcAMGTezIMZ38y+fd/i1OSU0WwU0NQBTE6r7YT7adf5
::ICO:oru+YgjTYC8OoOGPoZsy/JCAlVOQu2UGCSjQvT/7wqWYB4Bq+JPX7Sb8AIhI5kQGRPTVI4+SfeDK
::ICO:gaZ8xygIQnz+OJuz42AB+pOcyLvEFJpRruGva0sbfqA6DVj4nluzMchP91143kZ5sckBoBr+5HW7
::ICO:DL9a/jOtxfLiLJvGF4Dmw38gZhDwrgtwT0+TO1C0/mTdWXEFCUPNNzo3vCVdDX+4vr8x6DlvX4D/
::ICO:l2GVKkwG1GJu2M9q+JPX7TL86ntyRqxhJsKf3/bkyGyz6L8vMWsCEk9NThnO+murEvLZnDFQU2lE
::ICO:w1/X1iX4CdjYGLTAWA4UCKkWAH28DGswogCohj953R7ADwDEEGW3REziSQCYODAR69yoFsqCT+L0
::ICO:5XdXSIrfVrVBKNKYSCPb1dXwN2xnFzC9AiHS3pjv+wVAKawAqIY/ed0ewQ9md9AaEmvO+oXDX9/5
::ICO:P6cmpwyaDp+m10tsB3B6mtypySnjU98ae6bgrF0YMIcEOHx3uYa/yzYwYGSBhRkb0t54ZD+JKgCq
::ICO:4U9et1fwA1Br/5IEiTMAYRKTEZqbpcWDQSYBEITkMwxJYYlBGv4e2cCAyBKkVx8ksgCohj953R7B
::ICO:r/7uqvdftdcu3PbU2IWpyb+M3fsDLToANQr4S+OT3x6/UPRGARwYBWj4e2QDAyILFN6QeP1cGSDA
::ICO:WWf8pL4AqIY/ed0e9vzqM6/3F633/kBbZwOqUQBJPiObxAI0/F2ywRf/2C/UFgAFNPyp6PYQfq/d
::ICO:GbQG2+79gTYcgBoFSOOT3x6/UHDWLgxbOwwwx0oPjmrX8Heuy97GoJ98pQIAeOOpjfl/Xz2zZu0a
::ICO:/hZ0iQQECSHOMJha7f2BNk8HBgAGkwHjt12210wyKZgXoOHvkg11bUSAU1bLf846A1L3/Kno9gH8
::ICO:zHAHjAFjyV5+7Lanxi5MT06LVnt/oE0HcHqa3EcnZsyPPzP2rbXK8u/nzWEBwIljeGSbhr8jXT8j
::ICO:sLIg8ep0Gde+bcMcCK8C3A/2avjb12Uwm8JEyS0sIL/r4wymF6dfbOWo2Kb3aioMpunJaYHXPrxD
::ICO:ZuVrlsgOVGRRUsiqs4a/O7okAKfIGLvVQuF1F/ayVOnBXbShLV0Nf0u6DNj7c6PWz4oLZ2/9xtjZ
::ICO:mYkZ88jMETviRxtK21MAAjGmgdPP7lxg1/mYIFozyHTjpAhr+NPRZakODF36ng17hTX8Ser2C/zM
::ICO:7oCRN66Vlr5CYuz3pzEt4uT8R0nbDgAATuO0+8jERevj3x7/StFZ+zdjmR0WAlMBDX9vdI385nFY
::ICO:X9qr4W9Jl8EyZ+QN2y2XXs0VPnbr12n9RbzIcXL+o6Rp1dBmcv/MhIOJi9au7J5/M19ZOJIV+ZNl
::ICO:t+gS0aYd6hr+lHW9xsRP/01DV8Pfki6D2STTFcTFAlf+5sxXHi3xJLe87FcvHY0AAIBA/NOZx91f
::ICO:/TqtL62WPuZwpZg1sgazlLV6wW80/InrRij3pb0a/tZ1mSrj2RGr4BZ//8g3xr9yauJUx/A3un/L
::ICO:MjXJxovT4FvuXPxI3sx82WWXbK6QgKh9NzX8yetq+JPX7Sf4wfZYZsxaqiydY9r5MWdhpjIxM+F0
::ICO:MvT3peMRgC+np8l91+Q0feJbY+eKzup9hjClRRkXwaCghj95XQ1/8rp9BL9k6e6wdlor9vK5/zu6
::ICO:875bv07rScHfyI625ZEJth6YIfsLv/TGqR25sceKzrrNxFbwVn31xw5r0/Anr6vhb1mXwc6wOWyW
::ICO:3OK3Xto5cmJyGt7ZnBRrr38cSWwE4MsDM2Q/MnHR+uT/2v/4urP8+Ehm1GJGGWAQ+uyPHdam4U9e
::ICO:V8Pfsi6DHYtMIaXrltn9p6enyX36+NMiSfgb2dORMJgePv60cRfuwrxY/tJoZsfJhfKiVFuIRc09
::ICO:e/2ga9o0/Mnravhb1lXD/h2GLStyzV4/9d7z408kEfGPc+/EhMFEID5z/Lz5i8bEP5Ps/nMBw3Sk
::ICO:LYnUKnWvH3RNm4Y/eV0Nfxu6bO+wdloO208t2Uu/d/s39j11/jibJy5sPo8jCUnNAQDeSACgsyA5
::ICO:ddfCyZzIftlhlxy2pVAHWcUySMPvtWn4k9ftE/gZDDDKu7Jj2VV79dy7v/4H9wJnZVo9vy+JxwCC
::ICO:QiA+CyGfuPuH2dNPj50rOOv3GmRgyBwxGfG2EGv4vTYNf/K6fQK/ZMkEkvvzY9kVe/nc5Z3D9zEe
::ICO:xvnjbKYJfyP7EpdHJi5aD8wcsf/78bkPDpnD/8Qk80Or9qIEkRARZmj4vTYNf/K6fQI/M7s5I2/Y
::ICO:suwIEv9yrvLc7564cMJhcOIBv2a2pC5Tk2ycniZ3ElPGx0/c/VdZkT1VdotSwpVUNyXQ8HttGv7k
::ICO:dfsAfm/TnJM3BiwBXii4a585/NT4OQYLAB3l97ciqU4B6kVVE2JjCpP8a+dH7nXApyxh8aC5w5Qs
::ICO:2d9JqOH32jT8yev2Afxgdg0yaH9uzKq4pXMvL1+56fBT4+fUYR5Cdgv+Gpu6KwQ+IwWdJTn1gbkP
::ICO:DVnD/1Cy+6suu3C5YjNgUt3rr+HvgQ1xdTX8sdqY2WWCGDKGqOgW5k1h/PFseeZfnrhwwkk72Bcl
::ICO:PXIASvwpAQA89svrpwzQf7GM/K6iswqHbQeAISJQ0PCnbENcXQ1/0zZmdhkshqwREgDW7PXHK1j/
::ICO:jaPfeMs8sLFkHnGrVKWrU4B68Q8bYTDd+83Bx39amLt5vbJ0VrK7MGKNmSZZxGAnkXMINfzJ62r4
::ICO:G+syu5IlD1nDxqA5SAA/6XDl7sPfGL336DfeMn9x4qKFHsIP9HgEEJSpySnj9PRpFwCmji2NmTk8
::ICO:KMAPDVk7xwreiIAYFFZnANDwd11Xwx/apjordplhjFgjJNkFkXhSsvyjd34t/zVPh9TP9Q58X/rG
::ICO:AQDqwTx9HIaf9TR1bGnMyvJDRHhw2No5ZksbRXeFAbgAGQSKYkbDn6auhr+ujRkMyQQ2yTJHrGGU
::ICO:3VIo+NOT08Lv6PpB+soB+FLvCL5w/Ce7hyh/P8j4QFbkfjUjMlh3VuGyDQA2MQQIwvt1KOwFCPk2
::ICO:sq3ruhr+5HVThN+fkgqQAzAJMsycGEBWWFiyF2d3mDs+V+bKM/0Mvi996QB8qXcEAPC1E8UPk2He
::ICO:VXRWf9Mka3zIGkLJraAii5AsAbANgECoThVINYS9y6Gi4Y9ov87gZzCT386QIEgAZJBpChCGzWG4
::ICO:YFRkca0snf9Fki/IcuHPbvv2DbPez/ct+L70tQPwZcMRwIU3bzp//M2hRTbv3JnZcfuKs3IsJ3Lv
::ICO:s2VlZGd2BxwGCs4qGAx1gCnDZcchgP1fubMXw3cqza8Rpuu31QMV1A1ODhvdp143Sr9V3bDGvoI8
::ICO:qq0J/FHXrY2GMwCyTC83jSGRE3lkjQwkA6v28hrDLRHMzzG7qzfmRz838hWaq/70cTanx8Gne7Cs
::ICO:16psCQcQlKlJNvZcA9Xvjvrh3Tzyg/LysRFrxx3L5QULAg8IGBnluCGGrdEh/4/czZc28udDPmj1
::ICO:XmGOIvHfzbtoVLiq4+eQgC4B4MAvT030G7UxAwYBS/YKpHRXQOCcyFHJLX3HIPM7DMdxc+YjudVi
::ICO:6d0X9q4Fr3Nx4qKVZLWebsiWcwC+qOEVxIErEEdmaNOhCFPH3xz6+fy4+NHCPHbkMxkSzmcNMjOO
::ICO:dELXPgWA+sTrqDXSjnUjlLtqQ1xdAYiIjPS+sle0oNvougS50xoVq/byd8qG86zpCHqbOcq7n6SV
::ICO:etXzx9kcXpuhrQb9dhRiME1NsnFxgq3zx7njcudatNTLxQm2+DibDCZ/KW+ry7b4JcKk/g/06MSM
::ICO:CUwAmOmRRc1lotcGaPFkAlcOQE5ObwwYdA+vRYsWLVq0aNGiRYsWLVq0aNGiRYuWLSn/H0AF6Zss
::ICO:ts75AAAAAElFTkSuQmCC
