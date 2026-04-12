using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BackendApi.Models;
using BackendApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class WebhooksController : ControllerBase
{
    private readonly MongoDbService _db;
    private readonly ILogger<WebhooksController> _logger;
    private readonly IConfiguration _configuration;

    public WebhooksController(MongoDbService db, ILogger<WebhooksController> logger, IConfiguration configuration)
    {
        _db = db;
        _logger = logger;
        _configuration = configuration;
    }

    [HttpPost("mux")]
    public async Task<IActionResult> MuxWebhook()
    {
        var webhookSecret = _configuration["Mux:WebhookSecret"];
        if (string.IsNullOrEmpty(webhookSecret))
        {
            _logger.LogError("Mux:WebhookSecret is not configured");
            return StatusCode(500);
        }

        Request.EnableBuffering();
        string rawBody;
        using (var reader = new StreamReader(Request.Body, Encoding.UTF8, leaveOpen: true))
        {
            rawBody = await reader.ReadToEndAsync();
        }
        Request.Body.Position = 0;

        if (!Request.Headers.TryGetValue("mux-signature", out var signatureHeader) ||
            string.IsNullOrEmpty(signatureHeader))
        {
            _logger.LogWarning("Mux webhook rejected: missing mux-signature header");
            return Unauthorized();
        }

        var headerValue = signatureHeader.ToString();
        string? timestamp = null;
        string? receivedSignature = null;

        foreach (var part in headerValue.Split(','))
        {
            var kv = part.Split('=', 2);
            if (kv.Length != 2) continue;
            if (kv[0] == "t") timestamp = kv[1];
            else if (kv[0] == "v1") receivedSignature = kv[1];
        }

        if (string.IsNullOrEmpty(timestamp) || string.IsNullOrEmpty(receivedSignature))
        {
            _logger.LogWarning("Mux webhook rejected: malformed mux-signature header");
            return Unauthorized();
        }

        var signingPayload = Encoding.UTF8.GetBytes($"{timestamp}.{rawBody}");
        var keyBytes = Encoding.UTF8.GetBytes(webhookSecret);
        var expectedHashBytes = HMACSHA256.HashData(keyBytes, signingPayload);
        var expectedSignature = Convert.ToHexString(expectedHashBytes).ToLowerInvariant();

        var expectedBytes = Encoding.UTF8.GetBytes(expectedSignature);
        var receivedBytes = Encoding.UTF8.GetBytes(receivedSignature);

        if (expectedBytes.Length != receivedBytes.Length ||
            !CryptographicOperations.FixedTimeEquals(expectedBytes, receivedBytes))
        {
            _logger.LogWarning("Mux webhook rejected: invalid signature");
            return Unauthorized();
        }

        MuxWebhookPayload payload;
        try
        {
            payload = JsonSerializer.Deserialize<MuxWebhookPayload>(rawBody)
                ?? throw new JsonException("Null payload");
        }
        catch (JsonException ex)
        {
            _logger.LogWarning("Mux webhook rejected: invalid JSON body — {Message}", ex.Message);
            return BadRequest();
        }

        _logger.LogInformation("Mux webhook received: {Type}", payload.Type);

        switch (payload.Type)
        {
            case "video.upload.asset_created":
                await HandleUploadAssetCreated(payload.Data);
                break;

            case "video.asset.ready":
                await HandleAssetReady(payload.Data);
                break;

            case "video.asset.errored":
                await HandleAssetErrored(payload.Data);
                break;
        }

        return Ok();
    }

    private async Task HandleUploadAssetCreated(MuxWebhookData data)
    {
        if (string.IsNullOrEmpty(data.AssetId)) return;

        var video = await _db.GetByMuxUploadIdAsync(data.Id);
        if (video is null)
        {
            _logger.LogWarning("No video found for upload {UploadId}", data.Id);
            return;
        }

        video.MuxAssetId = data.AssetId;
        video.Status = "processing";
        await _db.UpdateAsync(video.Id!, video);

        _logger.LogInformation("Asset {AssetId} linked to video {VideoId}", data.AssetId, video.Id);
    }

    private async Task HandleAssetReady(MuxWebhookData data)
    {
        var video = await _db.GetByMuxAssetIdAsync(data.Id);
        if (video is null)
        {
            _logger.LogWarning("No video found for asset {AssetId}", data.Id);
            return;
        }

        video.Status = "ready";
        if (data.PlaybackIds?.Count > 0)
        {
            video.MuxPlaybackId = data.PlaybackIds[0].Id;
        }
        await _db.UpdateAsync(video.Id!, video);

        _logger.LogInformation("Video {VideoId} is ready with playback ID {PlaybackId}",
            video.Id, video.MuxPlaybackId);
    }

    private async Task HandleAssetErrored(MuxWebhookData data)
    {
        var video = await _db.GetByMuxAssetIdAsync(data.Id);
        if (video is null) return;

        video.Status = "errored";
        await _db.UpdateAsync(video.Id!, video);

        _logger.LogError("Video {VideoId} asset errored", video.Id);
    }
}
