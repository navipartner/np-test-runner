#requires -Version 5.0
using namespace Microsoft.Dynamics.Framework.UI.Client
using namespace Microsoft.Dynamics.Framework.UI.Client.Interactions

function Open-ClientSessionDotNet
(
    [switch] $DisableSSLVerification,
    [ValidateSet('Windows','NavUserPassword','AAD')]
    [string] $AuthorizationType,
    [Parameter(Mandatory=$false)]
    [pscredential] $Credential,
    [Parameter(Mandatory=$true)]
    [string] $ServiceUrl,
    [string] $Culture = $script:DefaultCulture,
    [timespan] $TransactionTimeout = $script:DefaultTransactionTimeout,
    [timespan] $TcpKeepActive = $script:DefaultTcpKeepActive,
    [switch] $ForceNewSession
)
{
    if ($Global:Runner) {
        # TODO: We should evaluate this ideally if the session is really open or in some inconsisten state etc.
        $sessionOpen = $true

        if (!$sessionOpen) {
            # We can't use the existing session as it's not in a correct state!
            $ForceNewSession = $true
        }

        if (!$ForceNewSession) {
            return
        }
    }

    [AuthenticationScheme]$authScheme = [AuthenticationScheme]::UserNamePassword;

    switch ($AuthorizationType) {
        Windows { $authScheme = [AuthenticationScheme]::Windows; break; }
        AAD { $authScheme = [AuthenticationScheme]::AzureActiveDirectory; break; }
        Default { $authScheme = [AuthenticationScheme]::UserNamePassword; break; }
    }

    $Global:Runner = [NaviPartner.ALTestRunner.TestRunner]::new($ServiceUrl, $authScheme, $Credential, $TransactionTimeout, $Culture)
}

function Setup-TestRunDotNet
(
    [string] $TestSuite = $script:DefaultTestSuite,
    [string] $TestCodeunitsRange = "",
    [string] $TestProcedureRange = "",
    [string] $ExtensionId = "",
    [int] $TestRunnerId = $global:DefaultTestRunner,
    [string] $TestPage = $global:DefaultTestPage,
    [array] $DisabledTests = @(),
    [ValidateSet('Disabled', 'PerRun', 'PerCodeunit', 'PerTest')]
    [string] $CodeCoverageTrackingType = 'Disabled',
    [ValidateSet('Disabled','PerCodeunit','PerTest')]
    [string] $ProduceCodeCoverageMap = 'Disabled',
    [string] $CodeCoverageOutputPath = (Join-Path $PSScriptRoot 'CodeCoverage'),
    [string] $CodeCoverageExporterId,
    [switch] $CodeCoverageTrackAllSessions,
    [bool] $StabilityRun
)
{
   
    Write-Host "Setting up test run: $CodeCoverageTrackingType - $CodeCoverageOutputPath"
    $closeSession = $false
    
    if($CodeCoverageTrackingType -ne 'Disabled')
    {
        if (-not (Test-Path -Path $CodeCoverageOutputPath))
        {
            $null = New-Item -Path $CodeCoverageOutputPath -ItemType Directory
        }
    }

    try
    {
        $Global:Runner.SetupTestRun($TestPage, $TestSuite, $ExtensionId, $TestCodeunitsRange, $TestProcedureRange, $TestRunnerId, $DisabledTests, $StabilityRun)
    }
    catch 
    {
        $closeSession = $true
    }
    finally
    {
        if($closeSession)
        {
            if ($Global:Runner) {
                $Global:Runner.CloseSession()
            }
        }
    }
}

function Run-NextTestDotNet {
    [CmdletBinding()]
    param (
    )

    try
    {
        $closeSession = $false
        $testResultJson = $Global:Runner.RunNextTest();
        return $testResultJson
    }
    catch 
    {
        $closeSession = $true
        throw $PSItem.Exception
    }
    finally
    {
        if($closeSession)
        {
            if ($Global:Runner) {
                $Global:Runner.CloseSession()
            }
        }
    }
}

function Run-AllTestsDotNet {
    [CmdletBinding()]
    param (
    )

    try
    {
        $closeSession = $false
        $testResuls = $Global:Runner.RunAllTests()
        return $testResuls
    }
    catch 
    {
        $closeSession = $true
        throw $PSItem.Exception
    }
    finally
    {
        if($closeSession)
        {
            if ($Global:Runner) {
                $Global:Runner.CloseSession()
            }
        }
    }
}

[NaviPartner.ALTestRunner.TestRunner]$Global:Runner = $null

$script:DefaultTcpKeepActive = [timespan]::FromMinutes(2);
$script:DefaultTransactionTimeout = [timespan]::FromMinutes(10);

Export-ModuleMember -Function *