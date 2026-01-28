// Program.cs
// 用法：dotnet run -- MHD855
// 功能：打开 https://www.carjam.co.nz/car/?plate=<PLATE> ，等待页面加载完成，输出最终 HTML（或保存到文件）

using System;
using System.IO;
using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using HtmlAgilityPack;
using Microsoft.Extensions.Configuration;
using Microsoft.Playwright;
using Npgsql;

class Program
{
    static async Task<int> Main(string[] args)
    {
        var plate = args.Length > 0 ? args[0].Trim().ToUpperInvariant() : "";
        if (string.IsNullOrWhiteSpace(plate))
        {
            Console.Error.WriteLine("Usage: dotnet run -- <PLATE>  (e.g. dotnet run -- MHD855)");
            return 1;
        }

        // 基础校验（可按需放宽）
        if (!Regex.IsMatch(plate, "^[A-Z0-9]{1,8}$"))
        {
            Console.Error.WriteLine("Invalid plate format.");
            return 2;
        }

        var url = $"https://www.carjam.co.nz/car/?plate={Uri.EscapeDataString(plate)}";

        using var playwright = await Playwright.CreateAsync();
        await using var browser = await playwright.Chromium.LaunchAsync(new BrowserTypeLaunchOptions
        {
            Headless = true
        });

        var context = await browser.NewContextAsync(new BrowserNewContextOptions
        {
            // 可选：更像真实浏览器
            ViewportSize = new ViewportSize { Width = 1280, Height = 720 },
            Locale = "en-NZ",
            UserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
        });

        var page = await context.NewPageAsync();

        // 1) 先等到 network idle（大部分资源加载完成）
        await page.GotoAsync(url, new PageGotoOptions
        {
            WaitUntil = WaitUntilState.NetworkIdle,
            Timeout = 60000
        });

        // 2) 再等关键对象出现（确保异步注入完成）
        //    注意：如果 Carjam 对某些字段需要付费/登录，window.report.idh.vehicle 仍会存在，但部分字段可能缺失
        await page.WaitForFunctionAsync(
            "() => window.report && window.report.idh && window.report.idh.vehicle && window.report.idh.vehicle.plate",
            null,
            new PageWaitForFunctionOptions { Timeout = 60000 }
        );

        // 3) 拿“加载后的最终 HTML”（DOM 运行后的）
        var html = await page.ContentAsync();

        //4 提取 window JSON（页面脚本里）
        // 注意：Carjam 不是把 window.report 写成一个大 JSON，而是分段赋值，所以我们按段提取
        var vehicleJson = ExtractWindowAssignmentJson(html, "window.report.idh.vehicle");               // {...}
        var odoHistoryJson = ExtractWindowAssignmentJson(html, "window.report.idh.odometer_history");   // [...]
        var jphJson = ExtractWindowAssignmentJson(html, "window.jph_search");                           // {...}

        using var vehicleDoc = !string.IsNullOrWhiteSpace(vehicleJson) ? JsonDocument.Parse(vehicleJson) : null;
        using var jphDoc = !string.IsNullOrWhiteSpace(jphJson) ? JsonDocument.Parse(jphJson) : null;
        using var odoDoc = !string.IsNullOrWhiteSpace(odoHistoryJson) ? JsonDocument.Parse(odoHistoryJson) : null;

        // 4) HTML(data-key) 解析
        var htmlDoc = new HtmlDocument();
        htmlDoc.LoadHtml(html);

        var plateFromData = GetString(vehicleDoc?.RootElement, "plate") ?? GetDataKeyValue(htmlDoc, "plate");
        var plateFinal = string.IsNullOrWhiteSpace(plateFromData) ? plate : plateFromData!;
        if (string.IsNullOrWhiteSpace(plateFinal))
        {
            Console.Error.WriteLine("plate not found in window.report.idh.vehicle nor HTML data-key.");
            return 3;
        }

        // ----- 映射：DB 字段 -> 来源（优先 window JSON，其次 data-key，其次 jph_search） -----
        string? make = GetString(vehicleDoc?.RootElement, "make") ?? GetDataKeyValue(htmlDoc, "make");
        string? model = GetString(vehicleDoc?.RootElement, "model")
                       ?? GetDataKeyValue(htmlDoc, "model")
                       ?? GetString(jphDoc?.RootElement, "cars", 0, "model"); // jph_search.cars[0].model

        int? year = GetInt(vehicleDoc?.RootElement, "year_of_manufacture") ?? ParseIntLoose(GetDataKeyValue(htmlDoc, "year_of_manufacture"));
        string? vin = GetString(vehicleDoc?.RootElement, "vin") ?? GetDataKeyValue(htmlDoc, "vin");

        // engine: 尽量从 jph_search.cars[0].engine 取（如果存在）
        string? engine = GetString(jphDoc?.RootElement, "cars", 0, "engine");

        // rego_expiry / wof_expiry：你这份快照大概率是占位，先按 HTML data-key 尝试（取不到就 NULL）
        DateTime? regoExpiry = ParseDateNZStyle(GetDataKeyValue(htmlDoc, "licence_expiry")); // 如果页面真有日期，会在 value
        DateTime? wofExpiry = ParseDateNZStyle(GetDataKeyValue(htmlDoc, "expiry_date_of_last_successful_wof")); // 若页面存在该 data-key

        string? colour = GetDataKeyValue(htmlDoc, "main_colour");
        string? bodyStyle = GetDataKeyValue(htmlDoc, "body_style");
        string? engineNo = GetDataKeyValue(htmlDoc, "engine_number");
        string? chassis = GetString(vehicleDoc?.RootElement, "chassis") ?? GetDataKeyValue(htmlDoc, "chassis");

        int? ccRating = ParseCcToInt(GetDataKeyValue(htmlDoc, "cc_rating"));
        string? fuelType = GetDataKeyValue(htmlDoc, "fuel_type");
        int? seats = ParseIntLoose(GetDataKeyValue(htmlDoc, "no_of_seats"));

        string? countryOfOrigin = GetDataKeyValue(htmlDoc, "country_of_origin");
        int? grossVehicleMass = ParseKgToInt(GetDataKeyValue(htmlDoc, "gross_vehicle_mass"));

        string? refrigerant = GetDataKeyValue(htmlDoc, "synthetic_greenhouse_gas");
        decimal? fuelTankLitres = ParseDecimalLoose(GetDataKeyValue(htmlDoc, "fuel_tank_capacity_litres"));
        decimal? fullCombinedRangeKm = ParseDecimalLoose(GetDataKeyValue(htmlDoc, "full_combined_range_km"));

        // odometer：优先 window.report.idh.odometer_history 最新一条
        int? odometer = ExtractLatestOdometer(odoDoc?.RootElement);

        DateTime? nzFirstRegistration = ParseDateNZStyle(GetDataKeyValue(htmlDoc, "date_of_first_registration_in_nz"));

        // raw_json：建议保存关键原始对象，便于回溯
        var rawJson = BuildRawJson(
            plateFinal,
            vehicleDoc?.RootElement,
            odoDoc?.RootElement,
            jphDoc?.RootElement
        );

        // 5) UPSERT 到 PostgreSQL
        var config = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: true, reloadOnChange: false)
            .AddUserSecrets<Program>(optional: true)
            .AddEnvironmentVariables()
            .Build();

        var connStr = config.GetConnectionString("Carjam");
        if (string.IsNullOrWhiteSpace(connStr))
        {
            Console.Error.WriteLine("Missing connection string. Set ConnectionStrings:Carjam in appsettings.json or user-secrets.");
            return 4;
        }
        using var conn = new NpgsqlConnection(connStr);
        conn.Open();

        var sql = @"
INSERT INTO vehicles
(
  plate, make, model, year, vin, engine, rego_expiry, colour, body_style, engine_no, chassis,
  cc_rating, fuel_type, seats, country_of_origin, gross_vehicle_mass, refrigerant,
  fuel_tank_capacity_litres, full_combined_range_km, wof_expiry, odometer, nz_first_registration,
  raw_json, updated_at
)
VALUES
(
  @plate, @make, @model, @year, @vin, @engine, @rego_expiry, @colour, @body_style, @engine_no, @chassis,
  @cc_rating, @fuel_type, @seats, @country_of_origin, @gross_vehicle_mass, @refrigerant,
  @fuel_tank_capacity_litres, @full_combined_range_km, @wof_expiry, @odometer, @nz_first_registration,
  @raw_json::jsonb, now()
)
ON CONFLICT (plate)
DO UPDATE SET
  make = EXCLUDED.make,
  model = EXCLUDED.model,
  year = EXCLUDED.year,
  vin = EXCLUDED.vin,
  engine = EXCLUDED.engine,
  rego_expiry = EXCLUDED.rego_expiry,
  colour = EXCLUDED.colour,
  body_style = EXCLUDED.body_style,
  engine_no = EXCLUDED.engine_no,
  chassis = EXCLUDED.chassis,
  cc_rating = EXCLUDED.cc_rating,
  fuel_type = EXCLUDED.fuel_type,
  seats = EXCLUDED.seats,
  country_of_origin = EXCLUDED.country_of_origin,
  gross_vehicle_mass = EXCLUDED.gross_vehicle_mass,
  refrigerant = EXCLUDED.refrigerant,
  fuel_tank_capacity_litres = EXCLUDED.fuel_tank_capacity_litres,
  full_combined_range_km = EXCLUDED.full_combined_range_km,
  wof_expiry = EXCLUDED.wof_expiry,
  odometer = EXCLUDED.odometer,
  nz_first_registration = EXCLUDED.nz_first_registration,
  raw_json = EXCLUDED.raw_json,
  updated_at = now();
";

        using var cmd = new NpgsqlCommand(sql, conn);

        cmd.Parameters.AddWithValue("plate", plateFinal);
        cmd.Parameters.AddWithValue("make", (object?)make ?? DBNull.Value);
        cmd.Parameters.AddWithValue("model", (object?)model ?? DBNull.Value);
        cmd.Parameters.AddWithValue("year", (object?)year ?? DBNull.Value);
        cmd.Parameters.AddWithValue("vin", (object?)vin ?? DBNull.Value);
        cmd.Parameters.AddWithValue("engine", (object?)engine ?? DBNull.Value);
        cmd.Parameters.AddWithValue("engine_no", (object?)engineNo ?? DBNull.Value);
        cmd.Parameters.AddWithValue("rego_expiry", (object?)regoExpiry ?? DBNull.Value);
        cmd.Parameters.AddWithValue("colour", (object?)colour ?? DBNull.Value);
        cmd.Parameters.AddWithValue("body_style", (object?)bodyStyle ?? DBNull.Value);
        cmd.Parameters.AddWithValue("chassis", (object?)chassis ?? DBNull.Value);
        cmd.Parameters.AddWithValue("cc_rating", (object?)ccRating ?? DBNull.Value);
        cmd.Parameters.AddWithValue("fuel_type", (object?)fuelType ?? DBNull.Value);
        cmd.Parameters.AddWithValue("seats", (object?)seats ?? DBNull.Value);
        cmd.Parameters.AddWithValue("country_of_origin", (object?)countryOfOrigin ?? DBNull.Value);
        cmd.Parameters.AddWithValue("gross_vehicle_mass", (object?)grossVehicleMass ?? DBNull.Value);
        cmd.Parameters.AddWithValue("refrigerant", (object?)refrigerant ?? DBNull.Value);
        cmd.Parameters.AddWithValue("fuel_tank_capacity_litres", (object?)fuelTankLitres ?? DBNull.Value);
        cmd.Parameters.AddWithValue("full_combined_range_km", (object?)fullCombinedRangeKm ?? DBNull.Value);
        cmd.Parameters.AddWithValue("wof_expiry", (object?)wofExpiry ?? DBNull.Value);
        cmd.Parameters.AddWithValue("odometer", (object?)odometer ?? DBNull.Value);
        cmd.Parameters.AddWithValue("nz_first_registration", (object?)nzFirstRegistration ?? DBNull.Value);
        cmd.Parameters.AddWithValue("raw_json", rawJson);

        var affected = cmd.ExecuteNonQuery();

        Console.WriteLine($"**********Upserted vehicle plate={plateFinal}, rows affected={affected}");
        Console.WriteLine($"*******make={make}, model={model}, year={year}, vin={vin}, odometer={odometer}");
        return 0;
    }

    // ----------------- JSON 提取：window.xxx = {...}; 或 window.xxx = [...]; -----------------
    static string? ExtractWindowAssignmentJson(string html, string varPath)
    {

        var pattern = Regex.Escape(varPath) + @"\s*=\s*(\{.*?\}|\[.*?\])\s*;";
        var m = Regex.Match(html, pattern, RegexOptions.Singleline);
        return m.Success ? m.Groups[1].Value : null;
    }

    // ----------------- JSON 安全读取 -----------------
    static string? GetString(JsonElement? obj, string name)
    {
        if (obj is null) return null;
        if (obj.Value.ValueKind != JsonValueKind.Object) return null;
        if (!obj.Value.TryGetProperty(name, out var p)) return null;
        if (p.ValueKind == JsonValueKind.String) return p.GetString();
        // 有时数字也能转 string
        if (p.ValueKind == JsonValueKind.Number) return p.ToString();
        return null;
    }

    static int? GetInt(JsonElement? obj, string name)
    {
        if (obj is null) return null;
        if (obj.Value.ValueKind != JsonValueKind.Object) return null;
        if (!obj.Value.TryGetProperty(name, out var p)) return null;

        if (p.ValueKind == JsonValueKind.Number && p.TryGetInt32(out var n)) return n;
        if (p.ValueKind == JsonValueKind.String && int.TryParse(p.GetString(), out var s)) return s;
        return null;
    }

    static string? GetString(JsonElement? root, string arrayName, int index, string prop)
    {
        if (root is null) return null;
        if (root.Value.ValueKind != JsonValueKind.Object) return null;
        if (!root.Value.TryGetProperty(arrayName, out var arr)) return null;
        if (arr.ValueKind != JsonValueKind.Array) return null;
        if (arr.GetArrayLength() <= index) return null;
        var item = arr[index];
        if (item.ValueKind != JsonValueKind.Object) return null;
        if (!item.TryGetProperty(prop, out var p)) return null;
        if (p.ValueKind == JsonValueKind.String) return p.GetString();
        return p.ToString();
    }

    // ----------------- HTML data-key value 提取 -----------------
    static string? GetDataKeyValue(HtmlDocument doc, string dataKey)
    {
        // 选择：<span class="key" data-key="X">... </span> 后面的同级 <span class="value">...</span>
        var keyNode = doc.DocumentNode.SelectSingleNode($"//span[contains(@class,'key') and @data-key='{dataKey}']");
        if (keyNode == null) return null;

        // 找到同一个 td 下的第一个 value span
        var td = keyNode.Ancestors("td").FirstOrDefault();
        if (td == null) return null;

        var valueNode = td.SelectSingleNode(".//span[contains(@class,'value')][1]");
        if (valueNode == null) return null;

        var text = WebUtility.HtmlDecode(valueNode.InnerText).Trim();
        text = Regex.Replace(text, @"\s+", " "); // 压缩空白
        return string.IsNullOrWhiteSpace(text) ? null : text;
    }

    // ----------------- 转换 helpers -----------------
    static int? ParseIntLoose(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        var digits = Regex.Replace(s, @"[^\d\-]", "");
        return int.TryParse(digits, out var n) ? n : null;
    }

    static int? ParseCcToInt(string? s)
    {
        // "1,198cc (1.2l)" -> 1198
        if (string.IsNullOrWhiteSpace(s)) return null;
        var m = Regex.Match(s, @"([\d,]+)\s*cc", RegexOptions.IgnoreCase);
        if (!m.Success) return ParseIntLoose(s);
        var raw = m.Groups[1].Value.Replace(",", "");
        return int.TryParse(raw, out var n) ? n : null;
    }

    static int? ParseKgToInt(string? s)
    {
        // "1,365kg" -> 1365
        if (string.IsNullOrWhiteSpace(s)) return null;
        var m = Regex.Match(s, @"([\d,]+)\s*kg", RegexOptions.IgnoreCase);
        if (!m.Success) return ParseIntLoose(s);
        var raw = m.Groups[1].Value.Replace(",", "");
        return int.TryParse(raw, out var n) ? n : null;
    }

    static decimal? ParseDecimalLoose(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        // "~41 litres" / "~804km" -> 41 / 804
        var m = Regex.Match(s, @"-?[\d]+(\.[\d]+)?");
        if (!m.Success) return null;
        return decimal.TryParse(m.Value, NumberStyles.Number, CultureInfo.InvariantCulture, out var d) ? d : null;
    }

    static DateTime? ParseDateNZStyle(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;

        // 常见：30-Apr-2022 / 2022-Feb-03 / 2012-12（月份精度）等
        var formats = new[]
        {
            "dd-MMM-yyyy",
            "yyyy-MMM-dd",
            "yyyy-MM-dd",
            "yyyy-MM",
            "dd/MM/yyyy",
            "yyyy/MM/dd"
        };

        if (DateTime.TryParseExact(s.Trim(), formats, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var dt))
            return dt.Date;

        // 兜底：TryParse
        if (DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out dt))
            return dt.Date;

        return null;
    }

    static int? ExtractLatestOdometer(JsonElement? odoRoot)
    {
        if (odoRoot is null) return null;
        if (odoRoot.Value.ValueKind != JsonValueKind.Array) return null;

        long bestDate = long.MinValue;
        string? bestReading = null;

        foreach (var item in odoRoot.Value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) continue;

            long date = 0;
            if (item.TryGetProperty("odometer_date", out var d))
            {
                if (d.ValueKind == JsonValueKind.Number && d.TryGetInt64(out var dn)) date = dn;
                else if (d.ValueKind == JsonValueKind.String && long.TryParse(d.GetString(), out var ds)) date = ds;
            }

            string? reading = null;
            if (item.TryGetProperty("odometer_reading", out var r))
            {
                reading = r.ValueKind == JsonValueKind.String ? r.GetString() : r.ToString();
            }

            if (date > bestDate && !string.IsNullOrWhiteSpace(reading))
            {
                bestDate = date;
                bestReading = reading;
            }
        }

        return ParseIntLoose(bestReading);
    }

    static string BuildRawJson(string plate, JsonElement? vehicle, JsonElement? odos, JsonElement? jph)
    {
        var obj = new Dictionary<string, object?>()
        {
            ["plate"] = plate,
            ["idh_vehicle"] = vehicle?.Clone(),
            ["odometer_history"] = odos?.Clone(),
            ["jph_search"] = jph?.Clone(),
        };

        return JsonSerializer.Serialize(obj, new JsonSerializerOptions { WriteIndented = false });



        // // 你可以选择：打印到控制台（可能很长），或保存文件
        // var outPath = Path.Combine(Directory.GetCurrentDirectory(), $"carjam_{plate}.html");
        // await File.WriteAllTextAsync(outPath, finalHtml);

        // Console.WriteLine(outPath); // 输出保存路径
        // return 0;
    }
}
