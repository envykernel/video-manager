namespace BackendApi.Models;

public class TranscriptionResponse
{
    public string RawTranscription { get; set; } = string.Empty;
    public string StructuredTranscription { get; set; } = string.Empty;
    public string DetectedLanguage { get; set; } = string.Empty;
    public string TranslatedTo { get; set; } = string.Empty;
    public List<TranscriptionSegment> Segments { get; set; } = new();
}
