[CmdletBinding()]
param(
    [string]$BcLibVersion
)

Push-Location

$libsPath = Get-VSCodeExtensionClientContextLibsRootPath
$libsPath = Join-Path $libsPath $BcLibVersion

if (!(Test-Path $libsPath)) {
    throw "Client Session libraries for $BcLibVersion are not present. Try to download them."
}

try {

    Set-Location $PSScriptRoot

    $dlls = Get-ChildItem -Path $libsPath -Filter *.dll -Recurse -Force
    $dlls | ForEach-Object { 
        [void][Reflection.Assembly]::LoadFrom($_) 
    }    


    Import-Module .\ClientContext.psm1
    . .\ClientContextLibLoaderHelper.ps1
} 
catch {
    
}
finally {
    Pop-Location
}