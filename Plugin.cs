using System;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.SeasonSubtitles;

public class Plugin : BasePlugin<BasePluginConfiguration>
{
    public Plugin(IApplicationPaths paths, IXmlSerializer xml) : base(paths, xml)
    {
        Instance = this;
    }

    public override string Name => "Season Subtitle Downloader";

    public override Guid Id => Guid.Parse("a3c0e5c3-7d0d-4b91-9d1c-2e6f9b3a1c5d");

    public static Plugin? Instance { get; private set; }
}
