using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;
using System;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Diagnostics.CodeAnalysis;
using System.Linq;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace NaviPartner.ALTestRunner.Integration
{
    public class TestRunnerIntegration
    {
        protected static TestRunner DefaultTestRunner { get; private set; } = null;
        protected LaunchConfigurations DefaultLaunchConfigs { get; private set; } = new LaunchConfigurations();
        protected LaunchConfiguration DefaultLaunchConfig { get; private set; } = new LaunchConfiguration();
        protected ALTestRunnerConfig DefaultALTestRunnerConfig { get; private set; } = new ALTestRunnerConfig();

        public TestRunnerIntegration() { }

        public async Task<Array> InvokeALTests(string alTestRunnerExtPath, string alProjectPath, string smbAlExtPath, string tests, string extensionId, 
            string extensionName, string testCodeunitsRange = "", string testProcedureRange = "", Dictionary<string, string>? disabledTests = null)
        {
            return await InvokeALTests(alTestRunnerExtPath, alProjectPath, smbAlExtPath, (TestContext)Enum.Parse(typeof(TestContext), tests), new Guid(extensionId), 
                extensionName, testCodeunitsRange, testProcedureRange, disabledTests);
        }

        public async Task<Array> InvokeALTests(string alTestRunnerExtPath, string alProjectPath, string smbAlExtPath, TestContext tests, Guid extensionId, 
            string? extensionName, string? testCodeunitsRange = "", string? testProcedureRange = "", Dictionary<string, string>? disabledTests = null)
        {
            if (DefaultTestRunner == null)
            {
                Task.WaitAll([
                GetLaunchConfig(GetLaunchJsonPath(alProjectPath)),
                GetALTestRunnerConfig(GetALTestRunnerConfigPath(alProjectPath))
                ]);

                var serviceUrl = await GetServiceUrl(DefaultLaunchConfig);
                var bcVersion = DefaultALTestRunnerConfig.selectedBcVersion;
                var bcVersionLibsPath = Path.Combine(alTestRunnerExtPath, ".npaltestrunner", "CSLibs", bcVersion);
                if (!(await IsServiceIsRunningAndHealthy(DefaultLaunchConfig)))
                {
                    throw new Exception($"{serviceUrl} is not available. Please start the container, or check NST, eventually retry.");
                }

                NetworkCredential? creds = null;
                BCAuthScheme authScheme = BCAuthScheme.UserNamePassword;

                AssemblyResolver.SetupAssemblyResolve("Microsoft.Dynamics.Framework.UI.Client", bcVersionLibsPath);

                switch (DefaultLaunchConfig.EnvironmentType)
                {
                    case EnvironmentType.OnPrem:
                        var serviceUrlCredCacheKey = GetServiceUrlCredentialCacheKey(DefaultLaunchConfig).ToLower();
                        creds = GetNavUserPasswordCredentials(smbAlExtPath, serviceUrlCredCacheKey);
                        authScheme = BCAuthScheme.UserNamePassword;
                        break;
                    case EnvironmentType.Sandbox:
                        throw new NotImplementedException("Credential handling for Sandbox has to be yet implemented!");
                    default:
                        throw new NotSupportedException($"Credential handling for {DefaultLaunchConfig.EnvironmentType} isn't supported!");
                }

                DefaultTestRunner = new TestRunner(serviceUrl, authScheme, creds, TimeSpan.FromMinutes(30), DefaultALTestRunnerConfig.culture);
            }

            DisabledTest[]? disabledTestsArray = null;
            if ((disabledTests != null) && (disabledTests.Count > 0))
            {
                disabledTestsArray = disabledTests
                    .Select(kvp => new DisabledTest
                    {
                        CodeunitName = kvp.Key,
                        Method = kvp.Value
                    })
                    .ToArray();
            }


            DefaultTestRunner.SetupTestRun(extensionId: extensionId.ToString(), testCodeunitsRange: testCodeunitsRange, 
                testProcedureRange: testProcedureRange, disabledTests: disabledTestsArray);
            
            var results = DefaultTestRunner.RunAllTests();

            //DefaultTestRunner.CloseAllForms();

            return results;
        }

        private NetworkCredential GetNavUserPasswordCredentials(string smbAlExtPath, string webClientUrl)
        {
            var creds = GetALDevCacheFileContent(smbAlExtPath, CredentialCacheFileName.UserPasswordCache) ?? 
                throw new Exception("Credential cache empty. You should authenticate using standard AL dev approach (e.g. download symbols) first and then try again.");

            var regex = new Regex(webClientUrl);

            var matchingEntry = creds.First(entry => regex.IsMatch(entry.Key));
            
            string username = matchingEntry.Value["Username"];
            string password = matchingEntry.Value["Password"];

            return new NetworkCredential(username, password);
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
                    throw new NotImplementedException($"'{launchConfiguration.EnvironmentType}' is unsupported configuration value!");
            }
        }
        internal async Task<string> GetServiceUrl(LaunchConfiguration launchConfiguration)
        {
            string? url;

            switch (launchConfiguration.EnvironmentType)
            {
                case EnvironmentType.OnPrem:
                    url = $"{launchConfiguration.Server.TrimEnd('/')}/{launchConfiguration.ServerInstance}";
                    if (!string.IsNullOrEmpty(launchConfiguration.Tenant))
                        url = $"{url}/?tenant={launchConfiguration.Tenant}";
                    return url;
                case EnvironmentType.Sandbox:
                    url = $"https://businesscentral.dynamics.com/{launchConfiguration.Tenant}/{launchConfiguration.EnvironmentName}/deployment/url";
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
                    throw new NotImplementedException($"'{launchConfiguration.EnvironmentType}' is unsupported configuration value!");
            }
        }

        internal string GetServiceHealthUrl(LaunchConfiguration launchConfiguration)
        {
            switch (launchConfiguration.EnvironmentType)
            {
                case EnvironmentType.OnPrem:
                    return $"{launchConfiguration.Server.TrimEnd('/')}/{launchConfiguration.ServerInstance}/Health/System";
                default:
                    throw new NotImplementedException($"'{launchConfiguration.EnvironmentType}' is unsupported configuration value!");
            }
        }

        internal string GetServiceUrlCredentialCacheKey(LaunchConfiguration launchConfiguration)
        {
            string? url;

            switch(launchConfiguration.EnvironmentType)
            {
                case EnvironmentType.OnPrem:
                    url = $"{launchConfiguration.Server.TrimEnd('/')}:{launchConfiguration.Port}";
                    url = new Uri(url).AbsoluteUri.TrimEnd('/').ToString();

                    // Append ".?" and "_serverInstance"
                    url = $"{url}.?_{launchConfiguration.ServerInstance}";

                    return url;
                case EnvironmentType.Sandbox:
                    throw new NotImplementedException("Sandbox Credential Cache");
                default:
                    throw new NotSupportedException($"'{launchConfiguration.EnvironmentType}' is unknown or unsupported environment type!");
            }
        }

        internal string GetLaunchJsonPath([NotNull] string alProjectPath)
        {
            return Path.Combine([alProjectPath, ".vscode", "launch.json"]);
        }

        internal async Task<LaunchConfigurations> GetLaunchConfig([NotNull] string launchJsonPath)
        {
            var content = await File.ReadAllTextAsync(launchJsonPath);
            if (content == null)
            {
                throw new Exception($"Content of '{launchJsonPath}' is null!");
            }

            var deserializedConfig = JsonConvert.DeserializeObject(content);
            if (deserializedConfig == null)
            {
                throw new Exception($"Deserialized content of '{launchJsonPath}' is null!");
            }

            var deserializedConfigs = JsonConvert.DeserializeObject<LaunchConfigurations>(content) ?? 
                throw new Exception($"Deserialized content of '{launchJsonPath}' is null!");

            DefaultLaunchConfigs = deserializedConfigs;
            DefaultLaunchConfig = DefaultLaunchConfigs.Configurations[0];

            return DefaultLaunchConfigs;
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
                throw new Exception($"Content of '{alTestRunnerConfigPath}' is null!");
            }
            var jsonConfig = JsonConvert.DeserializeObject<ALTestRunnerConfig>(content) ??
                throw new Exception($"Deserialized content of '{alTestRunnerConfigPath}' is null!");

            DefaultALTestRunnerConfig = jsonConfig;

            return DefaultALTestRunnerConfig;
        }

        internal static async Task<bool> IsServiceResponding(string url)
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
        internal static async Task<HttpResponseMessage> InvokeHttp(string url, int timeoutSeconds = 10)
        {
            using (var client = new HttpClient())
            {
                client.Timeout = TimeSpan.FromSeconds(timeoutSeconds);
                return await client.GetAsync(url);
            }
        }

        internal Dictionary<string, dynamic> GetALDevCacheFileContent(string smbAlExtPath, CredentialCacheFileName fileName)
        {
            string fileNameString = $"{fileName}.dat";

            string smbAlExtBinPath = GetMsbAlExtBinariesPath(smbAlExtPath);
            string smbAlCacheFilePath = Path.Combine(smbAlExtBinPath, fileNameString);

            if (!File.Exists(smbAlCacheFilePath))
            {
                throw new FileNotFoundException($"Requested credential cache file {fileNameString} doesn't exist. Please, authenticate using the standard Microsoft AL development extension first and then try again.");
            }

            string fileContent;
            try
            {
                fileContent = ALCredentailCacheReader.GetDataFromCredentialCache(smbAlExtBinPath, fileNameString);
            }
            catch (Exception ex)
            {
                throw new Exception($"Can not decrypt file {fileNameString}. {ex.Message}", ex);
            }

            if (string.IsNullOrEmpty(fileContent))
            {
                throw new Exception($"Content of the cache file '{fileNameString}' is either null or empty!");
            }

            var cacheFile = JsonConvert.DeserializeObject<Dictionary<string, dynamic>>(fileContent);

            if (cacheFile == null)
            {
                throw new Exception($"Content of the cache file '{fileNameString}' can't be deserialized!");
            }

            return cacheFile;
        }

        internal static string GetMsbAlExtBinariesPath(string msDynamicsSmbAlExtPath)
        {
            if (string.IsNullOrEmpty(msDynamicsSmbAlExtPath))
            {
                throw new ArgumentNullException(nameof(msDynamicsSmbAlExtPath), "msDynamicsSmbAlExtPath is required.");
            }

            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                return Path.Combine(msDynamicsSmbAlExtPath, "bin", "win32");
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
            {
                return Path.Combine(msDynamicsSmbAlExtPath, "bin", "darwin");
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
            {
                return Path.Combine(msDynamicsSmbAlExtPath, "bin", "linux");
            }
            else
            {
                throw new PlatformNotSupportedException("Unsupported operating system.");
            }
        }
    }
}
