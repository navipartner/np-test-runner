function Get-ALTestRunnerConfigPath {    
    $ConfigPath = Find-ALTestRunnerConfigInFolder ($PSScriptRoot)
    if ($null -eq $ConfigPath) {
        $ConfigPath = Find-ALTestRunnerConfigInFolder (Split-Path ($PSScriptRoot) -Parent)
    }

    if ($null -eq $ConfigPath) {
        $ConfigPath = Join-Path (Join-Path ($PSScriptRoot) '.npaltestrunner') 'config.json'
    }

    return $ConfigPath
}

function Find-ALTestRunnerConfigInFolder {
    param (
        [Parameter(Mandatory = $true)]
        [string]$Folder
    )

    if ((Get-ChildItem $Folder -Recurse -Filter '.npaltestrunner').Count -gt 1) {
        throw "There is more than one .npaltestrunner folder under $($PSScriptRoot)"
    }

    Get-ChildItem $Folder -Recurse -Filter '.npaltestrunner' | ForEach-Object {
        $ConfigPath = (Join-Path $_.FullName 'config.json')
        if (Test-Path $ConfigPath) {
            return $ConfigPath
        }
    }
}

Export-ModuleMember -Function Get-ALTestRunnerConfigPath