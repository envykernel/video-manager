using System.Text;
using System.Text.RegularExpressions;
using Azure;
using Azure.AI.OpenAI;
using Azure.Identity;
using Microsoft.Agents.AI;
using Microsoft.Agents.AI.OpenAI;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;
using BackendApi.Configuration;
using BackendApi.Models;

namespace BackendApi.Services;

public class TranscriptionAgentService
{
    private readonly AudioExtractionService _audioService;
    private readonly WhisperService _whisperService;
    private readonly AzureAIOptions _config;
    private readonly ILogger<TranscriptionAgentService> _logger;

    public TranscriptionAgentService(
        IOptions<AzureAIOptions> options,
        AudioExtractionService audioService,
        WhisperService whisperService,
        ILogger<TranscriptionAgentService> logger)
    {
        _audioService = audioService;
        _whisperService = whisperService;
        _config = options.Value;
        _logger = logger;
    }

    public async Task<TranscriptionResponse> TranscribeVideoAsync(string videoFilePath, string? translateTo = null)
    {
        _logger.LogInformation("Starting transcription for video: {VideoPath}, translate to: {TranslateTo}",
            videoFilePath, translateTo ?? "none");

        var audioPath = await _audioService.ExtractAudioAsync(videoFilePath);

        try
        {
            var whisperResult = await _whisperService.TranscribeAsync(audioPath);

            if (string.IsNullOrWhiteSpace(whisperResult.Text))
            {
                return new TranscriptionResponse
                {
                    RawTranscription = string.Empty,
                    StructuredTranscription = string.Empty,
                    DetectedLanguage = whisperResult.Language,
                    TranslatedTo = string.Empty,
                    Segments = new List<TranscriptionSegment>()
                };
            }

            var needsTranslation = !string.IsNullOrEmpty(translateTo)
                && !translateTo.Equals(whisperResult.Language, StringComparison.OrdinalIgnoreCase);

            // Process segments and full text with the agent
            var (structuredText, translatedSegments) = await ProcessWithAgent(
                whisperResult.Text, whisperResult.Language, whisperResult.Segments, translateTo);

            return new TranscriptionResponse
            {
                RawTranscription = whisperResult.Text,
                StructuredTranscription = structuredText,
                DetectedLanguage = whisperResult.Language,
                TranslatedTo = translateTo ?? string.Empty,
                Segments = needsTranslation ? translatedSegments : whisperResult.Segments
            };
        }
        finally
        {
            if (File.Exists(audioPath))
            {
                File.Delete(audioPath);
                _logger.LogInformation("Cleaned up audio file: {AudioPath}", audioPath);
            }
        }
    }

    private async Task<(string structuredText, List<TranscriptionSegment> translatedSegments)> ProcessWithAgent(
        string rawTranscription, string detectedLanguage, List<TranscriptionSegment> segments, string? translateTo)
    {
        _logger.LogInformation("Processing transcription with AI agent. Detected: {Detected}, Translate to: {TranslateTo}",
            detectedLanguage, translateTo ?? "none");

        var chat = _config.Chat;

        AzureOpenAIClient azureClient = string.IsNullOrEmpty(chat.ApiKey)
            ? new AzureOpenAIClient(new Uri(chat.Endpoint), new DefaultAzureCredential())
            : new AzureOpenAIClient(new Uri(chat.Endpoint), new AzureKeyCredential(chat.ApiKey));

        var chatClient = azureClient.GetChatClient(chat.Deployment).AsIChatClient();

        var needsTranslation = !string.IsNullOrEmpty(translateTo)
            && !translateTo.Equals(detectedLanguage, StringComparison.OrdinalIgnoreCase);

        // Build numbered segment list for the agent
        var segmentBlock = new StringBuilder();
        for (int i = 0; i < segments.Count; i++)
        {
            segmentBlock.AppendLine($"[{i}] {segments[i].Text}");
        }

        string instructions;
        string userMessage;

        if (needsTranslation)
        {
            instructions = $"""
                You are a transcription post-processor and translator. You will receive:
                1. A full raw transcription
                2. Numbered segments from that transcription

                Your tasks:
                - Clean up the full transcription (fix grammar, punctuation, remove filler words)
                - Translate everything to {translateTo}
                - Return your response in EXACTLY this format:

                === FULL TEXT ===
                (the cleaned and translated full text here)

                === SEGMENTS ===
                [0] (translated segment 0)
                [1] (translated segment 1)
                ...

                IMPORTANT: Keep the exact same number of segments with the same [N] numbering.
                Translate each segment individually. Do not merge or split segments.
                Return ONLY the formatted output, nothing else.
                """;
            userMessage = $"Translate this {detectedLanguage} transcription to {translateTo}:\n\nFull text:\n{rawTranscription}\n\nSegments:\n{segmentBlock}";
        }
        else
        {
            instructions = """
                You are a transcription post-processor. You will receive:
                1. A full raw transcription
                2. Numbered segments from that transcription

                Your tasks:
                - Clean up the full transcription (fix grammar, punctuation, remove filler words, add paragraph breaks)
                - Clean up each segment individually
                - Return your response in EXACTLY this format:

                === FULL TEXT ===
                (the cleaned full text here)

                === SEGMENTS ===
                [0] (cleaned segment 0)
                [1] (cleaned segment 1)
                ...

                IMPORTANT: Keep the exact same number of segments with the same [N] numbering.
                Clean each segment individually. Do not merge or split segments.
                Return ONLY the formatted output, nothing else.
                """;
            userMessage = $"Clean and structure this {detectedLanguage} transcription:\n\nFull text:\n{rawTranscription}\n\nSegments:\n{segmentBlock}";
        }

        var agent = chatClient.AsAIAgent(
            name: "TranscriptionProcessor",
            instructions: instructions);

        var messages = new List<Microsoft.Extensions.AI.ChatMessage>
        {
            new(ChatRole.User, userMessage)
        };

        var response = await agent.RunAsync(messages);

        var agentOutput = response.Messages
            .Where(m => m.Role == ChatRole.Assistant)
            .Select(m => m.Text)
            .LastOrDefault() ?? string.Empty;

        // Parse the agent output
        var (fullText, translatedSegments) = ParseAgentOutput(agentOutput, segments);

        return (fullText.Length > 0 ? fullText : rawTranscription, translatedSegments);
    }

    private static (string fullText, List<TranscriptionSegment> segments) ParseAgentOutput(
        string output, List<TranscriptionSegment> originalSegments)
    {
        var fullText = string.Empty;
        var translatedSegments = new List<TranscriptionSegment>(originalSegments);

        // Split by === FULL TEXT === and === SEGMENTS ===
        var fullTextMatch = Regex.Match(output, @"===\s*FULL TEXT\s*===\s*\n([\s\S]*?)(?====\s*SEGMENTS\s*===|$)");
        if (fullTextMatch.Success)
        {
            fullText = fullTextMatch.Groups[1].Value.Trim();
        }

        var segmentsMatch = Regex.Match(output, @"===\s*SEGMENTS\s*===\s*\n([\s\S]*)");
        if (segmentsMatch.Success)
        {
            var segmentLines = segmentsMatch.Groups[1].Value;
            var lineMatches = Regex.Matches(segmentLines, @"\[(\d+)\]\s*(.+)");

            foreach (Match match in lineMatches)
            {
                if (int.TryParse(match.Groups[1].Value, out int idx) && idx < originalSegments.Count)
                {
                    translatedSegments[idx] = new TranscriptionSegment
                    {
                        StartTime = originalSegments[idx].StartTime,
                        EndTime = originalSegments[idx].EndTime,
                        Text = match.Groups[2].Value.Trim()
                    };
                }
            }
        }

        return (fullText, translatedSegments);
    }
}
