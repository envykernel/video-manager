using BackendApi.Models;
using BackendApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers;

[ApiController]
[Route("api/mobile-upload")]
public class MobileUploadController : ControllerBase
{
    private readonly MongoDbService _db;
    private readonly MuxService _mux;
    private readonly IConfiguration _configuration;

    public MobileUploadController(MongoDbService db, MuxService mux, IConfiguration configuration)
    {
        _db = db;
        _mux = mux;
        _configuration = configuration;
    }

    [HttpPost("token")]
    public async Task<IActionResult> CreateToken()
    {
        var token = new UploadToken
        {
            Token = Guid.NewGuid().ToString("N"),
            ExpiresAt = DateTime.UtcNow.AddMinutes(30)
        };

        await _db.CreateTokenAsync(token);

        var baseUrl = _configuration["App:BaseUrl"] ?? "http://localhost:5173";
        var mobileUrl = $"{baseUrl}/mobile-upload/{token.Token}";

        return Ok(new
        {
            token = token.Token,
            mobileUrl,
            expiresAt = token.ExpiresAt
        });
    }

    [HttpGet("token/{token}/validate")]
    public async Task<IActionResult> ValidateToken(string token)
    {
        var uploadToken = await _db.GetTokenAsync(token);
        if (uploadToken is null) return NotFound(new { message = "Token expired or invalid" });
        return Ok(new { expiresAt = uploadToken.ExpiresAt });
    }

    [HttpPost("token/{token}/upload")]
    public async Task<ActionResult<CreateUploadResponse>> Upload(
        string token, [FromBody] CreateUploadRequest request)
    {
        var uploadToken = await _db.GetTokenAsync(token);
        if (uploadToken is null) return NotFound(new { message = "Token expired or invalid" });

        var (uploadId, uploadUrl) = await _mux.CreateDirectUploadAsync();

        var video = new Video
        {
            Name = request.Name,
            Size = request.Size,
            Duration = request.Duration,
            MuxUploadId = uploadId,
            UploadToken = token,
            Status = "waiting_for_upload"
        };

        await _db.CreateAsync(video);

        return Ok(new CreateUploadResponse
        {
            VideoId = video.Id!,
            UploadUrl = uploadUrl
        });
    }

    [HttpGet("token/{token}/videos")]
    public async Task<ActionResult<List<VideoResponse>>> GetVideosByToken(string token)
    {
        var uploadToken = await _db.GetTokenAsync(token);
        if (uploadToken is null) return NotFound(new { message = "Token expired or invalid" });

        var videos = await _db.GetVideosByTokenAsync(token);
        return videos.Select(VideoResponse.FromVideo).ToList();
    }
}
