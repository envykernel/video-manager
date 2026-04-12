using System.Diagnostics;

namespace BackendApi.Services;

public class AudioExtractionService
{
    private readonly ILogger<AudioExtractionService> _logger;

    public AudioExtractionService(ILogger<AudioExtractionService> logger)
    {
        _logger = logger;
    }

    public async Task<string> ExtractAudioAsync(string videoFilePath)
    {
        var outputPath = Path.ChangeExtension(videoFilePath, ".wav");

        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "ffmpeg",
                ArgumentList = { "-i", videoFilePath, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", outputPath, "-y" },
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            }
        };

        _logger.LogInformation("Extracting audio from {VideoPath} to {AudioPath}", videoFilePath, outputPath);

        process.Start();

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(120));
        var stderrTask = process.StandardError.ReadToEndAsync(cts.Token);
        var waitTask = process.WaitForExitAsync(cts.Token);
        await Task.WhenAll(stderrTask, waitTask);
        var stderr = await stderrTask;

        if (process.ExitCode != 0)
        {
            _logger.LogError("ffmpeg failed with exit code {ExitCode}: {Error}", process.ExitCode, stderr);
            throw new InvalidOperationException($"ffmpeg failed: {stderr}");
        }

        _logger.LogInformation("Audio extraction completed: {AudioPath}", outputPath);
        return outputPath;
    }
}
