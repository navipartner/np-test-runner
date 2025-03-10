using System.Net.Security;
using System.Security.Cryptography.X509Certificates;

namespace NaviPartner.ALTestRunner
{
    public static class SslVerification
    {
        private static bool ValidationCallback(object sender, X509Certificate certificate, X509Chain chain, SslPolicyErrors sslPolicyErrors) { return true; }
        public static void Disable() { System.Net.ServicePointManager.ServerCertificateValidationCallback = ValidationCallback; }
        public static void Enable() { System.Net.ServicePointManager.ServerCertificateValidationCallback = null; }
    }
}
