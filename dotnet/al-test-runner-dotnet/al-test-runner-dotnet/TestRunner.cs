using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using BCClientLib.libs;
using Microsoft.Dynamics.Framework.UI.Client;

namespace NaviPartner.ALTestRunner
{
    public class TestRunner : ClientContext
    {
        public const string AllTestsExecutedString = "All tests executed.";
        public const string DefaultTestSuite = "DEFAULT";
        public const int DefaultTestPage = 130455;
        public int TestPage { get; private set; }
        public string TestSuite { get; private set; }
        public TestRunner(string serviceUrl, AuthenticationScheme authenticationScheme, ICredentials credential,
            TimeSpan interactionTimeout, string culture) : base(serviceUrl, authenticationScheme, credential, interactionTimeout, culture) 
        { 
        }

        public void SetupTestRun(int testPage = DefaultTestPage, string testSuite = DefaultTestSuite, string extensionId = "", string testCodeunitsRange = "",
            string testProcedureRange = "", int testRunnerCodeunit = 130450, DisabledTest[] disabledTests = null, bool stabilityRun = false)
        {
            TestPage = TestPage;
            TestSuite = testSuite; ;

            OpenTestForm(testPage);
            SetTestSuite(OpenedForm, testSuite);
            SetExtensionId(OpenedForm, extensionId);
            SetTestCodeunits(OpenedForm, testCodeunitsRange);
            SetTestProcedures(OpenedForm, testProcedureRange);
            SetTestRunner(OpenedForm, testRunnerCodeunit);
            SetRunFalseOnDisabledTests(OpenedForm, disabledTests);
            SetStabilityRun(OpenedForm, stabilityRun);
            ClearTestResults(OpenedForm);
            
            // TODO: Codecoverage settings if enabled!

            //CloseForm(form);
        }

        public string RunNextTest()
        {
            OpenTestForm(TestPage);
            SetTestSuite(OpenedForm, TestSuite);
            InvokeAction(GetActionByName(OpenedForm, "RunNextTest"));
            var testResultControl = GetControlByName(OpenedForm, "TestResultJson");
            return testResultControl.StringValue;
        }

        public void RunAllTests()
        {
            bool runNextTest = true;

            while ( runNextTest )
            {
                var testResult = RunNextTest();
                Console.WriteLine(testResult);
                Console.WriteLine();
                runNextTest = (testResult != AllTestsExecutedString);
            }
        }

        public override void CloseSession()
        {
            TestPage = 0;
            TestSuite = "";

            base.CloseSession();
        }

        protected ClientLogicalForm OpenTestForm(int testPage = 130455)
        {
            OpenForm(testPage);
            if (OpenedForm == null)
            {
                throw new Exception($"Cannot open page {testPage}. Verify if the test tool and test objects are imported and can be opened manually.");
            }
            return OpenedForm;
        }

        protected void SetTestSuite(ClientLogicalForm form, string testSuite = "DEFAULT")
        {
            var suiteControl = GetControlByName(form, "CurrentSuiteName");
            SaveValue(suiteControl, testSuite);
        }

        protected void SetExtensionId(ClientLogicalForm form, string extensionId)
        {
            if (string.IsNullOrEmpty(extensionId))
            {
                return;
            }

            var extensionIdControl = GetControlByName(form, "ExtensionId");
            SaveValue(extensionIdControl, extensionId);
        }

        protected void SetTestCodeunits(ClientLogicalForm form, string testCodeunitsFilter)
        {
            if (string.IsNullOrEmpty(testCodeunitsFilter))
            {
                return;
            }

            var testCodeunitRangeFilterControl = GetControlByName(form, "TestCodeunitRangeFilter");
            SaveValue(testCodeunitRangeFilterControl, testCodeunitsFilter);
        }

        protected void SetTestProcedures(ClientLogicalForm form, string filter)
        {
            var control = GetControlByName(form, "TestProcedureRangeFilter");
            SaveValue(control, filter);
        }

        protected void SetTestRunner(ClientLogicalForm form, int testRunnerId)
        {
            if (testRunnerId == 0)
            {
                return;
            }

            var testRunnerCodeunitIdControl = GetControlByName(form, "TestRunnerCodeunitId");
            SaveValue(testRunnerCodeunitIdControl, testRunnerId.ToString());
        }

        protected void SetRunFalseOnDisabledTests(ClientLogicalForm form, DisabledTest[] disabledTests)
        {
            if ((disabledTests == null) || (disabledTests.Length == 0))
            {
                return;
            }

            foreach ( var disabledTestMethod in disabledTests)
            {
                var testKey = disabledTestMethod.CodeunitName + "," + disabledTestMethod.Method;
                var removeTestMethodControl = GetControlByName(form, "DisableTestMethod");
                SaveValue(removeTestMethodControl, testKey);
            }
        }
        protected void SetStabilityRun(ClientLogicalForm form, bool stabilityRun)
        {
            var stabilityRunControl = GetControlByName(form, "StabilityRun");
            SaveValue(stabilityRunControl, stabilityRun.ToString());
        }

        protected void ClearTestResults(ClientLogicalForm form)
        {
            this.InvokeAction(GetActionByName(form, "ClearTestResults"));
        }
    }
}
