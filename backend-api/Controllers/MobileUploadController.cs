using System.Security.Claims;
using BackendApi.Models;
using BackendApi.Services;
using Microsoft.AspNetCore.Authorization;
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
    [Authorize]
    public async Task<IActionResult> CreateToken()
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)!.Value;
        var limits = await _db.GetUploadLimitsAsync();

        var token = new UploadToken
        {
            Token = Guid.NewGuid().ToString("N"),
            UserId = userId,
            ExpiresAt = DateTime.UtcNow.AddMinutes(limits.QrExpirationMinutes)
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
    [AllowAnonymous]
    public async Task<IActionResult> ValidateToken(string token)
    {
        var uploadToken = await _db.GetTokenAsync(token);
        if (uploadToken is null) return NotFound(new { message = "Token expired or invalid" });

        var user = await _db.GetUserByIdAsync(uploadToken.UserId);
        return Ok(new
        {
            expiresAt = uploadToken.ExpiresAt,
            displayName = user?.DisplayName ?? "User"
        });
    }

    private static int ParseDurationSeconds(string duration)
    {
        var parts = duration.Split(':');
        if (parts.Length == 2 && int.TryParse(parts[0], out var m) && int.TryParse(parts[1], out var s))
            return m * 60 + s;
        return 0;
    }

    [HttpPost("token/{token}/upload")]
    [AllowAnonymous]
    public async Task<ActionResult<CreateUploadResponse>> Upload(
        string token, [FromBody] CreateUploadRequest request)
    {
        var uploadToken = await _db.GetTokenAsync(token);
        if (uploadToken is null) return NotFound(new { message = "Token expired or invalid" });

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
            UploadToken = token,
            UserId = uploadToken.UserId,
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
    [AllowAnonymous]
    public async Task<ActionResult<List<VideoResponse>>> GetVideosByToken(string token)
    {
        var uploadToken = await _db.GetTokenAsync(token);
        if (uploadToken is null) return NotFound(new { message = "Token expired or invalid" });

        var videos = await _db.GetVideosByTokenAsync(token);
        return videos.Select(VideoResponse.FromVideo).ToList();
    }
}
