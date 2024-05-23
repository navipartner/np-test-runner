#requires -Version 5.0
using namespace Microsoft.AspNetCore.DataProtection

function Add-ExternalLibraries {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory=$true)]
        [string]$msDynamicsSmbAlExtPath
    )

    # TODO: What about macOS (OS X) or Linux?
    $Global:MsDynamicsSmbAlExtPath = $msDynamicsSmbAlExtPath
    $Global:MsDynamicsSmbAlExtLibPath = Join-Path $msDynamicsSmbAlExtPath '\bin\win32\'
   
    $libPath = $Global:MsDynamicsSmbAlExtLibPath
        
    $libPath = "$PSScriptRoot\..\..\Libs"
    Get-ChildItem $libPath -Recurse -Filter '*.dll' | ForEach-Object {
        Add-Type -Path $_.FullName
    }
}

function Get-NavUserPasswordCredentialsViaDll {
[CmdletBinding()]
    param (
        [Parameter(Mandatory=$true)]
        [string]$SmbAlExtPath,
        [Parameter(Mandatory=$true)]
        [string]$WebClientUrl
    )

    $creds = [ALCredentialCacheLibrary.ALCredentailCacheReader]::GetDataFromCredentialCache(
        (Join-Path $SmbAlExtPath "\bin\win32\"),
        "UserPasswordCache.dat")

    if (!$creds) {
        return $null
    }

    $credsJson = ConvertFrom-Json $creds -AsHashtable
    $record = $credsJson[$WebClientUrl]

    return $record
}

#$Global:MsDynamicsSmbAlExtPath = $null;
#$Global:MsDynamicsSmbAlExtLibPath = $null;

Export-ModuleMember -Function Get-NavUserPasswordCredentialsViaDll, Add-ExternalLibraries