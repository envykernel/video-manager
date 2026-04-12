using System.Security.Claims;
using System.Text;
using System.Threading.Channels;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.Authorization;
using BackendApi.Configuration;
using BackendApi.Models;
using BackendApi.Services;

namespace BackendApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TranscriptionController : ControllerBase
{
    private readonly Channel<TranscriptionWorkItem> _queue;
    private readonly MuxService _mux;
    private readonly MongoDbService _db;
    private readonly TranscriptionOptions _config;
    private readonly ILogger<TranscriptionController> _logger;

    public TranscriptionController(
        Channel<TranscriptionWorkItem> queue,
        MuxService mux,
        MongoDbService db,
        IOptions<TranscriptionOptions> transcriptionOptions,
        ILogger<TranscriptionController> logger)
    {
        _queue = queue;
        _mux = mux;
        _db = db;
        _config = transcriptionOptions.Value;
        _logger = logger;
    }

    private string GetUserId() =>
        User.FindFirstValue(ClaimTypes.NameIdentifier) ?? throw new UnauthorizedAccessException();

    /// <summary>
    /// List all videos with transcription for the current user.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var videos = await _db.GetTranscribedByUserAsync(GetUserId());
        return Ok(videos.Select(VideoResponse.FromVideo));
    }

    /// <summary>
    /// Upload a video: creates Mux upload, starts transcription in background, returns video ID for polling.
    /// </summary>
    [HttpPost("upload")]
    [RequestSizeLimit(100 * 1024 * 1024)]
    public async Task<IActionResult> Upload(IFormFile file, [FromQuery] string? translateTo)
    {
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!_config.AllowedExtensions.Contains(extension))
        {
            return BadRequest(new { message = $"File type '{extension}' is not supported. Allowed: {string.Join(", ", _config.AllowedExtensions)}" });
        }

        if (file.Length > _config.MaxFileSizeBytes)
        {
            return StatusCode(413, new { message = $"File size exceeds the maximum allowed size of {_config.MaxFileSizeBytes / (1024 * 1024)} MB" });
        }

        // Save file to temp
        var tempDir = Path.GetFullPath(_config.TempFilePath);
        Directory.CreateDirectory(tempDir);
        var tempFilePath = Path.Combine(tempDir, $"{Guid.NewGuid()}{extension}");

        await using (var stream = new FileStream(tempFilePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        // Create Mux upload
        var (uploadId, uploadUrl) = await _mux.CreateDirectUploadAsync();

        // Create video record in MongoDB
        var video = new Video
        {
            Name = file.FileName,
            Size = file.Length,
            Duration = "0:00",
            MuxUploadId = uploadId,
            UserId = GetUserId(),
            Status = "waiting_for_upload",
            TranscriptionStatus = "pending",
            TranslatedTo = translateTo
        };
        await _db.CreateAsync(video);

        _logger.LogInformation("Created video {VideoId} for transcription, uploading to Mux", video.Id);

        // Enqueue background work
        await _queue.Writer.WriteAsync(new TranscriptionWorkItem(
            video.Id!, tempFilePath, uploadUrl, translateTo));

        return Ok(new { videoId = video.Id });
    }

    /// <summary>
    /// Poll for video status (Mux processing + transcription).
    /// </summary>
    [HttpGet("{videoId}")]
    public async Task<IActionResult> GetStatus(string videoId)
    {
        var video = await _db.GetByIdAsync(videoId);
        if (video == null) return NotFound(new { message = "Video not found" });
        if (video.UserId != GetUserId()) return Forbid();

        return Ok(VideoResponse.FromVideo(video));
    }

    /// <summary>
    /// Serves transcription segments as WebVTT subtitles.
    /// </summary>
    [HttpGet("{videoId}/subtitles.vtt")]
    [AllowAnonymous]
    public async Task<IActionResult> GetSubtitles(string videoId)
    {
        var video = await _db.GetByIdAsync(videoId);
        if (video?.Segments == null || video.Segments.Count == 0)
            return NotFound();

        var vtt = new StringBuilder();
        vtt.AppendLine("WEBVTT");
        vtt.AppendLine();

        for (int i = 0; i < video.Segments.Count; i++)
        {
            var seg = video.Segments[i];
            vtt.AppendLine($"{i + 1}");
            vtt.AppendLine($"{FormatVttTime(seg.StartTime)} --> {FormatVttTime(seg.EndTime)}");
            vtt.AppendLine(seg.Text);
            vtt.AppendLine();
        }

        return Content(vtt.ToString(), "text/vtt", Encoding.UTF8);
    }

    private static string FormatVttTime(double seconds)
    {
        var ts = TimeSpan.FromSeconds(seconds);
        return $"{(int)ts.TotalHours:D2}:{ts.Minutes:D2}:{ts.Seconds:D2}.{ts.Milliseconds:D3}";
    }
}
