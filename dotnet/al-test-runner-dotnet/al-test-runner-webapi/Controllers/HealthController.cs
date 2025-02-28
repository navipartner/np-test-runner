using System.ComponentModel;
using Microsoft.AspNetCore.Mvc;
using NaviPartner.ALTestRunner.Integration;
using NaviPartner.ALTestRunner.WebApi.Requests;

namespace NaviPartner.ALTestRunner.WebApi.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class HealthController : ControllerBase
    {
        private readonly ILogger<HealthController> _logger;

        public HealthController(ILogger<HealthController> logger)
        {
            _logger = logger;
        }

        [HttpGet("")]
        public IActionResult health()
        {
            return Ok();
        }
    }
}
