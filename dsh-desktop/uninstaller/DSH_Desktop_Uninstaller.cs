using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Threading;
using System.Drawing;
using System.Windows.Forms;
using System.Windows.Forms.VisualStyles;
using Microsoft.Win32;

class DSHDesktopUninstaller
{
    static bool silent = false;
    static List<string> messages = new List<string>();
    static bool keepAgentPresets = false;
    static bool keepRuntime = false;
    static bool keepAppSettings = false;
    static bool keepModelConfig = false;
    static bool keepOtherUserData = false;
    static bool keepChatData = false;
    static bool keepPlugins = false;
    static List<string> keepPresetNames = new List<string>();
    static List<string> keepPluginNames = new List<string>();

    static string DshInstallDir = ResolveDshInstallDir();
    static string DshDesktopUpdaterDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "dsh-desktop-updater");
    static string DshLauncherUpdaterDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "dsh-launcher-updater");
    static string DshRoamingDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "DSH Desktop");
    static string DshRoamingDir2 = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "dsh-desktop");
    static string DesktopShortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "DSH Desktop.lnk");
    static string StartMenuShortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"Microsoft\Windows\Start Menu\Programs\DSH Desktop.lnk");
    static string CommonDesktopShortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory), "DSH Desktop.lnk");
    static string CommonStartMenuShortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu), @"Programs\DSH Desktop.lnk");
    const string LegacyUninstallRegKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\62276e9d-c5f3-5091-b4ee-c7144d6db450";
    static string NotifRegKey1 = @"Software\Microsoft\Windows\CurrentVersion\Notifications\Settings\com.deepseek.dsh.desktop";
    static string NotifRegKey2 = @"Software\Microsoft\Windows\CurrentVersion\PushNotifications\Backup\com.deepseek.dsh.desktop";
    static string MachineEnvKey = @"SYSTEM\CurrentControlSet\Control\Session Manager\Environment";
    static string DshHome = ResolveDshHome();
    static string DshRuntime = Path.Combine(Path.GetDirectoryName(Path.GetFullPath(DshHome)), ".dsh-runtime");
    static bool useDetectedRunningDsh = false;
    static string DetectedRunningDshDir = FindRunningDshInstallDir();
    static string LogFilePath = Path.Combine(Directory.GetCurrentDirectory(), "Log.log");

    class PresetInfo
    {
        public string FolderName;
        public string DisplayName;

        public PresetInfo(string folderName, string displayName)
        {
            FolderName = folderName;
            DisplayName = displayName;
        }
    }

    class PluginInfo
    {
        public string PackageName;
        public string DisplayName;

        public PluginInfo(string packageName, string displayName)
        {
            PackageName = packageName;
            DisplayName = displayName;
        }
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int MessageBoxW(IntPtr hWnd, string lpText, string lpCaption, uint uType);

    static string ResolveDshInstallDir()
    {
        // Prefer a DSH Desktop uninstall entry: this works across versions,
        // install locations, drive letters and both HKLM/HKCU 32/64-bit views.
        string registryDir = FindDshInstallDirFromRegistry();
        if (!string.IsNullOrEmpty(registryDir))
        {
            return registryDir;
        }

        // Fallback: if this uninstaller is copied into the DSH Desktop install
        // folder, use its own directory.
        try
        {
            string currentDir = Path.GetDirectoryName(Assembly.GetEntryAssembly().Location);
            if (!string.IsNullOrEmpty(currentDir) && HasDshExecutable(currentDir))
            {
                return currentDir;
            }
        }
        catch
        {
        }

        // Fallback: scan common per-user / per-machine install roots. This
        // covers future installers that do not write an uninstall key yet.
        string fallback = FindDshInstallDirInKnownLocations();
        if (!string.IsNullOrEmpty(fallback))
        {
            return fallback;
        }

        // No hardcoded fallback: if the install folder cannot be detected,
        // skip deleting it instead of risking the wrong path on another PC.
        return string.Empty;
    }

    static string FindDshInstallDirFromRegistry()
    {
        List<string> existingCandidates = new List<string>();
        List<string> knownExeCandidates = new List<string>();

        RegistryHive[] hives = new RegistryHive[] { RegistryHive.LocalMachine, RegistryHive.CurrentUser };
        RegistryView[] views = new RegistryView[] { RegistryView.Registry64, RegistryView.Registry32 };

        foreach (RegistryHive hive in hives)
        {
            foreach (RegistryView view in views)
            {
                try
                {
                    using (RegistryKey baseKey = RegistryKey.OpenBaseKey(hive, view))
                    using (RegistryKey uninstallRoot = baseKey.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall"))
                    {
                        if (uninstallRoot == null) continue;
                        foreach (string name in uninstallRoot.GetSubKeyNames())
                        {
                            using (RegistryKey sub = uninstallRoot.OpenSubKey(name))
                            {
                                if (sub == null) continue;
                                string displayName = sub.GetValue("DisplayName") as string;
                                string displayIcon = sub.GetValue("DisplayIcon") as string;
                                string uninstallString = sub.GetValue("UninstallString") as string;
                                string installLocation = sub.GetValue("InstallLocation") as string;
                                string publisher = sub.GetValue("Publisher") as string;
                                if (!IsDshUninstallEntry(displayName, displayIcon, uninstallString, installLocation, publisher))
                                {
                                    continue;
                                }

                                string dir = ResolveInstallDirFromRegistryEntry(displayIcon, uninstallString, installLocation);
                                if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir)) continue;
                                if (HasDshExecutable(dir))
                                {
                                    knownExeCandidates.Add(dir);
                                }
                                else
                                {
                                    existingCandidates.Add(dir);
                                }
                            }
                        }
                    }
                }
                catch
                {
                }
            }
        }

        if (knownExeCandidates.Count > 0)
        {
            return knownExeCandidates[0];
        }
        if (existingCandidates.Count > 0)
        {
            return existingCandidates[0];
        }
        return string.Empty;
    }

    static string ResolveInstallDirFromRegistryEntry(string displayIcon, string uninstallString, string installLocation)
    {
        string iconDir = ParseDirFromDisplayIcon(displayIcon);
        if (!string.IsNullOrEmpty(iconDir) && Directory.Exists(iconDir)) return iconDir;

        if (!string.IsNullOrWhiteSpace(installLocation))
        {
            string dir = installLocation.Trim().TrimEnd('\\');
            if (Directory.Exists(dir)) return dir;
        }

        string exePath = ParseExePathFromCommandLine(uninstallString);
        if (!string.IsNullOrEmpty(exePath))
        {
            string dir = Path.GetDirectoryName(exePath);
            if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir)) return dir;
        }

        return string.Empty;
    }

    static string ParseDirFromDisplayIcon(string displayIcon)
    {
        if (string.IsNullOrWhiteSpace(displayIcon)) return string.Empty;
        string iconPath = displayIcon.Split(',')[0].Trim().Trim('"');
        if (string.IsNullOrEmpty(iconPath)) return string.Empty;
        string dir = Path.GetDirectoryName(iconPath);
        if (string.IsNullOrEmpty(dir)) return string.Empty;
        return dir;
    }

    static string FindDshInstallDirInKnownLocations()
    {
        List<string> roots = new List<string>();
        try { roots.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs")); } catch { }
        try { roots.Add(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)); } catch { }
        try { roots.Add(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86)); } catch { }

        foreach (string root in roots)
        {
            if (string.IsNullOrEmpty(root) || !Directory.Exists(root)) continue;
            try
            {
                foreach (string dir in Directory.GetDirectories(root))
                {
                    string name = Path.GetFileName(dir);
                    if (IsDshRelatedName(name) && HasDshExecutable(dir))
                    {
                        return dir;
                    }
                }
            }
            catch
            {
            }
        }

        // Direct common locations that may not sit under "Programs".
        string[] directCandidates = new string[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DSH Desktop"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "dsh-desktop"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "DSH Desktop"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "dsh-desktop")
        };
        foreach (string dir in directCandidates)
        {
            if (Directory.Exists(dir) && HasDshExecutable(dir))
            {
                return dir;
            }
        }

        return string.Empty;
    }

    static string FindRunningDshInstallDir()
    {
        foreach (Process p in Process.GetProcesses())
        {
            try
            {
                string path = p.MainModule.FileName;
                if (string.IsNullOrEmpty(path)) continue;

                string fileName = Path.GetFileName(path);
                if (!fileName.Equals("DSH Desktop.exe", StringComparison.OrdinalIgnoreCase) &&
                    !fileName.Equals("dsh-desktop.exe", StringComparison.OrdinalIgnoreCase) &&
                    !fileName.Equals("DeepSeek Harness Desktop.exe", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                try
                {
                    if (path.Equals(Assembly.GetEntryAssembly().Location, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }
                }
                catch
                {
                }

                string dir = Path.GetDirectoryName(path);
                if (!string.IsNullOrEmpty(dir) && HasDshExecutable(dir))
                {
                    return dir;
                }
            }
            catch
            {
            }
        }
        return string.Empty;
    }

    static bool HasDshExecutable(string dir)
    {
        if (string.IsNullOrEmpty(dir)) return false;
        string[] names = new string[] { "DSH Desktop.exe", "dsh-desktop.exe", "DeepSeek Harness Desktop.exe" };
        foreach (string name in names)
        {
            if (File.Exists(Path.Combine(dir, name))) return true;
        }
        return false;
    }

    static bool IsDshUninstallEntry(string displayName, string displayIcon, string uninstallString, string installLocation, string publisher)
    {
        if (IsDshRelatedName(displayName)) return true;
        if (IsDshRelatedName(publisher)) return true;
        if (IsDshRelatedPath(displayIcon)) return true;
        if (IsDshRelatedPath(uninstallString)) return true;
        if (IsDshRelatedPath(installLocation)) return true;
        return false;
    }

    static bool IsDshRelatedName(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return false;
        string value = text.Trim();
        return value.IndexOf("DSH Desktop", StringComparison.OrdinalIgnoreCase) >= 0
            || value.IndexOf("DSH桌面", StringComparison.OrdinalIgnoreCase) >= 0
            || value.IndexOf("DeepSeek Harness Desktop", StringComparison.OrdinalIgnoreCase) >= 0
            || value.IndexOf("DeepSeek Harness (dsh)", StringComparison.OrdinalIgnoreCase) >= 0
            || value.IndexOf("dsh-desktop", StringComparison.OrdinalIgnoreCase) >= 0;
    }

    static bool IsDshRelatedPath(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) return false;
        return path.IndexOf("DSH Desktop", StringComparison.OrdinalIgnoreCase) >= 0
            || path.IndexOf("dsh-desktop", StringComparison.OrdinalIgnoreCase) >= 0
            || path.IndexOf("DeepSeek Harness Desktop", StringComparison.OrdinalIgnoreCase) >= 0;
    }

    static string ParseExePathFromCommandLine(string commandLine)
    {
        if (string.IsNullOrWhiteSpace(commandLine)) return null;

        string cmd = commandLine.Trim();
        if (cmd.StartsWith("\""))
        {
            int end = cmd.IndexOf('"', 1);
            if (end > 0) return cmd.Substring(1, end - 1);
        }

        int space = cmd.IndexOf(' ');
        return space > 0 ? cmd.Substring(0, space) : cmd;
    }

    static string ResolveDshHome()
    {
        // DSH_HOME may point to a custom user-data location.
        string env = Environment.GetEnvironmentVariable("DSH_HOME");
        if (!string.IsNullOrWhiteSpace(env))
        {
            return env.Trim().TrimEnd('\\');
        }

        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".dsh");
    }

    static bool ConfirmAndSelectRetention()
    {
        if (silent) return true;

        Application.EnableVisualStyles();
        using (RetentionForm form = new RetentionForm())
        {
            form.SetRetentionOptions(keepAgentPresets, keepRuntime, keepChatData, keepAppSettings, keepModelConfig, keepOtherUserData, keepPlugins, keepPresetNames, keepPluginNames);

            if (form.ShowDialog() != DialogResult.OK)
            {
                return false;
            }

            keepAgentPresets = form.KeepAgentPresets;
            keepRuntime = form.KeepRuntime;
            keepChatData = form.KeepChatData;
            keepAppSettings = form.KeepAppSettings;
            keepModelConfig = form.KeepModelConfig;
            keepOtherUserData = form.KeepOtherUserData;
            keepPlugins = form.KeepPlugins;
            keepPresetNames = form.KeepPresetNames;
            keepPluginNames = form.KeepPluginNames;
            useDetectedRunningDsh = form.UseDetectedRunningDsh;
            return true;
        }
    }
    [STAThread]
    static int Main(string[] args)
    {
        ParseArgs(args);
        InitializeLog();

        if (!IsAdministrator())
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = Assembly.GetEntryAssembly().Location;
                psi.Verb = "runas";
                psi.UseShellExecute = true;
                psi.Arguments = string.Join(" ", args);
                Process.Start(psi);
                return 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Administrator rights are required. Right-click and select Run as administrator.");
                Console.WriteLine(ex.Message);
                Pause();
                return 1;
            }
        }

        try
        {
            if (!ConfirmAndSelectRetention())
            {
                Log("Uninstall cancelled by user.");
                Pause();
                return 0;
            }

            Run();
            Log("===== Uninstaller exit =====");
        }
        catch (Exception ex)
        {
            Log("ERROR: " + ex);
            Console.WriteLine("Error: " + ex.Message);
            Pause();
            return 1;
        }

        Pause();
        return 0;
    }

    static void ParseArgs(string[] args)
    {
        foreach (string raw in args)
        {
            string arg = raw;
            string value = null;
            int eq = arg.IndexOf('=');
            if (eq >= 0)
            {
                value = arg.Substring(eq + 1);
                arg = arg.Substring(0, eq);
            }

            if (arg.Equals("/S", StringComparison.OrdinalIgnoreCase) ||
                arg.Equals("-S", StringComparison.OrdinalIgnoreCase) ||
                arg.Equals("/silent", StringComparison.OrdinalIgnoreCase) ||
                arg.Equals("-silent", StringComparison.OrdinalIgnoreCase))
            {
                silent = true;
            }
            else if (arg.Equals("/KeepPresets", StringComparison.OrdinalIgnoreCase) ||
                     arg.Equals("-KeepPresets", StringComparison.OrdinalIgnoreCase))
            {
                keepAgentPresets = true;
                if (!string.IsNullOrWhiteSpace(value))
                {
                    keepPresetNames = ParsePresetNames(value);
                }
            }
            else if (arg.Equals("/KeepRuntime", StringComparison.OrdinalIgnoreCase) ||
                     arg.Equals("-KeepRuntime", StringComparison.OrdinalIgnoreCase))
            {
                keepRuntime = true;
            }
            else if (arg.Equals("/KeepPlugins", StringComparison.OrdinalIgnoreCase) ||
                     arg.Equals("-KeepPlugins", StringComparison.OrdinalIgnoreCase))
            {
                keepPlugins = true;
                keepRuntime = true;
                if (!string.IsNullOrWhiteSpace(value))
                {
                    keepPluginNames = ParsePresetNames(value);
                }
            }
            else if (arg.Equals("/KeepVision", StringComparison.OrdinalIgnoreCase) ||
                     arg.Equals("-KeepVision", StringComparison.OrdinalIgnoreCase))
            {
                keepPlugins = true;
                keepRuntime = true;
                if (!keepPluginNames.Contains("@dsh-external/dsh-vision", StringComparer.OrdinalIgnoreCase))
                {
                    keepPluginNames.Add("@dsh-external/dsh-vision");
                }
            }
            else if (arg.Equals("/KeepAppSettings", StringComparison.OrdinalIgnoreCase) ||
                     arg.Equals("-KeepAppSettings", StringComparison.OrdinalIgnoreCase))
            {
                keepAppSettings = true;
            }
            else if (arg.Equals("/KeepModelConfig", StringComparison.OrdinalIgnoreCase) ||
                     arg.Equals("-KeepModelConfig", StringComparison.OrdinalIgnoreCase))
            {
                keepModelConfig = true;
            }
            else if (arg.Equals("/KeepOtherUserData", StringComparison.OrdinalIgnoreCase) ||
                     arg.Equals("-KeepOtherUserData", StringComparison.OrdinalIgnoreCase) ||
                     arg.Equals("/KeepOtherData", StringComparison.OrdinalIgnoreCase) ||
                     arg.Equals("-KeepOtherData", StringComparison.OrdinalIgnoreCase))
            {
                keepOtherUserData = true;
            }
            else if (arg.Equals("/KeepChatData", StringComparison.OrdinalIgnoreCase) ||
                     arg.Equals("-KeepChatData", StringComparison.OrdinalIgnoreCase) ||
                     arg.Equals("/KeepChat", StringComparison.OrdinalIgnoreCase) ||
                     arg.Equals("-KeepChat", StringComparison.OrdinalIgnoreCase))
            {
                keepChatData = true;
            }
            else if (arg.Equals("/KeepAll", StringComparison.OrdinalIgnoreCase) ||
                     arg.Equals("-KeepAll", StringComparison.OrdinalIgnoreCase))
            {
                keepAgentPresets = true;
                keepRuntime = true;
                keepPlugins = true;
                keepChatData = true;
                keepAppSettings = true;
                keepModelConfig = true;
                keepOtherUserData = true;
            }
            else if (arg.Equals("/DetectRunning", StringComparison.OrdinalIgnoreCase) ||
                     arg.Equals("-DetectRunning", StringComparison.OrdinalIgnoreCase) ||
                     arg.Equals("/DetectDSH", StringComparison.OrdinalIgnoreCase) ||
                     arg.Equals("-DetectDSH", StringComparison.OrdinalIgnoreCase))
            {
                useDetectedRunningDsh = true;
            }
            else if (arg.Equals("/Default", StringComparison.OrdinalIgnoreCase) ||
                     arg.Equals("-Default", StringComparison.OrdinalIgnoreCase))
            {
                useDetectedRunningDsh = false;
            }
        }
    }

    static List<string> ParsePresetNames(string value)
    {
        List<string> result = new List<string>();
        if (string.IsNullOrWhiteSpace(value)) return result;
        string[] parts = value.Split(new char[] { ',', ';', '，' }, StringSplitOptions.RemoveEmptyEntries);
        foreach (string part in parts)
        {
            string name = part.Trim();
            if (name.Length > 0 && name != "*" && !name.Equals("all", StringComparison.OrdinalIgnoreCase))
            {
                result.Add(name);
            }
        }
        return result;
    }

    static List<PresetInfo> DetectAgentPresets()
    {
        List<PresetInfo> result = new List<PresetInfo>();
        string presetRoot = Path.Combine(DshHome, ".agent-presets");
        if (!Directory.Exists(presetRoot))
        {
            return result;
        }

        foreach (string dir in Directory.GetDirectories(presetRoot))
        {
            string folderName = Path.GetFileName(dir);
            string displayName = GetPresetDisplayName(dir);
            result.Add(new PresetInfo(folderName, displayName));
        }
        return result;
    }

    static string GetPresetDisplayName(string presetDir)
    {
        string presetFile = Path.Combine(presetDir, "preset.yml");
        if (!File.Exists(presetFile))
        {
            return Path.GetFileName(presetDir);
        }

        try
        {
            foreach (string rawLine in File.ReadAllLines(presetFile))
            {
                string line = rawLine.Trim();
                if (line.Length > 5 && line.StartsWith("name:", StringComparison.OrdinalIgnoreCase))
                {
                    string name = line.Substring(5).Trim();
                    if (name.Length >= 2 &&
                        ((name[0] == '"' && name[name.Length - 1] == '"') ||
                         (name[0] == '\'' && name[name.Length - 1] == '\'')))
                    {
                        name = name.Substring(1, name.Length - 2);
                    }
                    if (!string.IsNullOrWhiteSpace(name))
                    {
                        return name.Trim();
                    }
                }
            }
        }
        catch
        {
        }

        return Path.GetFileName(presetDir);
    }

    static List<PluginInfo> DetectPlugins()
    {
        List<PluginInfo> result = new List<PluginInfo>();
        string webModules = Path.Combine(DshHome, @"profiles\web\node_modules");
        if (!Directory.Exists(webModules))
        {
            return result;
        }

        foreach (string dir in Directory.GetDirectories(webModules))
        {
            string name = Path.GetFileName(dir);
            if (name.StartsWith("@")) continue;
            AddPluginIfDsh(dir, result);
        }

        foreach (string scopeDir in Directory.GetDirectories(webModules))
        {
            string scope = Path.GetFileName(scopeDir);
            if (!scope.StartsWith("@")) continue;
            foreach (string pkgDir in Directory.GetDirectories(scopeDir))
            {
                AddPluginIfDsh(pkgDir, result);
            }
        }

        result.Sort((a, b) => string.Compare(a.PackageName, b.PackageName, StringComparison.OrdinalIgnoreCase));
        return result;
    }

    static void AddPluginIfDsh(string pkgDir, List<PluginInfo> result)
    {
        string pkgFile = Path.Combine(pkgDir, "package.json");
        if (!File.Exists(pkgFile)) return;

        try
        {
            string json = File.ReadAllText(pkgFile);
            if (json.IndexOf("\"dsh\"", StringComparison.OrdinalIgnoreCase) < 0) return;
            string packageName = ExtractJsonString(json, "name");
            string description = ExtractJsonString(json, "description");
            if (string.IsNullOrEmpty(packageName)) return;

            string display = string.IsNullOrEmpty(description)
                ? packageName
                : packageName + " — " + description;
            result.Add(new PluginInfo(packageName, display));
        }
        catch
        {
        }
    }

    static string ExtractJsonString(string json, string key)
    {
        int keyIdx = json.IndexOf("\"" + key + "\"", StringComparison.OrdinalIgnoreCase);
        if (keyIdx < 0) return null;
        int colon = json.IndexOf(':', keyIdx);
        if (colon < 0) return null;
        int start = colon + 1;
        while (start < json.Length && char.IsWhiteSpace(json[start])) start++;
        if (start >= json.Length || json[start] != '"') return null;
        start++;

        System.Text.StringBuilder sb = new System.Text.StringBuilder();
        for (int i = start; i < json.Length; i++)
        {
            char c = json[i];
            if (c == '"') break;
            if (c == '\\' && i + 1 < json.Length)
            {
                i++;
                char esc = json[i];
                if (esc == 'n') sb.Append('\n');
                else if (esc == 't') sb.Append('\t');
                else if (esc == 'r') sb.Append('\r');
                else sb.Append(esc);
            }
            else
            {
                sb.Append(c);
            }
        }
        return sb.ToString();
    }

    static string FindPluginSourceDir(string webModules, string packageName)
    {
        string relative = packageName.Replace('/', Path.DirectorySeparatorChar);
        string candidate = Path.Combine(webModules, relative);
        return Directory.Exists(candidate) ? candidate : string.Empty;
    }

    static bool IsAdministrator()
    {
        WindowsIdentity identity = WindowsIdentity.GetCurrent();
        WindowsPrincipal principal = new WindowsPrincipal(identity);
        return principal.IsInRole(WindowsBuiltInRole.Administrator);
    }

    static void Run()
    {
        if (useDetectedRunningDsh)
        {
            string runningDir = FindRunningDshInstallDir();
            if (!string.IsNullOrEmpty(runningDir))
            {
                DshInstallDir = runningDir;
                Log("Uninstall mode: detect running DSH -> " + runningDir);
            }
            else
            {
                Log("Uninstall mode: detect running DSH requested, but no running DSH found; falling back to default detection.");
            }
        }
        else
        {
            Log("Uninstall mode: default detection.");
        }

        Log("===== DSH Desktop Complete Uninstaller =====");
        Log("Retention: " + RetentionSummary());
        Log("Install dir: " + (string.IsNullOrEmpty(DshInstallDir) ? "(not detected)" : DshInstallDir));
        Log("");

        KillDSHProcesses();
        DeleteDirectoryWithRetry(DshInstallDir);
        DeleteDirectoryWithRetry(DshDesktopUpdaterDir);
        DeleteDirectoryWithRetry(DshLauncherUpdaterDir);
        DeleteDirectoryWithRetry(DshRoamingDir);
        DeleteDirectoryWithRetry(DshRoamingDir2);
        DeleteFileIfExists(DesktopShortcut);
        DeleteFileIfExists(StartMenuShortcut);
        DeleteFileIfExists(CommonDesktopShortcut);
        DeleteFileIfExists(CommonStartMenuShortcut);
        DeleteRegistryKeys();
        CleanupMachinePath();
        PreserveSelectedPlugins();
        CleanDshHome();
        if (!keepRuntime)
        {
            DeleteDirectoryWithRetry(DshRuntime);
        }
        CleanupTemp();

        Log("");
        Log("===== Uninstall finished =====");
        Log("Removed DSH Desktop app, updaters, caches, shortcuts, uninstall registry key and DSH user data.");
        Log("Kept: " + RetentionSummary());
    }

    static string RetentionSummary()
    {
        List<string> kept = new List<string>();
        if (keepAgentPresets)
        {
            if (keepPresetNames.Count > 0)
            {
                kept.Add(".agent-presets (" + string.Join(", ", keepPresetNames.ToArray()) + ")");
            }
            else
            {
                kept.Add(".agent-presets (all)");
            }
        }
        if (keepChatData)
        {
            kept.Add("聊天数据 (sessions)");
        }
        if (keepAppSettings)
        {
            kept.Add("应用设置 (settings.yaml)");
        }
        if (keepModelConfig)
        {
            kept.Add("模型配置 (credentials + settings.yaml 模型部分)");
        }
        if (keepOtherUserData)
        {
            kept.Add("其他 .dsh 数据 (graph-memory/storages/profiles 等)");
        }
        if (keepRuntime)
        {
            kept.Add(".dsh-runtime");
        }
        if (keepPlugins)
        {
            if (keepPluginNames.Count > 0)
            {
                kept.Add("插件 (" + string.Join(", ", keepPluginNames.ToArray()) + ")");
            }
            else
            {
                kept.Add("插件 (all)");
            }
        }
        return kept.Count == 0 ? "(none)" : string.Join(", ", kept.ToArray());
    }

    static void KillDSHProcesses()
    {
        Log("[1/9] Stopping DSH Desktop processes...");
        foreach (Process p in Process.GetProcesses())
        {
            try
            {
                if (IsDshProcess(p))
                {
                    p.Kill();
                    Log("  Stopped: " + p.ProcessName + " (PID " + p.Id + ")");
                }
            }
            catch
            {
            }
        }
        Thread.Sleep(1500);
    }

    static bool IsDshProcess(Process p)
    {
        try
        {
            string path = p.MainModule.FileName;
            if (!string.IsNullOrEmpty(path))
            {
                try
                {
                    if (path.Equals(Assembly.GetEntryAssembly().Location, StringComparison.OrdinalIgnoreCase))
                    {
                        return false;
                    }
                }
                catch
                {
                }

                if (!string.IsNullOrEmpty(DshInstallDir) &&
                    path.StartsWith(DshInstallDir + "\\", StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }

                string fileName = Path.GetFileName(path);
                if (fileName.Equals("DSH Desktop.exe", StringComparison.OrdinalIgnoreCase) ||
                    fileName.Equals("dsh-desktop.exe", StringComparison.OrdinalIgnoreCase) ||
                    fileName.Equals("DeepSeek Harness Desktop.exe", StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            if (p.ProcessName.Equals("DSH Desktop", StringComparison.OrdinalIgnoreCase) ||
                p.ProcessName.Equals("dsh-desktop", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        catch
        {
        }
        return false;
    }

    static void DeleteDirectoryWithRetry(string dir)
    {
        if (string.IsNullOrEmpty(dir)) return;
        if (!Directory.Exists(dir)) return;

        for (int i = 0; i < 8; i++)
        {
            try
            {
                DeleteDirectorySafe(dir);
                Log("  Deleted directory: " + dir);
                return;
            }
            catch (Exception ex)
            {
                if (i == 7)
                {
                    Log("  Failed to delete (may be in use): " + dir + " -> " + ex.Message);
                }
                else
                {
                    Thread.Sleep(800);
                }
            }
        }
    }

    static void DeleteDirectorySafe(string path)
    {
        if (!Directory.Exists(path)) return;

        FileAttributes attr = File.GetAttributes(path);
        if ((attr & FileAttributes.ReparsePoint) != 0)
        {
            Directory.Delete(path, false);
            return;
        }

        string[] subdirs = Directory.GetDirectories(path);
        foreach (string sub in subdirs)
        {
            DeleteDirectorySafe(sub);
        }

        string[] files = Directory.GetFiles(path);
        foreach (string file in files)
        {
            File.Delete(file);
        }

        Directory.Delete(path, false);
    }

    static void DeleteFileIfExists(string file)
    {
        if (string.IsNullOrEmpty(file)) return;
        if (!File.Exists(file)) return;

        try
        {
            File.Delete(file);
            Log("  Deleted file: " + file);
        }
        catch (Exception ex)
        {
            Log("  Failed to delete file: " + file + " -> " + ex.Message);
        }
    }

    static void DeleteRegistryKeys()
    {
        Log("[2/9] Cleaning registry...");

        DeleteMatchingUninstallKeys(RegistryHive.LocalMachine, RegistryView.Registry64, "HKLM 64-bit");
        DeleteMatchingUninstallKeys(RegistryHive.LocalMachine, RegistryView.Registry32, "HKLM 32-bit");
        DeleteMatchingUninstallKeys(RegistryHive.CurrentUser, RegistryView.Registry64, "HKCU 64-bit");
        DeleteMatchingUninstallKeys(RegistryHive.CurrentUser, RegistryView.Registry32, "HKCU 32-bit");

        // Legacy hardcoded key: harmless fallback if a future entry stops
        // exposing usual values (DisplayName/DisplayIcon/UninstallString).
        try
        {
            using (RegistryKey key = Registry.LocalMachine.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true))
            {
                if (key != null && key.OpenSubKey("62276e9d-c5f3-5091-b4ee-c7144d6db450") != null)
                {
                    key.DeleteSubKeyTree("62276e9d-c5f3-5091-b4ee-c7144d6db450", false);
                    Log("  Deleted legacy HKLM uninstall key: " + LegacyUninstallRegKey);
                }
            }
        }
        catch (Exception ex)
        {
            Log("  Failed to delete legacy HKLM uninstall key: " + ex.Message);
        }

        DeleteRegSubKey(Registry.CurrentUser, NotifRegKey1, "HKCU notification settings");
        DeleteRegSubKey(Registry.CurrentUser, NotifRegKey2, "HKCU push backup");

        try
        {
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey("Environment", true))
            {
                if (key != null && key.GetValue("VIPSHOME") != null)
                {
                    key.DeleteValue("VIPSHOME");
                    Log("  Deleted user environment variable VIPSHOME");
                }
            }
        }
        catch (Exception ex)
        {
            Log("  Failed to delete VIPSHOME: " + ex.Message);
        }
    }

    static void DeleteMatchingUninstallKeys(RegistryHive hive, RegistryView view, string label)
    {
        try
        {
            using (RegistryKey baseKey = RegistryKey.OpenBaseKey(hive, view))
            using (RegistryKey uninstallRoot = baseKey.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true))
            {
                if (uninstallRoot == null) return;
                string[] names = uninstallRoot.GetSubKeyNames();
                foreach (string name in names)
                {
                    bool matched = false;
                    using (RegistryKey sub = uninstallRoot.OpenSubKey(name))
                    {
                        if (sub == null) continue;
                        string displayName = sub.GetValue("DisplayName") as string;
                        string displayIcon = sub.GetValue("DisplayIcon") as string;
                        string uninstallString = sub.GetValue("UninstallString") as string;
                        string installLocation = sub.GetValue("InstallLocation") as string;
                        string publisher = sub.GetValue("Publisher") as string;
                        matched = IsDshUninstallEntry(displayName, displayIcon, uninstallString, installLocation, publisher);
                    }

                    if (matched)
                    {
                        try
                        {
                            uninstallRoot.DeleteSubKeyTree(name, false);
                            Log("  Deleted " + label + " uninstall key: " + Path.Combine(uninstallRoot.Name, name));
                        }
                        catch (Exception ex)
                        {
                            Log("  Failed to delete " + label + " uninstall key " + name + ": " + ex.Message);
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Log("  Failed to scan " + label + " uninstall keys: " + ex.Message);
        }
    }

    static void DeleteRegSubKey(RegistryKey root, string subKey, string label)
    {
        try
        {
            using (RegistryKey key = root.OpenSubKey(subKey))
            {
                if (key != null)
                {
                    key.Close();
                    root.DeleteSubKeyTree(subKey, false);
                    Log("  Deleted " + label + ": " + subKey);
                }
            }
        }
        catch (Exception ex)
        {
            Log("  Failed to delete " + label + ": " + ex.Message);
        }
    }

    static void CleanupMachinePath()
    {
        Log("[3/9] Cleaning machine PATH...");
        try
        {
            using (RegistryKey key = Registry.LocalMachine.OpenSubKey(MachineEnvKey, true))
            {
                if (key == null) return;
                string path = key.GetValue("Path", "").ToString();
                string[] parts = path.Split(new char[] { ';' }, StringSplitOptions.RemoveEmptyEntries);
                List<string> kept = new List<string>();
                bool changed = false;
                foreach (string part in parts)
                {
                    string trimmed = part.Trim().TrimEnd('\\');
                    if (trimmed.Equals(Path.Combine(DshRuntime, "node"), StringComparison.OrdinalIgnoreCase))
                    {
                        changed = true;
                        Log("  Removed from PATH: " + part);
                    }
                    else
                    {
                        kept.Add(part);
                    }
                }
                if (changed)
                {
                    key.SetValue("Path", string.Join(";", kept.ToArray()), RegistryValueKind.ExpandString);
                }
            }
        }
        catch (Exception ex)
        {
            Log("  Failed to clean PATH: " + ex.Message);
        }
    }

    static void PreserveSelectedPlugins()
    {
        if (!keepPlugins || !keepRuntime) return;
        Log("[4/9] Preserving selected DSH plugins...");

        string webModules = Path.Combine(DshHome, @"profiles\web\node_modules");
        string destRoot = Path.Combine(DshRuntime, @"dsh\node_modules");
        if (!Directory.Exists(webModules) || !Directory.Exists(destRoot))
        {
            return;
        }

        List<PluginInfo> plugins = DetectPlugins();
        int preserved = 0;
        foreach (PluginInfo plugin in plugins)
        {
            if (keepPluginNames.Count > 0 &&
                !keepPluginNames.Contains(plugin.PackageName, StringComparer.OrdinalIgnoreCase))
            {
                continue;
            }

            string src = FindPluginSourceDir(webModules, plugin.PackageName);
            if (string.IsNullOrEmpty(src)) continue;

            string dest = Path.Combine(destRoot, plugin.PackageName.Replace('/', Path.DirectorySeparatorChar));
            if (Directory.Exists(dest))
            {
                Log("  Plugin already exists in runtime: " + plugin.PackageName);
                continue;
            }

            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(dest));
                CopyDirectory(src, dest);
                Log("  Preserved plugin: " + plugin.PackageName);
                preserved++;
            }
            catch (Exception ex)
            {
                Log("  Failed to preserve plugin " + plugin.PackageName + ": " + ex.Message);
            }
        }

        if (preserved == 0)
        {
            Log("  No plugin needed copying.");
        }
    }
static bool IsSettingsFile(string path)
    {
        string name = Path.GetFileName(path);
        return !string.IsNullOrEmpty(name) && name.StartsWith("settings.yaml", StringComparison.OrdinalIgnoreCase);
    }

    static bool IsCredentialsFile(string path)
    {
        string name = Path.GetFileName(path);
        return !string.IsNullOrEmpty(name) && name.StartsWith(".credentials.yaml", StringComparison.OrdinalIgnoreCase);
    }

    static void CleanDshHome()
    {
        Log("[5/9] Cleaning DSH user data...");

        if (!Directory.Exists(DshHome))
        {
            Log("  DSH user data directory does not exist: " + DshHome);
            return;
        }

        string presetRoot = Path.Combine(DshHome, ".agent-presets");
        string sessionsDir = Path.Combine(DshHome, "sessions");
        bool keepPresets = keepAgentPresets && Directory.Exists(presetRoot);
        bool keepChat = keepChatData && Directory.Exists(sessionsDir);
        bool keepOther = keepOtherUserData;

        if (keepPresets)
        {
            if (keepPresetNames.Count == 0)
            {
                Log("  Keeping all agent presets: " + presetRoot);
            }
            else
            {
                Log("  Keeping selected agent presets: " + string.Join(", ", keepPresetNames.ToArray()));
                KeepSelectedPresets(presetRoot, keepPresetNames);
            }
        }
        if (keepChat)
        {
            Log("  Keeping chat data (sessions): " + sessionsDir);
        }
        if (keepAppSettings)
        {
            Log("  Keeping application settings: settings.yaml*");
        }
        if (keepModelConfig)
        {
            Log("  Keeping model configuration/credentials: .credentials.yaml* + settings.yaml* (shared file)");
        }
        if (keepOther)
        {
            Log("  Keeping other .dsh user data (graph-memory/storages/profiles 等): " + DshHome);
        }

        string[] dirs = Directory.GetDirectories(DshHome);
        foreach (string dir in dirs)
        {
            if (keepPresets && dir.Equals(presetRoot, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }
            if (keepChat && dir.Equals(sessionsDir, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }
            if (keepOther)
            {
                continue;
            }
            DeleteDirectoryWithRetry(dir);
        }

        string[] files = Directory.GetFiles(DshHome);
        foreach (string file in files)
        {
            if (keepAppSettings && IsSettingsFile(file))
            {
                continue;
            }
            if (keepModelConfig && (IsCredentialsFile(file) || IsSettingsFile(file)))
            {
                continue;
            }
            if (keepOther && !IsSettingsFile(file) && !IsCredentialsFile(file))
            {
                continue;
            }
            DeleteFileIfExists(file);
        }

        if (!keepPresets && !keepChat && !keepOther && !keepAppSettings && !keepModelConfig)
        {
            // Nothing is being retained under .dsh: remove the data root too.
            DeleteDirectoryWithRetry(DshHome);
        }
    }

    static void KeepSelectedPresets(string presetRoot, List<string> names)
    {
        HashSet<string> keep = new HashSet<string>(names, StringComparer.OrdinalIgnoreCase);
        foreach (PresetInfo info in DetectAgentPresets())
        {
            if (names.Contains(info.DisplayName, StringComparer.OrdinalIgnoreCase))
            {
                keep.Add(info.FolderName);
            }
        }
        foreach (string dir in Directory.GetDirectories(presetRoot))
        {
            string name = Path.GetFileName(dir);
            if (!keep.Contains(name))
            {
                Log("  Removing agent preset: " + name);
                DeleteDirectoryWithRetry(dir);
            }
        }

        foreach (string file in Directory.GetFiles(presetRoot))
        {
            DeleteFileIfExists(file);
        }
    }

    static void CopyDirectory(string sourceDir, string destDir)
    {
        Directory.CreateDirectory(destDir);
        foreach (string file in Directory.GetFiles(sourceDir))
        {
            string destFile = Path.Combine(destDir, Path.GetFileName(file));
            File.Copy(file, destFile, true);
        }
        foreach (string sub in Directory.GetDirectories(sourceDir))
        {
            CopyDirectory(sub, Path.Combine(destDir, Path.GetFileName(sub)));
        }
    }

    static void CleanupTemp()
    {
        Log("[6/9] Cleaning temp dsh-* directories...");
        string temp = Path.GetTempPath();
        try
        {
            string[] dirs = Directory.GetDirectories(temp, "dsh*");
            foreach (string d in dirs)
            {
                try
                {
                    Directory.Delete(d, true);
                    Log("  Deleted temp directory: " + d);
                }
                catch
                {
                }
            }
        }
        catch
        {
        }
    }

    static void InitializeLog()
    {
        try
        {
            string dir = Path.GetDirectoryName(LogFilePath);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }
            File.WriteAllText(LogFilePath, "===== DSH Desktop Uninstaller Log " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " =====" + Environment.NewLine);
        }
        catch
        {
        }
    }

    static void Log(string message)
    {
        messages.Add(message);
        try
        {
            File.AppendAllText(LogFilePath, message + Environment.NewLine);
        }
        catch
        {
        }
        Console.WriteLine(message);
    }

    static void Pause()
    {
        if (!silent)
        {
            Console.WriteLine();
            Console.WriteLine("Press any key to exit...");
            try
            {
                Console.ReadKey(true);
            }
            catch
            {
            }
        }
    }
    class RetentionForm : Form
    {
        private class PresetListItem
        {
            public string Folder;
            public string Display;
            public string Label;

            public PresetListItem(string folder, string display, string label)
            {
                Folder = folder;
                Display = display;
                Label = label;
            }

            public override string ToString()
            {
                return Label;
            }
        }

        private class PluginListItem
        {
            public string Package;
            public string Label;

            public PluginListItem(string package, string label)
            {
                Package = package;
                Label = label;
            }

            public override string ToString()
            {
                return Label;
            }
        }
private class GrayableCheckBox : CheckBox
          {
              protected override void OnPaint(PaintEventArgs e)
              {
                  if (Enabled)
                  {
                      base.OnPaint(e);
                      return;
                  }

                  using (SolidBrush bg = new SolidBrush(Parent != null ? Parent.BackColor : BackColor))
                  {
                      e.Graphics.FillRectangle(bg, ClientRectangle);
                  }

                  CheckBoxState state;
                  switch (CheckState)
                  {
                      case CheckState.Checked:
                          state = CheckBoxState.CheckedDisabled;
                          break;
                      case CheckState.Indeterminate:
                          state = CheckBoxState.MixedDisabled;
                          break;
                      default:
                          state = CheckBoxState.UncheckedDisabled;
                          break;
                  }

                  Size glyphSize = CheckBoxRenderer.GetGlyphSize(e.Graphics, state);
                  Point boxLocation = new Point(0, Math.Max(0, (Height - glyphSize.Height) / 2));
                  CheckBoxRenderer.DrawCheckBox(e.Graphics, boxLocation, state);

                  Rectangle textBounds = new Rectangle(
                      glyphSize.Width + 4,
                      0,
                      Math.Max(0, Width - glyphSize.Width - 4),
                      Height);
                  TextRenderer.DrawText(e.Graphics, Text, Font, textBounds, SystemColors.GrayText,
                      TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
              }
          }

        private GrayableCheckBox chkPresets;
        private CheckedListBox clbPresets;
        private CheckBox chkRuntime;
        private GrayableCheckBox chkPlugins;
        private CheckedListBox clbPlugins;
        private CheckBox chkChatData;
        private CheckBox chkAppSettings;
        private CheckBox chkModelConfig;
        private CheckBox chkOtherUserData;
        private RadioButton rbDetectRunning;
        private RadioButton rbDefault;
        private bool updatingPresetState;
        private bool updatingPluginState;
        private bool hasPresets;
        private bool hasPlugins;

        public bool KeepAgentPresets { get { return chkPresets.CheckState != CheckState.Unchecked; } }
        public bool KeepRuntime { get { return chkRuntime.Checked || chkPlugins.CheckState != CheckState.Unchecked; } }
        public bool KeepChatData { get { return chkChatData.Checked; } }
        public bool KeepAppSettings { get { return chkAppSettings.Checked; } }
        public bool KeepModelConfig { get { return chkModelConfig.Checked; } }
        public bool KeepOtherUserData { get { return chkOtherUserData.Checked; } }
        public bool KeepPlugins { get { return chkPlugins.CheckState != CheckState.Unchecked; } }
        public List<string> KeepPresetNames
        {
            get
            {
                if (chkPresets.CheckState == CheckState.Unchecked)
                {
                    return new List<string>();
                }

                List<string> names = new List<string>();
                foreach (object item in clbPresets.CheckedItems)
                {
                    PresetListItem preset = item as PresetListItem;
                    if (preset != null && !string.IsNullOrEmpty(preset.Folder))
                    {
                        names.Add(preset.Folder);
                    }
                }
                return names;
            }
        }
        public List<string> KeepPluginNames
        {
            get
            {
                if (chkPlugins.CheckState == CheckState.Unchecked)
                {
                    return new List<string>();
                }

                List<string> names = new List<string>();
                foreach (object item in clbPlugins.CheckedItems)
                {
                    PluginListItem plugin = item as PluginListItem;
                    if (plugin != null && !string.IsNullOrEmpty(plugin.Package))
                    {
                        names.Add(plugin.Package);
                    }
                }
                return names;
            }
        }
        public bool UseDetectedRunningDsh
        {
            get { return rbDetectRunning.Checked; }
        }

        private void SetAllPresetItems(bool isChecked)
        {
            for (int i = 0; i < clbPresets.Items.Count; i++)
            {
                clbPresets.SetItemChecked(i, isChecked);
            }
        }

        private void UpdatePresetParentState()
        {
            if (updatingPresetState) return;
            updatingPresetState = true;
            try
            {
                int total = clbPresets.Items.Count;
                if (total > 0)
                {
                    int checkedCount = clbPresets.CheckedItems.Count;
                    if (checkedCount == 0)
                    {
                        chkPresets.CheckState = CheckState.Unchecked;
                    }
                    else if (checkedCount == total)
                    {
                        chkPresets.CheckState = CheckState.Checked;
                    }
                    else
                    {
                        chkPresets.CheckState = CheckState.Indeterminate;
                    }
                }
                clbPresets.Enabled = chkPresets.CheckState != CheckState.Unchecked && hasPresets;
            }
            finally
            {
                updatingPresetState = false;
            }
        }

        private void SetAllPluginItems(bool isChecked)
        {
            for (int i = 0; i < clbPlugins.Items.Count; i++)
            {
                clbPlugins.SetItemChecked(i, isChecked);
            }
        }

        private void UpdatePluginParentState()
        {
            if (updatingPluginState) return;
            updatingPluginState = true;
            try
            {
                int total = clbPlugins.Items.Count;
                if (total > 0)
                {
                    int checkedCount = clbPlugins.CheckedItems.Count;
                    if (checkedCount == 0)
                    {
                        chkPlugins.CheckState = CheckState.Unchecked;
                    }
                    else if (checkedCount == total)
                    {
                        chkPlugins.CheckState = CheckState.Checked;
                    }
                    else
                    {
                        chkPlugins.CheckState = CheckState.Indeterminate;
                    }
                }
                if (chkPlugins.CheckState != CheckState.Unchecked)
                {
                    chkRuntime.Checked = true;
                }
                clbPlugins.Enabled = chkPlugins.CheckState != CheckState.Unchecked && hasPlugins;
            }
            finally
            {
                updatingPluginState = false;
            }
        }

        private void DrawCheckedListBoxItem(object sender, DrawItemEventArgs e, CheckedListBox list)
        {
            if (e.Index < 0) return;

            bool enabled = list.Enabled;
            bool isChecked = list.GetItemChecked(e.Index);

            using (SolidBrush bg = new SolidBrush(enabled ? SystemColors.Window : SystemColors.Control))
            {
                e.Graphics.FillRectangle(bg, e.Bounds);
            }

            Rectangle checkRect = new Rectangle(e.Bounds.X + 2, e.Bounds.Y + (e.Bounds.Height - 13) / 2, 13, 13);
            ButtonState state;
            if (!enabled)
            {
                state = isChecked ? (ButtonState.Checked | ButtonState.Inactive) : ButtonState.Inactive;
            }
            else
            {
                state = isChecked ? ButtonState.Checked : ButtonState.Normal;
            }
            ControlPaint.DrawCheckBox(e.Graphics, checkRect, state);

            Rectangle textRect = new Rectangle(e.Bounds.X + 20, e.Bounds.Y, e.Bounds.Width - 22, e.Bounds.Height);
            Color textColor = enabled ? SystemColors.WindowText : SystemColors.GrayText;
            TextRenderer.DrawText(e.Graphics, list.Items[e.Index].ToString(), e.Font, textRect, textColor,
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
        }

        public void SetRetentionOptions(bool presets, bool runtime, bool chatData, bool appSettings, bool modelConfig, bool otherUserData, bool plugins, List<string> presetNames, List<string> pluginNames)
        {
            chkRuntime.Checked = runtime;
            chkChatData.Checked = chatData;
            chkAppSettings.Checked = appSettings;
            chkModelConfig.Checked = modelConfig;
            chkOtherUserData.Checked = otherUserData;

            updatingPresetState = true;
            try
            {
                if (presets)
                {
                    if (presetNames == null || presetNames.Count == 0)
                    {
                        SetAllPresetItems(true);
                        chkPresets.CheckState = CheckState.Checked;
                    }
                    else
                    {
                        SetAllPresetItems(false);
                        HashSet<string> folderNames = new HashSet<string>(presetNames, StringComparer.OrdinalIgnoreCase);
                        for (int i = 0; i < clbPresets.Items.Count; i++)
                        {
                            PresetListItem item = clbPresets.Items[i] as PresetListItem;
                            if (item != null &&
                            (folderNames.Contains(item.Folder) ||
                             (!string.IsNullOrEmpty(item.Display) && folderNames.Contains(item.Display))))
                            {
                                clbPresets.SetItemChecked(i, true);
                            }
                        }
                    }
                }
                else
                {
                    SetAllPresetItems(false);
                    chkPresets.CheckState = CheckState.Unchecked;
                }
            }
            finally
            {
                updatingPresetState = false;
            }

            updatingPluginState = true;
            try
            {
                if (plugins)
                {
                    if (pluginNames == null || pluginNames.Count == 0)
                    {
                        SetAllPluginItems(true);
                        chkPlugins.CheckState = CheckState.Checked;
                        chkRuntime.Checked = true;
                    }
                    else
                    {
                        SetAllPluginItems(false);
                        HashSet<string> packageNames = new HashSet<string>(pluginNames, StringComparer.OrdinalIgnoreCase);
                        for (int i = 0; i < clbPlugins.Items.Count; i++)
                        {
                            PluginListItem item = clbPlugins.Items[i] as PluginListItem;
                            if (item != null && packageNames.Contains(item.Package))
                            {
                                clbPlugins.SetItemChecked(i, true);
                            }
                        }
                    }
                }
                else
                {
                    SetAllPluginItems(false);
                    chkPlugins.CheckState = CheckState.Unchecked;
                }
            }
            finally
            {
                updatingPluginState = false;
            }

            UpdatePresetParentState();
            UpdatePluginParentState();
        }
        public RetentionForm()
        {
            Text = "DSH Desktop 卸载确认";
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ShowInTaskbar = true;
            ClientSize = new Size(520, 640);
            Font = new Font("Microsoft YaHei UI", 9F);

            Label lblTitle = new Label();
            lblTitle.Text = "确定要卸载 DSH Desktop 吗？";
            lblTitle.Font = new Font("Microsoft YaHei UI", 12F, FontStyle.Bold);
            lblTitle.AutoSize = false;
            lblTitle.SetBounds(22, 16, 476, 30);

            Label lblDesc = new Label();
            lblDesc.Text = "将删除程序、更新器、缓存、快捷方式、注册表和 DSH 用户数据。\r\n默认不保留用户数据，可在下方勾选需要保留的项目。";
            lblDesc.AutoSize = false;
            lblDesc.SetBounds(22, 52, 476, 48);

            GroupBox grpMode = new GroupBox();
            grpMode.Text = "卸载模式";
            grpMode.SetBounds(22, 106, 476, 72);

            rbDetectRunning = new RadioButton();
            string runningDir = DSHDesktopUninstaller.DetectedRunningDshDir;
            rbDetectRunning.Text = string.IsNullOrEmpty(runningDir)
                ? "程序识别卸载（未检测到运行中的 DSH，将回退默认定位）"
                : "程序识别卸载（当前运行：" + runningDir + "）";
            rbDetectRunning.SetBounds(14, 20, 448, 24);
            rbDetectRunning.Checked = !string.IsNullOrEmpty(runningDir);

            rbDefault = new RadioButton();
            rbDefault.Text = "默认卸载（按注册表/常见安装路径检测）";
            rbDefault.SetBounds(14, 46, 448, 22);
            rbDefault.Checked = !rbDetectRunning.Checked;

            grpMode.Controls.Add(rbDetectRunning);
            grpMode.Controls.Add(rbDefault);

            GroupBox grp = new GroupBox();
            grp.Text = "可选保留项";
            grp.SetBounds(22, 184, 476, 390);

            Panel pnlOptions = new Panel();
            pnlOptions.SetBounds(8, 20, 458, 358);
            pnlOptions.AutoScroll = true;

            chkPresets = new GrayableCheckBox();
            chkPresets.ThreeState = true;
            chkPresets.AutoCheck = false;
            chkPresets.Text = "保留预设（按名称保留）";
            chkPresets.SetBounds(18, 24, 440, 24);
            chkPresets.Click += delegate
            {
                chkPresets.CheckState = chkPresets.CheckState == CheckState.Checked
                    ? CheckState.Unchecked
                    : CheckState.Checked;
            };
            chkPresets.CheckStateChanged += delegate
            {
                if (updatingPresetState) return;
                updatingPresetState = true;
                try
                {
                    if (chkPresets.CheckState == CheckState.Checked)
                    {
                        SetAllPresetItems(true);
                    }
                    else if (chkPresets.CheckState == CheckState.Unchecked)
                    {
                        SetAllPresetItems(false);
                    }
                    clbPresets.Enabled = chkPresets.CheckState != CheckState.Unchecked && hasPresets;
                }
                finally
                {
                    updatingPresetState = false;
                }
            };

            clbPresets = new CheckedListBox();
            clbPresets.SetBounds(38, 50, 420, 70);
            clbPresets.CheckOnClick = true;
            clbPresets.IntegralHeight = false;
            clbPresets.DrawMode = DrawMode.OwnerDrawFixed;
            clbPresets.DrawItem += delegate(object sender, DrawItemEventArgs e)
            {
                DrawCheckedListBoxItem(sender, e, clbPresets);
            };
            clbPresets.ItemCheck += delegate(object sender, ItemCheckEventArgs e)
            {
                if (updatingPresetState) return;
                int total = clbPresets.Items.Count;
                if (total == 0) return;

                int checkedCount = clbPresets.CheckedItems.Count;
                if (e.NewValue == CheckState.Checked)
                {
                    checkedCount++;
                }
                else if (e.NewValue == CheckState.Unchecked && clbPresets.CheckedIndices.Contains(e.Index))
                {
                    checkedCount--;
                }

                CheckState state;
                if (checkedCount == 0)
                {
                    state = CheckState.Unchecked;
                }
                else if (checkedCount == total)
                {
                    state = CheckState.Checked;
                }
                else
                {
                    state = CheckState.Indeterminate;
                }

                if (chkPresets.CheckState != state)
                {
                    updatingPresetState = true;
                    try
                    {
                        chkPresets.CheckState = state;
                    }
                    finally
                    {
                        updatingPresetState = false;
                    }
                }
                clbPresets.Enabled = chkPresets.CheckState != CheckState.Unchecked && hasPresets;
            };

            List<PresetInfo> detected = DSHDesktopUninstaller.DetectAgentPresets();
            hasPresets = detected.Count > 0;
            if (detected.Count == 0)
            {
                clbPresets.Items.Add(new PresetListItem("", "", "（未检测到预设）"));
                clbPresets.Enabled = false;
                chkPresets.Enabled = false;
            }
            else
            {
                foreach (PresetInfo preset in detected)
                {
                    string label = string.Equals(preset.FolderName, preset.DisplayName, StringComparison.OrdinalIgnoreCase)
                        ? preset.DisplayName
                        : preset.DisplayName + " (" + preset.FolderName + ")";
                    clbPresets.Items.Add(new PresetListItem(preset.FolderName, preset.DisplayName, label));
                }
            }

            chkChatData = new CheckBox();
            chkChatData.Text = "保留聊天数据（.dsh\\sessions 对话记录）";
            chkChatData.SetBounds(18, 126, 440, 24);

            chkPlugins = new GrayableCheckBox();
            chkPlugins.ThreeState = true;
            chkPlugins.AutoCheck = false;
            chkPlugins.Text = "保留插件（按名称保留，自动保留运行时）";
            chkPlugins.SetBounds(18, 154, 440, 24);
            chkPlugins.Click += delegate
            {
                chkPlugins.CheckState = chkPlugins.CheckState == CheckState.Checked
                    ? CheckState.Unchecked
                    : CheckState.Checked;
            };
            chkPlugins.CheckStateChanged += delegate
            {
                if (updatingPluginState) return;
                updatingPluginState = true;
                try
                {
                    if (chkPlugins.CheckState == CheckState.Checked)
                    {
                        SetAllPluginItems(true);
                        chkRuntime.Checked = true;
                    }
                    else if (chkPlugins.CheckState == CheckState.Unchecked)
                    {
                        SetAllPluginItems(false);
                    }
                    clbPlugins.Enabled = chkPlugins.CheckState != CheckState.Unchecked && hasPlugins;
                }
                finally
                {
                    updatingPluginState = false;
                }
            };

            clbPlugins = new CheckedListBox();
            clbPlugins.SetBounds(38, 180, 420, 120);
            clbPlugins.CheckOnClick = true;
            clbPlugins.IntegralHeight = false;
            clbPlugins.HorizontalScrollbar = true;
            clbPlugins.DrawMode = DrawMode.OwnerDrawFixed;
            clbPlugins.DrawItem += delegate(object sender, DrawItemEventArgs e)
            {
                DrawCheckedListBoxItem(sender, e, clbPlugins);
            };
            clbPlugins.ItemCheck += delegate(object sender, ItemCheckEventArgs e)
            {
                if (updatingPluginState) return;
                int total = clbPlugins.Items.Count;
                if (total == 0) return;

                int checkedCount = clbPlugins.CheckedItems.Count;
                if (e.NewValue == CheckState.Checked)
                {
                    checkedCount++;
                }
                else if (e.NewValue == CheckState.Unchecked && clbPlugins.CheckedIndices.Contains(e.Index))
                {
                    checkedCount--;
                }

                CheckState state;
                if (checkedCount == 0)
                {
                    state = CheckState.Unchecked;
                }
                else if (checkedCount == total)
                {
                    state = CheckState.Checked;
                }
                else
                {
                    state = CheckState.Indeterminate;
                }

                if (chkPlugins.CheckState != state)
                {
                    updatingPluginState = true;
                    try
                    {
                        chkPlugins.CheckState = state;
                    }
                    finally
                    {
                        updatingPluginState = false;
                    }
                }
                if (chkPlugins.CheckState != CheckState.Unchecked)
                {
                    chkRuntime.Checked = true;
                }
                clbPlugins.Enabled = chkPlugins.CheckState != CheckState.Unchecked && hasPlugins;
            };

            List<PluginInfo> detectedPlugins = DSHDesktopUninstaller.DetectPlugins();
            hasPlugins = detectedPlugins.Count > 0;
            if (detectedPlugins.Count == 0)
            {
                clbPlugins.Items.Add(new PluginListItem("", "（未检测到插件）"));
                clbPlugins.Enabled = false;
                chkPlugins.Enabled = false;
            }
            else
            {
                foreach (PluginInfo plugin in detectedPlugins)
                {
                    clbPlugins.Items.Add(new PluginListItem(plugin.PackageName, plugin.DisplayName));
                }
            }

            chkAppSettings = new CheckBox();
            chkAppSettings.Text = "保留应用设置（settings.yaml）";
            chkAppSettings.SetBounds(18, 306, 440, 24);

            chkModelConfig = new CheckBox();
            chkModelConfig.Text = "保留模型配置与凭据（.credentials.yaml + settings.yaml 模型部分）";
            chkModelConfig.SetBounds(18, 334, 440, 24);

            chkOtherUserData = new CheckBox();
            chkOtherUserData.Text = "保留其他 .dsh 数据（graph-memory/storages/super-injector 等）";
            chkOtherUserData.SetBounds(18, 362, 440, 24);

            chkRuntime = new CheckBox();
            chkRuntime.Text = "保留 .dsh-runtime（DSH CLI 运行时）";
            chkRuntime.SetBounds(18, 390, 440, 24);

            pnlOptions.Controls.Add(chkPresets);
            pnlOptions.Controls.Add(clbPresets);
            pnlOptions.Controls.Add(chkChatData);
            pnlOptions.Controls.Add(chkPlugins);
            pnlOptions.Controls.Add(clbPlugins);
            pnlOptions.Controls.Add(chkAppSettings);
            pnlOptions.Controls.Add(chkModelConfig);
            pnlOptions.Controls.Add(chkOtherUserData);
            pnlOptions.Controls.Add(chkRuntime);
            grp.Controls.Add(pnlOptions);

            Button btnOk = new Button();
            btnOk.Text = "卸载";
            btnOk.DialogResult = DialogResult.OK;
            btnOk.SetBounds(260, 586, 100, 30);

            Button btnCancel = new Button();
            btnCancel.Text = "取消";
            btnCancel.DialogResult = DialogResult.Cancel;
            btnCancel.SetBounds(370, 586, 100, 30);

            Controls.Add(lblTitle);
            Controls.Add(lblDesc);
            Controls.Add(grpMode);
            Controls.Add(grp);
            Controls.Add(btnOk);
            Controls.Add(btnCancel);

            AcceptButton = btnOk;
            CancelButton = btnCancel;
        }
    }
}
