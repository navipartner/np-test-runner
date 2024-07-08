using System.Net;
using NaviPartner.ALTestRunner;

namespace NaviPartner.ALTestRunner.Server
{
    public class TestRunnerService
    {
        private static TestRunnerService _instance;
        private static readonly object _lock = new object();
        private Dictionary<string, object> _sessions = new Dictionary<string, object>();

        private TestRunnerService() { }

        public static TestRunnerService GetInstance()
        {
            if (_instance == null)
            {
                lock (_lock)
                {
                    if (_instance == null)
                    {
                        _instance = new TestRunnerService();
                    }
                }
            }
            return _instance;
        }

        public string CreateSession(string serviceUrl, string authenticationScheme, ICredentials credential,
            TimeSpan interactionTimeout, string culture)
        {
            // Logic to create a new session
            string sessionId = Guid.NewGuid().ToString();
            _sessions[sessionId] = new TestRunner(serviceUrl, authenticationScheme, credential, interactionTimeout, culture); // Initialize your DLL class here
            return sessionId;
        }

        public object GetSession(string sessionId)
        {
            return _sessions[sessionId];
        }

        // Add methods to interact with your DLL class
        public void SetupTestRun(string sessionId, int testPage, string testSuite, int testRunnerCodeunit, string extensionId = "", string testCodeunitsRange = "",
            string testProcedureRange = "", DisabledTest[] disabledTests = null, bool stabilityRun = false)
        {
            var session = GetSession(sessionId) as TestRunner;
            session.SetupTestRun(testPage, testSuite, extensionId, testCodeunitsRange, testProcedureRange, testRunnerCodeunit, disabledTests, stabilityRun);
        }

        public Array RunAllTests(string sessionId)
        {
            var session = GetSession(sessionId) as TestRunner;
            return session.RunAllTests();
        }
    }
}
