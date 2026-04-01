using System.Text.Json.Serialization;

namespace BackendApi.Models;

public class MuxWebhookPayload
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("data")]
    public MuxWebhookData Data { get; set; } = new();
}

public class MuxWebhookData
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("asset_id")]
    public string? AssetId { get; set; }

    [JsonPropertyName("status")]
    public string? Status { get; set; }

    [JsonPropertyName("playback_ids")]
    public List<MuxPlaybackId>? PlaybackIds { get; set; }
}

public class MuxPlaybackId
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("policy")]
    public string Policy { get; set; } = string.Empty;
}
