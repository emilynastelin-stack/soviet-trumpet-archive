Set-Location 'C:\Users\emily\Downloads\astro-latest\soviet-archive'

$exts = '*.js','*.jsx','*.ts','*.tsx','*.astro','*.coffee','*.html'
$files = Get-ChildItem -Path . -Recurse -File -Include $exts -ErrorAction SilentlyContinue

if (-not $files) {
  Write-Host "No files found for the given extensions."
  exit 0
}

$pattern = '\.replace\(\s*/\s*&\s*/g'  # primary marker for the chained escaping pattern
$matches = Select-String -Path $files.FullName -Pattern $pattern -Context 2,2 -ErrorAction SilentlyContinue

if (-not $matches) {
  Write-Host "No matches found."
  exit 0
}

$grouped = $matches | Group-Object Path
foreach ($g in $grouped) {
  Write-Host "---- $($g.Name) ----"
  foreach ($m in $g.Group) {
    Write-Host "Line $($m.LineNumber): $($m.Line.Trim())"
    if ($m.Context.PreContext) { $m.Context.PreContext | ForEach-Object { Write-Host "  PRE: $_" } }
    if ($m.Context.PostContext) { $m.Context.PostContext | ForEach-Object { Write-Host "  POST: $_" } }
    Write-Host ""
  }
}
Write-Host "Total matches: $($matches.Count)"