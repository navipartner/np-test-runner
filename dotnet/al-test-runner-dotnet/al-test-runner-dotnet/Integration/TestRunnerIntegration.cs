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
using System.Threading;
using System.Threading.Tasks;
using System.IO;
using System.Net.Http;

namespace NaviPartner.ALTestRunner.Integration
{
    public class TestRunnerIntegration : IDisposable
    {
        private static readonly SemaphoreSlim _testRunnerInitLock = new SemaphoreSlim(1, 1);
        protected static TestRunner DefaultTestRunner { get; private set; } = null;
        protected LaunchConfigurations DefaultLaunchConfigs { get; private set; } = new LaunchConfigurations();
        protected LaunchConfiguration DefaultLaunchConfig { get; private set; } = new LaunchConfiguration();
        protected ALTestRunnerConfig DefaultALTestRunnerConfig { get; private set; } = new ALTestRunnerConfig();
        private bool _disposed = false;

        public TestRunnerIntegration() { }

        public async Task<Array> InvokeALTests(string alTestRunnerExtPath, string alProjectPath, string smbAlExtPath, string tests, string extensionId,
            string extensionName, string testCodeunitsRange = "", string testProcedureRange = "", Dictionary<string, string>? disabledTests = null)
        {
            if (string.IsNullOrEmpty(alTestRunnerExtPath))
                throw new ArgumentNullException(nameof(alTestRunnerExtPath), "AL Test Runner extension path cannot be null or empty");

            if (string.IsNullOrEmpty(alProjectPath))
                throw new ArgumentNullException(nameof(alProjectPath), "AL project path cannot be null or empty");

            if (string.IsNullOrEmpty(smbAlExtPath))
                throw new ArgumentNullException(nameof(smbAlExtPath), "SMB AL extension path cannot be null or empty");

            if (string.IsNullOrEmpty(tests))
                throw new ArgumentNullException(nameof(tests), "Tests parameter cannot be null or empty");

            if (string.IsNullOrEmpty(extensionId))
                throw new ArgumentNullException(nameof(extensionId), "Extension ID cannot be null or empty");

            if (!Enum.TryParse(typeof(TestContext), tests, out var testContext))
                throw new ArgumentException($"Invalid test context value: {tests}", nameof(tests));

            try
            {
                var guidExtensionId = new Guid(extensionId);
                return await InvokeALTests(alTestRunnerExtPath, alProjectPath, smbAlExtPath, (TestContext)testContext, guidExtensionId,
                    extensionName, testCodeunitsRange, testProcedureRange, disabledTests);
            }
            catch (FormatException ex)
            {
                throw new ArgumentException($"Invalid extension ID format: {extensionId}", nameof(extensionId), ex);
            }
        }

        public async Task<Array> InvokeALTests(string alTestRunnerExtPath, string alProjectPath, string smbAlExtPath, TestContext tests, Guid extensionId,
            string? extensionName, string? testCodeunitsRange = "", string? testProcedureRange = "", Dictionary<string, string>? disabledTests = null)
        {
            if (string.IsNullOrEmpty(alTestRunnerExtPath))
                throw new ArgumentNullException(nameof(alTestRunnerExtPath), "AL Test Runner extension path cannot be null or empty");

            if (string.IsNullOrEmpty(alProjectPath))
                throw new ArgumentNullException(nameof(alProjectPath), "AL project path cannot be null or empty");

            if (string.IsNullOrEmpty(smbAlExtPath))
                throw new ArgumentNullException(nameof(smbAlExtPath), "SMB AL extension path cannot be null or empty");

            if (extensionId == Guid.Empty)
                throw new ArgumentException("Extension ID cannot be empty", nameof(extensionId));

            bool recreateClient = false;

            try
            {
                if (DefaultTestRunner == null)
                {
                    await InitializeTestRunnerAsync(alTestRunnerExtPath, alProjectPath, smbAlExtPath);
                }

                if (DefaultTestRunner == null)
                {
                    throw new InvalidOperationException("Failed to initialize test runner");
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

                DefaultTestRunner.SetupTestRun(
                    extensionId: extensionId.ToString(),
                    testCodeunitsRange: testCodeunitsRange,
                    testProcedureRange: testProcedureRange,
                    disabledTests: disabledTestsArray);

                var results = DefaultTestRunner.RunAllTests();
                recreateClient = true;

                return results;
            }
            catch (Exception ex)
            {
                throw new Exception($"Error running AL tests: {ex.Message}", ex);
            }
            finally
            {
                try
                {
                    if (DefaultTestRunner != null)
                    {
                        DefaultTestRunner.CloseOpenedForm();
                        DefaultTestRunner.CloseSession();
                        DefaultTestRunner.Dispose();
                        DefaultTestRunner = null;
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error during TestRunner cleanup: {ex.Message}");
                }

                if (recreateClient)
                {
                    _ = Task.Run(() => InitializeTestRunnerAsync(alTestRunnerExtPath, alProjectPath, smbAlExtPath));
                }
            }
        }

        private async Task InitializeTestRunnerAsync(string alTestRunnerExtPath, string alProjectPath, string smbAlExtPath)
        {
            await _testRunnerInitLock.WaitAsync();

            try
            {
                if (DefaultTestRunner != null)
                    return;

                await CreateTestRunnerInstance(alTestRunnerExtPath, alProjectPath, smbAlExtPath);
            }
            finally
            {
                _testRunnerInitLock.Release();
            }
        }

        private async Task<TestRunner> CreateTestRunnerInstance(string alTestRunnerExtPath, string alProjectPath, string smbAlExtPath)
        {
            try
            {
                if (DefaultTestRunner == null)
                {
                    // Load configurations in parallel
                    var launchJsonPath = GetLaunchJsonPath(alProjectPath);
                    var alTestRunnerConfigPath = GetALTestRunnerConfigPath(alProjectPath);

                    if (!File.Exists(launchJsonPath))
                        throw new FileNotFoundException($"Launch configuration file not found at: {launchJsonPath}");

                    if (!File.Exists(alTestRunnerConfigPath))
                        throw new FileNotFoundException($"AL Test Runner configuration file not found at: {alTestRunnerConfigPath}");

                    // Run configuration tasks in parallel
                    var configTasks = new List<Task>
                    {
                        GetLaunchConfig(launchJsonPath),
                        GetALTestRunnerConfig(alTestRunnerConfigPath)
                    };

                    // Wait for all configuration tasks to complete
                    await Task.WhenAll(configTasks);

                    // Get service URL and verify service is healthy
                    var serviceUrl = await GetServiceUrl(DefaultLaunchConfig);
                    var bcVersion = DefaultALTestRunnerConfig.selectedBcVersion;
                    var bcVersionLibsPath = Path.Combine(alTestRunnerExtPath, ".npaltestrunner", "CSLibs", bcVersion);

                    if (!Directory.Exists(bcVersionLibsPath))
                        throw new DirectoryNotFoundException($"BC version libraries path not found: {bcVersionLibsPath}");

                    // Check if service is running
                    if (!(await IsServiceIsRunningAndHealthy(DefaultLaunchConfig)))
                    {
                        throw new Exception($"Service at {serviceUrl} is not available or not healthy. Please start the container, check NST, or retry.");
                    }

                    // Set up credentials based on environment type
                    NetworkCredential? creds = null;
                    BCAuthScheme authScheme = BCAuthScheme.UserNamePassword;

                    // Set up assembly resolution
                    AssemblyResolver.SetupAssemblyResolve("Microsoft.Dynamics.Framework.UI.Client", bcVersionLibsPath);

                    // Handle different environment types
                    switch (DefaultLaunchConfig.EnvironmentType)
                    {
                        case EnvironmentType.OnPrem:
                            var serviceUrlCredCacheKey = GetServiceUrlCredentialCacheKey(DefaultLaunchConfig).ToLower();
                            creds = GetNavUserPasswordCredentials(smbAlExtPath, serviceUrlCredCacheKey);
                            authScheme = BCAuthScheme.UserNamePassword;
                            break;
                        case EnvironmentType.Sandbox:
                            throw new NotImplementedException("Credential handling for Sandbox environment type has not yet been implemented.");
                        default:
                            throw new NotSupportedException($"Credential handling for environment type '{DefaultLaunchConfig.EnvironmentType}' is not supported.");
                    }

                    // Create the test runner with configured parameters
                    DefaultTestRunner = new TestRunner(
                        serviceUrl,
                        authScheme,
                        creds,
                        TimeSpan.FromMinutes(30),
                        DefaultALTestRunnerConfig.culture);
                }

                return DefaultTestRunner;
            }
            catch (Exception ex)
            {
                // Clear the instance in case of failure
                DefaultTestRunner = null;

                // Add more context to the exception
                throw new Exception($"Failed to create TestRunner instance: {ex.Message}", ex);
            }
        }

        private NetworkCredential GetNavUserPasswordCredentials(string smbAlExtPath, string webClientUrl)
        {
            try
            {
                var creds = GetALDevCacheFileContent(smbAlExtPath, CredentialCacheFileName.UserPasswordCache);

                if (creds == null || !creds.Any())
                    throw new InvalidOperationException("Credential cache is empty. You should authenticate using the standard AL development approach (e.g., download symbols) first and then try again.");

                var regex = new Regex(webClientUrl);

                // Find matching entry
                var matchingEntries = creds.Where(entry => regex.IsMatch(entry.Key)).ToList();

                if (!matchingEntries.Any())
                    throw new KeyNotFoundException($"No matching credential found for URL pattern: {webClientUrl}");

                var matchingEntry = matchingEntries.First();

                // Validate credential values
                if (!matchingEntry.Value.ContainsKey("Username") || !matchingEntry.Value.ContainsKey("Password"))
                    throw new InvalidOperationException("Credential entry is missing username or password.");

                string username = matchingEntry.Value["Username"];
                string password = matchingEntry.Value["Password"];

                if (string.IsNullOrEmpty(username))
                    throw new InvalidOperationException("Username is empty in the credential cache.");

                return new NetworkCredential(username, password);
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to retrieve NAV user credentials: {ex.Message}", ex);
            }
        }

        internal async Task<bool> IsServiceIsRunningAndHealthy(LaunchConfiguration launchConfiguration)
        {
            if (launchConfiguration == null)
                throw new ArgumentNullException(nameof(launchConfiguration));

            try
            {
                switch (launchConfiguration.EnvironmentType)
                {
                    case EnvironmentType.OnPrem:
                        var healthServiceUrl = GetServiceHealthUrl(launchConfiguration);
                        return await IsServiceResponding(healthServiceUrl);
                    case EnvironmentType.Sandbox:
                        // TODO: Implement health check for Sandbox environment
                        return true;
                    default:
                        throw new NotSupportedException($"Environment type '{launchConfiguration.EnvironmentType}' is not supported for health checks.");
                }
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to check if service is running and healthy: {ex.Message}", ex);
            }
        }

        internal async Task<string> GetServiceUrl(LaunchConfiguration launchConfiguration)
        {
            if (launchConfiguration == null)
                throw new ArgumentNullException(nameof(launchConfiguration));

            try
            {
                string? url;

                switch (launchConfiguration.EnvironmentType)
                {
                    case EnvironmentType.OnPrem:
                        if (string.IsNullOrEmpty(launchConfiguration.Server))
                            throw new InvalidOperationException("Server URL is missing in the launch configuration.");

                        if (string.IsNullOrEmpty(launchConfiguration.ServerInstance))
                            throw new InvalidOperationException("Server instance is missing in the launch configuration.");

                        url = $"{launchConfiguration.Server.TrimEnd('/')}/{launchConfiguration.ServerInstance}";

                        if (!string.IsNullOrEmpty(launchConfiguration.Tenant))
                            url = $"{url}/?tenant={launchConfiguration.Tenant}";

                        return url;
                    case EnvironmentType.Sandbox:
                        if (string.IsNullOrEmpty(launchConfiguration.Tenant))
                            throw new InvalidOperationException("Tenant is missing in the launch configuration.");

                        if (string.IsNullOrEmpty(launchConfiguration.EnvironmentName))
                            throw new InvalidOperationException("Environment name is missing in the launch configuration.");

                        url = $"https://businesscentral.dynamics.com/{launchConfiguration.Tenant}/{launchConfiguration.EnvironmentName}/deployment/url";

                        var response = await InvokeHttp(url);

                        if (!response.IsSuccessStatusCode)
                            throw new HttpRequestException($"Failed to get deployment URL: {response.StatusCode}");

                        string responseBody = await response.Content.ReadAsStringAsync();

                        if (string.IsNullOrEmpty(responseBody))
                            throw new InvalidOperationException("Received empty response from deployment URL");

                        string[] parts = responseBody.Split('?');

                        if (parts.Length < 2)
                            throw new FormatException($"Unexpected deployment URL format: {responseBody}");

                        string useUrl = parts[0];

                        string[] queryParams = parts[1].Split('=');

                        if (queryParams.Length < 2 || queryParams[0] != "tenant")
                            throw new FormatException($"Unexpected query parameters in deployment URL: {parts[1]}");

                        string tenant = queryParams[1];

                        string publicWebBaseUrl = useUrl.TrimEnd('/');
                        url = $"{publicWebBaseUrl}/cs?tenant={tenant}";

                        return url;
                    default:
                        throw new NotSupportedException($"Environment type '{launchConfiguration.EnvironmentType}' is not supported for getting service URL.");
                }
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to get service URL: {ex.Message}", ex);
            }
        }

        internal string GetServiceHealthUrl(LaunchConfiguration launchConfiguration)
        {
            if (launchConfiguration == null)
                throw new ArgumentNullException(nameof(launchConfiguration));

            try
            {
                switch (launchConfiguration.EnvironmentType)
                {
                    case EnvironmentType.OnPrem:
                        if (string.IsNullOrEmpty(launchConfiguration.Server))
                            throw new InvalidOperationException("Server URL is missing in the launch configuration.");

                        if (string.IsNullOrEmpty(launchConfiguration.ServerInstance))
                            throw new InvalidOperationException("Server instance is missing in the launch configuration.");

                        return $"{launchConfiguration.Server.TrimEnd('/')}/{launchConfiguration.ServerInstance}/Health/System";
                    default:
                        throw new NotSupportedException($"Environment type '{launchConfiguration.EnvironmentType}' is not supported for health URL.");
                }
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to get service health URL: {ex.Message}", ex);
            }
        }

        internal string GetServiceUrlCredentialCacheKey(LaunchConfiguration launchConfiguration)
        {
            if (launchConfiguration == null)
                throw new ArgumentNullException(nameof(launchConfiguration));

            try
            {
                string? url;

                switch (launchConfiguration.EnvironmentType)
                {
                    case EnvironmentType.OnPrem:
                        if (string.IsNullOrEmpty(launchConfiguration.Server))
                            throw new InvalidOperationException("Server URL is missing in the launch configuration.");

                        if (launchConfiguration.Port <= 0)
                            throw new InvalidOperationException("Invalid server port in the launch configuration.");

                        if (string.IsNullOrEmpty(launchConfiguration.ServerInstance))
                            throw new InvalidOperationException("Server instance is missing in the launch configuration.");

                        url = $"{launchConfiguration.Server.TrimEnd('/')}:{launchConfiguration.Port}";

                        try
                        {
                            url = new Uri(url).AbsoluteUri.TrimEnd('/').ToString();
                        }
                        catch (UriFormatException ex)
                        {
                            throw new FormatException($"Invalid server URL format: {url}", ex);
                        }

                        // Append ".?" and "_serverInstance"
                        url = $"{url}.?_{launchConfiguration.ServerInstance}";

                        return url;
                    case EnvironmentType.Sandbox:
                        throw new NotImplementedException("Credential cache key for Sandbox environment is not implemented.");
                    default:
                        throw new NotSupportedException($"Environment type '{launchConfiguration.EnvironmentType}' is not supported for credential cache key.");
                }
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to get service URL credential cache key: {ex.Message}", ex);
            }
        }

        internal string GetLaunchJsonPath([NotNull] string alProjectPath)
        {
            if (string.IsNullOrEmpty(alProjectPath))
                throw new ArgumentNullException(nameof(alProjectPath));

            var path = Path.Combine(alProjectPath, ".vscode", "launch.json");

            return path;
        }

        internal async Task<LaunchConfigurations> GetLaunchConfig([NotNull] string launchJsonPath)
        {
            if (string.IsNullOrEmpty(launchJsonPath))
                throw new ArgumentNullException(nameof(launchJsonPath));

            try
            {
                if (!File.Exists(launchJsonPath))
                    throw new FileNotFoundException($"Launch configuration file not found: {launchJsonPath}");

                var content = await File.ReadAllTextAsync(launchJsonPath);

                if (string.IsNullOrEmpty(content))
                    throw new InvalidOperationException($"Launch configuration file is empty: {launchJsonPath}");

                var deserializedConfigs = JsonConvert.DeserializeObject<LaunchConfigurations>(content);

                if (deserializedConfigs == null)
                    throw new JsonException($"Failed to deserialize launch configuration from: {launchJsonPath}");

                if (deserializedConfigs.Configurations == null || deserializedConfigs.Configurations.Count == 0)
                    throw new InvalidOperationException("Launch configuration file does not contain any configurations.");

                DefaultLaunchConfigs = deserializedConfigs;
                DefaultLaunchConfig = DefaultLaunchConfigs.Configurations[0];

                return DefaultLaunchConfigs;
            }
            catch (Exception ex) when (
                ex is IOException ||
                ex is JsonException ||
                ex is FormatException)
            {
                throw new Exception($"Error loading launch configuration: {ex.Message}", ex);
            }
        }

        internal string GetALTestRunnerConfigPath([NotNull] string alProjectPath)
        {
            if (string.IsNullOrEmpty(alProjectPath))
                throw new ArgumentNullException(nameof(alProjectPath));

            return Path.Combine(alProjectPath, ".npaltestrunner", "config.json");
        }

        internal async Task<ALTestRunnerConfig> GetALTestRunnerConfig([NotNull] string alTestRunnerConfigPath)
        {
            if (string.IsNullOrEmpty(alTestRunnerConfigPath))
                throw new ArgumentNullException(nameof(alTestRunnerConfigPath));

            try
            {
                if (!File.Exists(alTestRunnerConfigPath))
                    throw new FileNotFoundException($"AL Test Runner configuration file not found: {alTestRunnerConfigPath}");

                var content = await File.ReadAllTextAsync(alTestRunnerConfigPath);

                if (string.IsNullOrEmpty(content))
                    throw new InvalidOperationException($"AL Test Runner configuration file is empty: {alTestRunnerConfigPath}");

                var jsonConfig = JsonConvert.DeserializeObject<ALTestRunnerConfig>(content);

                if (jsonConfig == null)
                    throw new JsonException($"Failed to deserialize AL Test Runner configuration from: {alTestRunnerConfigPath}");

                if (string.IsNullOrEmpty(jsonConfig.selectedBcVersion))
                    throw new InvalidOperationException("AL Test Runner configuration does not contain a selected BC version.");

                DefaultALTestRunnerConfig = jsonConfig;

                return DefaultALTestRunnerConfig;
            }
            catch (Exception ex) when (
                ex is IOException ||
                ex is JsonException ||
                ex is FormatException)
            {
                throw new Exception($"Error loading AL Test Runner configuration: {ex.Message}", ex);
            }
        }

        internal static async Task<bool> IsServiceResponding(string url)
        {
            if (string.IsNullOrEmpty(url))
                throw new ArgumentNullException(nameof(url));

            try
            {
                HttpResponseMessage response = await InvokeHttp(url);
                return response.IsSuccessStatusCode;
            }
            catch (HttpRequestException ex)
            {
                // Log the specific network error for troubleshooting
                Console.WriteLine($"Network error checking service health: {ex.Message}");
                return false;
            }
            catch (TaskCanceledException ex)
            {
                // Log the timeout for troubleshooting
                Console.WriteLine($"Timeout checking service health: {ex.Message}");
                return false;
            }
            catch (Exception ex)
            {
                // Log any other unexpected errors
                Console.WriteLine($"Unexpected error checking service health: {ex.Message}");
                return false;
            }
        }

        internal static async Task<HttpResponseMessage> InvokeHttp(string url, int timeoutSeconds = 10)
        {
            if (string.IsNullOrEmpty(url))
                throw new ArgumentNullException(nameof(url));

            if (timeoutSeconds <= 0)
                throw new ArgumentOutOfRangeException(nameof(timeoutSeconds), "Timeout must be greater than zero seconds.");

            using (var client = new HttpClient())
            {
                client.Timeout = TimeSpan.FromSeconds(timeoutSeconds);
                return await client.GetAsync(url);
            }
        }

        internal Dictionary<string, dynamic> GetALDevCacheFileContent(string smbAlExtPath, CredentialCacheFileName fileName)
        {
            if (string.IsNullOrEmpty(smbAlExtPath))
                throw new ArgumentNullException(nameof(smbAlExtPath));

            try
            {
                string fileNameString = $"{fileName}.dat";

                string smbAlExtBinPath = GetMsbAlExtBinariesPath(smbAlExtPath);
                string smbAlCacheFilePath = Path.Combine(smbAlExtBinPath, fileNameString);

                if (!File.Exists(smbAlCacheFilePath))
                {
                    throw new FileNotFoundException(
                        $"Requested credential cache file {fileNameString} doesn't exist. " +
                        "Please authenticate using the standard Microsoft AL development extension first and then try again.");
                }

                string fileContent;
                try
                {
                    fileContent = ALCredentailCacheReader.GetDataFromCredentialCache(smbAlExtBinPath, fileNameString);
                }
                catch (Exception ex)
                {
                    throw new Exception($"Cannot decrypt credential cache file {fileNameString}: {ex.Message}", ex);
                }

                if (string.IsNullOrEmpty(fileContent))
                {
                    throw new InvalidOperationException($"Content of the credential cache file '{fileNameString}' is either null or empty.");
                }

                var cacheFile = JsonConvert.DeserializeObject<Dictionary<string, dynamic>>(fileContent);

                if (cacheFile == null)
                {
                    throw new JsonException($"Content of the credential cache file '{fileNameString}' cannot be deserialized.");
                }

                return cacheFile;
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to get AL development cache file content: {ex.Message}", ex);
            }
        }

        internal static string GetMsbAlExtBinariesPath(string msDynamicsSmbAlExtPath)
        {
            if (string.IsNullOrEmpty(msDynamicsSmbAlExtPath))
                throw new ArgumentNullException(nameof(msDynamicsSmbAlExtPath), "Microsoft Dynamics SMB AL extension path is required.");

            try
            {
                if (!Directory.Exists(msDynamicsSmbAlExtPath))
                    throw new DirectoryNotFoundException($"Microsoft Dynamics SMB AL extension directory not found: {msDynamicsSmbAlExtPath}");

                string binPath;

                if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                {
                    binPath = Path.Combine(msDynamicsSmbAlExtPath, "bin", "win32");
                }
                else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
                {
                    binPath = Path.Combine(msDynamicsSmbAlExtPath, "bin", "darwin");
                }
                else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
                {
                    binPath = Path.Combine(msDynamicsSmbAlExtPath, "bin", "linux");
                }
                else
                {
                    throw new PlatformNotSupportedException("Current operating system is not supported.");
                }

                if (!Directory.Exists(binPath))
                    throw new DirectoryNotFoundException($"Microsoft Dynamics SMB AL extension binaries directory not found: {binPath}");

                return binPath;
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to get Microsoft Dynamics SMB AL extension binaries path: {ex.Message}", ex);
            }
        }

        public void Dispose()
        {
            Dispose(true);
            GC.SuppressFinalize(this);
        }

        protected virtual void Dispose(bool disposing)
        {
            if (_disposed)
                return;

            if (disposing)
            {
                if (DefaultTestRunner != null)
                {
                    try
                    {
                        DefaultTestRunner.CloseOpenedForm();
                        DefaultTestRunner.CloseSession();
                        DefaultTestRunner.Dispose();
                        DefaultTestRunner = null;
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Error during TestRunner disposal: {ex.Message}");
                    }
                }
            }

            _disposed = true;
        }

        ~TestRunnerIntegration()
        {
            Dispose(false);
        }
    }
}