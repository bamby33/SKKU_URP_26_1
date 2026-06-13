/**
 * 최근 7일 일과 달성률 꺾은선 그래프 (react-native-svg)
 */
import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { colors } from '../theme/colors';

type Point = { label: string; rate: number; has: boolean };
type Props = { data: Point[]; width?: number };

const H = 150;            // 차트 높이
const PAD_T = 22;         // 위 여백(값 라벨)
const PAD_B = 22;         // 아래 여백(요일)
const PAD_X = 18;

export default function WeeklyRateChart({ data, width }: Props) {
  const W = width ?? Dimensions.get('window').width - 28 - 28; // body(14)+card(14) 좌우
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_T - PAD_B;

  const n = data.length;
  const x = (i: number) => PAD_X + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const y = (rate: number) => PAD_T + innerH * (1 - Math.max(0, Math.min(100, rate)) / 100);

  const pts = data.map((d, i) => ({ ...d, cx: x(i), cy: y(d.rate) }));
  const linePts = pts.filter(p => p.has);
  const polyline = linePts.map(p => `${p.cx},${p.cy}`).join(' ');

  return (
    <View style={styles.card}>
      <Svg width={W} height={H}>
        {/* 가로 격자 0/50/100 */}
        {[0, 50, 100].map(g => (
          <React.Fragment key={g}>
            <Line x1={PAD_X} y1={y(g)} x2={W - PAD_X} y2={y(g)} stroke="#EEF1F8" strokeWidth={1} />
            <SvgText x={4} y={y(g) + 3} fontSize={9} fill="#B6C0CF">{g}</SvgText>
          </React.Fragment>
        ))}
        {/* 선 */}
        {linePts.length >= 2 && (
          <Polyline points={polyline} fill="none" stroke={colors.primary} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {/* 점 + 값 */}
        {pts.map((p, i) => p.has ? (
          <React.Fragment key={i}>
            <Circle cx={p.cx} cy={p.cy} r={4} fill={colors.white} stroke={colors.primary} strokeWidth={2.5} />
            <SvgText x={p.cx} y={p.cy - 9} fontSize={10} fontWeight="bold" fill={colors.primary} textAnchor="middle">{p.rate}</SvgText>
          </React.Fragment>
        ) : null)}
        {/* 요일 라벨 */}
        {pts.map((p, i) => (
          <SvgText key={`l${i}`} x={p.cx} y={H - 6} fontSize={11} fontWeight="bold" fill="#94A3B8" textAnchor="middle">{p.label}</SvgText>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white, borderRadius: 18, padding: 14, alignItems: 'center',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
});
