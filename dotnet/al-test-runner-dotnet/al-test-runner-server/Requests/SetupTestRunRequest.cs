namespace NaviPartner.ALTestRunner.Server.Requests
{
    public class SetupTestRunRequest : BaseRequest
    {
        public int testPage { get; set; }
        public string testSuite { get; set; }
        public int testRunnerCodeunit { get; set; }
        public string extensionId { get; set; } = "";
        public string testCodeunitsRange { get; set; } = "";
        public string testProcedureRange { get; set; } = "";
        public DisabledTest[] disabledTests { get; set; } = null;
        public bool stabilityRun { get; set; } = false;
    }
}
