using Microsoft.AspNetCore.Mvc;
using System.Net;
using NaviPartner.ALTestRunner;
using NaviPartner.ALTestRunner.Server;
using NaviPartner.ALTestRunner.Server.Requests;
using static NaviPartner.ALTestRunner.Server.Requests.InvokeALTestsRequest;
// For more information on enabling Web API for empty projects, visit https://go.microsoft.com/fwlink/?LinkID=397860

namespace NaviPartner.ALTestRunner.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class TestRunnerController : ControllerBase
    {
        private readonly TestRunnerService _service = TestRunnerService.GetInstance();
        public const string AllTestsExecutedString = "All tests executed.";
        
        [HttpPost("invokeAlTests")]
        public IActionResult InvokeALTests([FromBody] InvokeALTestsRequest request)
        {
            var result = _service.InvokeALTests(request.AlTestRunnerExtPath, request.AlProjectPath, request.SmbAlExtPath, 
                (TestContext)Enum.Parse(typeof(TestContext), request.Tests),
                new Guid(request.ExtensionId), request.ExtensionName, request.FileName, Convert.ToInt32(request.SelectionStart));
            return Ok();
        }
    }
}
