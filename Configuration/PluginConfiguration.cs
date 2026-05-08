using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.SeasonSubtitles.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    public PluginConfiguration()
    {
        DefaultLanguage = string.Empty;
        SkipExistingByDefault = true;
        MaxRetries = 2;
        RequestDelayMs = 0;
    }

    /// <summary>
    /// Default 3-letter ISO language code (e.g. "eng"). Empty means fall back
    /// to the user's Jellyfin subtitle preference, then "eng".
    /// </summary>
    public string DefaultLanguage { get; set; }

    /// <summary>
    /// Whether the "skip existing" checkbox starts ticked.
    /// </summary>
    public bool SkipExistingByDefault { get; set; }

    /// <summary>
    /// Max retry attempts per remote-subtitle call on transient failures.
    /// </summary>
    public int MaxRetries { get; set; }

    /// <summary>
    /// Delay in milliseconds between consecutive episode fetches, to ease
    /// strict provider rate limits. 0 disables.
    /// </summary>
    public int RequestDelayMs { get; set; }
}
