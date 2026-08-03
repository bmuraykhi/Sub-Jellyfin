using System;
using System.IO;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SeasonSubtitles;

public static class IndexHtmlPatch
{
    private const string OpenMarker = "<!-- season-subtitles-inject -->";
    private const string CloseMarker = "<!-- /season-subtitles-inject -->";

    private static string? _cachedJs;
    private static bool _warnedEmptyResource;

    internal static ILogger? Logger { get; set; }

    public static string Apply(Payload content)
    {
        if (string.IsNullOrEmpty(content?.Contents))
        {
            return content?.Contents ?? string.Empty;
        }

        var html = content.Contents;

        var startIdx = html.IndexOf(OpenMarker, StringComparison.Ordinal);
        var guard = 0;
        while (startIdx >= 0 && guard++ < 10)
        {
            var endIdx = html.IndexOf(CloseMarker, startIdx, StringComparison.Ordinal);
            if (endIdx > startIdx)
            {
                html = html.Remove(startIdx, endIdx - startIdx + CloseMarker.Length);
            }
            else
            {
                Logger?.LogWarning("Unpaired season-subtitles open marker found in index.html; removing the orphaned marker.");
                html = html.Remove(startIdx, OpenMarker.Length);
            }
            startIdx = html.IndexOf(OpenMarker, StringComparison.Ordinal);
        }

        var bodyClose = html.IndexOf("</body>", StringComparison.OrdinalIgnoreCase);
        if (bodyClose < 0)
        {
            Logger?.LogWarning("No </body> tag found; season subtitles script was not injected.");
            return html;
        }

        var js = _cachedJs ??= LoadEmbeddedJs();
        if (string.IsNullOrEmpty(js))
        {
            if (!_warnedEmptyResource)
            {
                _warnedEmptyResource = true;
                Logger?.LogWarning("Embedded season subtitles script resource is missing or empty; nothing was injected.");
            }
            return html;
        }

        var snippet = $"{OpenMarker}\n<script>{js}</script>\n{CloseMarker}";
        return html.Insert(bodyClose, snippet);
    }

    private static string LoadEmbeddedJs()
    {
        var asm = typeof(IndexHtmlPatch).Assembly;
        const string resource = "Jellyfin.Plugin.SeasonSubtitles.Web.season-subtitles.js";
        using var stream = asm.GetManifestResourceStream(resource);
        if (stream == null)
        {
            return string.Empty;
        }
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    public class Payload
    {
        [JsonPropertyName("contents")]
        public string? Contents { get; set; }
    }
}
