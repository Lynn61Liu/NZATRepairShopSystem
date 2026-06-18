using System.Globalization;
using Workshop.Api.Models;

namespace Workshop.Api.Services;

public sealed class CourtesyCarAgreementStorageService
{
    private readonly IWebHostEnvironment _environment;

    public CourtesyCarAgreementStorageService(IWebHostEnvironment environment)
    {
        _environment = environment;
    }

    public string GetAttachmentDirectory(long agreementId)
    {
        var dir = Path.Combine(_environment.ContentRootPath, "App_Data", "courtesy-car-agreements", agreementId.ToString(CultureInfo.InvariantCulture));
        Directory.CreateDirectory(dir);
        return dir;
    }

    public string GetPdfDirectory(long agreementId)
    {
        var dir = Path.Combine(GetAttachmentDirectory(agreementId), "pdf");
        Directory.CreateDirectory(dir);
        return dir;
    }

    public async Task<CourtesyCarAgreementAttachment> SaveAttachmentAsync(
        long agreementId,
        string kind,
        IFormFile file,
        CancellationToken ct)
    {
        if (file.Length <= 0)
            throw new InvalidOperationException("Attachment file is empty.");

        var attachmentId = Guid.NewGuid().ToString("N");
        var safeName = SanitizeFileName(file.FileName);
        var extension = Path.GetExtension(safeName);
        var fileName = $"{attachmentId}_{safeName}";
        var storagePath = Path.Combine(GetAttachmentDirectory(agreementId), fileName);

        await using (var stream = new FileStream(storagePath, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            await file.CopyToAsync(stream, ct);
        }

        return new CourtesyCarAgreementAttachment
        {
            Id = attachmentId,
            Kind = NormalizeKind(kind),
            Name = string.IsNullOrWhiteSpace(file.FileName) ? fileName : file.FileName.Trim(),
            MimeType = string.IsNullOrWhiteSpace(file.ContentType) ? GuessMimeType(extension) : file.ContentType.Trim(),
            Size = file.Length,
            StoragePath = storagePath,
            CreatedAt = DateTime.UtcNow,
        };
    }

    public async Task<CourtesyCarAgreementAttachment> SaveAttachmentBytesAsync(
        long agreementId,
        string kind,
        string fileName,
        string mimeType,
        byte[] bytes,
        CancellationToken ct)
    {
        var attachmentId = Guid.NewGuid().ToString("N");
        var safeName = SanitizeFileName(fileName);
        var storagePath = Path.Combine(GetAttachmentDirectory(agreementId), $"{attachmentId}_{safeName}");
        await File.WriteAllBytesAsync(storagePath, bytes, ct);

        return new CourtesyCarAgreementAttachment
        {
            Id = attachmentId,
            Kind = NormalizeKind(kind),
            Name = string.IsNullOrWhiteSpace(fileName) ? safeName : fileName.Trim(),
            MimeType = string.IsNullOrWhiteSpace(mimeType) ? GuessMimeType(Path.GetExtension(safeName)) : mimeType.Trim(),
            Size = bytes.LongLength,
            StoragePath = storagePath,
            CreatedAt = DateTime.UtcNow,
        };
    }

    public Task<byte[]?> ReadBytesAsync(CourtesyCarAgreementAttachment attachment, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(attachment.StoragePath) || !File.Exists(attachment.StoragePath))
            return Task.FromResult<byte[]?>(null);

        return Task.FromResult<byte[]?>(File.ReadAllBytes(attachment.StoragePath));
    }

    public async Task<string> SavePdfAsync(long agreementId, byte[] pdfBytes, string fileName, CancellationToken ct)
    {
        var safeName = SanitizeFileName(fileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) ? fileName : $"{fileName}.pdf");
        var storagePath = Path.Combine(GetPdfDirectory(agreementId), $"{Guid.NewGuid():N}_{safeName}");
        await File.WriteAllBytesAsync(storagePath, pdfBytes, ct);
        return storagePath;
    }

    public void DeleteAgreementDirectory(long agreementId)
    {
        var dir = Path.Combine(
            _environment.ContentRootPath,
            "App_Data",
            "courtesy-car-agreements",
            agreementId.ToString(CultureInfo.InvariantCulture));

        if (Directory.Exists(dir))
            Directory.Delete(dir, recursive: true);
    }

    private static string NormalizeKind(string kind)
        => string.IsNullOrWhiteSpace(kind) ? "file" : kind.Trim().ToLowerInvariant();

    private static string SanitizeFileName(string fileName)
    {
        var raw = string.IsNullOrWhiteSpace(fileName) ? "attachment" : fileName.Trim();
        var invalid = Path.GetInvalidFileNameChars();
        var cleaned = new string(raw.Select(ch => invalid.Contains(ch) ? '_' : ch).ToArray());
        return string.IsNullOrWhiteSpace(cleaned) ? "attachment" : cleaned;
    }

    private static string GuessMimeType(string? extension) =>
        extension?.ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".pdf" => "application/pdf",
            _ => "application/octet-stream",
        };
}
