foreach ($ScriptFile in (Get-ChildItem $PSScriptRoot -Filter '*.ps1')) {
    .($ScriptFile.FullName)
}

#Import-Module (Join-Path $PSScriptRoot 'NPTestRunner\NPALTestRunner.psm1')