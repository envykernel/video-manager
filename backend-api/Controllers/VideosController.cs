using System.Security.Claims;
using BackendApi.Models;
using BackendApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class VideosController : ControllerBase
{
    private readonly MongoDbService _db;
    private readonly MuxService _mux;

    public VideosController(MongoDbService db, MuxService mux)
    {
        _db = db;
        _mux = mux;
    }

    private string GetUserId() => User.FindFirst(ClaimTypes.NameIdentifier)!.Value;

    [HttpGet]
    public async Task<ActionResult<List<VideoResponse>>> GetAll()
    {
        var videos = await _db.GetAllByUserAsync(GetUserId());
        return videos.Select(VideoResponse.FromVideo).ToList();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<VideoResponse>> GetById(string id)
    {
        var video = await _db.GetByIdAsync(id);
        if (video is null || video.UserId != GetUserId()) return NotFound();
        return VideoResponse.FromVideo(video);
    }

    private static int ParseDurationSeconds(string duration)
    {
        var parts = duration.Split(':');
        if (parts.Length == 2 && int.TryParse(parts[0], out var m) && int.TryParse(parts[1], out var s))
            return m * 60 + s;
        return 0;
    }

    [HttpPost("upload")]
    public async Task<ActionResult<CreateUploadResponse>> CreateUpload(
        [FromBody] CreateUploadRequest request)
    {
        var limits = await _db.GetUploadLimitsAsync();

        if (request.Size > limits.MaxFileSizeBytes)
            return BadRequest(new { message = $"File size exceeds the {limits.MaxFileSizeBytes / (1024 * 1024)} MB limit." });

        if (ParseDurationSeconds(request.Duration) > limits.MaxDurationSeconds)
            return BadRequest(new { message = $"Video duration exceeds the {limits.MaxDurationSeconds} second limit." });

        var (uploadId, uploadUrl) = await _mux.CreateDirectUploadAsync();

        var video = new Video
        {
            Name = request.Name,
            Size = request.Size,
            Duration = request.Duration,
            MuxUploadId = uploadId,
            UserId = GetUserId(),
            Status = "waiting_for_upload"
        };

        await _db.CreateAsync(video);

        return Ok(new CreateUploadResponse
        {
            VideoId = video.Id!,
            UploadUrl = uploadUrl
        });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var video = await _db.GetByIdAsync(id);
        if (video is null || video.UserId != GetUserId()) return NotFound();

        if (!string.IsNullOrEmpty(video.MuxAssetId))
        {
            await _mux.DeleteAssetAsync(video.MuxAssetId);
        }

        await _db.DeleteAsync(id);
        return NoContent();
    }
}
