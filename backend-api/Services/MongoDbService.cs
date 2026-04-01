using BackendApi.Models;
using MongoDB.Driver;

namespace BackendApi.Services;

public class MongoDbService
{
    private readonly IMongoCollection<Video> _videos;
    private readonly IMongoCollection<UploadToken> _uploadTokens;

    public MongoDbService(IConfiguration configuration)
    {
        var connectionString = configuration["MongoDB:ConnectionString"]
            ?? "mongodb://localhost:27017";
        var databaseName = configuration["MongoDB:DatabaseName"]
            ?? "video_platform";

        var client = new MongoClient(connectionString);
        var database = client.GetDatabase(databaseName);
        _videos = database.GetCollection<Video>("videos");
        _uploadTokens = database.GetCollection<UploadToken>("upload_tokens");
    }

    public async Task<List<Video>> GetAllAsync() =>
        await _videos.Find(_ => true)
            .SortByDescending(v => v.CreatedAt)
            .ToListAsync();

    public async Task<Video?> GetByIdAsync(string id) =>
        await _videos.Find(v => v.Id == id).FirstOrDefaultAsync();

    public async Task<Video?> GetByMuxUploadIdAsync(string muxUploadId) =>
        await _videos.Find(v => v.MuxUploadId == muxUploadId).FirstOrDefaultAsync();

    public async Task<Video?> GetByMuxAssetIdAsync(string muxAssetId) =>
        await _videos.Find(v => v.MuxAssetId == muxAssetId).FirstOrDefaultAsync();

    public async Task<Video> CreateAsync(Video video)
    {
        await _videos.InsertOneAsync(video);
        return video;
    }

    public async Task UpdateAsync(string id, Video video) =>
        await _videos.ReplaceOneAsync(v => v.Id == id, video);

    public async Task DeleteAsync(string id) =>
        await _videos.DeleteOneAsync(v => v.Id == id);

    // Upload tokens
    public async Task<UploadToken> CreateTokenAsync(UploadToken token)
    {
        await _uploadTokens.InsertOneAsync(token);
        return token;
    }

    public async Task<UploadToken?> GetTokenAsync(string tokenValue) =>
        await _uploadTokens.Find(t => t.Token == tokenValue && t.ExpiresAt > DateTime.UtcNow)
            .FirstOrDefaultAsync();

    public async Task<List<Video>> GetVideosByTokenAsync(string tokenValue) =>
        await _videos.Find(v => v.UploadToken == tokenValue)
            .SortByDescending(v => v.CreatedAt)
            .ToListAsync();
}
