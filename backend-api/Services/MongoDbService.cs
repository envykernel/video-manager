using BackendApi.Models;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;

namespace BackendApi.Services;

public class MongoDbService
{
    private readonly IMongoCollection<Video> _videos;
    private readonly IMongoCollection<UploadToken> _uploadTokens;
    private readonly IMongoCollection<User> _users;
    private readonly IMongoCollection<UploadLimits> _uploadLimits;
    private readonly IMongoCollection<ChatMessage> _chatMessages;
    private readonly ILogger<MongoDbService> _logger;

    public MongoDbService(IConfiguration configuration, ILogger<MongoDbService> logger)
    {
        _logger = logger;
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
        _chatMessages = database.GetCollection<ChatMessage>("chat_messages");

        EnsureIndexes();
        SeedUsersAsync(configuration).GetAwaiter().GetResult();
    }

    private void EnsureIndexes()
    {
        _videos.Indexes.CreateMany(new[]
        {
            new CreateIndexModel<Video>(Builders<Video>.IndexKeys.Ascending(v => v.UserId)),
            new CreateIndexModel<Video>(Builders<Video>.IndexKeys.Ascending(v => v.MuxUploadId)),
            new CreateIndexModel<Video>(Builders<Video>.IndexKeys.Ascending(v => v.MuxAssetId)),
            new CreateIndexModel<Video>(Builders<Video>.IndexKeys.Ascending(v => v.UploadToken)),
        });

        _uploadTokens.Indexes.CreateOne(
            new CreateIndexModel<UploadToken>(
                Builders<UploadToken>.IndexKeys.Ascending(t => t.Token),
                new CreateIndexOptions { Unique = true }));

        _users.Indexes.CreateOne(
            new CreateIndexModel<User>(
                Builders<User>.IndexKeys.Ascending(u => u.Username),
                new CreateIndexOptions { Unique = true }));

        _chatMessages.Indexes.CreateOne(
            new CreateIndexModel<ChatMessage>(
                Builders<ChatMessage>.IndexKeys.Ascending(m => m.UserId)));
    }

    public static string HashPassword(string password) =>
        BCrypt.Net.BCrypt.HashPassword(password, workFactor: 12);

    public static bool VerifyPassword(string password, string hash) =>
        BCrypt.Net.BCrypt.Verify(password, hash);

    private async Task SeedUsersAsync(IConfiguration configuration)
    {
        var count = await _users.CountDocumentsAsync(_ => true);
        if (count > 0) return;

        var saraPassword = configuration["Seed:SaraPassword"];
        var helenePassword = configuration["Seed:HelenePassword"];

        if (string.IsNullOrEmpty(saraPassword) || string.IsNullOrEmpty(helenePassword))
        {
            _logger.LogWarning("Seed credentials not configured (Seed:SaraPassword / Seed:HelenePassword). Skipping user seeding.");
            return;
        }

        var users = new List<User>
        {
            new()
            {
                Username = "sara",
                DisplayName = "Sara",
                PasswordHash = HashPassword(saraPassword)
            },
            new()
            {
                Username = "helene",
                DisplayName = "Helene",
                PasswordHash = HashPassword(helenePassword)
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

    public async Task<List<Video>> GetTranscribedByUserAsync(string userId) =>
        await _videos.Find(v => v.UserId == userId && v.TranscriptionStatus != null)
            .SortByDescending(v => v.CreatedAt)
            .ToListAsync();

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

    // Chat messages
    public async Task<ChatMessage> CreateChatMessageAsync(ChatMessage message)
    {
        await _chatMessages.InsertOneAsync(message);
        return message;
    }

    public async Task<List<ChatMessage>> GetChatMessagesByUserAsync(string userId) =>
        await _chatMessages.Find(m => m.UserId == userId)
            .SortBy(m => m.CreatedAt)
            .ToListAsync();

    public async Task DeleteChatMessageAsync(string id) =>
        await _chatMessages.DeleteOneAsync(m => m.Id == id);

    public async Task RemoveVideoFromChatMessagesAsync(string videoId)
    {
        var update = Builders<ChatMessage>.Update.Pull(m => m.VideoIds, videoId);
        await _chatMessages.UpdateManyAsync(m => m.VideoIds.Contains(videoId), update);
        // Clean up empty messages (no text and no videos)
        await _chatMessages.DeleteManyAsync(m => m.Text == null && m.VideoIds.Count == 0);
    }

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
