#requires -Version 5.0

enum BcArtifactSource {
    OnPrem
    Sandbox
    Insider
}

function Invoke-RipUnzip {    
    [CmdletBinding()]
    param (
        [Parameter(Mandatory=$true,ValueFromPipeline=$true,ValueFromPipelineByPropertyName=$true)]
        [string]$Uri,
        [Parameter(Mandatory=$true)]
        [string]$DestinationPath,
        [string]$ExtractionFilter
    )
    
    #"$PSScriptRoot\.\ripunzip\ripunzip.exe unzip-uri -d Libs https://bcartifacts.azureedge.net/onprem/23.3.14876.15024/platform 'Test Assemblies\*'"
    $cmd = "$PSScriptRoot\..\ripunzip\ripunzip.exe unzip-uri -d $DestinationPath $Uri $ExtractionFilter"
    Invoke-Expression -Command $cmd
}

function Get-ClientSessionLibrariesFromBcArtifacts {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory=$true)]
        #[ValidateSet("OnPrem", "Sandbox", "Insider")]
        [BcArtifactSource]$BcArtifactSource,
        [Parameter(Mandatory=$true)]
        [string]$Version
    )

    $url = Get-BcArtifactsSourceUrl -BcArtifactSource $BcArtifactSource
    $url = $url.TrimEnd("/")
    $url = "$url/$Version/platform"

    Invoke-RipUnzip -Uri $url -DestinationPath $Global:ClientSessionLibsPath -ExtractionFilter "'Test Assemblies\*'"
}

function Get-BcArtifactsSourceUrl {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory=$true)]
        [BcArtifactSource]$BcArtifactSource
    )
    
    switch ($BcArtifactSource) {
        OnPrem { 
            return "https://bcartifacts.blob.core.windows.net/onprem/"
        }
        Sandbox {
            return "https://bcartifacts.blob.core.windows.net/sandbox/"
        }
        Insider {
            return "https://bcinsider.blob.core.windows.net/sandbox/"
        }
        Default {
            throw "Unsupported value: '$BcArtifactSource'"
        }
    }
}

##########################
# From BcContainerHelper #
##########################
function Parse-JWTtoken([string]$token) {
    if ($token.Contains(".") -and $token.StartsWith("eyJ")) {
        $tokenPayload = $token.Split(".")[1].Replace('-', '+').Replace('_', '/')
        while ($tokenPayload.Length % 4) { $tokenPayload += "=" }
        return [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($tokenPayload)) | ConvertFrom-Json
    }
    throw "Invalid token"
}

function Test-BcAuthContext {
    Param(
        $bcAuthContext
    )

    if (!(($bcAuthContext -is [Hashtable]) -and
          ($bcAuthContext.ContainsKey('ClientID')) -and
          ($bcAuthContext.ContainsKey('Credential')) -and
          ($bcAuthContext.ContainsKey('authority')) -and
          ($bcAuthContext.ContainsKey('RefreshToken')) -and
          ($bcAuthContext.ContainsKey('UtcExpiresOn')) -and
          ($bcAuthContext.ContainsKey('tenantID')) -and
          ($bcAuthContext.ContainsKey('AccessToken')) -and
          ($bcAuthContext.ContainsKey('includeDeviceLogin')) -and
          ($bcAuthContext.ContainsKey('deviceLoginTimeout')))) {
        throw 'BcAuthContext should be a HashTable created by New-BcAuthContext.'
    }
}




$Global:ExtensionSystemFolderPath = Join-Path $PSScriptRoot ".test-runner"
$Global:ClientSessionLibsPath = Join-Path $Global:ExtensionSystemFolderPath "CSLibs"

#. (Join-Path $PSScriptRoot ClientContext.ps1)
Import-Module (Join-Path $PSScriptRoot EntraIdAuth\EntraIdAuth.psm1)
Import-Module (Join-Path $PSScriptRoot ALTestRunnerInternal.psm1)
Import-Module (Join-Path $PSScriptRoot ALTestRunner.psm1)

#Export-ModuleMember -Function *

# Get-ClientSessionLibrariesFromBcArtifacts -BcArtifactSource ([BcArtifactSource]::OnPrem) -Version '23.3.14876.15024'