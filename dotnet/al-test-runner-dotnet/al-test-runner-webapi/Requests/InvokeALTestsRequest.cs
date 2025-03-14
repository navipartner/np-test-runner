namespace NaviPartner.ALTestRunner.WebApi.Requests
{
    public class InvokeALTestsRequest
    {
        public required string alTestRunnerExtPath { get; set; }
        public required string alProjectPath { get; set; }
        public required string smbAlExtPath { get; set; }
        public required string tests { get; set; }
        public string? extensionId { get; set; }
        public string? extensionName { get; set; }
        public string? testCodeunitsRange { get; set; }
        public string? testProcedureRange { get; set; }
        public Dictionary<string, string>? disabledTests { get; set; }
        public string? codeCoverageTrackingType { get; set; }
        public bool? codeCoverageTrackAllSessions { get; set; }
        public string? codeCoverageExporterId { get; set; }
        public string? codeCoverageFilePrefix { get; set; }
        public string? codeCoverageOutputPath { get; set; }
        public string? codeCoverageMapType {  get; set; }
    }
}
