using Microsoft.AspNetCore.Mvc;
using NaviPartner.ALTestRunner.Integration;

namespace NaviPartner.ALTestRunner.WebApi.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class TestRunnerController : ControllerBase
    {
        private readonly ILogger<TestRunnerController> _logger;

        public TestRunnerController(ILogger<TestRunnerController> logger)
        {
            _logger = logger;
        }

        [HttpPost("invokeAlTests")]
        public async Task<Array> invokeAlTests([FromBody] InvokeALTestsRequest request)
        {
            TestRunnerIntegration testRunner = new TestRunnerIntegration();
            var results = await testRunner.InvokeALTests(request.alTestRunnerExtPath, request.alProjectPath, request.smbAlExtPath,
                (TestContext)Enum.Parse(typeof(TestContext), request.tests),
                new Guid(request.extensionId), request.extensionName, request.fileName, Convert.ToInt32(request.selectionStart));
            return results;
        }
    }
}
