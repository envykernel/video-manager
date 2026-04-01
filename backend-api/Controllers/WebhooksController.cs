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

    public WebhooksController(MongoDbService db, ILogger<WebhooksController> logger)
    {
        _db = db;
        _logger = logger;
    }

    [HttpPost("mux")]
    public async Task<IActionResult> MuxWebhook([FromBody] MuxWebhookPayload payload)
    {
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
