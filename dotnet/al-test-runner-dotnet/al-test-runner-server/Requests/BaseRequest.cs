using System.Text.Json.Serialization;

namespace NaviPartner.ALTestRunner.Server.Requests
{
    public class BaseRequest
    {
        [JsonPropertyName("sessionId")]
        public string sessionId { get; set; }
    }
}
