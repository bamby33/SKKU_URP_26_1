/**
 * 일과 제목 → 일과용 이미지 매핑 (이모티콘 대체)
 * Metro 번들러는 require()에 정적 경로가 필요하므로 여기서 한 번에 매핑한다.
 * 키워드에 안 걸리면 null → 호출부에서 이모티콘으로 폴백.
 */
import { ImageSourcePropType } from 'react-native';

const IMG = {
  wake: require('../../assets/schedule/wake.png'),
  breakfast: require('../../assets/schedule/breakfast.png'),
  lunch: require('../../assets/schedule/lunch.png'),
  dinner: require('../../assets/schedule/dinner.png'),
  wash: require('../../assets/schedule/wash.png'),
  bath: require('../../assets/schedule/bath.png'),
  sleep: require('../../assets/schedule/sleep.png'),
  nap: require('../../assets/schedule/nap.png'),
  rest: require('../../assets/schedule/rest.png'),
  exercise: require('../../assets/schedule/exercise.png'),
  walk: require('../../assets/schedule/walk.png'),
  reading: require('../../assets/schedule/reading.png'),
  medicine: require('../../assets/schedule/medicine.png'),
  hospital: require('../../assets/schedule/hospital.png'),
  center: require('../../assets/schedule/center.png'),
  commute: require('../../assets/schedule/commute.png'),
  home_return: require('../../assets/schedule/home_return.png'),
} as const;

export const DEFAULT_COLOR = '#4CAF7D';

// 우선순위 순서대로 검사 (구체적인 키워드를 위에) — 첫 일치 사용.
// color: 같은 일과는 어느 화면에서나 항상 같은 색이 되도록 일과별로 고정.
const RULES: { kw: string[]; img: ImageSourcePropType; color: string }[] = [
  { kw: ['기상', '일어나'], img: IMG.wake, color: '#FFB74D' },
  { kw: ['아침'], img: IMG.breakfast, color: '#4CAF7D' },
  { kw: ['점심'], img: IMG.lunch, color: '#66BB6A' },
  { kw: ['저녁'], img: IMG.dinner, color: '#4DB6AC' },
  { kw: ['식사', '밥', '먹기', '간식'], img: IMG.lunch, color: '#4CAF7D' },  // 일반 '식사'
  { kw: ['목욕', '샤워'], img: IMG.bath, color: '#FFB74D' },
  { kw: ['세면', '양치', '씻', '수면준비', '잠잘준비'], img: IMG.wash, color: '#4FC3F7' },
  { kw: ['낮잠'], img: IMG.nap, color: '#9FA8DA' },                          // 낮잠 — 취침보다 먼저 (별도 색)
  { kw: ['휴식', '쉬기', '쉬는', '쉼'], img: IMG.rest, color: '#80CBC4' },    // 휴식
  { kw: ['취침', '수면', '잠자', '잠들', '자기'], img: IMG.sleep, color: '#AB77E8' },  // 밤 취침
  { kw: ['운동', '체조', '스트레칭'], img: IMG.exercise, color: '#AED581' },
  { kw: ['산책', '걷기'], img: IMG.walk, color: '#6B9BF2' },
  { kw: ['독서', '책', '여가', '자유', '놀이', 'tv', '게임', '음악'], img: IMG.reading, color: '#5BB7C0' },
  { kw: ['약', '복용'], img: IMG.medicine, color: '#E57373' },
  { kw: ['병원', '치료', '재활'], img: IMG.hospital, color: '#FF8A65' },
  { kw: ['복지관', '센터', '기관', '학교', '방문'], img: IMG.center, color: '#9575CD' },
  { kw: ['출근', '등교', '등원'], img: IMG.commute, color: '#7986CB' },
  { kw: ['퇴근', '하교', '하원', '귀가'], img: IMG.home_return, color: '#4DB6AC' },
];

/** 제목에 맞는 일과 이미지. 없으면 null. */
export function scheduleImage(title: string | undefined | null): ImageSourcePropType | null {
  if (!title) return null;
  const t = title.toLowerCase();
  for (const r of RULES) {
    if (r.kw.some(k => t.includes(k.toLowerCase()))) return r.img;
  }
  return null;
}

/** 제목에 맞는 일과 색 — 같은 일과는 어느 화면에서나 같은 색. 없으면 기본 초록. */
export function scheduleColor(title: string | undefined | null): string {
  if (!title) return DEFAULT_COLOR;
  const t = title.toLowerCase();
  for (const r of RULES) {
    if (r.kw.some(k => t.includes(k.toLowerCase()))) return r.color;
  }
  return DEFAULT_COLOR;
}
