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

public class StartupTask : IScheduledTask
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

    public Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        return Task.Run(RegisterTransformation, cancellationToken);
    }

    private void RegisterTransformation()
    {
        Assembly? ftAsm = AssemblyLoadContext.All
            .SelectMany(c => c.Assemblies)
            .FirstOrDefault(a => a.FullName?.Contains(".FileTransformation", StringComparison.Ordinal) == true);

        if (ftAsm == null)
        {
            _logger.LogWarning("File Transformation plugin not found. Install it from the catalog: this plugin depends on it.");
            return;
        }

        Type? pluginInterface = ftAsm.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface");
        if (pluginInterface == null)
        {
            _logger.LogWarning("File Transformation PluginInterface type not found.");
            return;
        }

        var payload = new JObject
        {
            { "id", Plugin.Instance!.Id.ToString() },
            { "fileNamePattern", "index.html" },
            { "callbackAssembly", typeof(StartupTask).Assembly.FullName },
            { "callbackClass", typeof(IndexHtmlPatch).FullName },
            { "callbackMethod", nameof(IndexHtmlPatch.Apply) }
        };

        try
        {
            pluginInterface.GetMethod("RegisterTransformation")?.Invoke(null, new object?[] { payload });
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
