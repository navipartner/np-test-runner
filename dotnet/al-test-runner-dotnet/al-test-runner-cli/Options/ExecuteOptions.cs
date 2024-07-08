using CommandLine;

namespace NaviPartner.ALTestRunner.CLI.Options
{
    [Verb("runall", HelpText = "Run all tests")]
    public class ExecuteOptions
    {
        [Option('p', "parallel", Required = false, HelpText = "Run tests in parallel.")]
        public bool Parallel { get; set; }
    }
}
