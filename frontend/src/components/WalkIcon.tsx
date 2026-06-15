/**
 * 산책 일과 SVG 아이콘 (이모지 대체)
 * - animated=false: 정지 (일과 리스트용, 가벼움)
 * - animated=true : 몸통 바운스 + 팔다리 흔들 (현재 일과 카드용)
 * react-native-svg + Animated (추가 라이브러리 없음)
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Rect, Ellipse, Circle, Line, Path, G } from 'react-native-svg';

const AG = Animated.createAnimatedComponent(G);

// (테스트) 저녁식사에도 임시로 적용 — 데모에서 바로 보기용
export const isWalk = (title: string) => /산책|걷기|walk/i.test(title || '');

export default function WalkIcon({ size = 40, animated = false }: { size?: number; animated?: boolean }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animated) return;
    // 0→1→0 왕복 (각 반쪽에 ease-in-out) → 원본 keyframe과 동일한 느낌
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(t, { toValue: 1, duration: 450, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      Animated.timing(t, { toValue: 0, duration: 450, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [animated]);

  const lerp = (a: number, b: number) => t.interpolate({ inputRange: [0, 1], outputRange: [a, b] });
  const bodyY = animated ? lerp(0, -1.5) : 0;
  const armL = animated ? lerp(-7, 7) : 0;
  const armR = animated ? lerp(7, -7) : 0;
  const legL = animated ? lerp(-9, 8) : 0;
  const legR = animated ? lerp(8, -9) : 0;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect width={100} height={100} rx={22} fill="#E8F5E9" />
      {/* 구름 */}
      <Ellipse cx={76} cy={20} rx={10} ry={6} fill="#fff" opacity={0.9} />
      <Ellipse cx={84} cy={20} rx={7} ry={5} fill="#fff" opacity={0.9} />
      <Ellipse cx={68} cy={21} rx={6} ry={4} fill="#fff" opacity={0.9} />
      {/* 나무 */}
      <Rect x={74} y={57} width={5} height={20} rx={2} fill="#8D6E63" />
      <Ellipse cx={76} cy={51} rx={10} ry={12} fill="#66BB6A" />
      <Ellipse cx={72} cy={55} rx={7} ry={8} fill="#81C784" />
      {/* 땅 */}
      <Path d="M8 82 Q30 77 52 82 Q72 86 92 80" fill="none" stroke="#81C784" strokeWidth={2.5} strokeLinecap="round" />
      <Ellipse cx={38} cy={87} rx={30} ry={5} fill="#A5D6A7" opacity={0.4} />
      {/* 사람 (몸통 바운스) */}
      <AG translateY={bodyY as any}>
        <Circle cx={38} cy={24} r={10} fill="#4CAF50" />
        <Circle cx={34} cy={22} r={1.8} fill="#2E7D32" />
        <Circle cx={42} cy={22} r={1.8} fill="#2E7D32" />
        <Path d="M34 27 Q38 30 42 27" fill="none" stroke="#2E7D32" strokeWidth={1.5} strokeLinecap="round" />
        <Rect x={34} y={34} width={8} height={22} rx={4} fill="#388E3C" />
        {/* 왼팔 */}
        <AG rotation={armL as any} originX={36} originY={37}>
          <Line x1={36} y1={37} x2={28} y2={50} stroke="#388E3C" strokeWidth={4.5} strokeLinecap="round" />
          <Circle cx={28} cy={50} r={3.5} fill="#4CAF50" />
        </AG>
        {/* 오른팔 */}
        <AG rotation={armR as any} originX={40} originY={37}>
          <Line x1={40} y1={37} x2={48} y2={50} stroke="#388E3C" strokeWidth={4.5} strokeLinecap="round" />
          <Circle cx={48} cy={50} r={3.5} fill="#4CAF50" />
        </AG>
        {/* 왼다리 */}
        <AG rotation={legL as any} originX={36} originY={56}>
          <Line x1={36} y1={56} x2={32} y2={74} stroke="#2E7D32" strokeWidth={5} strokeLinecap="round" />
          <Ellipse cx={31} cy={76} rx={5.5} ry={3} fill="#1B5E20" />
        </AG>
        {/* 오른다리 */}
        <AG rotation={legR as any} originX={40} originY={56}>
          <Line x1={40} y1={56} x2={44} y2={74} stroke="#2E7D32" strokeWidth={5} strokeLinecap="round" />
          <Ellipse cx={45} cy={76} rx={5.5} ry={3} fill="#1B5E20" />
        </AG>
      </AG>
    </Svg>
  );
}
