#requires -Version 5.0

enum BcArtifactSource {
    OnPrem
    Sandbox
    Insider
}

#Import-Module (Join-Path $PSScriptRoot ClientContext\ClientContext.psd1)
#Import-Module (Join-Path $PSScriptRoot ClientContext\ClientContext.psm1)
#. "$PSScriptRoot\ClientContext\ClientContextLibLoader.ps1" -BcLibVersion (Get-SelectedBcVersion)
Import-Module (Join-Path $PSScriptRoot EntraIdAuth\EntraIdAuth.psm1)
Import-Module (Join-Path $PSScriptRoot ALTestRunnerInternal.psm1)
Import-Module (Join-Path $PSScriptRoot ALTestRunner.psm1)
#Import-Module (Join-Path $PSScriptRoot ALExtBridge\ALExtBridge.psd1)
#Import-Module (Join-Path $PSScriptRoot ALExtBridge\ALExtBridge.psm1)

function Invoke-NPALTests {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory=$false)]
        [string]$SmbAlExtPath,
        [Parameter(Mandatory=$false)]
        [ValidateSet('All','Codeunit','Test')]
        [string]$Tests = 'All',
        [Parameter(Mandatory=$false)]
        [string]$FileName = '',
        [Parameter(Mandatory=$false)]
        [int]$SelectionStart = 0,
        [Parameter(Mandatory=$false)]
        [string]$ExtensionId,
        [Parameter(Mandatory=$false)]
        [string]$ExtensionName,
        [Parameter(Mandatory = $false)]
        [switch]$GetCodeCoverage,
        [Parameter(Mandatory = $false)]
        $DisabledTests,
        [switch]$GetPerformanceProfile,
        [string]$ResultsFilePath
    )

    $Params = @{}

    $environmentType = Get-ValueFromLaunchJson -KeyName 'environmentType'
    $tenant = Get-ValueFromLaunchJson -KeyName 'tenant'
    $serviceUrl = Get-ServiceUrl

    Test-ServiceIsRunningAndHealthy

    # Let's check version and already loaded modules (if any) and eventually load/import ClientContext assemblies and types.
    $Version = Get-SelectedBcVersion
    if ($global:ClientContextLoadedModuleVersion -ne $Version) {
        
        Push-Location

        try {        
            Set-Location $PSScriptRoot
            . (Join-Path $PSScriptRoot -ChildPath 'ClientContext' -AdditionalChildPath 'ClientContextLibLoader.ps1') -BcLibVersion $Version
            . (Join-Path $PSScriptRoot 'ClientSessionLibLoader.ps1')
            $global:ClientContextLoadedModuleVersion = $Version
        }
        catch {
            Write-Error "Can't import ClientContext module for BC version $Version. Details: $_"
        }
        finally {
            Pop-Location
        }
    }

    switch ($environmentType) {
        OnPrem {
            $serviceUrlCredCacheKey = Get-ServiceUrlCredentialCacheKey
            $serviceUrlCredCacheKey = $serviceUrlCredCacheKey.ToLower();

            $creds = Get-NavUserPasswordCredentials -SmbAlExtPath $SmbAlExtPath -WebClientUrl $serviceUrlCredCacheKey
            if (!$creds) {
                throw "Can't find credential for the key $serviceUrlCredCacheKey!"
            }

            [securestring]$secStringPassword = ConvertTo-SecureString $creds.Password -AsPlainText -Force
            [pscredential]$creds = New-Object System.Management.Automation.PSCredential ($creds.Username, $secStringPassword)
            if (!$creds) {
                throw "Can't find credentials in the AL development credential cache for $serviceUrlCredCacheKey!"
            }

            $Params.Add('Credential', $creds)
            $Params.Add('AutorizationType', 'NavUserPassword')
        }
        Sandbox {
            # Sandbox with AAD auth.
            $environmentName = Get-ValueFromLaunchJson -KeyName 'environmentName'
            if (!$bcAuthContext) {
                $bcAuthContext = New-BcAuthContext -includeDeviceLogin
            }
            $bcAuthContext = Renew-BcAuthContext $bcAuthContext
            $Global:BCAuthContext = $bcAuthContext
            
            #$accessToken = $bcAuthContext.accessToken
            #$credential = New-Object pscredential -ArgumentList $bcAuthContext.upn, (ConvertTo-SecureString -String $accessToken -AsPlainText -Force)
            
            $response = Invoke-RestMethod -Method Get -Uri "https://businesscentral.dynamics.com/$($bcAuthContext.tenantID)/$environmentName/deployment/url"
            if($response.status -ne 'Ready') {
                throw "environment not ready, status is $($response.status)"
            }
            $useUrl = $response.data.Split('?')[0]
            $tenant = ($response.data.Split('?')[1]).Split('=')[1]
            $publicWebBaseUrl = $useUrl.TrimEnd('/')
            $serviceUrl = "$publicWebBaseUrl/cs?tenant=$tenant"
            if ($companyName) {
                $serviceUrl += "&company=$([Uri]::EscapeDataString($companyName))"
            }
            
            $Params.Add('AutorizationType', 'AAD')
        }
        Default {
            throw "Environment type '$environmentType' is not supported!"
        }
    }
    
    if ($FileName -ne '') {
        if (Get-FileIsTestCodeunit -FileName $FileName) {
            $Params.Add('TestCodeunitsRange', (Get-ObjectIdFromFile $FileName))
        }
        else {
            throw "$FileName is not an AL test codeunit"
        }
    }

    if ($SelectionStart -ne 0) {
        $TestName = Get-TestNameFromSelectionStart -Path $FileName -SelectionStart $SelectionStart
        if ($TestName -eq '') {
            throw "Please place the cursor within the test method that you want to run and try again."
        }
        else {
            $Params.Add('TestProcedureRange', $TestName)
        }
    }

    if (-not [string]::IsNullOrEmpty($ResultsFilePath)) {
        $Params.Add('ResultsFilePath', $ResultsFilePath)
        $Params.Add('SaveResultFile', $true);
    } else {
        $Params.Add('SaveResultFile', $false);
    }

    Run-AlTests -ServiceUrl $serviceUrl @Params
}

function Get-OnPremServiceUrlCredentialKey {
    [CmdletBinding()]
    param (
        [CmdletBinding(Mandatory=$true)]
        [string]$ServiceUrl
    )

    $url = ([System.Uri]$ServiceUrl).AbsoluteUri.Replace('/','_').Replace('__','//')
    return $url
}

function Get-ServiceUrl {
    [CmdletBinding()]
    param (
    )
    
    $environmentType = Get-ValueFromLaunchJson -KeyName 'environmentType'
    
    switch ($environmentType) {
        OnPrem {
            # TODO: Optimize => Read once and then parse each property.
            $server = Get-ValueFromLaunchJson -KeyName 'server'
            $serverInstance = Get-ValueFromLaunchJson -KeyName 'serverInstance'
            $port = Get-ValueFromLaunchJson -KeyName 'port'
            $tenant = Get-ValueFromLaunchJson -KeyName 'tenant'

            $serviceUrl = "$($server.TrimEnd('/'))"
            if (-not ([string]::IsNullOrEmpty($port))) {
                $serviceUrl = "$serviceUrl`:$port"
            }
            $serviceUrl = "$serviceUrl/$serverInstance"
            if (-not ([string]::IsNullOrEmpty($tenant))) {
                $serviceUrl = "$serviceUrl/?tenant=$tenant"
            }

            return $serviceUrl
        }
        Sandbox {
            # TODO: Base URL for SaaS maybe configurable?
            $serviceUrl = 'https://businesscentral.dynamics.com/'
            $environmentName = Get-ValueFromLaunchJson -KeyName 'environmentName'
            $tenant = Get-ValueFromLaunchJson -KeyName 'tenant'

            $serviceUrl = "$($serviceUrl.TrimEnd('/'))/$tenant/$environmentName/deployment/url"
            $response = Invoke-RestMethod -Method Get -Uri $serviceUrl

            $useUrl = $response.data.Split('?')[0]
            $tenant = ($response.data.Split('?')[1]).Split('=')[1]
            $publicWebBaseUrl = $useUrl.TrimEnd('/')
            $serviceUrl = "$publicWebBaseUrl/cs?tenant=$tenant"

            return $serviceUrl
        }
        Default {
            throw "Environment type '$environmentType' is not supported!"
        }
    }
}

function Get-ServiceUrlCredentialCacheKey {
    [CmdletBinding()]
    param (
    )
    
    $environmentType = Get-ValueFromLaunchJson -KeyName 'environmentType'
    
    switch ($environmentType) {
        OnPrem {
            # TODO: Optimize => Read once and then parse each property.
            $server = Get-ValueFromLaunchJson -KeyName 'server'
            $serverInstance = Get-ValueFromLaunchJson -KeyName 'serverInstance'
            $port = Get-ValueFromLaunchJson -KeyName 'port'
            $tenant = Get-ValueFromLaunchJson -KeyName 'tenant'

            $serviceUrl = "$($server.TrimEnd('/'))"
            if (-not ([string]::IsNullOrEmpty($port))) {
                $serviceUrl = "$serviceUrl`:$port"
            }
            $serviceUrl = ([System.Uri]$serviceUrl).AbsoluteUri.TrimEnd('/')
            $serviceUrl = "$serviceUrl`.?"
            $serviceUrl = "$serviceUrl`_$serverInstance"
            <# The 'UserPasswordCache.dat' file contains entries without tenant id so let's remove the next code:
            if ((-not ([string]::IsNullOrEmpty($tenant))) -and ($tenant -ne 'default')) {
                $serviceUrl = "$serviceUrl?tenant=$tenant"
            }
            #>

            return $serviceUrl
        }
        Sandbox {
            # TODO: Base URL for SaaS maybe configurable?
            throw "Not implemented yet!"
            $serviceUrl = 'https://businesscentral.dynamics.com/'
            $environmentName = Get-ValueFromLaunchJson -KeyName 'environmentName'
            $tenant = Get-ValueFromLaunchJson -KeyName 'tenant'

            $serviceUrl = "$($serviceUrl.TrimEnd('/'))/$tenant/$environmentName/deployment/url"
            $response = Invoke-RestMethod -Method Get -Uri $serviceUrl

            $useUrl = $response.data.Split('?')[0]
            $tenant = ($response.data.Split('?')[1]).Split('=')[1]
            $publicWebBaseUrl = $useUrl.TrimEnd('/')
            $serviceUrl = "$publicWebBaseUrl/cs?tenant=$tenant"

            return $serviceUrl
        }
        Default {
            throw "Environment type '$environmentType' is not supported!"
        }
    }
}

function Get-ServiceHealthUrl {
    [CmdletBinding()]
    param (
    )

    $environmentType = Get-ValueFromLaunchJson -KeyName 'environmentType'
    
    switch ($environmentType) {
        OnPrem {
            $server = Get-ValueFromLaunchJson -KeyName 'server'
            $serverInstance = Get-ValueFromLaunchJson -KeyName 'serverInstance'
            $port = Get-ValueFromLaunchJson -KeyName 'port'

            $serviceUrl = "$($server.TrimEnd('/'))"
            if (-not ([string]::IsNullOrEmpty($port))) {
                $serviceUrl = "$serviceUrl`:$port"
            }
            $serviceUrl = "$serviceUrl/$serverInstance"
            if (-not ([string]::IsNullOrEmpty($tenant))) {
                $serviceUrl = "$serviceUrl/Health/System"
            }
            return $serviceUrl
        }
        Default {
            throw "Environment type '$environmentType' is not supported!"
        }
    }
}

function Test-ServiceIsRunningAndHealthy {
    param (
    )

    $environmentType = Get-ValueFromLaunchJson -KeyName 'environmentType'

    switch ($environmentType) {
        OnPrem {
            $healthServiceUrl = Get-ServiceHealthUrl
            $serviceUrl = Get-ServiceUrl
            $healthCheckResult = $null
            try {
                $healthCheckResult = Invoke-WebRequest -Uri $healthServiceUrl -UseBasicParsing -TimeoutSec 10
                
            } catch {
                $healthCheckResult = $null
            }
            if ((!$healthCheckResult) -or ($healthCheckResult.StatusCode -ne 200)) {
                throw "$serviceUrl is not available. Please start the container, or check NST, eventually retry."
            }
        }
        Default {
            # For SaaS Sandboxes we don't have any method without authentication so we have to be authenticated first.
            # So let's consider the environment is up and user knows about the real state before development and testing.
        }
    }
}

function Get-VSCodeExtensionRootPath {
    [CmdletBinding()]
    param (
    )
    
    $currentPath = $PSScriptRoot

    while ($currentPath) {
        $manifestFile = Get-ChildItem -Path $currentPath -Filter 'package.json'
        if ($manifestFile) {
            return $currentPath
        }

        $currentPath = Split-Path $currentPath -ErrorAction SilentlyContinue
    }

    throw "Can't find VSCode extension root path."
}

function Get-VSCodeExtensionInternalFolderPath {
    [CmdletBinding()]
    param (
    )
    
    $rootPath = Get-VSCodeExtensionRootPath
    $internalPath = Join-Path $rootPath '.altestrunner'
    if (!(Test-Path $internalPath)) {
        $null = New-Item $internalPath -ItemType Directory -Force
    }

    return $internalPath
}

function Get-VSCodeExtensionClientContextLibsRootPath {
    [CmdletBinding()]
    param (
    )
    
    $path = Get-VSCodeExtensionInternalFolderPath
    $path = Join-Path $path 'CSLibs'
    if (!(Test-Path $path)) {
        $null = New-Item $path -ItemType Directory -Force
    }

    return $path
}

function  Get-RipUnzipExeFilePath {
    [CmdletBinding()]
    param (
    )

    $vsCodeExtRootPath = Get-VSCodeExtensionRootPath
    $os = $PSVersionTable.OS
    if ($os) {
        if ($os.ToLower().Contains('windows')) {
            $ripUnzipExeFileName = 'ripunzip.exe'
        } else {
            $ripUnzipExeFileName = 'ripunzip'
        }
    } else {
        $ripUnzipExeFileName = 'ripunzip.exe'
    }
    
    $ripUnzipPath = Join-Path $vsCodeExtRootPath '.bin' -AdditionalChildPath 'ripunzip', $ripUnzipExeFileName

    if (!(Test-Path $ripUnzipPath)) {
        throw "'$ripUnzipExeFileName' path $ripUnzipPath doesn't exist!"
    }

    return $ripUnzipPath
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
    
    $ripUnzipPath = Get-RipUnzipExeFilePath
    $ripUnzipFolderPath = Split-Path $ripUnzipPath
    $ripUnzipExe = Split-Path $ripUnzipPath -Leaf
    
    $null = Push-Location
    
    try {
        $null = Set-Location $ripUnzipFolderPath
        $cmd = "$ripUnzipPath unzip-uri -d $DestinationPath $Uri $ExtractionFilter"
        Invoke-Expression -Command $cmd
        if (!($?)) {
            throw "'ripunzip' execution error. If you do not see any error in the terminal, please, try to execute $ripUnzipPath manually and see the error."
        }
    } catch {
        throw $_.Exception
    } finally {
        $null = Pop-Location
    }
}

function Get-ClientSessionLibrariesFromBcArtifacts {
    [CmdletBinding()]
    param (
        [string]$BcArtifactSourceUrl,
        [Parameter(Mandatory=$true)]
        [string]$Version
    )

    $BcArtifactSourceUrl = $BcArtifactSourceUrl.TrimEnd("/")
    $BcArtifactSourceUrl = "$BcArtifactSourceUrl/$Version/platform"

    Set-SelectedBcVersion -BcVersion $Version
    $destPath = Get-SelectedBcVersionLibPath
    if (!(Test-Path $destPath)) {
        $null = New-Item -Path $destPath -ItemType Directory -Force
    }

    Invoke-RipUnzip -Uri $BcArtifactSourceUrl -DestinationPath $destPath -ExtractionFilter "'?pplications\*\?est?unner\?nternal\*.dll'"
}

function Import-ClientContextModule {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$Version
    )

    if ($global:ClientContextLoadedModuleVersion) {
        if ($global:ClientContextLoadedModuleVersion -eq $Version) {
            return
        }
    }

    try {
        . (Join-Path $PSScriptRoot -ChildPath 'ClientContext' -AdditionalChildPath 'ClientContextLibLoader.ps1') -BcLibVersion $Version
        $global:ClientContextLoadedModuleVersion = $Version
    }
    catch {
        Write-Error "Can't import ClientContext module for BC version $Version. Details: $_"
    }
}

$code = @"
using Microsoft.AspNetCore.DataProtection;
using System.Text;
using System.IO;

namespace ALCredentialCacheLibrary
{
    public static class ALCredentailCacheReader
    {
        public static string GetDataFromCredentialCache(string credentialFolderPath, string credentialCacheFileName)
        { 
            var credentailFilePath = Path.Combine(credentialFolderPath, credentialCacheFileName);
            if (!File.Exists(credentailFilePath))
            throw new FileNotFoundException(string.Format("Credential file {0} doesn't exist!", credentailFilePath));
            var bytes = File.ReadAllBytes(credentailFilePath);
            var purpose = new string[] { "Microsoft.Dynamics.Nav.Deployment", credentialCacheFileName };

            var dirInfo = new DirectoryInfo(credentialFolderPath);
            var provider = DataProtectionProvider.Create(dirInfo);
            var protector = provider.CreateProtector(purpose);

            return Encoding.UTF8.GetString(protector.Unprotect(bytes));
        }
    }
}
"@

function Get-MsbAlExtBinariesPath {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory=$true)]
        [string]$msDynamicsSmbAlExtPath
    )

    # TODO: What about macOS (OS X) or Linux?
    return (Join-Path $msDynamicsSmbAlExtPath '\bin\win32\')
}

function Get-ExternalLibraries {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory=$true)]
        [string]$msDynamicsSmbAlExtPath
    )

    $libs = @()

    # TODO: What about macOS (OS X) or Linux?
    $Global:MsDynamicsSmbAlExtPath = $msDynamicsSmbAlExtPath
    $Global:MsDynamicsSmbAlExtLibPath = Get-MsbAlExtBinariesPath -msDynamicsSmbAlExtPath $msDynamicsSmbAlExtPath
   
    $libPath = $Global:MsDynamicsSmbAlExtLibPath
    
    $libs += Join-Path $libPath "Microsoft.AspNetCore.DataProtection.dll"
    $libs += Join-Path $libPath "Microsoft.AspNetCore.DataProtection.Abstractions.dll"
    $libs += Join-Path $libPath "Microsoft.AspNetCore.DataProtection.Extensions.dll"
    $libs += Join-Path $libPath "Microsoft.AspNetCore.Cryptography.Internal.dll"
    $libs += Join-Path $libPath "Microsoft.AspNetCore.Connections.Abstractions.dll"
    #$libs += Join-Path $libPath "mscorlib.dll"
    $libs += Join-Path $libPath "System.dll"
    $libs += Join-Path $libPath "System.Runtime.dll"
    $libs += Join-Path $libPath "System.IO.FileSystem.dll"
   
    return $libs
}

function Get-NavUserPasswordCredentials {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory=$true)]
        [string]$SmbAlExtPath,
        [Parameter(Mandatory=$true)]
        [string]$WebClientUrl
    )

    $creds = Get-ALDevCacheFileContent -SmbAlExtPath $SmbAlExtPath -FileName UserPasswordCache.dat -ReturnPSObject
    if (!$creds) {
        throw "You should authenticate using standard AL dev approach. Then you can try again."
    }

    $credsHashTable = @{}
    $selectedCredCache = $creds | Where-Object { $_ -match $WebClientUrl }
    $selectedCredCache.PSObject.Properties | ForEach-Object { $credsHashTable[$_.Name] = $_.Value }
    if ($credsHashTable.Count -lt 1) {
        throw "You were not authenticated against $WebClientUrl yet or the cache has expired. Please, authenticate using the standard Microsoft AL development extension and try again."
    }
    $record = $credsHashTable.Values[0]

    return $record
}

function Get-ALDevCacheFileContent {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory=$true)]
        [string]$SmbAlExtPath,
        [Parameter(Mandatory=$true)]
        [ValidateSet("UserPasswordCache.dat", "TokenKeyCache.dat", "TokenCache.dat", "TenantMapCache.dat", "ServerInfoCache.dat")]
        [string]$FileName,
        [switch]$ReturnPSObject
    )

    if (-not ('ALCredentialCacheLibrary.ALCredentailCacheReader' -as [type])) {
        $assemblies = Get-ExternalLibraries -msDynamicsSmbAlExtPath $SmbAlExtPath
        $assemblies | ForEach-Object { 
            [void][Reflection.Assembly]::LoadFrom($_) 
        }

        $credentialReader = Add-Type -TypeDefinition $code -Language CSharp -ReferencedAssemblies (Get-ExternalLibraries -msDynamicsSmbAlExtPath $SmbAlExtPath) -WarningAction Ignore -IgnoreWarnings -PassThru
    } else {
        $credentialReader = [ALCredentialCacheLibrary.ALCredentailCacheReader]
    }

    $os = $PSVersionTable.OS
    if ($os) {
        if ($os.ToLower().Contains('windows')) {
            $SmbAlExtBinPath = Join-Path $SmbAlExtPath '\bin\win32\'
        } else {
            $SmbAlExtBinPath = Join-Path $SmbAlExtPath '/bin/linux'
        }
    } else {
        $SmbAlExtBinPath = Join-Path $SmbAlExtPath '\bin\win32\'
    }
    $smbAlCacheFilePath = Join-Path $SmbAlExtBinPath $FileName
    
    if (-not (Test-Path $smbAlCacheFilePath)) {
        Write-Error "Requested credential cache file $FileName doesn't exist. Please, authenticate using the standard Microsoft AL development extension first and then try again."
    }

    try {
        $fileContent = $credentialReader::GetDataFromCredentialCache($SmbAlExtBinPath,$FileName)
    } catch {
        Write-Error "Can not decrypt file $FileName. $($_.Exception)"
    }

    if (!$ReturnPSObject) {
        return $fileContent
    }

    $fileContentObject = ConvertFrom-Json $fileContent
    return $fileContentObject
}

function Get-NavUserPasswordCredentialsNotWorking {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory=$true)]
        [string]$WebClientUrl
    )

    #$purpose = @("Microsoft.Dynamics.Nav.Deployment", "UserPasswordCache.dat")
    $purpose = New-Object System.Collections.Generic.List[System.String]
    $purpose.Add('Microsoft.Dynamics.Nav.Deployment')
    $purpose.Add('UserPasswordCache.dat')
    $protectedFile = Join-Path $Global:MsDynamicsSmbAlExtLibPath $purpose[1]
    
    #$dirInfo = New-Object System.IO.DirectoryInfo -ArgumentList $Global:MsDynamicsSmbAlExtLibPath
    $dirInfo = New-Object "System.IO.DirectoryInfo, Version=6.0.0.0" -ArgumentList $Global:MsDynamicsSmbAlExtLibPath
    
    $provider = [Microsoft.AspNetCore.DataProtection.DataProtectionProvider]::Create($dirInfo)
    $protector = $provider.CreateProtector($purpose);
    $bytes = [System.IO.File]::ReadAllBytes($protectedFile)
    $unprotectedValues = $protector.Unprotect($bytes);
    $unprotectedString = [System.Text.Encoding]::UTF8.GetString($unprotectedValues)
    Write-Host "Creds: $unprotectedString"


    #[Microsoft.AspNetCore.DataProtection.DataProtectionProvider]::Create(()
}

function Get-SelectedBcVersion {
    [CmdletBinding()]
    param(
    )

    $global:SelectedBcVersion = Get-ValueFromALTestRunnerConfig -KeyName 'selectedBcVersion'

    if ([string]::IsNullOrEmpty($global:SelectedBcVersion)) {
        throw "You have to select BC version and eventually download missing libraries."
    }

    return $global:SelectedBcVersion
}

function Set-SelectedBcVersion {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$BcVersion
    )

    $global:SelectedBcVersion = Set-ALTestRunnerConfigValue -KeyName 'selectedBcVersion' -KeyValue $BcVersion
    return $global:SelectedBcVersion
}

function Get-SelectedBcVersionLibPath {
    [CmdletBinding()]
    param(
    )

    $path = Get-VSCodeExtensionClientContextLibsRootPath
    $destPath = Join-Path $path (Get-SelectedBcVersion)
    return $destPath
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



$Global:ExtensionSystemFolderPath = Get-ALTestRunnerConfigPath -ReturnFolderPath

Export-ModuleMember -Function *