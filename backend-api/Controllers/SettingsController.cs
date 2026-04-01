using BackendApi.Models;
using BackendApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SettingsController : ControllerBase
{
    private readonly MongoDbService _db;

    public SettingsController(MongoDbService db)
    {
        _db = db;
    }

    [HttpGet("upload-limits")]
    [AllowAnonymous]
    public async Task<ActionResult<UploadLimitsResponse>> GetUploadLimits()
    {
        var limits = await _db.GetUploadLimitsAsync();
        return Ok(new UploadLimitsResponse
        {
            MaxFileSizeBytes = limits.MaxFileSizeBytes,
            MaxDurationSeconds = limits.MaxDurationSeconds
        });
    }

    [HttpPut("upload-limits")]
    [Authorize]
    public async Task<ActionResult<UploadLimitsResponse>> UpdateUploadLimits(
        [FromBody] UploadLimitsRequest request)
    {
        if (request.MaxFileSizeBytes <= 0)
            return BadRequest(new { message = "Max file size must be greater than 0." });

        if (request.MaxDurationSeconds <= 0)
            return BadRequest(new { message = "Max duration must be greater than 0." });

        var limits = new UploadLimits
        {
            MaxFileSizeBytes = request.MaxFileSizeBytes,
            MaxDurationSeconds = request.MaxDurationSeconds
        };

        await _db.UpdateUploadLimitsAsync(limits);

        return Ok(new UploadLimitsResponse
        {
            MaxFileSizeBytes = limits.MaxFileSizeBytes,
            MaxDurationSeconds = limits.MaxDurationSeconds
        });
    }
}
