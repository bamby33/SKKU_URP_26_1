/** 당사자 테마 색 팔레트 — 따뜻하고 친근한 색상 */
export type ThemeColor = {
  key: string;
  label: string;
  color: string;
  bg: string;
  border: string;
};

export const THEME_PALETTE: ThemeColor[] = [
  { key: 'blue',   label: '파란색', color: '#3A7BD5', bg: '#EBF2FB', border: '#A8C8F0' },
  { key: 'green',  label: '초록색', color: '#2EAA72', bg: '#E8F8F1', border: '#9ADBC0' },
  { key: 'purple', label: '보라색', color: '#7C5CBF', bg: '#F0EBFB', border: '#C4B0E8' },
  { key: 'orange', label: '주황색', color: '#E07B39', bg: '#FDF0E8', border: '#F0C4A0' },
  { key: 'pink',   label: '분홍색', color: '#E0547A', bg: '#FDEEF3', border: '#F0B0C4' },
  { key: 'teal',   label: '청록색', color: '#1E9E8E', bg: '#E6F8F6', border: '#8ED8D0' },
];

export const DEFAULT_THEME_COLOR = THEME_PALETTE[0];
