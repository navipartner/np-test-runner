using System;
using CommandLine;
using NaviPartner.ALTestRunner;
using NaviPartner.ALTestRunner.CLI.Options;
using NaviPartner.ALTestRunner.Integration;

namespace NaviPartner.ALTestRunner.CLI;

internal class Program
{
    static void Main(string[] args)
    {
        Parser.Default.ParseArguments<SetupOptions, ExecuteOptions, GetResultsOptions, InvokeALTestsOptions>(args)
            .MapResult(
                (SetupOptions opts) => SetupTestRun(opts),
                (ExecuteOptions opts) => ExecuteTests(opts),
                (GetResultsOptions opts) => GetTestResults(opts),
                (InvokeALTestsOptions opts) => InvokeALTests(opts),
                errs => 1);
    }

    static int SetupTestRun(SetupOptions opts)
    {
        var testRunner = new TestRunner("serviceUrl", "authenticationScheme", null, TimeSpan.FromMinutes(1), "en-US");
        testRunner.SetupTestRun(opts.TestPage, opts.TestSuite, opts.ExtensionId, opts.TestCodeunitsRange, opts.testProcedureRange,
            opts.testRunnerCodeunit, opts.disabledTests, opts.stabilityRun);
        Console.WriteLine("Test run setup complete.");
        return 0;
    }

    static int ExecuteTests(ExecuteOptions opts)
    {
        var testRunner = new TestRunner("serviceUrl", "authenticationScheme", null, TimeSpan.FromMinutes(1), "en-US");
        var testResults = testRunner.RunAllTests();
        Console.WriteLine("Tests executed.");
        return 0;
    }

    static int GetTestResults(GetResultsOptions opts)
    {
        throw new NotImplementedException();
        /*
        var testRunner = new TestRunner("serviceUrl", "authenticationScheme", null, TimeSpan.FromMinutes(1), "en-US");
        var results = testRunner.GetTestResults();
        Console.WriteLine($"Test results: {results}");
        return 0;
        */
    }

    static int InvokeALTests(InvokeALTestsOptions opts)
    {
        TestRunnerIntegration testRunner = new TestRunnerIntegration();
        var result = testRunner.InvokeALTests(opts.AlTestRunnerExtPath, opts.AlProjectPath, opts.SmbAlExtPath, opts.Tests,
            opts.ExtensionId, opts.ExtensionName, opts.FileName, opts.SelectionStart);
        Console.WriteLine(result);
        return 0;
    }
}
