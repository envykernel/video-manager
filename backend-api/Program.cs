using System.Text;
using System.Threading.Channels;
using BackendApi.Configuration;
using BackendApi.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Services
builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddSingleton<MongoDbService>();
builder.Services.AddSingleton<MuxService>();

// Transcription services
builder.Services.Configure<AzureAIOptions>(
    builder.Configuration.GetSection(AzureAIOptions.SectionName));
builder.Services.Configure<TranscriptionOptions>(
    builder.Configuration.GetSection(TranscriptionOptions.SectionName));
builder.Services.AddSingleton<AudioExtractionService>();
builder.Services.AddSingleton<WhisperService>();
builder.Services.AddSingleton<TranscriptionAgentService>();
builder.Services.AddSingleton<ClarityAgentService>();

// Background transcription worker
builder.Services.AddSingleton(Channel.CreateBounded<TranscriptionWorkItem>(100));
builder.Services.AddHttpClient();
builder.Services.AddHostedService<TranscriptionWorker>();

// JWT Authentication
var jwtSecret = builder.Configuration["Jwt:Secret"]
    ?? throw new InvalidOperationException("Jwt:Secret must be configured");
var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));
builder.Services.AddSingleton(signingKey);
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = "VideoApp",
            ValidAudience = "VideoApp",
            IssuerSigningKey = signingKey
        };
    });

// CORS — allow frontend dev server, ngrok, and additional origins from config
var allowedOrigins = new List<string> { "http://localhost:5173", "http://localhost:4173" };
var ngrokUrl = builder.Configuration["App:BaseUrl"];
if (!string.IsNullOrEmpty(ngrokUrl)) allowedOrigins.Add(ngrokUrl);
var extraOrigins = builder.Configuration.GetSection("App:AllowedOrigins").Get<string[]>();
if (extraOrigins is not null) allowedOrigins.AddRange(extraOrigins);

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(allowedOrigins.ToArray())
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

app.MapOpenApi();

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
