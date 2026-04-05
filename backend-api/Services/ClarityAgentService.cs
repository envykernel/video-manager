using System.Collections.Concurrent;
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

public class ClaritySession
{
    public string Transcription { get; set; } = string.Empty;
    public List<ClarityQuestion> Questions { get; set; } = new();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class ClarityAgentService
{
    private readonly WhisperService _whisper;
    private readonly AudioExtractionService _audioExtraction;
    private readonly AzureAIOptions _config;
    private readonly ILogger<ClarityAgentService> _logger;

    // In-memory session store (simple approach — no DB needed for short-lived sessions)
    private readonly ConcurrentDictionary<string, ClaritySession> _sessions = new();

    public ClarityAgentService(
        IOptions<AzureAIOptions> options,
        WhisperService whisper,
        AudioExtractionService audioExtraction,
        ILogger<ClarityAgentService> logger)
    {
        _whisper = whisper;
        _audioExtraction = audioExtraction;
        _config = options.Value;
        _logger = logger;
    }

    public async Task<ClarityTranscribeResponse> TranscribeAndAskAsync(string audioFilePath)
    {
        _logger.LogInformation("Clarity: transcribing audio {Path}", audioFilePath);

        // Transcribe
        var whisperResult = await _whisper.TranscribeAsync(audioFilePath);
        var transcription = whisperResult.Text;

        if (string.IsNullOrWhiteSpace(transcription))
        {
            return new ClarityTranscribeResponse
            {
                SessionId = string.Empty,
                Transcription = string.Empty,
                Questions = new List<ClarityQuestion>()
            };
        }

        // Generate 2 clarity questions
        var questions = await GenerateQuestionsAsync(transcription);

        // Store session
        var sessionId = Guid.NewGuid().ToString("N");
        _sessions[sessionId] = new ClaritySession
        {
            Transcription = transcription,
            Questions = questions
        };

        // Cleanup old sessions (>30 min)
        CleanupOldSessions();

        return new ClarityTranscribeResponse
        {
            SessionId = sessionId,
            Transcription = transcription,
            Questions = questions
        };
    }

    public async Task<ClarityReformulateResponse> ReformulateAsync(string sessionId, List<ClarityAnswer> answers)
    {
        if (!_sessions.TryGetValue(sessionId, out var session))
            throw new InvalidOperationException("Session not found or expired.");

        var reformulated = await ReformulateWithAgentAsync(session.Transcription, session.Questions, answers);

        // Remove session after use
        _sessions.TryRemove(sessionId, out _);

        return new ClarityReformulateResponse
        {
            OriginalMessage = session.Transcription,
            ReformulatedMessage = reformulated,
            Questions = session.Questions,
            Answers = answers
        };
    }

    private async Task<List<ClarityQuestion>> GenerateQuestionsAsync(string transcription)
    {
        _logger.LogInformation("Clarity: generating questions for transcription");

        var chatClient = CreateChatClient();

        var agent = chatClient.AsAIAgent(
            name: "ClarityQuestioner",
            instructions: """
                You are an after-sales support assistant specialized in diagnosing faulty or broken products ("produit en panne").
                You receive a transcribed voice message from a customer describing a problem with a product they purchased.

                Your job:
                1. First, identify the type/nature of the product from the message (e.g. home appliance, electronic device, vehicle, software, clothing, furniture, etc.)
                2. Then generate exactly 2 yes/no diagnostic questions tailored to that product category

                Guidelines for good diagnostic questions:
                - For electronics/appliances: ask about power, error codes, unusual sounds, recent changes, warranty status
                - For mechanical products: ask about physical damage, normal wear, operating conditions
                - For software/digital products: ask about updates, error messages, when it last worked
                - For furniture/physical goods: ask about visible damage, assembly, usage conditions
                - Always adapt your questions to the specific product — generic questions are useless
                - Each question must be answerable with "Yes", "No", or "I don't know"
                - Questions should help narrow down the root cause of the problem
                - Keep questions short, clear, and in the same language as the customer's message

                Return EXACTLY this format (nothing else):
                Q1: <question>
                Q2: <question>
                """);

        var messages = new List<Microsoft.Extensions.AI.ChatMessage>
        {
            new(ChatRole.User, $"Here is the user's voice message:\n\n\"{transcription}\"\n\nGenerate 2 clarity questions.")
        };

        var response = await agent.RunAsync(messages);
        var output = response.Messages
            .Where(m => m.Role == ChatRole.Assistant)
            .Select(m => m.Text)
            .LastOrDefault() ?? string.Empty;

        return ParseQuestions(output);
    }

    private async Task<string> ReformulateWithAgentAsync(
        string transcription, List<ClarityQuestion> questions, List<ClarityAnswer> answers)
    {
        _logger.LogInformation("Clarity: reformulating message with answers");

        var chatClient = CreateChatClient();

        var agent = chatClient.AsAIAgent(
            name: "ClarityReformulator",
            instructions: """
                You are a writing assistant that helps customers write messages to sellers about broken or faulty products.
                You receive:
                1. A customer's original voice message describing a product problem (transcribed)
                2. Two diagnostic questions that were asked
                3. The customer's answers to those questions (Yes / No / I don't know)

                Your job is to rewrite the customer's words into a clear, natural message they can send directly to the seller.

                Rules:
                - Write in the same language as the original message
                - Write as if the customer is speaking directly to the seller (use "I", "my", first person)
                - This is a simple message, NOT a support ticket — no subject line, no title, no "Dear support", no signature
                - Just write the body of the message, as if it were a chat message or SMS to the seller
                - Incorporate the diagnostic answers naturally — don't mention the Q&A process
                - Keep the customer's original tone — natural, conversational, not overly formal
                - If an answer is "I don't know", leave that aspect as-is from the original
                - Be concise but include the relevant details that help the seller understand the problem
                - Return ONLY the message text, nothing else
                """);

        var qaBlock = "";
        for (int i = 0; i < questions.Count; i++)
        {
            var answer = answers.FirstOrDefault(a => a.Index == i)?.Answer ?? "Je ne sais pas";
            qaBlock += $"Q: {questions[i].Question}\nA: {answer}\n\n";
        }

        var messages = new List<Microsoft.Extensions.AI.ChatMessage>
        {
            new(ChatRole.User, $"Original message:\n\"{transcription}\"\n\nClarification Q&A:\n{qaBlock}\nReformulate the original message taking these answers into account.")
        };

        var response = await agent.RunAsync(messages);
        return response.Messages
            .Where(m => m.Role == ChatRole.Assistant)
            .Select(m => m.Text)
            .LastOrDefault() ?? transcription;
    }

    private Microsoft.Extensions.AI.IChatClient CreateChatClient()
    {
        var chat = _config.Chat;
        AzureOpenAIClient azureClient = string.IsNullOrEmpty(chat.ApiKey)
            ? new AzureOpenAIClient(new Uri(chat.Endpoint), new DefaultAzureCredential())
            : new AzureOpenAIClient(new Uri(chat.Endpoint), new AzureKeyCredential(chat.ApiKey));
        return azureClient.GetChatClient(chat.Deployment).AsIChatClient();
    }

    private static List<ClarityQuestion> ParseQuestions(string output)
    {
        var questions = new List<ClarityQuestion>();
        var matches = Regex.Matches(output, @"Q(\d+):\s*(.+)");
        foreach (Match m in matches)
        {
            if (int.TryParse(m.Groups[1].Value, out var idx))
            {
                questions.Add(new ClarityQuestion { Index = idx - 1, Question = m.Groups[2].Value.Trim() });
            }
        }
        // Fallback: try line-by-line if regex didn't match
        if (questions.Count == 0)
        {
            var lines = output.Split('\n', StringSplitOptions.RemoveEmptyEntries);
            for (int i = 0; i < Math.Min(lines.Length, 2); i++)
            {
                var line = Regex.Replace(lines[i], @"^[\d\.\)\-\*Q:]+\s*", "").Trim();
                if (line.Length > 0)
                    questions.Add(new ClarityQuestion { Index = i, Question = line });
            }
        }
        return questions;
    }

    private void CleanupOldSessions()
    {
        var cutoff = DateTime.UtcNow.AddMinutes(-30);
        foreach (var key in _sessions.Keys)
        {
            if (_sessions.TryGetValue(key, out var s) && s.CreatedAt < cutoff)
                _sessions.TryRemove(key, out _);
        }
    }
}
