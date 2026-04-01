using BackendApi.Services;

var builder = WebApplication.CreateBuilder(args);

// Services
builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddSingleton<MongoDbService>();
builder.Services.AddSingleton<MuxService>();

// CORS — allow frontend dev server + ngrok
var allowedOrigins = new List<string> { "http://localhost:5173", "http://localhost:4173" };
var ngrokUrl = builder.Configuration["App:BaseUrl"];
if (!string.IsNullOrEmpty(ngrokUrl)) allowedOrigins.Add(ngrokUrl);

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

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();
app.MapControllers();

app.Run();
