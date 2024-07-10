using System.Net;
using NaviPartner.ALTestRunner;
using NaviPartner.ALTestRunner.Integration;

namespace NaviPartner.ALTestRunner.Server
{
    public class TestRunnerService
    {
        private static TestRunnerService _instance;
        private static readonly object _lock = new object();
        private Dictionary<string, object> _sessions = new Dictionary<string, object>();

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

        public object GetSession(string sessionId)
        {
            return _sessions[sessionId];
        }

        public async Task<Array> InvokeALTests(string alTestRunnerExtPath, string alProjectPath, string smbAlExtPath, TestContext tests, 
            Guid extensionId, string extensionName, string fileName, int selectionStart, string? sessionId = null)
        {
            if (string.IsNullOrEmpty(sessionId))
            {
                sessionId = Guid.NewGuid().ToString();
                _sessions[sessionId] = new TestRunnerIntegration();
            }

            var session = GetSession(sessionId) as TestRunnerIntegration;
            var result = await session.InvokeALTests(alTestRunnerExtPath, alProjectPath, smbAlExtPath, tests, 
                extensionId, extensionName, fileName, selectionStart);

            return result;
        }
    }
}
