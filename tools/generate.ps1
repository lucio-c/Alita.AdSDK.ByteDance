$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$sdk = $args[0]
if (-not $sdk) {
    throw "用法: ./tools/generate.ps1 <ad_open_sdk_go 目录>"
}

$openapi = Join-Path $root "openapi/oceanengine.json"
$api = Join-Path $root "src/Alita.AdSDK.ByteDance.OceanEngine.Api"
node (Join-Path $PSScriptRoot "build-openapi.mjs") $sdk $openapi

Get-ChildItem $api -Force | Where-Object { $_.Name -ne "Alita.AdSDK.ByteDance.OceanEngine.Api.csproj" } | Remove-Item -Recurse -Force
Push-Location $root
try {
    dotnet kiota generate -l CSharp -d $openapi -o $api -c OceanEngineClient -n Alita.AdSDK.ByteDance.OceanEngine.Api
    node (Join-Path $PSScriptRoot "localize-kiota-comments.mjs") $api
}
finally {
    Pop-Location
}
