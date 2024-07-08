using System.Net;
namespace NaviPartner.ALTestRunner.Server.Requests
{
    public class CreateSessionRequest
    {
        public string serviceUrl { get; set; } 
        public string authenticationScheme { get; set; }
        public ICredentials credential { get; set; }
        public TimeSpan interactionTimeout { get; set; } 
        public string culture { get; set; }
    }
}
