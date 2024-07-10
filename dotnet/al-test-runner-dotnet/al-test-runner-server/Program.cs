using Microsoft.AspNetCore.Http.Json;
using NaviPartner.ALTestRunner.Server.Requests;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;

namespace NaviPartner.ALTestRunner.Server
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            builder.Services.AddControllers()
                .AddJsonOptions(options =>
                {
                    options.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
                    options.JsonSerializerOptions.PropertyNamingPolicy = null;
                    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
                    options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
                });

            builder.Services.AddSingleton<TestRunnerService>();

            var app = builder.Build();

            app.UseRouting();
            app.MapControllers();
            app.Run("http://localhost:5000");
        }
    }

    [JsonSourceGenerationOptions(WriteIndented = true, PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
    [JsonSerializable(typeof(InvokeALTestsRequest))]
    internal partial class JsonSerializationContext : JsonSerializerContext
    {
    }
}
