using Microsoft.AspNetCore.Mvc;
using NaviPartner.ALTestRunner.Integration;
using NaviPartner.ALTestRunner.WebApi.Requests;

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

            try
            {
                var results = await testRunner.InvokeALTests(request.alTestRunnerExtPath, request.alProjectPath, request.smbAlExtPath,
                    (TestContext)Enum.Parse(typeof(TestContext), request.tests),
                    (!string.IsNullOrEmpty(request.extensionId)) ? new Guid(request.extensionId) : Guid.Empty, request.extensionName,
                    request.testCodeunitsRange, request.testProcedureRange, request.disabledTests);

                return results;
            } 
            catch (Exception ex)
            {
                throw new Exception($"Error during invocation of test runner: {ex.Message}", ex.InnerException);
            }
        }
    }
}
