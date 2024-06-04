[CmdletBinding()]
param(
    [string]$BcLibVersion
)

Push-Location

$libsPath = Get-VSCodeExtensionClientContextLibsRootPath

try {

    Set-Location $PSScriptRoot

    $dlls = Get-ChildItem -Path "$libsPath\$BcLibVersion\" -Filter *.dll -Recurse -Force
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