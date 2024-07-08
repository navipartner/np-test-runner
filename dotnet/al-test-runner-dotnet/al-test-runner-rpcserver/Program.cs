using StreamJsonRpc;
using System.Net.Sockets;
using System.Net;

namespace NaviPartner.ALTestRunner.RpcServer
{
    internal class Program
    {
        static async Task Main(string[] args)
        {
            int port = Convert.ToInt32(args[0]);
            _ = RunServer(port);
        }

        static async Task RunServer(int port)
        {
            var listener = new TcpListener(IPAddress.Loopback, port);
            listener.Start();
            Console.WriteLine($"Server started. Listening on port {port}...");

            while (true)
            {
                var client = await listener.AcceptTcpClientAsync();
                _ = HandleClientAsync(client);
            }
        }

        static async Task HandleClientAsync(TcpClient client)
        {
            using (client)
            using (var stream = client.GetStream())
            {
                var rpc = JsonRpc.Attach(stream, new TestRunnerRpcServer());
                await rpc.Completion;
            }
        }
    }
}
