FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY BackendApi.csproj .
RUN dotnet restore

COPY . .
RUN dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# Install ffmpeg for audio extraction
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

# Create temp directory for transcription files
RUN mkdir -p /app/temp

COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "BackendApi.dll"]
