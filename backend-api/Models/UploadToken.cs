using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace BackendApi.Models;

public class UploadToken
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    public string Token { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime ExpiresAt { get; set; }
}
