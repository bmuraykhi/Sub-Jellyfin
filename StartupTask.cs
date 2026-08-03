using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.SeasonSubtitles;

public class StartupTask : IScheduledTask, IConfigurableScheduledTask
{
    private readonly ILogger<StartupTask> _logger;

    public StartupTask(ILogger<StartupTask> logger)
    {
        _logger = logger;
    }

    public string Name => "Season Subtitle Downloader Startup";
    public string Key => "SeasonSubtitleDownloaderStartup";
    public string Description => "Registers a File Transformation that injects the season subtitle UI into Jellyfin's web client.";
    public string Category => "Season Subtitle Downloader";
    public bool IsHidden => true;
    public bool IsEnabled => true;
    public bool IsLogged => false;

    public Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        return Task.Run(() =>
        {
            IndexHtmlPatch.Logger = _logger;
            RegisterTransformation();
            progress.Report(100);
        }, cancellationToken);
    }

    private void RegisterTransformation()
    {
        try
        {
            Assembly? ftAsm = AssemblyLoadContext.All
                .SelectMany(c => c.Assemblies)
                .Where(a => a.GetName().Name?.EndsWith(".FileTransformation", StringComparison.Ordinal) == true)
                .OrderByDescending(a => a.GetName().Version)
                .FirstOrDefault();

            if (ftAsm == null)
            {
                _logger.LogWarning("File Transformation plugin not found. Install it from the catalog and restart Jellyfin: this plugin depends on it.");
                return;
            }

            _logger.LogInformation("Using File Transformation assembly {AssemblyName}", ftAsm.FullName);

            Type? pluginInterface = ftAsm.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface");
            if (pluginInterface == null)
            {
                _logger.LogWarning("File Transformation PluginInterface type not found; its API may have changed.");
                return;
            }

            MethodInfo? register = pluginInterface.GetMethod("RegisterTransformation");
            if (register == null)
            {
                _logger.LogWarning("File Transformation RegisterTransformation method not found; its API may have changed.");
                return;
            }

            Plugin? plugin = Plugin.Instance;
            if (plugin == null)
            {
                _logger.LogWarning("Plugin instance not initialized; cannot register the transformation.");
                return;
            }

            var payload = new JObject
            {
                { "id", plugin.Id.ToString() },
                { "fileNamePattern", "index.html" },
                { "callbackAssembly", typeof(StartupTask).Assembly.FullName },
                { "callbackClass", typeof(IndexHtmlPatch).FullName },
                { "callbackMethod", nameof(IndexHtmlPatch.Apply) }
            };

            register.Invoke(null, new object?[] { payload });
            _logger.LogInformation("Season Subtitle Downloader transformation registered.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to register Season Subtitle Downloader transformation.");
        }
    }

    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
    {
        yield return new TaskTriggerInfo { Type = TaskTriggerInfoType.StartupTrigger };
    }
}
