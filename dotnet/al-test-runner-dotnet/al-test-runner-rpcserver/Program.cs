using StreamJsonRpc;
using System.Net.Sockets;
using System.Net;

namespace NaviPartner.ALTestRunner.RpcServer
{
    internal class Program
    {
        const int DEFAULT_PORT = 63731;
        static async Task Main(string[] args)
        {
            int port = args.Length > 0 && int.TryParse(args[0], out int parsedPort) ? parsedPort : DEFAULT_PORT;
            //await RunServer(port);

            var server = new TestRunnerRpcServer();
            await server.StartServer(port);
        }

        static async Task RunServer(int port)
        {
            var listener = new TcpListener(IPAddress.Loopback, port);
            listener.Start();            
            Console.WriteLine($"Server started. Listening on port {port}...");

            while (true)
            {
                var client = await listener.AcceptTcpClientAsync();
                await HandleClientAsync(client);
            }
        }

        static async Task HandleClientAsync(TcpClient client)
        {
            using (client)
            using (var stream = client.GetStream())
            {
                var formatter = new JsonMessageFormatter();
                var handler = new NewLineDelimitedMessageHandler(stream, stream, formatter);
                var rpc = new JsonRpc(handler);

                rpc.AddLocalRpcTarget(new TestRunnerRpcServer());

                rpc.StartListening();
                await rpc.Completion;
            }
        }
    }
}
