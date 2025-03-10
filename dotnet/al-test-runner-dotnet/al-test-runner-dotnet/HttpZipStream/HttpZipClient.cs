using NaviPartner.ALTestRunner.HttpZipStream;
using System.IO;
using System.Runtime.CompilerServices;
using System.Text.RegularExpressions;

namespace NaviPartner.ALTestRunner.HttpZipStream
{
    public static class HttpZipClient
    {
        public static void ExtractFile(string remoteArchive, string outputDirectory, string extractionPattern)
        {

        }
        public static async Task<bool> ExtractFileAsync(string remoteArchive, string outputDirectory, string extractionPattern)
        {
            var tasks = new List<Task>();

            if (!Directory.Exists(outputDirectory))
            {
                Directory.CreateDirectory(outputDirectory);
            }

            using (var zipStream = new HttpZipStream(remoteArchive))
            {
                var entryList = await zipStream.GetEntriesAsync();
                var searchRegex = new Regex(extractionPattern);
                var filteredEntries = entryList.FindAll(e => (searchRegex.IsMatch(e.FileName)));

                foreach (var entry in filteredEntries)
                {
                    tasks.Add(zipStream.ExtractAsync(entry, (entryStream) =>
                    {
                        var filePath = Path.Join(outputDirectory, Path.GetFileName(entry.FileName));
                        using (FileStream fileStream = new FileStream(filePath, FileMode.Create, FileAccess.Write))
                        {
                            entryStream.CopyTo(fileStream);
                        }
                    }));
                }
            }

            await Task.WhenAll(tasks);

            return true;
        }
    }
}
