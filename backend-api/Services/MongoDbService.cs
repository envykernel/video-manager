using System.Security.Cryptography;
using System.Text;
using BackendApi.Models;
using MongoDB.Driver;

namespace BackendApi.Services;

public class MongoDbService
{
    private readonly IMongoCollection<Video> _videos;
    private readonly IMongoCollection<UploadToken> _uploadTokens;
    private readonly IMongoCollection<User> _users;
    private readonly IMongoCollection<UploadLimits> _uploadLimits;

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
        _users = database.GetCollection<User>("users");
        _uploadLimits = database.GetCollection<UploadLimits>("upload_limits");

        SeedUsersAsync().GetAwaiter().GetResult();
    }

    public static string HashPassword(string password)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(password));
        return Convert.ToBase64String(bytes);
    }

    public static bool VerifyPassword(string password, string hash) =>
        HashPassword(password) == hash;

    private async Task SeedUsersAsync()
    {
        var count = await _users.CountDocumentsAsync(_ => true);
        if (count > 0) return;

        var users = new List<User>
        {
            new()
            {
                Username = "sara",
                DisplayName = "Sara",
                PasswordHash = HashPassword("sara123")
            },
            new()
            {
                Username = "helene",
                DisplayName = "Helene",
                PasswordHash = HashPassword("helene123")
            }
        };

        await _users.InsertManyAsync(users);
    }

    // Users
    public async Task<User?> GetUserByUsernameAsync(string username) =>
        await _users.Find(u => u.Username == username).FirstOrDefaultAsync();

    public async Task<User?> GetUserByIdAsync(string id) =>
        await _users.Find(u => u.Id == id).FirstOrDefaultAsync();

    // Videos — filtered by user
    public async Task<List<Video>> GetAllByUserAsync(string userId) =>
        await _videos.Find(v => v.UserId == userId)
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

    // Upload limits
    public async Task<UploadLimits> GetUploadLimitsAsync()
    {
        var limits = await _uploadLimits.Find(_ => true).FirstOrDefaultAsync();
        if (limits is not null) return limits;

        limits = new UploadLimits();
        await _uploadLimits.InsertOneAsync(limits);
        return limits;
    }

    public async Task UpdateUploadLimitsAsync(UploadLimits limits)
    {
        var existing = await _uploadLimits.Find(_ => true).FirstOrDefaultAsync();
        if (existing is not null)
        {
            limits.Id = existing.Id;
            await _uploadLimits.ReplaceOneAsync(l => l.Id == existing.Id, limits);
        }
        else
        {
            await _uploadLimits.InsertOneAsync(limits);
        }
    }
}
