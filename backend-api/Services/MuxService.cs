using Mux.Csharp.Sdk.Api;
using Mux.Csharp.Sdk.Client;
using Mux.Csharp.Sdk.Model;

namespace BackendApi.Services;

public class MuxService
{
    private readonly DirectUploadsApi _uploadsApi;
    private readonly AssetsApi _assetsApi;
    private readonly ILogger<MuxService> _logger;

    public MuxService(IConfiguration configuration, ILogger<MuxService> logger)
    {
        _logger = logger;

        var tokenId = configuration["Mux:TokenId"]
            ?? throw new InvalidOperationException("Mux:TokenId is not configured");
        var tokenSecret = configuration["Mux:TokenSecret"]
            ?? throw new InvalidOperationException("Mux:TokenSecret is not configured");

        var config = new Configuration
        {
            BasePath = "https://api.mux.com",
            Username = tokenId,
            Password = tokenSecret
        };

        _uploadsApi = new DirectUploadsApi(config);
        _assetsApi = new AssetsApi(config);
    }

    public async Task<(string uploadId, string uploadUrl)> CreateDirectUploadAsync()
    {
        var request = new CreateUploadRequest(
            newAssetSettings: new CreateAssetRequest(
                playbackPolicy: [PlaybackPolicy.Public],
                encodingTier: CreateAssetRequest.EncodingTierEnum.Baseline
            ),
            corsOrigin: "*"
        );

        var response = await _uploadsApi.CreateDirectUploadAsync(request);
        var upload = response.Data;

        _logger.LogInformation("Created Mux direct upload: {UploadId}", upload.Id);

        return (upload.Id, upload.Url);
    }

    public async Task DeleteAssetAsync(string assetId)
    {
        try
        {
            await _assetsApi.DeleteAssetAsync(assetId);
            _logger.LogInformation("Deleted Mux asset: {AssetId}", assetId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to delete Mux asset: {AssetId}", assetId);
        }
    }
}
