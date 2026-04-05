namespace BackendApi.Configuration;

public class AzureAIOptions
{
    public const string SectionName = "AzureAI";

    public AzureAIEndpoint Whisper { get; set; } = new();
    public AzureAIEndpoint Chat { get; set; } = new();
}

public class AzureAIEndpoint
{
    public string Endpoint { get; set; } = string.Empty;
    public string Deployment { get; set; } = string.Empty;
    public string? ApiKey { get; set; }
}

public class TranscriptionOptions
{
    public const string SectionName = "Transcription";
    public long MaxFileSizeBytes { get; set; } = 100 * 1024 * 1024;
    public string TempFilePath { get; set; } = "./temp";
    public string[] AllowedExtensions { get; set; } = [".mp4", ".mov", ".avi", ".mkv", ".webm"];
}
