using NaviPartner.ALTestRunner.HttpZipStream;

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
    }
}