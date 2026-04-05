using Azure;
using Azure.AI.OpenAI;
using Azure.Identity;
using Microsoft.Extensions.Options;
using OpenAI.Audio;
using BackendApi.Configuration;
using BackendApi.Models;

namespace BackendApi.Services;

public class WhisperResult
{
    public string Text { get; set; } = string.Empty;
    public string Language { get; set; } = "unknown";
    public List<TranscriptionSegment> Segments { get; set; } = new();
}

public class WhisperService
{
    private readonly AudioClient _audioClient;
    private readonly ILogger<WhisperService> _logger;

    public WhisperService(IOptions<AzureAIOptions> options, ILogger<WhisperService> logger)
    {
        _logger = logger;
        var whisper = options.Value.Whisper;

        AzureOpenAIClient azureClient = string.IsNullOrEmpty(whisper.ApiKey)
            ? new AzureOpenAIClient(new Uri(whisper.Endpoint), new DefaultAzureCredential())
            : new AzureOpenAIClient(new Uri(whisper.Endpoint), new AzureKeyCredential(whisper.ApiKey));

        _audioClient = azureClient.GetAudioClient(whisper.Deployment);
    }

    public async Task<WhisperResult> TranscribeAsync(string audioFilePath)
    {
        _logger.LogInformation("Transcribing audio file: {AudioPath} (auto-detect language)", audioFilePath);

        var transcriptionOptions = new AudioTranscriptionOptions
        {
            ResponseFormat = AudioTranscriptionFormat.Verbose,
            TimestampGranularities = AudioTimestampGranularities.Segment
        };

        await using var audioStream = File.OpenRead(audioFilePath);
        var result = await _audioClient.TranscribeAudioAsync(audioStream, Path.GetFileName(audioFilePath), transcriptionOptions);

        var transcription = result.Value;
        var detectedLanguage = transcription.Language ?? "unknown";

        var segments = new List<TranscriptionSegment>();
        if (transcription.Segments != null)
        {
            foreach (var seg in transcription.Segments)
            {
                segments.Add(new TranscriptionSegment
                {
                    StartTime = seg.StartTime.TotalSeconds,
                    EndTime = seg.EndTime.TotalSeconds,
                    Text = seg.Text?.Trim() ?? string.Empty
                });
            }
        }

        _logger.LogInformation("Transcription completed. Language: {Language}, Segments: {Count}, Length: {Length} chars",
            detectedLanguage, segments.Count, transcription.Text?.Length ?? 0);

        return new WhisperResult
        {
            Text = transcription.Text ?? string.Empty,
            Language = detectedLanguage,
            Segments = segments
        };
    }
}
