using Microsoft.AspNetCore.Mvc;
using NaviPartner.ALTestRunner.HttpZipStream;
using NaviPartner.ALTestRunner.WebApi.Requests;

namespace NaviPartner.ALTestRunner.WebApi.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class HttpZipStreamController : ControllerBase
    {
        private readonly ILogger<HttpZipStreamController> _logger;

        public HttpZipStreamController(ILogger<HttpZipStreamController> logger)
        {
            _logger = logger;
        }

        [HttpPost("downloadFilesFromRemoteZip")]
        public async Task downloadFilesFromRemoteZip([FromBody] DownloadFilesFromRemoteZipRequest request)
        {
            await HttpZipClient.ExtractFileAsync(request.url, request.destinationPath, request.extractionFilter);
        }
    }
}
