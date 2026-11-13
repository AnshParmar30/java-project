@echo off
cd /d "%~dp0"
where javac >nul 2>nul
if errorlevel 1 (
  echo Java JDK 17+ nahi mila. Install karo: https://adoptium.net
  pause
  exit /b 1
)
if not exist out mkdir out
echo Compiling...
javac --release 17 -d out src\*.java
if errorlevel 1 (
  echo Compile error.
  pause
  exit /b 1
)
echo Server start ho raha hai: http://localhost:8080
start "" http://localhost:8080
java -cp out StudyCompanionServer
pause
