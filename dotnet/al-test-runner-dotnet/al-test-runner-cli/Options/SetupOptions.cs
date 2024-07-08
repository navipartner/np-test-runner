using CommandLine;

namespace NaviPartner.ALTestRunner.CLI.Options
{
    /// <summary>
    /// int testPage = DefaultTestPage, string testSuite = DefaultTestSuite, string extensionId = "", string testCodeunitsRange = "",
    /// string testProcedureRange = "", int testRunnerCodeunit = DefaultTestRunnerCodeunit, DisabledTest[] disabledTests = null, bool stabilityRun = false
    /// </summary>
    [Verb("setup", HelpText = "Setup the test run")]
    public class SetupOptions
    {
        [Option("tp", Required = false, HelpText = "Test page ID.")]
        public int TestPage { get; set; } = 130455;

        [Option('s', "ts", Required = false, HelpText = "Test suite name.")]
        public string TestSuite { get; set; } = "DEFAULT";

        [Option('e', "extid", Required = false, HelpText = "BC extension/app ID.")]
        public string ExtensionId { get; set; } = "";

        [Option('c', "tcr", Required = false, HelpText = "Range of test codeunits to execute the tests for.")]
        public string TestCodeunitsRange { get; set; } = "";
        
        [Option('p', "tpr", Required = false, HelpText = "Range of test procedures to run.")]
        public string testProcedureRange { get; set; } = "";

        [Option("trc", Required = false, HelpText = "Test runner Codeunit ID.")]
        public int testRunnerCodeunit { get; set; } = 130450;

        [Option("dt", Required = false, HelpText = "Disabled tests.")]
        public DisabledTest[] disabledTests { get; set; } = null;

        [Option("sr", Required = false, HelpText = "Stability run.")]
        public bool stabilityRun { get; set; } = false;
    }
}
