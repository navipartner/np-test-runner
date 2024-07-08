using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace NaviPartner.ALTestRunner.Integration
{
    public class LaunchConfiguration
    {
        public string Server { get; set; } = "http://bcserver";
        public int Port { get; set; } = 7049;
        public string ServerInstance { get; set; } = "";
        public string Tenant { get; set; } = "default";
        public string PrimaryTenantDomain { get; set; } = "";
        public string ApplicationFamily { get; set; } = "";
        public AuthenticationMethod Authentication { get; set; } = AuthenticationMethod.UserPassword;
        public int StartupObjectId { get; set; } = 22;
        public StartupObjectType StartupObjectType { get; set; } = StartupObjectType.Page;
        public string StartupCompany { get; set; }
        public SchemaUpdateMode SchemaUpdateMode { get; set; } = SchemaUpdateMode.Synchronize;
        public DependencyPublishingOption DependencyPublishingOption { get; set; } = DependencyPublishingOption.Default;
        public BreakOnErrorOption BreakOnError { get; set; } = BreakOnErrorOption.None;
        public BreakOnRecordWriteOption BreakOnRecordWrite { get; set; } = BreakOnRecordWriteOption.None;
        public bool LaunchBrowser { get; set; } = true;
        public bool UsePublicURLFromServer { get; set; } = true;
        public bool EnableSqlInformationDebugger { get; set; } = true;
        public bool EnableLongRunningSqlStatements { get; set; } = true;
        public int LongRunningSqlStatementsThreshold { get; set; } = 500;
        public int NumberOfSqlStatements { get; set; } = 10;
        public string SandboxName { get; set; }
        public string EnvironmentName { get; set; }
        public EnvironmentType EnvironmentType { get; set; }
        public bool DisableHttpRequestTimeout { get; set; } = false;
        public bool ForceUpgrade { get; set; } = false;
        public bool UseSystemSessionForDeployment { get; set; } = false;
        public string SnapshotFileName { get; set; } = "";
        public BreakOnNextOption BreakOnNext { get; set; } = BreakOnNextOption.WebClient;
        public string UserId { get; set; } = "";
        public int SessionId { get; set; } = -1;
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
        Background
    }
}
