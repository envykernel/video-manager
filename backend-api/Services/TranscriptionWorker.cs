using System.Threading.Channels;
using BackendApi.Models;

namespace BackendApi.Services;

public record TranscriptionWorkItem(
    string VideoId,
    string TempFilePath,
    string UploadUrl,
    string? TranslateTo);

public class TranscriptionWorker : BackgroundService
{
    private readonly Channel<TranscriptionWorkItem> _queue;
    private readonly MongoDbService _db;
    private readonly TranscriptionAgentService _agentService;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<TranscriptionWorker> _logger;

    public TranscriptionWorker(
        Channel<TranscriptionWorkItem> queue,
        MongoDbService db,
        TranscriptionAgentService agentService,
        IHttpClientFactory httpClientFactory,
        ILogger<TranscriptionWorker> logger)
    {
        _queue = queue;
        _db = db;
        _agentService = agentService;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var item in _queue.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                await ProcessItemAsync(item, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Background processing failed for video {VideoId}", item.VideoId);
                await SetTranscriptionStatus(item.VideoId, "failed");
            }
        }
    }

    private async Task ProcessItemAsync(TranscriptionWorkItem item, CancellationToken ct)
    {
        // Upload to Mux
        var httpClient = _httpClientFactory.CreateClient();
        await using var fileStream = File.OpenRead(item.TempFilePath);
        var content = new StreamContent(fileStream);
        content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("video/mp4");
        var response = await httpClient.PutAsync(item.UploadUrl, content, ct);
        response.EnsureSuccessStatusCode();

        _logger.LogInformation("Video {VideoId} uploaded to Mux", item.VideoId);

        // Run transcription
        await SetTranscriptionStatus(item.VideoId, "transcribing");

        var result = await _agentService.TranscribeVideoAsync(item.TempFilePath, item.TranslateTo);

        // Save transcription result
        var video = await _db.GetByIdAsync(item.VideoId);
        if (video != null)
        {
            video.TranscriptionStatus = "completed";
            video.RawTranscription = result.RawTranscription;
            video.StructuredTranscription = result.StructuredTranscription;
            video.DetectedLanguage = result.DetectedLanguage;
            video.TranslatedTo = result.TranslatedTo;
            video.Segments = result.Segments;
            await _db.UpdateAsync(item.VideoId, video);
        }

        _logger.LogInformation("Transcription completed for video {VideoId}", item.VideoId);

        // Cleanup temp file
        if (File.Exists(item.TempFilePath)) File.Delete(item.TempFilePath);
    }

    private async Task SetTranscriptionStatus(string videoId, string status)
    {
        var video = await _db.GetByIdAsync(videoId);
        if (video != null)
        {
            video.TranscriptionStatus = status;
            await _db.UpdateAsync(videoId, video);
        }
    }
}
