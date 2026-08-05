using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using Jellyfin.Plugin.SeasonSubtitles;
using Jellyfin.Plugin.SeasonSubtitles.Configuration;
using Xunit;

namespace Jellyfin.Plugin.SeasonSubtitles.Tests;

public class InvariantTests
{
    private static string FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        for (var i = 0; i < 10 && dir != null; i++)
        {
            if (File.Exists(Path.Combine(dir.FullName, "meta.json")))
            {
                return dir.FullName;
            }

            dir = dir.Parent;
        }

        throw new InvalidOperationException("Could not locate repo root (meta.json) within 10 levels of AppContext.BaseDirectory");
    }

    private static readonly string RepoRoot = FindRepoRoot();

    [Fact]
    public void Guid_IsConsistentAcrossAllFiles()
    {
        using var metaDoc = JsonDocument.Parse(File.ReadAllText(Path.Combine(RepoRoot, "meta.json")));
        var guid = metaDoc.RootElement.GetProperty("guid").GetString();
        Assert.False(string.IsNullOrEmpty(guid));

        using var manifestDoc = JsonDocument.Parse(File.ReadAllText(Path.Combine(RepoRoot, "manifest.json")));
        var manifestGuid = manifestDoc.RootElement.EnumerateArray().First().GetProperty("guid").GetString();
        Assert.Equal(guid, manifestGuid);

        var configPageText = File.ReadAllText(Path.Combine(RepoRoot, "Configuration", "configPage.html"));
        Assert.Contains(guid!, configPageText);

        var jsText = File.ReadAllText(Path.Combine(RepoRoot, "Web", "season-subtitles.js"));
        Assert.Contains(guid!, jsText);

        var pluginCsText = File.ReadAllText(Path.Combine(RepoRoot, "Plugin.cs"));
        Assert.Contains(guid!, pluginCsText);
    }

    [Fact]
    public void EmbeddedResources_Exist()
    {
        var names = typeof(IndexHtmlPatch).Assembly.GetManifestResourceNames();

        Assert.Contains("Jellyfin.Plugin.SeasonSubtitles.Web.season-subtitles.js", names);
        Assert.Contains("Jellyfin.Plugin.SeasonSubtitles.Configuration.configPage.html", names);
    }

    [Fact]
    public void ConfigProperties_AppearInConfigPageAndClientJs()
    {
        var configPageText = File.ReadAllText(Path.Combine(RepoRoot, "Configuration", "configPage.html"));
        var jsText = File.ReadAllText(Path.Combine(RepoRoot, "Web", "season-subtitles.js"));

        var properties = typeof(PluginConfiguration).GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly);
        Assert.NotEmpty(properties);

        foreach (var property in properties)
        {
            Assert.Contains(property.Name, configPageText);
            Assert.Contains(property.Name, jsText);
        }
    }

    [Fact]
    public void TargetAbi_IsFloorWithinJellyfinPackageSeries()
    {
        using var metaDoc = JsonDocument.Parse(File.ReadAllText(Path.Combine(RepoRoot, "meta.json")));
        var targetAbi = metaDoc.RootElement.GetProperty("targetAbi").GetString();
        Assert.False(string.IsNullOrEmpty(targetAbi));
        var abi = Version.Parse(targetAbi!);

        var csprojText = File.ReadAllText(Path.Combine(RepoRoot, "Jellyfin.Plugin.SeasonSubtitles.csproj"));
        var controller = Regex.Match(csprojText, "Include=\"Jellyfin.Controller\" Version=\"([^\"]+)\"");
        var model = Regex.Match(csprojText, "Include=\"Jellyfin.Model\" Version=\"([^\"]+)\"");
        Assert.True(controller.Success, "Could not find Jellyfin.Controller package reference in csproj");
        Assert.True(model.Success, "Could not find Jellyfin.Model package reference in csproj");
        Assert.Equal(controller.Groups[1].Value, model.Groups[1].Value);

        var pkg = Version.Parse(controller.Groups[1].Value + ".0");
        Assert.Equal(pkg.Major, abi.Major);
        Assert.Equal(pkg.Minor, abi.Minor);
        Assert.True(abi <= pkg, $"targetAbi {abi} must not exceed the compiled package version {pkg}");
        Assert.Equal(4, targetAbi!.Split('.').Length);
    }

    [Fact]
    public void PackageLockName_MatchesPackageJsonName()
    {
        using var pkgDoc = JsonDocument.Parse(File.ReadAllText(Path.Combine(RepoRoot, "package.json")));
        var pkgName = pkgDoc.RootElement.GetProperty("name").GetString();
        Assert.False(string.IsNullOrEmpty(pkgName));

        using var lockDoc = JsonDocument.Parse(File.ReadAllText(Path.Combine(RepoRoot, "package-lock.json")));
        var lockName = lockDoc.RootElement.GetProperty("name").GetString();

        Assert.Equal(pkgName, lockName);
    }
}
