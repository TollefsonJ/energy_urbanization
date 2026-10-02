@echo off
rem ==== EDIT THIS LINE: the name of your conda environment ====
set "ENV_NAME=base"
rem ==== Only fill this in if the script cannot find conda by itself, e.g. set "CONDA_ROOT=D:\Anaconda3" ====
set "CONDA_ROOT="

if not defined CONDA_ROOT for %%D in ("%USERPROFILE%\miniconda3" "%USERPROFILE%\anaconda3" "%LOCALAPPDATA%\miniconda3" "%LOCALAPPDATA%\anaconda3" "%ProgramData%\miniconda3" "%ProgramData%\anaconda3" "C:\miniconda3" "C:\anaconda3" "D:\miniconda3" "D:\anaconda3" "D:\Anaconda3") do if exist "%%~D\Scripts\activate.bat" if not defined CONDA_ROOT set "CONDA_ROOT=%%~D"

if not defined CONDA_ROOT goto noconda

echo Using conda at %CONDA_ROOT%, environment "%ENV_NAME%"
call "%CONDA_ROOT%\Scripts\activate.bat" "%ENV_NAME%"
if errorlevel 1 goto failed

cd /d "%~dp0"
echo.
echo Starting local server for: %CD%
echo When it says "Serving HTTP", open http://localhost:8001 in your browser.
echo Close this window (or press Ctrl+C) to stop the server.
echo.
python -m http.server 8001
goto done

:noconda
echo Could not find your conda installation.
echo Open this file in Notepad and set CONDA_ROOT to the folder that contains
echo Scripts\activate.bat (for example D:\Anaconda3). In an Anaconda Prompt,
echo the command  where conda  shows the location.
goto done

:failed
echo Could not activate the environment "%ENV_NAME%".
echo Check the name with  conda env list  in an Anaconda Prompt, then edit ENV_NAME in this file.

:done
echo.
pause
