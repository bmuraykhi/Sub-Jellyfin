using System;
using System.IO;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.SeasonSubtitles;

public static class IndexHtmlPatch
{
    private const string OpenMarker = "<!-- season-subtitles-inject -->";
    private const string CloseMarker = "<!-- /season-subtitles-inject -->";

    private static string? _cachedJs;

    public static string Apply(Payload content)
    {
        if (string.IsNullOrEmpty(content?.Contents))
        {
            return content?.Contents ?? string.Empty;
        }

        var html = content.Contents;

        // Remove any previous injection (idempotent on re-renders / version bumps)
        var startIdx = html.IndexOf(OpenMarker, StringComparison.Ordinal);
        if (startIdx >= 0)
        {
            var endIdx = html.IndexOf(CloseMarker, startIdx, StringComparison.Ordinal);
            if (endIdx > startIdx)
            {
                html = html.Remove(startIdx, endIdx - startIdx + CloseMarker.Length);
            }
        }

        var bodyClose = html.IndexOf("</body>", StringComparison.OrdinalIgnoreCase);
        if (bodyClose < 0)
        {
            return html;
        }

        var js = _cachedJs ??= LoadEmbeddedJs();
        if (string.IsNullOrEmpty(js))
        {
            return html;
        }

        var snippet = $"\n{OpenMarker}\n<script defer>{js}</script>\n{CloseMarker}\n";
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
