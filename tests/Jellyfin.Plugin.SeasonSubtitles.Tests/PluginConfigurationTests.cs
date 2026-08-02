using System.Xml.Serialization;
using Jellyfin.Plugin.SeasonSubtitles.Configuration;
using Xunit;

namespace Jellyfin.Plugin.SeasonSubtitles.Tests;

public class PluginConfigurationTests
{
    [Fact]
    public void Defaults_AreExpected()
    {
        var config = new PluginConfiguration();

        Assert.Equal(string.Empty, config.DefaultLanguage);
        Assert.True(config.SkipExistingByDefault);
        Assert.Equal(2, config.MaxRetries);
        Assert.Equal(0, config.RequestDelayMs);
        Assert.Equal(1, config.TopVariants);
    }

    [Fact]
    public void MaxRetries_ClampsAboveUpperBound()
    {
        var config = new PluginConfiguration { MaxRetries = 999 };
        Assert.Equal(10, config.MaxRetries);
    }

    [Fact]
    public void MaxRetries_ClampsBelowLowerBound()
    {
        var config = new PluginConfiguration { MaxRetries = -5 };
        Assert.Equal(0, config.MaxRetries);
    }

    [Fact]
    public void RequestDelayMs_ClampsAboveUpperBound()
    {
        var config = new PluginConfiguration { RequestDelayMs = int.MaxValue };
        Assert.Equal(10000, config.RequestDelayMs);
    }

    [Fact]
    public void TopVariants_ClampsBelowLowerBound()
    {
        var config = new PluginConfiguration { TopVariants = 0 };
        Assert.Equal(1, config.TopVariants);
    }

    [Fact]
    public void TopVariants_ClampsAboveUpperBound()
    {
        var config = new PluginConfiguration { TopVariants = 99 };
        Assert.Equal(5, config.TopVariants);
    }

    [Fact]
    public void DefaultLanguage_TrimsAndLowercasesValidCode()
    {
        var config = new PluginConfiguration { DefaultLanguage = " ENG " };
        Assert.Equal("eng", config.DefaultLanguage);
    }

    [Fact]
    public void DefaultLanguage_RejectsTwoLetterCode()
    {
        var config = new PluginConfiguration { DefaultLanguage = "en" };
        Assert.Equal(string.Empty, config.DefaultLanguage);
    }

    [Fact]
    public void DefaultLanguage_RejectsFourLetterCode()
    {
        var config = new PluginConfiguration { DefaultLanguage = "engx" };
        Assert.Equal(string.Empty, config.DefaultLanguage);
    }

    [Fact]
    public void DefaultLanguage_RejectsNull()
    {
        var config = new PluginConfiguration { DefaultLanguage = null! };
        Assert.Equal(string.Empty, config.DefaultLanguage);
    }

    [Fact]
    public void XmlSerializer_RoundTripsClampedValues()
    {
        var original = new PluginConfiguration
        {
            DefaultLanguage = "fra",
            SkipExistingByDefault = false,
            MaxRetries = 7,
            RequestDelayMs = 500,
            TopVariants = 3
        };

        var serializer = new XmlSerializer(typeof(PluginConfiguration));
        using var stream = new MemoryStream();
        serializer.Serialize(stream, original);
        stream.Position = 0;
        var roundTripped = (PluginConfiguration)serializer.Deserialize(stream)!;

        Assert.Equal(original.DefaultLanguage, roundTripped.DefaultLanguage);
        Assert.Equal(original.SkipExistingByDefault, roundTripped.SkipExistingByDefault);
        Assert.Equal(original.MaxRetries, roundTripped.MaxRetries);
        Assert.Equal(original.RequestDelayMs, roundTripped.RequestDelayMs);
        Assert.Equal(original.TopVariants, roundTripped.TopVariants);
    }
}
