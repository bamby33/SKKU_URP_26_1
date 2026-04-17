/** 당사자 테마 색 팔레트 — 따뜻하고 친근한 색상 */
export type ThemeColor = {
  key: string;
  label: string;
  color: string;
  bg: string;
  border: string;
};

export const THEME_PALETTE: ThemeColor[] = [
  { key: 'green',  label: '초록색', color: '#4A9B6F', bg: '#E8F5EE', border: '#A8D8C0' },
  { key: 'teal',   label: '청록색', color: '#2A9D8F', bg: '#E4F5F3', border: '#90D4CC' },
  { key: 'blue',   label: '파란색', color: '#4A80C4', bg: '#EAF1FB', border: '#A8C8F0' },
  { key: 'purple', label: '보라색', color: '#7C5CBF', bg: '#F0EBFB', border: '#C4B0E8' },
  { key: 'orange', label: '주황색', color: '#E07B39', bg: '#FDF0E8', border: '#F0C4A0' },
  { key: 'pink',   label: '분홍색', color: '#E0547A', bg: '#FDEEF3', border: '#F0B0C4' },
];

export const DEFAULT_THEME_COLOR = THEME_PALETTE[0];
