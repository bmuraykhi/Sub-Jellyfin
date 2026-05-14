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
        TopVariants = 1;
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

    /// <summary>
    /// How many of the top-ranked remote subtitles to download per episode.
    /// Default 1. Range 1-5. Useful when the highest-ranked match isn't always
    /// the best fit — pulling 3-5 variants raises the odds at least one syncs.
    /// </summary>
    public int TopVariants { get; set; }
}
