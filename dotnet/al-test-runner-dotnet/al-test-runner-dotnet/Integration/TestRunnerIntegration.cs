using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace NaviPartner.ALTestRunner.Integration
{
    public class TestRunnerIntegration
    {
        protected LaunchConfiguration DefaultLaunchConfig { get; private set; } = new LaunchConfiguration();
        protected ALTestRunnerConfig DefaultALTestRunnerConfig { get; private set; } = new ALTestRunnerConfig();
        public async Task<Array> InvokeALTests(string alProjectPath, string smbAlExtPath, string tests, string extensionId, string extensionName, string fileName,
            int selectionStart)
        {
            return await InvokeALTests(alProjectPath, smbAlExtPath, (TestContext)Enum.Parse(typeof(TestContext), tests), new Guid(extensionId), extensionName, fileName,
                selectionStart);
        }
        public async Task<Array> InvokeALTests(string alProjectPath, string smbAlExtPath, TestContext tests, Guid extensionId, string extensionName, string fileName,
            int selectionStart)
        {
            Task.WaitAll([
                GetLaunchConfig(GetLaunchJsonPath(alProjectPath)),
                GetALTestRunnerConfig(GetALTestRunnerConfigPath(alProjectPath))
                ]);

            var serviceUrl = await GetServiceUrl(DefaultLaunchConfig);
            if (!(await IsServiceIsRunningAndHealthy(DefaultLaunchConfig)))
            {
                throw new Exception($"${serviceUrl} is not available. Please start the container, or check NST, eventually retry.");
            }
        }

        internal async Task<bool> IsServiceIsRunningAndHealthy(LaunchConfiguration launchConfiguration)
        {
            switch (launchConfiguration.EnvironmentType)
            {
                case EnvironmentType.OnPrem:
                    var healthServiceUrl = GetServiceHealthUrl(launchConfiguration);
                    return await IsServiceResponding(healthServiceUrl);
                case EnvironmentType.Sandbox:
                    // We have to implement this probably!!!
                    return true;
                default:
                    throw new NotImplementedException($"'${launchConfiguration.EnvironmentType}' is unsupported configuration value!");
            }
        }
        internal async Task<string> GetServiceUrl(LaunchConfiguration launchConfiguration)
        {
            string? url;

            switch (launchConfiguration.EnvironmentType)
            {
                case EnvironmentType.OnPrem:
                    url = $"${launchConfiguration.Server.TrimEnd('/')}/${launchConfiguration.ServerInstance}";
                    if (!string.IsNullOrEmpty(launchConfiguration.Tenant))
                        url = $"{url}/?tenant=${launchConfiguration.Tenant}";
                    return url;
                case EnvironmentType.Sandbox:
                    url = $"https://businesscentral.dynamics.com/${launchConfiguration.Tenant}/${launchConfiguration.EnvironmentName}/deployment/url";
                    var response = await InvokeHttp(url);
                    response.EnsureSuccessStatusCode();
                    string responseBody = await response.Content.ReadAsStringAsync();

                    string[] parts = responseBody.Split('?');
                    string useUrl = parts[0];
                    string tenant = parts[1].Split('=')[1];
                    
                    string publicWebBaseUrl = useUrl.TrimEnd('/');
                    url = $"{publicWebBaseUrl}/cs?tenant={tenant}";

                    return url;
                default:
                    throw new NotImplementedException($"'${launchConfiguration.EnvironmentType}' is unsupported configuration value!");
            }
        }

        internal string GetServiceHealthUrl(LaunchConfiguration launchConfiguration)
        {
            switch (launchConfiguration.EnvironmentType)
            {
                case EnvironmentType.OnPrem:
                    return $"${launchConfiguration.Server.TrimEnd('/')}/${launchConfiguration.ServerInstance}/Health/System";
                default:
                    throw new NotImplementedException($"'${launchConfiguration.EnvironmentType}' is unsupported configuration value!");
            }
        }

        internal string GetLaunchJsonPath([NotNull] string alProjectPath)
        {
            return Path.Combine([alProjectPath, ".vscode", "launch.json"]);
        }

        internal async Task<LaunchConfiguration> GetLaunchConfig([NotNull] string launchJsonPath)
        {
            var content = await File.ReadAllTextAsync(launchJsonPath);
            if (content == null)
            {
                throw new Exception($"Content of '${launchJsonPath}' is null!");
            }
            var deserializedConfig = JsonConvert.DeserializeObject(content);
            if (deserializedConfig == null)
            {
                throw new Exception($"Deserialized content of '${launchJsonPath}' is null!");
            }
            LaunchConfiguration jsonConfig = (LaunchConfiguration)deserializedConfig;

            DefaultLaunchConfig = jsonConfig;

            return jsonConfig;
        }

        internal string GetALTestRunnerConfigPath([NotNull] string alProjectPath)
        {
            return Path.Combine([alProjectPath, ".npaltestrunner", "config.json"]);
        }

        internal async Task<ALTestRunnerConfig> GetALTestRunnerConfig([NotNull] string alTestRunnerConfigPath)
        {
            var content = await File.ReadAllTextAsync(alTestRunnerConfigPath);
            if (content == null)
            {
                throw new Exception($"Content of '${alTestRunnerConfigPath}' is null!");
            }
            var deserializedConfig = JsonConvert.DeserializeObject(content);
            if (deserializedConfig == null)
            {
                throw new Exception($"Deserialized content of '${alTestRunnerConfigPath}' is null!");
            }
            ALTestRunnerConfig jsonConfig = (ALTestRunnerConfig)deserializedConfig;

            DefaultALTestRunnerConfig = jsonConfig;

            return jsonConfig;
        }

        public static async Task<bool> IsServiceResponding(string url)
        {
            try
            {
                HttpResponseMessage response = await InvokeHttp(url);
                return response.IsSuccessStatusCode;
            }
            catch (HttpRequestException)
            {
                // network level errors ...
                return false;
            }
            catch (TaskCanceledException)
            {
                // timeout ...
                return false;
            }
        }
        public static async Task<HttpResponseMessage> InvokeHttp(string url, int timeoutSeconds = 10)
        {
            using (var client = new HttpClient())
            {
                client.Timeout = TimeSpan.FromSeconds(timeoutSeconds);
                return await client.GetAsync(url);
            }
        }
    }
}
