[CmdletBinding()]
param(
    [string]$BcLibVersion
)

Push-Location

$alRunnerPath = Get-ALTestRunnerConfigPath -ReturnFolderPath

try {

    Set-Location $PSScriptRoot

    $dlls = Get-ChildItem -Path "$alRunnerPath\CSLibs\$BcLibVersion\" -Filter *.dll -Recurse -Force
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

$clientContext = [ClientContext]::new('any-url', 10, 'culture')