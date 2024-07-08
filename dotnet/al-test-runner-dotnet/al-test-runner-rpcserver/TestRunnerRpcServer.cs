using StreamJsonRpc;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using NaviPartner.ALTestRunner;
using System.Net;

namespace NaviPartner.ALTestRunner.RpcServer
{
    public class TestRunnerRpcServer
    {
        private TestRunner _testRunner;
        private TestRunnerIntegration _testRunnerIntegration;

        public TestRunnerRpcServer()
        {
        }

        public async Task<Array> InvokeALTests(string alProjectPath, string smbAlExtPath, string tests, string extensionId, string extensionName, string fileName,
            int selectionStart)
        {
            _testRunnerIntegration = new TestRunnerIntegration();
            return await _testRunnerIntegration.InvokeALTests(alProjectPath, smbAlExtPath, tests, extensionId, extensionName, fileName, selectionStart);
        }

        /*
        public void OpenClientSession(string serviceUrl, string authenticationScheme, ICredentials credential,
            TimeSpan interactionTimeout, string culture)
        {
            _testRunner = new TestRunner(serviceUrl, authenticationScheme, credential, interactionTimeout, culture);
        }

        public void OpenClientSession(string serviceUrl, string authenticationScheme, string userName, string userPassword,
            TimeSpan interactionTimeout, string culture)
        {
            var credential = new NetworkCredential(userName, userPassword);
            _testRunner = new TestRunner(serviceUrl, authenticationScheme, credential, interactionTimeout, culture);
        }

        public void CloseClientSession()
        {
            _testRunner.CloseSession();
        }

        public void SetupTestRun(int testPage, string testSuite, int testRunnerCodeunit, string extensionId = "", string testCodeunitsRange = "",
            string testProcedureRange = "", DisabledTest[] disabledTests = null, bool stabilityRun = false)
        {
            _testRunner.SetupTestRun(testPage, testSuite, extensionId, testCodeunitsRange, testProcedureRange, testRunnerCodeunit, disabledTests, stabilityRun);
        }

        public Array RunAllTests()
        {
            return _testRunner.RunAllTests();
        }
        */
    }
}
