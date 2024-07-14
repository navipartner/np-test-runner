namespace NaviPartner.ALTestRunner.WebApi.Requests
{
    public class DownloadFilesFromRemoteZipRequest
    {
        public required string url { get; set; }
        public required string destinationPath { get; set; }
        public string extractionFilter { get; set; } = "";
    }
}
