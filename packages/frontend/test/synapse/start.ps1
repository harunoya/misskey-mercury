# Starts Synapse inside WSL. Windows Docker Desktop is not used.
$ErrorActionPreference = "Stop"
$wslDir = (wsl wslpath -a $PSScriptRoot).Trim()
wsl -e bash -lc "'$wslDir/start.sh'"
