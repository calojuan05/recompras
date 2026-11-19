@echo off
title recompras
cd /d "%~dp0"

if not exist node_modules (
  echo Instalando dependencias, solo la primera vez...
  call npm install || goto error
)

if not exist dev.db (
  echo Creando la base de datos con datos de prueba...
  call npm run seed || goto error
)

echo.
echo recompras se abre en http://localhost:3000
echo Para apagarla, cierra esta ventana.
echo.
start "" cmd /c "ping -n 7 127.0.0.1 >nul & start http://localhost:3000"
call npm run dev -- -p 3000
goto end

:error
echo.
echo Algo salio mal. Revisa el mensaje de arriba.
pause

:end
