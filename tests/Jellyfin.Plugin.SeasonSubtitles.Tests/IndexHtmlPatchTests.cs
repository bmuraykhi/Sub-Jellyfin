using Jellyfin.Plugin.SeasonSubtitles;
using Xunit;

namespace Jellyfin.Plugin.SeasonSubtitles.Tests;

public class IndexHtmlPatchTests
{
    private static IndexHtmlPatch.Payload P(string? s) => new() { Contents = s };

    private static int Count(string s, string sub)
    {
        var count = 0;
        var idx = 0;
        while ((idx = s.IndexOf(sub, idx, StringComparison.Ordinal)) >= 0)
        {
            count++;
            idx += sub.Length;
        }

        return count;
    }

    [Fact]
    public void Apply_NullPayload_ReturnsEmpty()
    {
        Assert.Equal(string.Empty, IndexHtmlPatch.Apply(null!));
    }

    [Fact]
    public void Apply_NullContents_ReturnsEmpty()
    {
        Assert.Equal(string.Empty, IndexHtmlPatch.Apply(P(null)));
    }

    [Fact]
    public void Apply_EmptyContents_ReturnsEmpty()
    {
        Assert.Equal(string.Empty, IndexHtmlPatch.Apply(P(string.Empty)));
    }

    [Fact]
    public void Apply_NoBodyClose_ReturnsUnchanged()
    {
        const string input = "<html><head></head></html>";
        Assert.Equal(input, IndexHtmlPatch.Apply(P(input)));
    }

    [Fact]
    public void Apply_InjectsExactlyOneMarkerPairAndScript()
    {
        const string input = "<html><body><p>x</p></body></html>";
        var output = IndexHtmlPatch.Apply(P(input));

        Assert.Equal(1, Count(output, "<!-- season-subtitles-inject -->"));
        Assert.Equal(1, Count(output, "<!-- /season-subtitles-inject -->"));
        Assert.Equal(1, Count(output, "<script"));

        var closeMarkerIdx = output.IndexOf("<!-- /season-subtitles-inject -->", StringComparison.Ordinal);
        var bodyCloseIdx = output.IndexOf("</body>", StringComparison.Ordinal);
        Assert.True(closeMarkerIdx < bodyCloseIdx);
    }

    [Fact]
    public void Apply_IsStructurallyIdempotentAcrossRepeatedRenders()
    {
        const string input = "<html><body><p>x</p></body></html>";
        var once = IndexHtmlPatch.Apply(P(input));
        var twice = IndexHtmlPatch.Apply(P(once));

        Assert.Equal(1, Count(twice, "<!-- season-subtitles-inject -->"));
        Assert.Equal(1, Count(twice, "<!-- /season-subtitles-inject -->"));
        Assert.Equal(1, Count(twice, "<script"));
    }

    [Fact]
    public void Apply_UppercaseBodyClose_StillInjects()
    {
        const string input = "<HTML><BODY><p>x</p></BODY></HTML>";
        var output = IndexHtmlPatch.Apply(P(input));

        Assert.Equal(1, Count(output, "<!-- season-subtitles-inject -->"));
        Assert.Contains("<script", output);
    }

    [Fact]
    public void Apply_StripsStaleInjectionBeforeReinserting()
    {
        const string input = "<html><body><!-- season-subtitles-inject -->STALE<!-- /season-subtitles-inject --></body></html>";
        var output = IndexHtmlPatch.Apply(P(input));

        Assert.DoesNotContain("STALE", output);
        Assert.Equal(1, Count(output, "<!-- season-subtitles-inject -->"));
    }

    [Fact]
    public void Apply_EmbeddedJsResourceLoadsAndIsSubstantial()
    {
        const string input = "<html><body><p>x</p></body></html>";
        var output = IndexHtmlPatch.Apply(P(input));

        Assert.True(output.Length - input.Length > 1000);
    }
}
