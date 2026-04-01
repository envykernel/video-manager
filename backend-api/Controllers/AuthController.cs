using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using BackendApi.Models;
using BackendApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;

namespace BackendApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly MongoDbService _db;
    private readonly IConfiguration _configuration;

    public AuthController(MongoDbService db, IConfiguration configuration)
    {
        _db = db;
        _configuration = configuration;
    }

    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request)
    {
        var user = await _db.GetUserByUsernameAsync(request.Username.ToLower().Trim());
        if (user is null || !MongoDbService.VerifyPassword(request.Password, user.PasswordHash))
            return Unauthorized(new { message = "Invalid username or password" });

        var token = GenerateJwtToken(user);

        return Ok(new LoginResponse
        {
            Token = token,
            UserId = user.Id!,
            Username = user.Username,
            DisplayName = user.DisplayName
        });
    }

    [HttpGet("me")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public async Task<IActionResult> Me()
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userId is null) return Unauthorized();

        var user = await _db.GetUserByIdAsync(userId);
        if (user is null) return Unauthorized();

        return Ok(new
        {
            userId = user.Id,
            username = user.Username,
            displayName = user.DisplayName
        });
    }

    private string GenerateJwtToken(User user)
    {
        var jwtSecret = _configuration["Jwt:Secret"] ?? "VideoAppSuperSecretKey2024!AtLeast32Chars";
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id!),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim("displayName", user.DisplayName)
        };

        var token = new JwtSecurityToken(
            issuer: "VideoApp",
            audience: "VideoApp",
            claims: claims,
            expires: DateTime.UtcNow.AddDays(7),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
