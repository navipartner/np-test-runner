using System.Text.Json.Serialization;

namespace NaviPartner.ALTestRunner.Server.Requests
{
    /*
    [JsonSerializable(typeof(InvokeALTestsRequest))]
    public class InvokeALTestsRequest
    {
        [JsonPropertyName("alTestRunnerExtPath")]
        public string AlTestRunnerExtPath { get; set; }

        [JsonPropertyName("alProjectPath")]
        public string AlProjectPath { get; set; }

        [JsonPropertyName("smbAlExtPath")]
        public string SmbAlExtPath { get; set; }

        [JsonPropertyName("tests")]
        public string Tests { get; set; }

        [JsonPropertyName("extensionId")]
        public string ExtensionId { get; set; }

        [JsonPropertyName("extensionName")]
        public string ExtensionName { get; set; }

        [JsonPropertyName("fileName")]
        public string FileName { get; set; }

        [JsonPropertyName("selectionStart")]
        public string SelectionStart { get; set; }
    }

    */

    public class InvokeALTestsRequest
    {
        public string AlTestRunnerExtPath { get; set; }
        public string AlProjectPath { get; set; }
        public string SmbAlExtPath { get; set; }
        public string Tests { get; set; }
        public string ExtensionId { get; set; }
        public string ExtensionName { get; set; }
        public string FileName { get; set; }
        public string SelectionStart { get; set; }
    }
}
