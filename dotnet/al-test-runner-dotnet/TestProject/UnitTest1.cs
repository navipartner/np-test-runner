using NaviPartner.ALTestRunner;
using NaviPartner.ALTestRunner.HttpZipStream;
using NaviPartner.ALTestRunner.Integration;
using System.Net;

namespace TestProject
{
    public class UnitTest1
    {
        [Fact]
        public async void HttpExtractionTest()
        {
            await HttpZipClient.ExtractFileAsync(
                "https://bcartifacts.blob.core.windows.net/onprem/23.3.14876.15024/platform", 
                @"c:/temp/HttpZipStreamTest/", 
                @"(?i)Applications\\testframework\\TestRunner\\Internal\\.*\.dll$");
            Console.WriteLine("Done");
        }

        [Fact]
        public void TestResolveAssemblies()
        {
            AssemblyResolver.SetupAssemblyResolve("Microsoft.Dynamics.Framework.UI.Client",
                @"C:\Users\JakubVanak\Documents\Repos\NaviPartner\np-al-test-runner-fork\.npaltestrunner\CSLibs\24.0.16410.18056");
            var testRunner = new TestRunner("https://whatever", "UserNamePassword", new NetworkCredential(), TimeSpan.FromSeconds(60), "");
        }

        [Fact]
        public async void InvokeALTests()
        {
            TestRunnerIntegration testRunner = new TestRunnerIntegration();
            var result = await testRunner.InvokeALTests(@"C:\Users\JakubVanak\Documents\Repos\NaviPartner\np-al-test-runner-fork\", 
                @"C:\Users\JakubVanak\Documents\AL\01\",
                @"C:\Users\JakubVanak\.vscode\extensions\ms-dynamics-smb.al-13.1.1065068\", "Test", 
                "147e6578-22ea-4f84-a6d8-10ce11ad0b04", "01", 
                @"C:\Users\JakubVanak\Documents\AL\01\tests.al", 0);            
            Console.WriteLine(result);
        }
    }
}