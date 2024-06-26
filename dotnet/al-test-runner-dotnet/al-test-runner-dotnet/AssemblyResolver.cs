using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;

namespace NaviPartner.ALTestRunner
{
    public static class AssemblyResolver
    {
        public static void SetupAssemblyResolve(string searchPattern, string directoryPath)
        {
            AppDomain.CurrentDomain.AssemblyResolve += (sender, args) =>
            {
                if (args.Name.Contains(searchPattern))
                {
                    var assemblyFileName = args.Name.Split(',')[0];
                    var filePath = FindFileInTheDirectoryScope(assemblyFileName, directoryPath);
                    return Assembly.LoadFrom(filePath);
                }
                return null;
            };
        }

        private static string FindFileInTheDirectoryScope(string fileName, string directoryPath = null)
        {
            if (directoryPath == null)
            {
                directoryPath = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            }

            var files = Directory.GetFiles(directoryPath, fileName, SearchOption.AllDirectories);
            if (files.Length == 0)
            {
                throw new Exception($"There is not any '{fileName}' in {directoryPath} or any of the subfolders.");
            }

            // Let's return just the firs one right now:
            return files.FirstOrDefault();
        }

        public static void LoadAssembliesFromFolderAndSubfolders(string searchPattern, string directoryPath = null)
        {
            List<string> loadedAssemblies = new List<string>();

            if (directoryPath == null)
            {
                directoryPath = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            }

            var files = Directory.GetFiles(directoryPath, searchPattern, SearchOption.AllDirectories);
            foreach (var file in files)
            {
                var fileName = Path.GetFileName(file);
                if (!loadedAssemblies.Contains(fileName))
                {
                    var fileToLoad = FindFileInTheDirectoryScope(Path.GetFileName(file), directoryPath);
                    Console.WriteLine($"Loading assembly '{fileToLoad}'...");
                    Assembly.LoadFrom(fileToLoad);
                    loadedAssemblies.Add(fileName);
                }
            }
        }
    }
}
