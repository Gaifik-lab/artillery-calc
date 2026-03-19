$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$content = "const tablesRawData = {`n"
Get-ChildItem -Filter *.csv | ForEach-Object {
    $name = $_.BaseName
    $text = Get-Content $_.FullName -Raw
    if ($text) {
        $text = $text -replace '`', '\`'
        $content += "`"$name`": ``$text``,`n"
    }
}
$content += "};"
Set-Content -Path "tables.js" -Value $content -Encoding UTF8
