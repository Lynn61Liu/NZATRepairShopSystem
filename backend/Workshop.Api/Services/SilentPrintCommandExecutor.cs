using System.Diagnostics;
using System.Text.RegularExpressions;

namespace Workshop.Api.Services;

public sealed class SilentPrintCommandExecutor
{
    public async Task ExecuteAsync(string printerName, byte[] pdfBytes, string? documentName, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(printerName))
            throw new InvalidOperationException("Printer name is required.");
        if (pdfBytes is null || pdfBytes.Length == 0)
            throw new InvalidOperationException("PDF content is required.");

        var lpCommand = ResolvePrintCommandPath("lp")
            ?? throw new InvalidOperationException(BuildCommandUnavailableMessage("lp"));
        EnsureCupsServerSocketAvailable();

        var tempPath = Path.Combine(Path.GetTempPath(), $"silent-print-{Guid.NewGuid():N}.pdf");
        await File.WriteAllBytesAsync(tempPath, pdfBytes, ct);

        try
        {
            var resolvedPrinterName = await ResolvePrinterQueueNameAsync(printerName, ct);
            await RunProcessAsync(lpCommand, BuildArguments(resolvedPrinterName, tempPath, documentName), ct);
        }
        finally
        {
            try
            {
                if (File.Exists(tempPath))
                    File.Delete(tempPath);
            }
            catch
            {
                // Best effort cleanup only.
            }
        }
    }

    internal static string BuildArguments(string printerName, string tempPath, string? documentName)
    {
        var args = new List<string>
        {
            "-d",
            Quote(printerName),
        };

        if (!string.IsNullOrWhiteSpace(documentName))
        {
            args.Add("-t");
            args.Add(Quote(documentName.Trim()));
        }

        args.Add(Quote(tempPath));
        return string.Join(' ', args);
    }

    private static string Quote(string value) => $"\"{value.Replace("\"", "\\\"")}\"";

    private static async Task<string> ResolvePrinterQueueNameAsync(string printerName, CancellationToken ct)
    {
        var normalizedPrinterName = printerName.Trim();
        if (string.IsNullOrWhiteSpace(normalizedPrinterName))
            return printerName;

        // The route resolver stores a display label (for example, "HP"), so
        // map it to a real CUPS queue name before invoking the print command.
        foreach (var envName in GetPrinterQueueOverrideNames(normalizedPrinterName))
        {
            var envOverride = Environment.GetEnvironmentVariable(envName);
            if (!string.IsNullOrWhiteSpace(envOverride))
                return envOverride.Trim();
        }

        var lpstatCommand = ResolvePrintCommandPath("lpstat");
        var lpstatOutput = lpstatCommand is null
            ? null
            : await TryCaptureProcessOutputAsync(lpstatCommand, "-p -d", ct);
        if (string.IsNullOrWhiteSpace(lpstatOutput))
            return normalizedPrinterName;

        return TryResolvePrinterQueueNameFromLpstatOutput(normalizedPrinterName, lpstatOutput)
            ?? normalizedPrinterName;
    }

    internal static string? TryResolvePrinterQueueNameFromLpstatOutput(string printerName, string lpstatOutput)
    {
        var normalizedPrinterName = printerName.Trim();
        if (string.IsNullOrWhiteSpace(normalizedPrinterName) || string.IsNullOrWhiteSpace(lpstatOutput))
            return null;

        var normalizedToken = NormalizePrinterToken(normalizedPrinterName);
        if (string.IsNullOrWhiteSpace(normalizedToken))
            return null;

        string? defaultDestination = null;
        var printerNames = new List<string>();

        foreach (var rawLine in lpstatOutput.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (rawLine.StartsWith("system default destination:", StringComparison.OrdinalIgnoreCase))
            {
                defaultDestination = rawLine["system default destination:".Length..].Trim();
                continue;
            }

            if (rawLine.StartsWith("系统默认目的位置：", StringComparison.OrdinalIgnoreCase))
            {
                defaultDestination = rawLine["系统默认目的位置：".Length..].Trim();
                continue;
            }

            var parsedPrinterName = TryParseLpstatPrinterName(rawLine);
            if (!string.IsNullOrWhiteSpace(parsedPrinterName))
            {
                printerNames.Add(parsedPrinterName);
            }
        }

        var exactMatch = printerNames.FirstOrDefault(name =>
            name.Equals(normalizedPrinterName, StringComparison.OrdinalIgnoreCase) ||
            NormalizePrinterToken(name).Equals(normalizedToken, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(exactMatch))
            return exactMatch;

        var containsMatch = printerNames.FirstOrDefault(name =>
        {
            var normalizedQueueToken = NormalizePrinterToken(name);
            return name.Contains(normalizedPrinterName, StringComparison.OrdinalIgnoreCase) ||
                   normalizedQueueToken.Contains(normalizedToken, StringComparison.OrdinalIgnoreCase) ||
                   normalizedToken.Contains(normalizedQueueToken, StringComparison.OrdinalIgnoreCase);
        });
        if (!string.IsNullOrWhiteSpace(containsMatch))
            return containsMatch;

        if (!string.IsNullOrWhiteSpace(defaultDestination) &&
            normalizedPrinterName.Equals("HP", StringComparison.OrdinalIgnoreCase))
        {
            return defaultDestination;
        }

        return null;
    }

    private static string? TryParseLpstatPrinterName(string rawLine)
    {
        var englishMatch = Regex.Match(rawLine, @"^printer\s+(?<name>.+?)\s+is\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        if (englishMatch.Success)
            return englishMatch.Groups["name"].Value.Trim();

        var chineseMatch = Regex.Match(rawLine, @"^打印机(?<name>.+?)(?:闲置|空闲|正在|已停用|停用|禁用|启用|接受|不接受|，|\s|$)", RegexOptions.CultureInvariant);
        if (chineseMatch.Success)
            return chineseMatch.Groups["name"].Value.Trim();

        return null;
    }

    private static string NormalizePrinterToken(string value) =>
        Regex.Replace((value ?? string.Empty).ToUpperInvariant(), "[^A-Z0-9]+", "");

    private static IEnumerable<string> GetPrinterQueueOverrideNames(string printerName)
    {
        var suffix = Regex.Replace(printerName.Trim().ToUpperInvariant(), "[^A-Z0-9]+", "_");
        suffix = Regex.Replace(suffix, "_+", "_").Trim('_');
        if (!string.IsNullOrWhiteSpace(suffix))
            yield return $"SILENT_PRINT_QUEUE_{suffix}";

        if (printerName.StartsWith("HP", StringComparison.OrdinalIgnoreCase))
            yield return "SILENT_PRINT_QUEUE_HP";
        else if (printerName.StartsWith("EPSON", StringComparison.OrdinalIgnoreCase))
            yield return "SILENT_PRINT_QUEUE_EPSON";
        else if (printerName.StartsWith("BROTHER", StringComparison.OrdinalIgnoreCase))
            yield return "SILENT_PRINT_QUEUE_BROTHER";

        if (string.IsNullOrWhiteSpace(suffix))
            yield return "SILENT_PRINT_QUEUE";
    }

    internal static string? ResolvePrintCommandPath(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return null;

        if (Path.IsPathFullyQualified(fileName) || fileName.Contains(Path.DirectorySeparatorChar))
            return File.Exists(fileName) ? fileName : null;

        foreach (var candidate in EnumerateCommandCandidates(fileName))
        {
            if (File.Exists(candidate))
                return candidate;
        }

        return null;
    }

    internal static void EnsureCupsServerSocketAvailable()
    {
        var cupsServer = Environment.GetEnvironmentVariable("CUPS_SERVER")?.Trim();
        if (string.IsNullOrWhiteSpace(cupsServer) || !Path.IsPathFullyQualified(cupsServer))
            return;

        if (File.Exists(cupsServer))
            return;

        throw new InvalidOperationException(BuildMissingCupsSocketMessage(cupsServer));
    }

    private static IEnumerable<string> EnumerateCommandCandidates(string fileName)
    {
        var extensions = OperatingSystem.IsWindows()
            ? (Environment.GetEnvironmentVariable("PATHEXT") ?? ".EXE;.CMD;.BAT;.COM")
                .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            : [string.Empty];

        foreach (var directory in GetCommandSearchDirectories())
        {
            foreach (var extension in extensions)
            {
                yield return Path.Combine(directory, fileName + extension);
            }
        }
    }

    private static IEnumerable<string> GetCommandSearchDirectories()
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var pathValue = Environment.GetEnvironmentVariable("PATH");

        if (!string.IsNullOrWhiteSpace(pathValue))
        {
            foreach (var directory in pathValue.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (seen.Add(directory))
                    yield return directory;
            }
        }

        foreach (var directory in new[] { "/usr/bin", "/bin", "/usr/local/bin", "/opt/homebrew/bin" })
        {
            if (seen.Add(directory))
                yield return directory;
        }
    }

    private static async Task<string?> TryCaptureProcessOutputAsync(string fileName, string arguments, CancellationToken ct)
    {
        var psi = new ProcessStartInfo(fileName, arguments)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        try
        {
            using var process = Process.Start(psi) ?? throw new InvalidOperationException($"Failed to start '{fileName}'.");
            var stdoutTask = process.StandardOutput.ReadToEndAsync(ct);
            var stderrTask = process.StandardError.ReadToEndAsync(ct);
            await process.WaitForExitAsync(ct);
            var stdout = await stdoutTask;
            var stderr = await stderrTask;

            if (process.ExitCode != 0)
                return string.IsNullOrWhiteSpace(stdout) ? stderr : stdout;

            return string.IsNullOrWhiteSpace(stdout) ? stderr : stdout;
        }
        catch (InvalidOperationException)
        {
            return null;
        }
        catch (System.ComponentModel.Win32Exception)
        {
            return null;
        }
    }

    private static async Task RunProcessAsync(string fileName, string arguments, CancellationToken ct)
    {
        var psi = new ProcessStartInfo(fileName, arguments)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        try
        {
            using var process = Process.Start(psi) ?? throw new InvalidOperationException($"Failed to start '{fileName}'.");
            var stdoutTask = process.StandardOutput.ReadToEndAsync(ct);
            var stderrTask = process.StandardError.ReadToEndAsync(ct);
            await process.WaitForExitAsync(ct);
            var stdout = await stdoutTask;
            var stderr = await stderrTask;

            if (process.ExitCode != 0)
            {
                throw new InvalidOperationException(BuildProcessFailureMessage(fileName, process.ExitCode, stdout, stderr));
            }
        }
        catch (System.ComponentModel.Win32Exception ex)
        {
            throw new InvalidOperationException(BuildCommandUnavailableMessage(fileName), ex);
        }
    }

    internal static string BuildCommandUnavailableMessage(string fileName) =>
        $"Printing command '{fileName}' is not available in this environment. On local macOS, make sure CUPS is enabled and /usr/bin/{Path.GetFileName(fileName)} exists; in Docker, rebuild/redeploy the API image with cups-client installed.";

    internal static string BuildMissingCupsSocketMessage(string cupsServer) =>
        $"CUPS server socket '{cupsServer}' is not available. If running locally, unset CUPS_SERVER or point it to the local CUPS socket; if running in Docker, mount the host socket to this path or update CUPS_SERVER/CUPS_SOCKET_PATH.";

    internal static string BuildProcessFailureMessage(string fileName, int exitCode, string stdout, string stderr)
    {
        var detail = string.Join(
            Environment.NewLine,
            new[] { stderr?.Trim(), stdout?.Trim() }.Where(value => !string.IsNullOrWhiteSpace(value)));

        if (!string.IsNullOrWhiteSpace(detail) &&
            detail.Contains("No such file or directory", StringComparison.OrdinalIgnoreCase))
        {
            return $"Printing command '{fileName}' failed because the CUPS server socket or printer queue is not reachable. For local runs, check macOS CUPS and printer queue names; for Docker, check CUPS_SERVER/CUPS_SOCKET_PATH. {detail}";
        }

        if (string.IsNullOrWhiteSpace(detail))
            return $"Printing command '{fileName}' failed with exit code {exitCode}.";

        return $"Printing command '{fileName}' failed with exit code {exitCode}. {detail}";
    }
}