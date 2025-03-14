using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json.Converters;
using Microsoft.Dynamics.Framework.UI.Client;
using Newtonsoft.Json;
using System.Collections;
using NaviPartner.ALTestRunner.Integration;

namespace NaviPartner.ALTestRunner
{
    public class TestRunner : ClientContext
    {
        public const string AllTestsExecutedString = "All tests executed.";
        public const string DefaultTestSuite = "DEFAULT";
        public const int DefaultTestPage = 130455;
        public const int DefaultTestRunnerCodeunit = 130450;
        public const string CCCollectedResult = "Done.";
        public const string DateTimeFormat = "s";
        public const string FailureTestResultType = "1";
        public const string SuccessTestResultType = "2";
        public const string SkippedTestResultType = "3";
        public const int NumberOfUnexpectedFailuresBeforeAborting = 50;
        public int TestPage { get; private set; }
        public string TestSuite { get; private set; }

        public string ClientSessionId
        {
            get
            {
                if (this.ClientSession == null)
                    return "";
                if (this.ClientSession.Info == null)
                    return "";
                return this.ClientSession.Info.SessionId;
            }
        }

        public TestRunner(string serviceUrl, string authenticationScheme, ICredentials credential,
            TimeSpan interactionTimeout, string culture) : base(serviceUrl, authenticationScheme, credential, interactionTimeout, culture)
        {
        }

        public TestRunner(string serviceUrl, BCAuthScheme authenticationScheme, ICredentials credential,
            TimeSpan interactionTimeout, string culture) : base(serviceUrl, authenticationScheme.ToString(), credential, interactionTimeout, culture)
        {
        }

        public void SetupTestRun(int testPage = DefaultTestPage, string testSuite = DefaultTestSuite, string extensionId = "", string testCodeunitsRange = "",
            string testProcedureRange = "", int testRunnerCodeunit = DefaultTestRunnerCodeunit, DisabledTest[]? disabledTests = null, bool stabilityRun = false,
            string codeCoverageTrackingType = "Disabled", bool codeCoverageTrackAllSessions = false, string codeCoverageExporterId = "",
            string codeCoverageMapType = "Disabled")
        {
            TestPage = testPage;
            TestSuite = testSuite;

            OpenTestForm(TestPage);
            SetTestSuite(OpenedForm, TestSuite);
            SetExtensionId(OpenedForm, extensionId);
            SetTestCodeunits(OpenedForm, testCodeunitsRange);
            SetTestProcedures(OpenedForm, testProcedureRange);
            SetTestRunner(OpenedForm, testRunnerCodeunit);
            SetRunFalseOnDisabledTests(OpenedForm, disabledTests);
            SetStabilityRun(OpenedForm, stabilityRun);
            ClearTestResults(OpenedForm);

            if (codeCoverageTrackingType != "Disabled")
            {
                SetCCTrackingType(OpenedForm, codeCoverageTrackingType);

                if (codeCoverageTrackAllSessions)
                {
                    SetCCTrackAllSessions(OpenedForm, true);
                }

                if (!string.IsNullOrEmpty(codeCoverageExporterId))
                {
                    SetCCExporterID(OpenedForm, codeCoverageExporterId);
                }

                if (codeCoverageMapType != "Disabled")
                {
                    SetCCProduceCodeCoverageMap(OpenedForm, codeCoverageMapType);
                }

                ClearCCResults(OpenedForm);
            }

            //CloseForm(form);
        }

        public TestResult RunNextTest()
        {
            TestResult resultObj = null;
            OpenTestForm(TestPage);
            SetTestSuite(OpenedForm, TestSuite);
            InvokeAction(GetActionByName(OpenedForm, "RunNextTest"));
            var testResultControl = GetControlByName(OpenedForm, "TestResultJson");
            string resultString = testResultControl.StringValue;
            if (resultString == AllTestsExecutedString)
            {
                return null;
            }

            resultObj = JsonConvert.DeserializeObject<TestResult>(resultString);
            return resultObj;
        }

        public Array RunAllTests(string codeCoverageTrackingType = "Disabled", string codeCoverageOutputPath = "",
            string codeCoverageExporterId = "", string codeCoverageFilePrefix = "")
        {
            int numberOfUnexpectedFailures = 0;
            ArrayList testRunResults = new ArrayList();
            TestResult testRunResultObject = null;
            Exception firstException = null;

            do
            {
                testRunResultObject = null;
                var testStartTime = DateTime.Now;

                try
                {
                    testRunResultObject = RunNextTest();
                    Console.WriteLine(testRunResultObject);
                    Console.WriteLine();
                    if (testRunResultObject == null)
                    {
                        return testRunResults.ToArray();
                    }

                    if (codeCoverageTrackingType != "Disabled")
                    {
                        CollectCoverageResults(
                            codeCoverageTrackingType,
                            codeCoverageOutputPath,
                            codeCoverageExporterId,
                            codeCoverageFilePrefix: codeCoverageFilePrefix);
                    }
                }
                catch (Exception ex)
                {
                    numberOfUnexpectedFailures++;

                    if (firstException == null)
                    {
                        firstException = ex;
                    }

                    var stackTrace = ex.StackTrace;

                    var testMethodResult = new TestMethodResult
                    {
                        Method = "Unexpected Failure",
                        CodeUnit = "Unexpected Failure",
                        StartTime = testStartTime.ToString(DateTimeFormat),
                        FinishTime = DateTime.Now.ToString(DateTimeFormat),
                        Result = FailureTestResultType,
                        Message = ex.Message,
                        StackTrace = stackTrace
                    };

                    testRunResultObject = new TestResult
                    {
                        Name = "Unexpected Failure",
                        CodeUnit = "UnexpectedFailure",
                        StartTime = testStartTime.ToString(DateTimeFormat),
                        FinishTime = DateTime.Now.ToString(DateTimeFormat),
                        Result = FailureTestResultType,
                        TestResults = new List<TestMethodResult>() { testMethodResult }
                    };
                }

                testRunResults.Add(testRunResultObject);

            } while ((testRunResultObject != null) && (NumberOfUnexpectedFailuresBeforeAborting > numberOfUnexpectedFailures));

            throw new Exception("Expected to end the test execution, something went wrong with returning test results.", firstException);
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

            foreach (var disabledTestMethod in disabledTests)
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

        protected void SetCCTrackingType(ClientLogicalForm form, string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return;
            }

            var trackingTypeValues = new Dictionary<string, int>
    {
        { "Disabled", 0 },
        { "PerRun", 1 },
        { "PerCodeunit", 2 },
        { "PerTest", 3 }
    };

            if (!trackingTypeValues.ContainsKey(value))
            {
                throw new ArgumentException($"Invalid tracking type: {value}. Must be one of: Disabled, PerRun, PerCodeunit, PerTest");
            }

            var trackingTypeControl = GetControlByName(form, "CCTrackingType");
            SaveValue(trackingTypeControl, trackingTypeValues[value].ToString());
        }

        protected void SetCCTrackAllSessions(ClientLogicalForm form, bool value)
        {
            if (!value)
            {
                return;
            }

            var trackAllSessionsControl = GetControlByName(form, "CCTrackAllSessions");
            SaveValue(trackAllSessionsControl, value.ToString());
        }

        protected void SetCCExporterID(ClientLogicalForm form, string exporterId)
        {
            if (string.IsNullOrEmpty(exporterId))
            {
                return;
            }

            var exporterIdControl = GetControlByName(form, "CCExporterID");
            SaveValue(exporterIdControl, exporterId);
        }

        protected void SetCCProduceCodeCoverageMap(ClientLogicalForm form, string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return;
            }

            var mapTypeValues = new Dictionary<string, int>
    {
        { "Disabled", 0 },
        { "PerCodeunit", 1 },
        { "PerTest", 2 }
    };

            if (!mapTypeValues.ContainsKey(value))
            {
                throw new ArgumentException($"Invalid coverage map type: {value}. Must be one of: Disabled, PerCodeunit, PerTest");
            }

            var ccMapControl = GetControlByName(form, "CCMap");
            SaveValue(ccMapControl, mapTypeValues[value].ToString());
        }

        protected void ClearCCResults(ClientLogicalForm form)
        {
            InvokeAction(GetActionByName(form, "ClearCodeCoverage"));
        }

        public void CollectCoverageResults(
            string trackingType = "Disabled",
            string outputPath = "",
            string exporterId = "",
            string coverageMapType = "Disabled",
            string codeCoverageFilePrefix = "")
        {
            if (trackingType == "Disabled")
            {
                return;
            }

            OpenTestForm(TestPage);
            SetTestSuite(OpenedForm, TestSuite);

            // Set CodeCoverage parameters
            SetCCTrackingType(OpenedForm, trackingType);
            SetCCExporterID(OpenedForm, exporterId);
            SetCCProduceCodeCoverageMap(OpenedForm, coverageMapType);

            string ccInfo;

            do
            {
                InvokeAction(GetActionByName(OpenedForm, "GetCodeCoverage"));

                var ccResultControl = GetControlByName(OpenedForm, "CCResultsCSVText");
                var ccInfoControl = GetControlByName(OpenedForm, "CCInfo");

                string ccResult = ccResultControl.StringValue;
                ccInfo = ccInfoControl.StringValue;

                if (ccInfo != CCCollectedResult && !string.IsNullOrEmpty(outputPath))
                {
                    // Replace commas with dashes for the filename
                    string safeInfo = ccInfo.Replace(",", "-");
                    string ccOutputFilename = $"{codeCoverageFilePrefix}_{safeInfo}.dat";
                    string fullPath = Path.Combine(outputPath, ccOutputFilename);

                    Console.WriteLine($"Storing coverage results of {ccInfo} in: {fullPath}");
                    File.WriteAllText(fullPath, ccResult);
                }
            } while (ccInfo != CCCollectedResult);

            if (coverageMapType != "Disabled")
            {
                string codeCoverageMapPath = Path.Combine(outputPath, "TestCoverageMap");
                SaveCodeCoverageMap(codeCoverageMapPath);
            }
        }

        protected void SaveCodeCoverageMap(string outputPath)
        {
            if (string.IsNullOrEmpty(outputPath))
            {
                throw new ArgumentException("Output path must be specified");
            }

            // Create directory if it doesn't exist
            if (!Directory.Exists(outputPath))
            {
                Directory.CreateDirectory(outputPath);
            }

            try
            {
                OpenTestForm(TestPage);
                SetTestSuite(OpenedForm, TestSuite);

                // Get code coverage map
                InvokeAction(GetActionByName(OpenedForm, "GetCodeCoverageMap"));

                var ccMapControl = GetControlByName(OpenedForm, "CCMapCSVText");
                string ccMap = ccMapControl.StringValue;

                string codeCoverageMapFileName = Path.Combine(outputPath, "TestCoverageMap.txt");

                if (File.Exists(codeCoverageMapFileName))
                {
                    File.AppendAllText(codeCoverageMapFileName, ccMap);
                }
                else
                {
                    File.WriteAllText(codeCoverageMapFileName, ccMap);
                }
            }
            finally
            {                
            }
        }
    }
}
