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
                    var filePath = FindFileInTheDirectoryScope($"{assemblyFileName}.dll", directoryPath);
                    return Assembly.LoadFrom(filePath);
                }
                return null;
            };
        }

        private static string FindFileInTheDirectoryScope(string fileName, string? directoryPath = null)
        {
            directoryPath ??= Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location) ?? throw new Exception("The executing assembly location is not available.");

            if (directoryPath == null)
            {
                throw new Exception("The directory path is not specified and the executing assembly location is not available.");
            }

            Console.WriteLine($"Searching for '{fileName}' in directory '{directoryPath}'...");
            var files = Directory.GetFiles(directoryPath, fileName, SearchOption.AllDirectories);
            Console.WriteLine($"Found {files.Length} files.");
            if (files.Length == 0)
            {
                throw new Exception($"There is not any '{fileName}' in {directoryPath} or any of the subfolders.");
            }

            // Let's return just the firs one right now:
            return files.FirstOrDefault() ?? throw new Exception($"File '{fileName}' not found in directory '{directoryPath}' or any of its subfolders.");
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
