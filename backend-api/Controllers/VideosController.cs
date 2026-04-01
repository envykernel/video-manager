using BackendApi.Models;
using BackendApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class VideosController : ControllerBase
{
    private readonly MongoDbService _db;
    private readonly MuxService _mux;

    public VideosController(MongoDbService db, MuxService mux)
    {
        _db = db;
        _mux = mux;
    }

    [HttpGet]
    public async Task<ActionResult<List<VideoResponse>>> GetAll()
    {
        var videos = await _db.GetAllAsync();
        return videos.Select(VideoResponse.FromVideo).ToList();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<VideoResponse>> GetById(string id)
    {
        var video = await _db.GetByIdAsync(id);
        if (video is null) return NotFound();
        return VideoResponse.FromVideo(video);
    }

    [HttpPost("upload")]
    public async Task<ActionResult<CreateUploadResponse>> CreateUpload(
        [FromBody] CreateUploadRequest request)
    {
        var (uploadId, uploadUrl) = await _mux.CreateDirectUploadAsync();

        var video = new Video
        {
            Name = request.Name,
            Size = request.Size,
            Duration = request.Duration,
            MuxUploadId = uploadId,
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
        if (video is null) return NotFound();

        if (!string.IsNullOrEmpty(video.MuxAssetId))
        {
            await _mux.DeleteAssetAsync(video.MuxAssetId);
        }

        await _db.DeleteAsync(id);
        return NoContent();
    }
}
