using NaviPartner.ALTestRunner;
using NaviPartner.ALTestRunner.HttpZipStream;
using NaviPartner.ALTestRunner.Integration;
using System.Net;

namespace TestProject
{
    public class UnitTest1
    {
        const string MSSMB_AL_VERSION = "15.0.1338262";
        const string PLATFORM_VERSION = "25.0.23364.24652";

        [Fact]
        public async void HttpExtractionTest()
        {
            await HttpZipClient.ExtractFileAsync(
                $"https://bcartifacts.blob.core.windows.net/onprem/{PLATFORM_VERSION}/platform", 
                "c:/temp/HttpZipStreamTest/", 
                "(?i)Applications/testframework/TestRunner/Internal/.*/.dll$");
            Console.WriteLine("Done");
        }

        [Fact]
        public void TestResolveAssemblies()
        {
            AssemblyResolver.SetupAssemblyResolve("Microsoft.Dynamics.Framework.UI.Client",
                $"C:/Users/JakubVanak/Documents/Repos/NaviPartner/np-al-test-runner-fork/.npaltestrunner/CSLibs/{PLATFORM_VERSION}");

            try
            {
                var testRunner = new TestRunner("https://whatever", "UserNamePassword", new NetworkCredential(), TimeSpan.FromSeconds(60), "");
            }
            catch (Exception ex)
            {
                Assert.IsType<Exception>(ex);
                Assert.Equal("ClientSession is Uninitialized", ex.Message);
            }
        }

        [Fact]
        public async void InvokeALTests_SpecCodeunit_TestMethodSpecified()
        {
            TestRunnerIntegration testRunner = new TestRunnerIntegration();
            var result = await testRunner.InvokeALTests("C:/Users/JakubVanak/Documents/Repos/NaviPartner/np-al-test-runner-fork/", 
                "C:/Users/JakubVanak/Documents/AL/01/",
                $"C:/Users/JakubVanak/.vscode/extensions/ms-dynamics-smb.al-{MSSMB_AL_VERSION}/", "Test", 
                "147e6578-22ea-4f84-a6d8-10ce11ad0b04", "01", 
                "50101", "TestMethod01");
            Console.WriteLine(result);
        }

        [Fact]
        public async void InvokeALTests_SpecCodeunit_AllMethods()
        {
            TestRunnerIntegration testRunner = new TestRunnerIntegration();
            var result = await testRunner.InvokeALTests("C:/Users/JakubVanak/Documents/Repos/NaviPartner/np-al-test-runner-fork/",
                "C:/Users/JakubVanak/Documents/AL/01/",
                $"C:/Users/JakubVanak/.vscode/extensions/ms-dynamics-smb.al-{MSSMB_AL_VERSION}/", "Test",
                "147e6578-22ea-4f84-a6d8-10ce11ad0b04", "01",
                "50101", "");
            Console.WriteLine(result);
        }

        [Fact]
        public async void InvokeALTests_Repeat_IsolatedTest()
        {
            for (int i = 0; i < 2; i++)
            {
                TestRunnerIntegration testRunner = new TestRunnerIntegration();
                var result = await testRunner.InvokeALTests("C:/Users/JakubVanak/Documents/Repos/NaviPartner/np-al-test-runner-fork/",
                    "C:/Users/JakubVanak/Documents/AL/01/",
                    $"C:/Users/JakubVanak/.vscode/extensions/ms-dynamics-smb.al-{MSSMB_AL_VERSION}/", "Test",
                    "147e6578-22ea-4f84-a6d8-10ce11ad0b04", "01",
                    "50101", "TestMethod01");
                Console.WriteLine(result);

                if ((result == null) || (result.Length == 0))
                {
                    throw new Exception($"The result is empty for run no. {i+1}");
                }
            }
        }
    }
}