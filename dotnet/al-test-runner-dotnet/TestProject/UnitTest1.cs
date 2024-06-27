using NaviPartner.ALTestRunner;
using NaviPartner.ALTestRunner.HttpZipStream;
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
    }
}