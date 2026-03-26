$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$csvFiles = Get-ChildItem -Filter *.csv | Sort-Object Name
$count = 0

$content = "const tablesRawData = {`n"
foreach ($file in $csvFiles) {
    $name = $file.BaseName
    $text = Get-Content $file.FullName -Raw
    if ($text) {
        $text = $text -replace '`', '\`'
        $content += "`"$name`": ``$text``,"
        $content += "`n"
        $count++
    }
}
$content += "};"

Set-Content -Path "tables.js" -Value $content -Encoding UTF8
Write-Host "Generated tables.js with $count weapon tables."
