using System.Net;
using System.Text.RegularExpressions;
using HtmlAgilityPack;

namespace CarjamImporter.Parsers;

/// <summary>
/// Parser for extracting data from HTML data-key attributes.
/// </summary>
public static class HtmlDataKeyParser
{
    public static HtmlDocument Load(string html)
    {
        var doc = new HtmlDocument();
        doc.LoadHtml(html);
        return doc;
    }

    public static string? GetDataKeyValue(HtmlDocument doc, string dataKey)
    {
        var keyNode = doc.DocumentNode.SelectSingleNode($"//span[contains(@class,'key') and @data-key='{dataKey}']");
        if (keyNode == null) return null;

        var td = keyNode.Ancestors("td").FirstOrDefault();
        if (td == null) return null;

        var valueNode = td.SelectSingleNode(".//span[contains(@class,'value')][1]");
        if (valueNode == null) return null;

        var text = WebUtility.HtmlDecode(valueNode.InnerText).Trim();
        text = Regex.Replace(text, @"\s+", " ");
        return string.IsNullOrWhiteSpace(text) ? null : text;
    }
}
