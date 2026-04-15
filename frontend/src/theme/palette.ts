/** 당사자 테마 색 팔레트 — 차분하고 모던한 색상 */
export type ThemeColor = {
  key: string;
  label: string;
  color: string;
  bg: string;        // 연한 배경색
  border: string;    // 테두리색
};

export const THEME_PALETTE: ThemeColor[] = [
  { key: 'navy',       label: '파란색',   color: '#3B4A6B', bg: '#EEF2F7', border: '#C5D0E0' },
  { key: 'forest',     label: '초록색',   color: '#2D6A4F', bg: '#EBF5EE', border: '#B7D9C4' },
  { key: 'mauve',      label: '보라색',   color: '#6B4F8B', bg: '#F3EEF9', border: '#CFBDE8' },
  { key: 'terracotta', label: '주황색',   color: '#A85C3A', bg: '#FBF0EB', border: '#E8C5B0' },
  { key: 'teal',       label: '청록색',   color: '#2A6B7B', bg: '#EBF5F7', border: '#B0D5DB' },
  { key: 'rose',       label: '분홍색',   color: '#8B4A62', bg: '#F9EEF2', border: '#E0BDC9' },
];

export const DEFAULT_THEME_COLOR = THEME_PALETTE[0];
