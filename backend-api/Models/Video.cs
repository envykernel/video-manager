using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace BackendApi.Models;

public class User
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    public string Username { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

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

    public string UserId { get; set; } = string.Empty;

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

public class UploadLimits
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    public long MaxFileSizeBytes { get; set; } = 5 * 1024 * 1024; // 5 MB

    public int MaxDurationSeconds { get; set; } = 60; // 1 minute

    public int QrExpirationMinutes { get; set; } = 30;
}

public class UploadLimitsRequest
{
    public long MaxFileSizeBytes { get; set; }
    public int MaxDurationSeconds { get; set; }
    public int QrExpirationMinutes { get; set; }
}

public class UploadLimitsResponse
{
    public long MaxFileSizeBytes { get; set; }
    public int MaxDurationSeconds { get; set; }
    public int QrExpirationMinutes { get; set; }
}

public class LoginRequest
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class LoginResponse
{
    public string Token { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
}
