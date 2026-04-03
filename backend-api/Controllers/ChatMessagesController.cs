using System.Security.Claims;
using BackendApi.Models;
using BackendApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Controllers;

[ApiController]
[Route("api/chat-messages")]
[Authorize]
public class ChatMessagesController : ControllerBase
{
    private readonly MongoDbService _db;

    public ChatMessagesController(MongoDbService db)
    {
        _db = db;
    }

    private string GetUserId() => User.FindFirst(ClaimTypes.NameIdentifier)!.Value;

    [HttpGet]
    public async Task<ActionResult<List<ChatMessageResponse>>> GetAll()
    {
        var userId = GetUserId();
        var messages = await _db.GetChatMessagesByUserAsync(userId);
        var allVideos = await _db.GetAllByUserAsync(userId);
        var videoMap = allVideos.ToDictionary(v => v.Id!);

        var response = messages.Select(m => new ChatMessageResponse
        {
            Id = m.Id!,
            Text = m.Text,
            Videos = m.VideoIds
                .Where(id => videoMap.ContainsKey(id))
                .Select(id => VideoResponse.FromVideo(videoMap[id]))
                .ToList(),
            CreatedAt = m.CreatedAt
        }).ToList();

        return response;
    }

    [HttpPost]
    public async Task<ActionResult<ChatMessageResponse>> Create(
        [FromBody] CreateChatMessageRequest request)
    {
        var userId = GetUserId();

        // Validate that all video IDs belong to this user
        foreach (var videoId in request.VideoIds)
        {
            var video = await _db.GetByIdAsync(videoId);
            if (video is null || video.UserId != userId)
                return BadRequest(new { message = $"Video {videoId} not found." });
        }

        var message = new ChatMessage
        {
            UserId = userId,
            Text = string.IsNullOrWhiteSpace(request.Text) ? null : request.Text.Trim(),
            VideoIds = request.VideoIds
        };

        await _db.CreateChatMessageAsync(message);

        // Fetch videos for response
        var videos = new List<VideoResponse>();
        foreach (var videoId in message.VideoIds)
        {
            var video = await _db.GetByIdAsync(videoId);
            if (video is not null)
                videos.Add(VideoResponse.FromVideo(video));
        }

        return Ok(new ChatMessageResponse
        {
            Id = message.Id!,
            Text = message.Text,
            Videos = videos,
            CreatedAt = message.CreatedAt
        });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var messages = await _db.GetChatMessagesByUserAsync(GetUserId());
        var message = messages.FirstOrDefault(m => m.Id == id);
        if (message is null) return NotFound();

        await _db.DeleteChatMessageAsync(id);
        return NoContent();
    }
}
