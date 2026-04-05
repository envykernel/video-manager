using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using BackendApi.Models;
using BackendApi.Services;

namespace BackendApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ClarityController : ControllerBase
{
    private readonly ClarityAgentService _clarity;
    private readonly ILogger<ClarityController> _logger;

    public ClarityController(ClarityAgentService clarity, ILogger<ClarityController> logger)
    {
        _clarity = clarity;
        _logger = logger;
    }

    /// <summary>
    /// Upload an audio file, transcribe it, and get 2 clarity questions.
    /// </summary>
    [HttpPost("transcribe")]
    [RequestSizeLimit(25 * 1024 * 1024)]
    public async Task<IActionResult> Transcribe(IFormFile file)
    {
        var allowedExts = new[] { ".mp3", ".wav", ".m4a", ".ogg", ".webm", ".mp4", ".flac" };
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!allowedExts.Contains(ext))
            return BadRequest(new { message = $"File type '{ext}' not supported." });

        var tempDir = Path.GetFullPath("./temp");
        Directory.CreateDirectory(tempDir);
        var tempPath = Path.Combine(tempDir, $"{Guid.NewGuid()}{ext}");

        try
        {
            await using (var stream = new FileStream(tempPath, FileMode.Create))
                await file.CopyToAsync(stream);

            var result = await _clarity.TranscribeAndAskAsync(tempPath);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Clarity transcription failed");
            return StatusCode(500, new { message = "Transcription failed: " + ex.Message });
        }
        finally
        {
            if (System.IO.File.Exists(tempPath)) System.IO.File.Delete(tempPath);
        }
    }

    /// <summary>
    /// Submit answers to clarity questions and get the reformulated message.
    /// </summary>
    [HttpPost("reformulate")]
    public async Task<IActionResult> Reformulate([FromBody] ClarityReformulateRequest request)
    {
        if (string.IsNullOrEmpty(request.SessionId))
            return BadRequest(new { message = "Session ID is required." });

        try
        {
            var result = await _clarity.ReformulateAsync(request.SessionId, request.Answers);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Clarity reformulation failed");
            return StatusCode(500, new { message = "Reformulation failed: " + ex.Message });
        }
    }
}
