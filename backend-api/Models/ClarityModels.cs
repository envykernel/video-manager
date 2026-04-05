namespace BackendApi.Models;

public class ClarityQuestion
{
    public int Index { get; set; }
    public string Question { get; set; } = string.Empty;
}

public class ClarityTranscribeResponse
{
    public string SessionId { get; set; } = string.Empty;
    public string Transcription { get; set; } = string.Empty;
    public List<ClarityQuestion> Questions { get; set; } = new();
}

public class ClarityAnswer
{
    public int Index { get; set; }
    public string Answer { get; set; } = string.Empty; // "yes", "no", "i dont know"
}

public class ClarityReformulateRequest
{
    public string SessionId { get; set; } = string.Empty;
    public List<ClarityAnswer> Answers { get; set; } = new();
}

public class ClarityReformulateResponse
{
    public string OriginalMessage { get; set; } = string.Empty;
    public string ReformulatedMessage { get; set; } = string.Empty;
    public List<ClarityQuestion> Questions { get; set; } = new();
    public List<ClarityAnswer> Answers { get; set; } = new();
}
