using CommandLine;

namespace NaviPartner.ALTestRunner.CLI.Options
{
    public class GetResultsOptions
    {
        [Option('f', "format", Required = false, HelpText = "Results format.")]
        public string Format { get; set; } = "json";
    }
}
