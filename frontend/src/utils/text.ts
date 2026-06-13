/**
 * AI 응답 텍스트 정리 유틸
 * - cleanForSpeech: 음성(TTS)으로 읽을 때 이모지·코드·마크다운 기호 제거 (기계음이 이모지/코드를 읽는 문제 방지)
 * - cleanForDisplay: 화면 표시용 — 코드블록/백틱만 제거하고 이모지·문장은 유지
 */

const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍]/gu;

// 모델 제어 토큰/메타 문구 제거 (<end_of_turn>, (AAC 버튼 제공) 등이 새어나오는 문제)
const stripModelArtifacts = (t: string): string =>
  t
    .replace(/<\|?\/?[a-z_]+\|?>/gi, '')           // <end_of_turn>, <start_of_turn>, <|...|> 등
    .replace(/\((?:AAC|aac)[^)]*\)/g, '')           // (AAC 버튼 제공)
    .replace(/\((?:선택지|툴|tool)[^)]*\)/g, '');    // (선택지 제공) 류 메타

export function cleanForSpeech(text: string): string {
  return stripModelArtifacts(text || '')
    .replace(/```[\s\S]*?```/g, ' ')   // 코드블록
    .replace(/`[^`]*`/g, ' ')          // 인라인 코드
    .replace(EMOJI_RE, '')             // 이모지
    .replace(/[*_#~>`|]/g, ' ')        // 마크다운/특수기호
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanForDisplay(text: string): string {
  return stripModelArtifacts(text || '')
    .replace(/```[\s\S]*?```/g, '')    // 코드블록 제거
    .replace(/`([^`]*)`/g, '$1')       // 인라인 코드 → 내용만
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
