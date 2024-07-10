using CommandLine;

namespace NaviPartner.ALTestRunner.CLI.Options
{
    [Verb("invokealtests", HelpText = "Run all tests")]
    public class InvokeALTestsOptions
    {
        [Option('t', "alTestRunnerExtPath", Required = true, HelpText = "Path to the AL test runner extension.")]
        public string AlTestRunnerExtPath { get; set; }

        [Option('p', "alProjectPath", Required = true, HelpText = "Path to the AL project.")]
        public string AlProjectPath { get; set; }

        [Option('s', "smbAlExtPath", Required = true, HelpText = "Path to the SMB AL extension.")]
        public string SmbAlExtPath { get; set; }

        [Option('c', "tests", Required = true, HelpText = "Test context.")]
        public TestContext Tests { get; set; }

        [Option('i', "extensionId", Required = true, HelpText = "Extension ID.")]
        public Guid ExtensionId { get; set; }

        [Option('n', "extensionName", Required = true, HelpText = "Extension name.")]
        public string ExtensionName { get; set; }

        [Option('f', "fileName", Required = true, HelpText = "File name.")]
        public string FileName { get; set; }

        [Option('l', "selectionStart", Required = true, HelpText = "Selection start position.")]
        public int SelectionStart { get; set; }
    }
}
