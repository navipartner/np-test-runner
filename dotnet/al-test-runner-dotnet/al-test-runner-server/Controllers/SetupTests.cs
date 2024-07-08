using Microsoft.AspNetCore.Mvc;

// For more information on enabling Web API for empty projects, visit https://go.microsoft.com/fwlink/?LinkID=397860

namespace NaviPartner.ALTestRunner.Server.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class SetupTests : ControllerBase
    {
        public const string DefaultTestSuite = "DEFAULT";
        public const int DefaultTestPage = 130455;
        public const int DefaultTestRunnerCodeunit = 130450;
        public const string DateTimeFormat = "s";
        public const string FailureTestResultType = "1";
        public const string SuccessTestResultType = "2";
        public const string SkippedTestResultType = "3";
        public const int NumberOfUnexpectedFailuresBeforeAborting = 50;

        // GET: api/<SetupTests>
        [HttpGet]
        public IEnumerable<string> Get()
        {
            return new string[] { "value1", "value2" };
        }

        // GET api/<SetupTests>/5
        [HttpGet("{id}")]
        public string Get(int id)
        {
            return "value";
        }

        // POST api/<SetupTests>
        [HttpPost]
        public void Post(int testPage = DefaultTestPage, string testSuite = DefaultTestSuite, string extensionId = "", string testCodeunitsRange = "",
            string testProcedureRange = "", int testRunnerCodeunit = DefaultTestRunnerCodeunit, DisabledTest[] disabledTests = null, bool stabilityRun = false)
        {
        }

        // PUT api/<SetupTests>/5
        [HttpPut("{id}")]
        public void Put(int id, [FromBody] string value)
        {
        }

        // DELETE api/<SetupTests>/5
        [HttpDelete("{id}")]
        public void Delete(int id)
        {
        }
    }
}
