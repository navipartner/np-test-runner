using System.Dynamic;
using System.Linq.Expressions;
using System.Net;
using System.Reflection;
using Microsoft.Dynamics.Framework.UI.Client;
using Microsoft.Dynamics.Framework.UI.Client.Interactions;

namespace NaviPartner.ALTestRunner
{
    public class ClientContext : IDisposable
    {
        protected ClientSession ClientSession { get; private set; }
        protected string Culture { get; private set; }
        internal ClientLogicalForm? OpenedForm { get; private set; } = null;
        protected string OpenedFormName { get; private set; } = "";
        private ClientLogicalForm PsTestRunnerCaughtForm;
        protected bool IgnoreErrors { get; private set; } = true;
        
        public ClientContext(string serviceUrl, AuthenticationScheme authenticationScheme, ICredentials credential,
            TimeSpan interactionTimeout, string culture) : base()
        {
            Initialize(serviceUrl, authenticationScheme, credential, interactionTimeout, culture);
        }

        public ClientContext(string serviceUrl, string authenticationScheme, ICredentials credential,
            TimeSpan interactionTimeout, string culture) : base()
        {
            AuthenticationScheme auth = (AuthenticationScheme)Enum.Parse(typeof(AuthenticationScheme), authenticationScheme);
            Initialize(serviceUrl, auth, credential, interactionTimeout, culture);
        }

        public void Initialize(string serviceUrl, AuthenticationScheme authenticationScheme, ICredentials credential,
            TimeSpan interactionTimeout, string culture)
        {
            // https://learn.microsoft.com/en-us/dotnet/api/system.net.servicepointmanager.settcpkeepalive?view=net-8.0
            ServicePointManager.SetTcpKeepAlive(true, (int)TimeSpan.FromMinutes(120).TotalMilliseconds, (int)TimeSpan.FromSeconds(10).TotalMilliseconds);
            SslVerification.Disable();

            var clientServicesUrl = serviceUrl;

            if ((!clientServicesUrl.Contains("/cs/")) && (!clientServicesUrl.Contains("/cs?")))
            {
                if (clientServicesUrl.Contains("?"))
                {
                    clientServicesUrl = clientServicesUrl.Insert(clientServicesUrl.LastIndexOf('?'), "cs/");
                }
                else
                {
                    clientServicesUrl = clientServicesUrl.TrimEnd('/');
                    clientServicesUrl = clientServicesUrl + "/cs/";
                }
            }

            var addressUri = new Uri(clientServicesUrl);
            var jsonClient = new JsonHttpClient(addressUri, credential, authenticationScheme);

            var httpClientField = typeof(JsonHttpClient).GetField("httpClient", BindingFlags.NonPublic | BindingFlags.Instance);
            var httpClient = (HttpClient)httpClientField.GetValue(jsonClient);
            httpClient.Timeout = interactionTimeout;


            this.ClientSession = new ClientSession(jsonClient, new NonDispatcher(), new TimerFactory<TaskTimer>());
            this.Culture = culture;
            this.OpenSession();
        }

        protected void OpenSession()
        {
            var csParams = new ClientSessionParameters();
            csParams.CultureId = Culture;
            csParams.UICultureId = Culture;
            csParams.AdditionalSettings.Add("IncludeControlIdentifier", true);

            this.ClientSession.MessageToShow += Cs_MessageToShow;
            this.ClientSession.CommunicationError += Cs_CommunicationError;
            this.ClientSession.UnhandledException += Cs_UnhandledException;
            this.ClientSession.InvalidCredentialsError += Cs_InvalidCredentialsError;
            this.ClientSession.UriToShow += Cs_UriToShow;
            this.ClientSession.DialogToShow += Cs_DialogToShow;

            this.ClientSession.SessionReady += ClientSession_SessionReady;
            this.ClientSession.OpenSessionAsync(csParams);
            this.AwaitState(ClientSessionState.Ready);
        }

        public virtual void CloseSession()
        {
            if (ClientSession != null)
            {
                if (ClientSession.State.HasFlag(ClientSessionState.Ready | ClientSessionState.Busy | ClientSessionState.InError | ClientSessionState.TimedOut))
                {
                    CloseAllForms();
                    OpenedForm = null;
                    OpenedFormName = "";
                    ClientSession.CloseSessionAsync();
                }
            }
        }

        private void ClientSession_SessionReady(object? sender, SessionInfoEventArgs e)
        {
            Console.WriteLine("Client session ready ...");
        }

        public void SetIgnoreServerErrors(bool ignoreServerErrors)
        {
            this.IgnoreErrors = ignoreServerErrors;
        }

        protected void AwaitState(ClientSessionState state)
        {
            while (this.ClientSession.State != state)
            {
                Thread.Sleep(100);
                string exceptionMessage = "";

                switch (this.ClientSession.State)
                {
                    case ClientSessionState.InError:
                    exceptionMessage = "ClientSession in Error state";
                    break;
                    case ClientSessionState.TimedOut:
                    exceptionMessage = "ClientSession time out";
                    break;
                    case ClientSessionState.Uninitialized:
                    exceptionMessage = "ClientSession is Uninitialized";
                    break;
                }

                if (!string.IsNullOrEmpty(exceptionMessage))
                {
                    // ClientSession.LastException is present on the latest versions, not for BC 17 and maybe some highers too.
                    string lastExceptionDetails = "";

                    dynamic session = this.ClientSession;
                    if (HasProperty(session, "LastException"))
                    {
                    if (session.LastException != null)
                    {
                        lastExceptionDetails = session.LastException.ToString();
                    }
                    }

                    throw new Exception($"{exceptionMessage}. Last exception: {lastExceptionDetails}");
                }
            }
        }

        public ClientLogicalForm OpenForm(int page)
        {
            if ((OpenedForm == null) || (String.IsNullOrEmpty(OpenedForm.Name)) || (OpenedForm.Name != OpenedFormName))
            {
                if ((OpenedForm != null) && (OpenedForm.Name != OpenedFormName))
                {
                    CloseForm(OpenedForm);
                }

                var interaction = new OpenFormInteraction();
                interaction.Page = page.ToString();
                OpenedForm = InvokeInteractionAndCatchForm(interaction);
                OpenedFormName = OpenedForm.Name;
            }
            return OpenedForm;
        }

        public void CloseOpenedForm()
        {
            if (OpenedForm != null)
            {
                this.InvokeInteraction(new CloseFormInteraction(OpenedForm));

                OpenedForm = null;
                OpenedFormName = "";
            }
        }

        public void CloseForm(ClientLogicalForm? form)
        {
            if (form == null)
            {
                return;
            }

            this.InvokeInteraction(new CloseFormInteraction(form));

            if ((OpenedForm != null) && (form.Name == OpenedForm.Name))
            {
                OpenedForm = null;
                OpenedFormName = "";
            }
        }

        public ClientLogicalForm[] GetAllForms()
        {
            return this.ClientSession.OpenedForms.ToArray<ClientLogicalForm>();
        }

        public void InvokeInteraction(ClientInteraction interaction)
        {
            this.ClientSession.InvokeInteractionAsync(interaction);
            this.AwaitState(ClientSessionState.Ready);
        }

        public ClientLogicalForm InvokeInteractionAndCatchForm(ClientInteraction interaction)
        {
            PsTestRunnerCaughtForm = null;
            this.ClientSession.FormToShow += ClientSession_FormToShow;

            try
            {
                this.InvokeInteraction(interaction);                

                if (PsTestRunnerCaughtForm == null) {
                    this.CloseAllWarningForms();
                }
            }
            catch (Exception ex)
            {
                var errorMessage = ex.Message;
                var failedItem = ex.Source;
                Console.WriteLine($"Error: {errorMessage} Item: {failedItem}");
            }
            finally
            {
                this.ClientSession.FormToShow -= ClientSession_FormToShow;
            }

            var form = PsTestRunnerCaughtForm;
            PsTestRunnerCaughtForm = null;
            return form;
        }

        public ClientLogicalForm InvokeActionAndCatchForm(ClientActionControl action)
        {
            return this.InvokeInteractionAndCatchForm(new InvokeActionInteraction(action));
        }

        public void CloseAllForms()
        {
            foreach (var form in this.GetAllForms())
            {
                this.CloseForm(form);
            }

            OpenedForm = null;
            OpenedFormName = "";
        }

        public void CloseAllErrorForms()
        {
            foreach (var form in this.GetAllForms())
            {
                if (form.ControlIdentifier == "00000000-0000-0000-0800-0000836bd2d2")
                {
                    this.CloseForm(form);
                }
            }
        }
        
        public void CloseAllWarningForms()
        {
            foreach (var form in this.GetAllForms())
            {
                if (form.ControlIdentifier == "00000000-0000-0000-0300-0000836bd2d2") {
                    this.CloseForm(form);
                }
            }
        }

        public ClientLogicalControl GetControlByName(ClientLogicalControl control, string name)
        {
            return control.ContainedControls.Where(clc => (clc.Name == name)).First();
        }

        public ClientLogicalControl GetControlByCaption(ClientLogicalControl control, string caption)
        {
            return control.ContainedControls.FirstOrDefault(clc => clc.Caption?.Replace("&", "") == caption);
        }

        public ClientLogicalControl GetControlByType(ClientLogicalControl control, Type type)
        {
            return control.ContainedControls.FirstOrDefault(clc => type.IsInstanceOfType(clc));
        }

        public void SaveValue(ClientLogicalControl control, string newValue)
        {
            this.InvokeInteraction(new SaveValueInteraction(control, newValue));
        }

        public ClientActionControl GetActionByName(ClientLogicalControl control, string name)
        {
            return (ClientActionControl)control.ContainedControls.Where(c => (c.GetType() == typeof(ClientActionControl)) && c.Name == name).First();
        }

        public ClientActionControl GetActionByCaption(ClientLogicalControl control, string caption)
        {
            return (ClientActionControl)control.ContainedControls
                .Where(c => c is ClientActionControl && ((ClientActionControl)c).Caption?.Replace("&", "") == caption)
                .FirstOrDefault();
        }

        public void InvokeAction(ClientActionControl action)
        {
            InvokeInteraction(new InvokeActionInteraction(action));
        }

        public void ScrollRepeater(ClientRepeaterControl repeater, int by)
        {
            this.InvokeInteraction(new ScrollRepeaterInteraction(repeater, by));
        }

        public void ActivateControl(ClientLogicalControl control)
        {
            this.InvokeInteraction(new ActivateControlInteraction(control));
        }

        public string GetErrorFromErrorForm()
        {
            string errorText = "";
            foreach (var form in this.ClientSession.OpenedForms)
            {
                if (form.ControlIdentifier == "00000000-0000-0000-0800-0000836bd2d2")
                {
                    var errorControl = form.ContainedControls.FirstOrDefault(c => c is ClientStaticStringControl);
                    if (errorControl != null)
                    {
                        errorText = ((ClientStaticStringControl)errorControl).StringValue;
                    }
                }
            }
            return errorText;
        }

        public string GetWarningFromWarningForm()
        {
            string warningText = "";
            foreach (var form in this.ClientSession.OpenedForms)
            {
                if (form.ControlIdentifier == "00000000-0000-0000-0300-0000836bd2d2")
                {
                    var warningControl = form.ContainedControls.FirstOrDefault(c => c is ClientStaticStringControl);
                    if (warningControl != null)
                    {
                        warningText = ((ClientStaticStringControl)warningControl).StringValue;
                    }
                }
            }
            return warningText;
        }

        public Dictionary<string, object> GetFormInfo(ClientLogicalForm form)
        {
            var result = new Dictionary<string, object>();
            result["title"] = $"{form.Name} {form.Caption}";
            
            var controls = new List<Dictionary<string, object>>();
            foreach (var control in form.Children)
            {
                controls.Add(DumpControl(control, 1));
            }
            
            result["controls"] = controls;
            return result;
        }

        private Dictionary<string, object> DumpRowControl(ClientLogicalControl control)
        {
            var result = new Dictionary<string, object>();
            result[control.Name] = control.ObjectValue;
            return result;
        }

        private Dictionary<string, object> DumpControl(ClientLogicalControl control, int indent)
        {
            var output = new Dictionary<string, object>();
            output["name"] = control.Name;
            output["type"] = control.GetType().Name;
            
            if (control is ClientGroupControl groupControl)
            {
                output["caption"] = groupControl.Caption;
                output["mappingHint"] = groupControl.MappingHint;
            }
            else if (control is ClientStaticStringControl staticStringControl)
            {
                output["value"] = staticStringControl.StringValue;
            }
            else if (control is ClientInt32Control int32Control)
            {
                output["value"] = int32Control.ObjectValue;
            }
            else if (control is ClientStringControl stringControl)
            {
                output["value"] = stringControl.StringValue;
            }
            else if (control is ClientActionControl actionControl)
            {
                output["caption"] = actionControl.Caption;
            }
            else if (control is ClientFilterLogicalControl)
            {
                // No additional properties
            }
            else if (control is ClientRepeaterControl repeaterControl)
            {
                var rows = new List<Dictionary<string, object>>();
                output[control.Name] = rows;
                
                int index = 0;
                while (true)
                {
                    if (index >= (repeaterControl.Offset + repeaterControl.DefaultViewport.Count))
                    {
                        ScrollRepeater(repeaterControl, 1);
                    }
                    
                    int rowIndex = index - (int)repeaterControl.Offset;
                    if (rowIndex >= repeaterControl.DefaultViewport.Count)
                    {
                        break;
                    }
                    
                    var row = repeaterControl.DefaultViewport[rowIndex];
                    var rowOutput = new Dictionary<string, object>();
                    
                    foreach (var child in row.Children)
                    {
                        foreach (var item in DumpRowControl(child))
                        {
                            rowOutput[item.Key] = item.Value;
                        }
                    }
                    
                    rows.Add(rowOutput);
                    index++;
                }
            }
            
            return output;
        }

        private void ClientSession_FormToShow(object? sender, ClientFormToShowEventArgs e)
        {
            PsTestRunnerCaughtForm = e.FormToShow;
        }

        private void Cs_DialogToShow(object? sender, ClientDialogToShowEventArgs e)
        {
            var form = e.DialogToShow;
            if (form.ControlIdentifier == "00000000-0000-0000-0800-0000836bd2d2") {
                var errorControl = form.ContainedControls.Where(c => c.GetType() == typeof(ClientStaticStringControl)).First();
                HandleClientSessionError($"ERROR: {errorControl.StringValue}", null);
            }
            if (form.ControlIdentifier == "00000000-0000-0000-0300-0000836bd2d2") {
                var errorControl = form.ContainedControls.Where(c => c.GetType() == typeof(ClientStaticStringControl)).First();
                Console.WriteLine($"WARNING: {errorControl.StringValue}");
            }
        }

        private void Cs_UriToShow(object? sender, ClientUriToShowEventArgs e)
        {
            Console.WriteLine($"UriToShow : {e.UriToShow}");
        }

        private void Cs_InvalidCredentialsError(object? sender, MessageToShowEventArgs e)
        {
            HandleClientSessionError("InvalidCredentialsError", null);
        }

        private void Cs_UnhandledException(object? sender, ExceptionEventArgs e)
        {
            HandleClientSessionError($"UnhandledException: {e.Exception}", null);
        }

        private void Cs_CommunicationError(object? sender, ExceptionEventArgs e)
        {
            HandleClientSessionError($"CommunicationError: {e.Exception}", null);
        }

        private void Cs_MessageToShow(object? sender, MessageToShowEventArgs e)
        {
            Console.WriteLine($"Message: {e.Message}");
        }

        private void HandleClientSessionError(string errorMsg, bool? throwError)
        {
            Console.WriteLine($"ERROR: {errorMsg}");
            if (throwError == true || (!this.IgnoreErrors && throwError != false))
            {
                throw new Exception(errorMsg);
            }
        }

        public void Dispose()
        {
            try
            {
                CloseSession();
            }
            catch (Exception e)
            {
                Console.WriteLine($"Can't close session: {e.Message}");
            }
        }

        public static bool HasProperty(object obj, string propertyName)
        {
            if (obj == null) return false;

            return obj.GetType().GetProperty(propertyName) != null;
        }

        public static object GetProperty(object obj, string propertyName)
        {
            if (obj == null) return false;

            return obj.GetType().GetProperty(propertyName).GetValue(obj);
        }
    }
}