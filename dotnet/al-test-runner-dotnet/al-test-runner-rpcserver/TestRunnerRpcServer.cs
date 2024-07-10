using StreamJsonRpc;
using NaviPartner.ALTestRunner.Integration;
using System.IO.Pipes;
using System.Net.Sockets;
using System.Net;

namespace NaviPartner.ALTestRunner.RpcServer
{
    public class TestRunnerRpcServer
    {
        private TestRunner _testRunner;
        private TestRunnerIntegration _testRunnerIntegration;
        private JsonRpc _rpc;
        public TestRunnerRpcServer()
        {
        }

        public async Task StartServer(int port)
        {
            var listener = new TcpListener(IPAddress.Loopback, port);
            listener.Start();
            Console.WriteLine($"Server listening on port {port}");

            while (true)
            {
                try
                {
                    using (var client = await listener.AcceptTcpClientAsync())
                    {
                        Console.WriteLine("Client connected");
                        var stream = client.GetStream();
                        _rpc = JsonRpc.Attach(stream, this);
                        await _rpc.Completion;
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error: {ex.Message}");
                }
            }
        }

        [JsonRpcMethod("InvokeALTests")]
        public async Task<Array> InvokeALTests(string alTestRunnerExtPath, string alProjectPath, string smbAlExtPath, string tests, 
            string extensionId, string extensionName, string fileName, int selectionStart)
        {
            _testRunnerIntegration = new TestRunnerIntegration();
            return await _testRunnerIntegration.InvokeALTests(alTestRunnerExtPath, alProjectPath, smbAlExtPath, tests, extensionId, 
                extensionName, fileName, selectionStart);
        }

        [JsonRpcMethod("InvokeALTestsSync")]
        public void InvokeALTestsSync(string alTestRunnerExtPath, string alProjectPath, string smbAlExtPath, string tests,
            string extensionId, string extensionName, string fileName, int selectionStart)
        {
            _testRunnerIntegration = new TestRunnerIntegration();
            _testRunnerIntegration.InvokeALTests(alTestRunnerExtPath, alProjectPath, smbAlExtPath, tests, extensionId,
                extensionName, fileName, selectionStart);
        }
    }
}
