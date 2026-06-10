/**
 * AI 응답 텍스트 정리 유틸
 * - cleanForSpeech: 음성(TTS)으로 읽을 때 이모지·코드·마크다운 기호 제거 (기계음이 이모지/코드를 읽는 문제 방지)
 * - cleanForDisplay: 화면 표시용 — 코드블록/백틱만 제거하고 이모지·문장은 유지
 */

const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍]/gu;

export function cleanForSpeech(text: string): string {
  return (text || '')
    .replace(/```[\s\S]*?```/g, ' ')   // 코드블록
    .replace(/`[^`]*`/g, ' ')          // 인라인 코드
    .replace(EMOJI_RE, '')             // 이모지
    .replace(/[*_#~>`|]/g, ' ')        // 마크다운/특수기호
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanForDisplay(text: string): string {
  return (text || '')
    .replace(/```[\s\S]*?```/g, '')    // 코드블록 제거
    .replace(/`([^`]*)`/g, '$1')       // 인라인 코드 → 내용만
    .trim();
}
