using Microsoft.AspNetCore.DataProtection;
using System.Text;

namespace NaviPartner.ALTestRunner
{
    public static class ALCredentailCacheReader
    {
        public static string GetDataFromCredentialCache(string credentialFolderPath, string credentialCacheFileName)
        { 
            var credentailFilePath = Path.Combine(credentialFolderPath, credentialCacheFileName);
            if (!File.Exists(credentailFilePath))
                throw new FileNotFoundException(string.Format("Credential file {0} doesn't exist!", credentailFilePath));
            var bytes = File.ReadAllBytes(credentailFilePath);
            var purpose = new string[] { "Microsoft.Dynamics.Nav.Deployment", credentialCacheFileName };

            var dirInfo = new DirectoryInfo(credentialFolderPath);
            var provider = DataProtectionProvider.Create(dirInfo);
            var protector = provider.CreateProtector(purpose);

            return Encoding.UTF8.GetString(protector.Unprotect(bytes));
        }
    }
}