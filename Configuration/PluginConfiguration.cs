using System;
using System.Text.RegularExpressions;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.SeasonSubtitles.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    private string _defaultLanguage = string.Empty;
    private int _maxRetries = 2;
    private int _requestDelayMs;
    private int _topVariants = 1;

    public string DefaultLanguage
    {
        get => _defaultLanguage;
        set
        {
            var v = (value ?? string.Empty).Trim().ToLowerInvariant();
            _defaultLanguage = Regex.IsMatch(v, "^[a-z]{3}$") ? v : string.Empty;
        }
    }

    public bool SkipExistingByDefault { get; set; } = true;

    public int MaxRetries
    {
        get => _maxRetries;
        set => _maxRetries = Math.Clamp(value, 0, 10);
    }

    public int RequestDelayMs
    {
        get => _requestDelayMs;
        set => _requestDelayMs = Math.Clamp(value, 0, 10000);
    }

    public int TopVariants
    {
        get => _topVariants;
        set => _topVariants = Math.Clamp(value, 1, 5);
    }
}
