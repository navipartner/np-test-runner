function Get-ALTestRunnerConfigPath {
    param (
        [switch]$ReturnFolderPath
    )

    $ConfigPath = Find-ALTestRunnerConfigInFolder (Get-Location)
    if ($null -eq $ConfigPath) {
        $ConfigPath = Find-ALTestRunnerConfigInFolder (Split-Path (Get-Location) -Parent)
    }

    
    if ($null -eq $ConfigPath) {
        $ConfigPath = Join-Path (Get-Location) '.altestrunner'

        if (-not ($ReturnFolderPath)) {
            $ConfigPath = Join-Path $ConfigPath '.config'
        }
    }

    if ($ReturnFolderPath) {
        $ConfigPath = $ConfigPath.TrimEnd('.config');
    }

    if ($ReturnFolderPath) {
        $ConfigPath = $ConfigPath.TrimEnd('config.json');
    }

    return $ConfigPath
}

function Find-ALTestRunnerConfigInFolder {
    param (
        [Parameter(Mandatory = $true)]
        [string]$Folder
    )

    if ((Get-ChildItem $Folder -Recurse -Filter '.altestrunner').Count -gt 1) {
        throw "There is more than one .altestrunner folder under $(Get-Location)"
    }

    Get-ChildItem $Folder -Recurse -Filter '.altestrunner' | ForEach-Object {
        $ConfigPath = (Join-Path $_.FullName 'config.json')
        if (Test-Path $ConfigPath) {
            return $ConfigPath
        }
    }
}

Export-ModuleMember -Function Get-ALTestRunnerConfigPath