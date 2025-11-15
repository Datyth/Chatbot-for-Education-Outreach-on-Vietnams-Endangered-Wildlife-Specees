# Runs file checks with correct paths
Set-Location -Path $PSScriptRoot
$env:PYTHONPATH = $PSScriptRoot
python "scripts/check_files.py"
