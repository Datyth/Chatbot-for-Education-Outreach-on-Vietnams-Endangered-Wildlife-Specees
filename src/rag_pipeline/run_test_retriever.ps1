# Runs the retrieval smoke test with correct paths
param(
  [string]$Query = "",
  [int]$TopK = 10
)

# Ensure we run from this script's directory (rag_pipeline)
Set-Location -Path $PSScriptRoot

# Make package imports resolve
$env:PYTHONPATH = $PSScriptRoot

# Build arguments for Python script
$py = "scripts/test_retriever.py"
$cmd = "python `"$py`""
if ($Query -ne "") { $cmd += " -- `"$Query`"" }
if ($TopK -ne 10) { $cmd += " --top-k $TopK" }

# Execute
Write-Host "Running: $cmd" -ForegroundColor Cyan
Invoke-Expression $cmd
