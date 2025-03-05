using Microsoft.Extensions.Configuration;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace NaviPartner.ALTestRunner.Integration
{
    public class LaunchConfigurations
    {
        [JsonPropertyName("version")]
        public string Version { get; set; }

        [JsonPropertyName("configurations")]
        public List<LaunchConfiguration> Configurations { get; set; } = new List<LaunchConfiguration>();
    }

    public class LaunchConfiguration
    {
        [JsonPropertyName("server")]
        public string Server { get; set; } = "http://bcserver";
        [JsonPropertyName("port")]
        public int Port { get; set; } = 7049;
        [JsonPropertyName("serverInstance)")]
        public string ServerInstance { get; set; } = "";
        [JsonPropertyName("tenant")]
        public string? Tenant { get; set; } = "default";
        [JsonPropertyName("primaryTenantDomain")]
        public string? PrimaryTenantDomain { get; set; } = "";
        [JsonPropertyName("applicationFamily")]
        public string? ApplicationFamily { get; set; } = "";
        [JsonPropertyName("authentication")]
        public AuthenticationMethod Authentication { get; set; } = AuthenticationMethod.UserPassword;
        [JsonPropertyName("startupObjectId")]
        public int? StartupObjectId { get; set; } = 22;
        [JsonPropertyName("startupObjectType")]
        public StartupObjectType StartupObjectType { get; set; } = StartupObjectType.Page;
        [JsonPropertyName("startupCompany")]
        public string? StartupCompany { get; set; }
        [JsonPropertyName("schemaUpdateMode")]
        public SchemaUpdateMode SchemaUpdateMode { get; set; } = SchemaUpdateMode.Synchronize;
        [JsonPropertyName("dependencyPublishingOption")]
        public DependencyPublishingOption DependencyPublishingOption { get; set; } = DependencyPublishingOption.Default;
        [JsonPropertyName("breakOnError")]
        public BreakOnErrorOption BreakOnError { get; set; } = BreakOnErrorOption.None;
        [JsonPropertyName("breakOnRecordWrite")]
        public BreakOnRecordWriteOption BreakOnRecordWrite { get; set; } = BreakOnRecordWriteOption.None;
        [JsonPropertyName("launchBrowser")]
        public bool? LaunchBrowser { get; set; } = true;
        [JsonPropertyName("usePublicURLFromServer")]
        public bool? UsePublicURLFromServer { get; set; } = true;
        [JsonPropertyName("enableSqlInformationDebugger")]
        public bool? EnableSqlInformationDebugger { get; set; } = true;
        [JsonPropertyName("enableLongRunningSqlStatements")]
        public bool? EnableLongRunningSqlStatements { get; set; } = true;
        [JsonPropertyName("longRunningSqlStatementsThreshold")]
        public int? LongRunningSqlStatementsThreshold { get; set; } = 500;
        [JsonPropertyName("numberOfSqlStatements")]
        public int? NumberOfSqlStatements { get; set; } = 10;
        [JsonPropertyName("sandboxName")]
        public string? SandboxName { get; set; }
        [JsonPropertyName("environmentName")]
        public string? EnvironmentName { get; set; }
        [JsonPropertyName("environmentType")]
        public EnvironmentType EnvironmentType { get; set; }
        [JsonPropertyName("disableHttpRequestTimeout")]
        public bool? DisableHttpRequestTimeout { get; set; } = false;
        [JsonPropertyName("forceUpgrade")]
        public bool? ForceUpgrade { get; set; } = false;
        [JsonPropertyName("useSystemSessionForDeployment")]
        public bool? UseSystemSessionForDeployment { get; set; } = false;
        [JsonPropertyName("snapshotFileName")]
        public string? SnapshotFileName { get; set; } = "";
        [JsonPropertyName("breakOnNext")]
        public BreakOnNextOption BreakOnNext { get; set; } = BreakOnNextOption.WebClient;
        [JsonPropertyName("userId")]
        public string? UserId { get; set; } = "";
        [JsonPropertyName("SessionId")]
        public int? SessionId { get; set; } = -1;
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum AuthenticationMethod
    {
        MicrosoftEntraID,
        AAD,
        Windows,
        UserPassword
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum StartupObjectType
    {
        Page,
        Table,
        Report,
        Query
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum SchemaUpdateMode
    {
        Synchronize,
        Recreate,
        ForceSync
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum DependencyPublishingOption
    {
        Default,
        Ignore,
        Strict
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum BreakOnErrorOption
    {
        None,
        All,
        ExcludeTry
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum BreakOnRecordWriteOption
    {
        None,
        All,
        ExcludeTemporary
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum EnvironmentType
    {
        OnPrem,
        Sandbox,
        Production
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum BreakOnNextOption
    {
        WebServiceClient,
        WebClient,
        Background,
        ClientService
    }
}
