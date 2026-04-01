using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace BackendApi.Models;

public class Video
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public long Size { get; set; }

    public string Duration { get; set; } = "0:00";

    public string? MuxAssetId { get; set; }

    public string? MuxPlaybackId { get; set; }

    public string? MuxUploadId { get; set; }

    public string? UploadToken { get; set; }

    public string Status { get; set; } = "waiting_for_upload";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class CreateUploadRequest
{
    public string Name { get; set; } = string.Empty;
    public long Size { get; set; }
    public string Duration { get; set; } = "0:00";
}

public class CreateUploadResponse
{
    public string VideoId { get; set; } = string.Empty;
    public string UploadUrl { get; set; } = string.Empty;
}

public class VideoResponse
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public long Size { get; set; }
    public string Duration { get; set; } = "0:00";
    public string? PlaybackId { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }

    public static VideoResponse FromVideo(Video video) => new()
    {
        Id = video.Id!,
        Name = video.Name,
        Size = video.Size,
        Duration = video.Duration,
        PlaybackId = video.MuxPlaybackId,
        Status = video.Status,
        CreatedAt = video.CreatedAt
    };
}
