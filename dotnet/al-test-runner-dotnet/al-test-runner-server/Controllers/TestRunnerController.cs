using Microsoft.AspNetCore.Mvc;
using System.Net;
using NaviPartner.ALTestRunner;
using NaviPartner.ALTestRunner.Server;
using NaviPartner.ALTestRunner.Server.Requests;
// For more information on enabling Web API for empty projects, visit https://go.microsoft.com/fwlink/?LinkID=397860

namespace NaviPartner.ALTestRunner.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class TestRunnerController : ControllerBase
    {
        private readonly TestRunnerService _service = TestRunnerService.GetInstance();
        public const string AllTestsExecutedString = "All tests executed.";
        
        // POST api/<TestRunnerController>
        [HttpPost("create-session")]
        public IActionResult CreateSession([FromBody] CreateSessionRequest request)
        {
            string sessionId = _service.CreateSession(request.serviceUrl, request.authenticationScheme, request.credential, 
                request.interactionTimeout, request.culture);
            return Ok(new { sessionId });
        }

        [HttpPost("setup-test-run")]
        public IActionResult SetupTestRun([FromBody] SetupTestRunRequest request)
        {
            _service.SetupTestRun(request.sessionId, request.testPage, request.testSuite, request.testRunnerCodeunit, request.extensionId, 
                request.testCodeunitsRange, request.testProcedureRange, request.disabledTests, request.stabilityRun);
            return Ok();
        }

        [HttpPost("run-all-tests")]
        public IActionResult RunAllTests([FromBody] RunAllTestsRequest request)
        {
            var result = _service.RunAllTests(request.sessionId);
            return Ok(new { result });
        }
    }
}
