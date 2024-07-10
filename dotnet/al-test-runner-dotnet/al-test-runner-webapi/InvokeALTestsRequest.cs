namespace NaviPartner.ALTestRunner.WebApi
{
    public class InvokeALTestsRequest
    {
        public required string alTestRunnerExtPath { get; set; }
        public required string alProjectPath { get; set; }
        public required string smbAlExtPath { get; set; }
        public required string tests { get; set; }
        public string? extensionId { get; set; }
        public string? extensionName { get; set; }
        public string? fileName { get; set; }
        public string? selectionStart { get; set; }
    }
}
