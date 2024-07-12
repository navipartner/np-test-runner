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
        protected ClientLogicalForm? OpenedForm { get; private set; } = null;
        protected string OpenedFormName { get; private set; } = "";
        private ClientLogicalForm PsTestRunnerCaughtForm;
        
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

        protected void AwaitState(ClientSessionState state)
        {
            while (this.ClientSession.State != state)
            {
                Thread.Sleep(100);

                switch (this.ClientSession.State)
                {
                    case ClientSessionState.InError:
                        throw new Exception("ClientSession in Error state");
                    case ClientSessionState.TimedOut:
                        throw new Exception("ClientSession time out");
                    case ClientSessionState.Uninitialized:
                        throw new Exception("ClientSession is Uninitialized");
                }

                // ClientSession.LastException is present on the latest versions, not for BC 17 and maybe some highers too.
                dynamic session = this.ClientSession;
                if (HasProperty(session, "LastException"))
                {
                    if (session.LastException != null) {
                        //throw new Exception(GetProperty(session, "LastException").ToString());
                        throw new Exception(session.LastException.Message);
                    }
                } else
                {
                    // TODO: ???
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

        public void CloseForm(ClientLogicalForm form)
        {
            this.InvokeInteraction(new CloseFormInteraction(form));

            OpenedForm = null;
            OpenedFormName = "";
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

        protected ClientLogicalControl GetControlByName(ClientLogicalControl control, string name)
        {
            return control.ContainedControls.Where(clc => (clc.Name == name)).First();
        }

        protected ClientActionControl GetActionByName(ClientLogicalControl control, string name)
        {
            return (ClientActionControl)control.ContainedControls.Where(c => (c.GetType() == typeof(ClientActionControl)) && c.Name == name).First();
        }

        protected void InvokeAction(ClientActionControl action)
        {
            InvokeInteraction(new InvokeActionInteraction(action));
        }

        protected void SaveValue(ClientLogicalControl control, string newValue)
        {
            this.InvokeInteraction(new SaveValueInteraction(control, newValue));
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
                HandleClientSessionError($"ERROR: {errorControl.StringValue}", true);
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
            HandleClientSessionError("InvalidCredentialsError", true);
        }

        private void Cs_UnhandledException(object? sender, ExceptionEventArgs e)
        {
            HandleClientSessionError($"UnhandledException: {e.Exception}", true);
        }

        private void Cs_CommunicationError(object? sender, ExceptionEventArgs e)
        {
            HandleClientSessionError($"CommunicationError: {e.Exception}", true);
        }

        private void Cs_MessageToShow(object? sender, MessageToShowEventArgs e)
        {
            Console.WriteLine($"Message: {e.Message}");
        }

        private void HandleClientSessionError(string errorMsg, bool? throwError)
        {
            Console.WriteLine($"ERROR: {errorMsg}");
            if (throwError == true)
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
