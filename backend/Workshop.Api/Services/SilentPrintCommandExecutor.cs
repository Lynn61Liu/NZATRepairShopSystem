using System.Diagnostics;

namespace Workshop.Api.Services;

public sealed class SilentPrintCommandExecutor
{
    public async Task ExecuteAsync(string printerName, byte[] pdfBytes, string? documentName, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(printerName))
            throw new InvalidOperationException("Printer name is required.");
        if (pdfBytes is null || pdfBytes.Length == 0)
            throw new InvalidOperationException("PDF content is required.");

        var tempPath = Path.Combine(Path.GetTempPath(), $"silent-print-{Guid.NewGuid():N}.pdf");
        await File.WriteAllBytesAsync(tempPath, pdfBytes, ct);

        try
        {
            await RunProcessAsync("lp", BuildArguments(printerName, tempPath, documentName), ct);
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

    private static string BuildArguments(string printerName, string tempPath, string? documentName)
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

    private static async Task RunProcessAsync(string fileName, string arguments, CancellationToken ct)
    {
        var psi = new ProcessStartInfo(fileName, arguments)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        using var process = Process.Start(psi) ?? throw new InvalidOperationException($"Failed to start '{fileName}'.");
        var stdoutTask = process.StandardOutput.ReadToEndAsync(ct);
        var stderrTask = process.StandardError.ReadToEndAsync(ct);
        await process.WaitForExitAsync(ct);
        var stdout = await stdoutTask;
        var stderr = await stderrTask;

        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"Printing command '{fileName}' failed with exit code {process.ExitCode}. {stderr}{stdout}");
        }
    }
}
