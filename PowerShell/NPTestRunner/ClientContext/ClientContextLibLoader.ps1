[CmdletBinding()]
param(
    [string]$BcLibVersion
)

Add-Type -TypeDefinition @"
    using System;
    using System.Reflection;
    using System.IO;
    using System.Collections.Generic;
    using System.Text;

    public static class AssemblyResolver
    {
        public static void SetupAssemblyResolve(string searchPattern, string directoryPath)
        {
            Console.WriteLine($"Set resolver for '{searchPattern}' in '{directoryPath}'.");
            AppDomain.CurrentDomain.AssemblyResolve += (sender, args) =>
            {
                Console.WriteLine($"Resolving '{args.Name}' ...");
                if (args.Name.Contains(searchPattern))
                {
                    var assemblyFileName = $"{args.Name.Split(',')[0]}.dll";
                    var filePath = FindFileInTheDirectoryScope(assemblyFileName, directoryPath);
                    return Assembly.LoadFrom(filePath);
                }
                return null;
            };
        }

        private static string FindFileInTheDirectoryScope(string fileName, string directoryPath)
        {
            Console.WriteLine($"Searching '{fileName}' in '{directoryPath}'...");
            var files = Directory.GetFiles(directoryPath, fileName, SearchOption.AllDirectories);
            Console.WriteLine($"Has {files.Length} file(s).");
            if (files.Length == 0)
            {
                throw new Exception($"There is not any '{fileName}' in {directoryPath} or any of the subfolders.");
            }

            // Let's return just the firs one right now:
            Console.WriteLine($"Assembly found: '{files[0]}'.");
            return files[0];
        }
    }
"@

Push-Location

$libsPath = Get-VSCodeExtensionClientContextLibsRootPath
$libsPath = Join-Path $libsPath $BcLibVersion

try {

    if (!(Test-Path $libsPath)) {
        throw "Client Session libraries for $BcLibVersion are not present. Try to download them."
    }

    if ([string]::IsNullOrEmpty($Global:AssemblyLoadedForBCVersion)) {
        [AssemblyResolver]::SetupAssemblyResolve('Microsoft.Dynamics.Framework.UI.Client', $libsPath)
        $Global:AssemblyLoadedForBCVersion = $BcLibVersion
    } else {
        if ($BcLibVersion -ne $Global:AssemblyLoadedForBCVersion) {            
            throw "You can't load libraries for '$BcLibVersion' as the context already uses libraries for '$Global:AssemblyLoadedForBCVersion'. Please, restart VSCode!"
        }
    }

    Set-Location $PSScriptRoot

    $dlls = Get-ChildItem -Path $libsPath -Filter *.dll -Recurse -Force
    $dlls | ForEach-Object { 
        [void][Reflection.Assembly]::LoadFrom($_) 
    }    

    Import-Module .\ClientContext.psm1
    . .\ClientContextLibLoaderHelper.ps1
}
catch {
    throw "Problems during initialization of the Client Context. Details: $($_.Exception)"
}
finally {
    Pop-Location
}