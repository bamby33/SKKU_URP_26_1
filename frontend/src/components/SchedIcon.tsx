/**
 * 일과 아이콘 — 제목에 맞는 이미지가 있으면 이미지, 없으면 이모티콘 폴백.
 * 일과가 표시되는 모든 곳(목록·카드·편집 블록·팝업)에서 공용 사용.
 */
import React from 'react';
import { Image, Text, StyleProp, TextStyle } from 'react-native';
import { scheduleImage } from '../utils/scheduleImage';

export function SchedIcon({ title, emoji, size, radius, fill, emojiStyle }: {
  title?: string | null;
  emoji?: string;        // 이미지 없을 때 보여줄 이모티콘
  size: number;          // 고정 크기 (fill 모드에선 이모티콘 폴백 크기로만 사용)
  radius?: number;       // 곡률 (기본 size의 약 18%)
  fill?: boolean;        // true면 부모 폭에 꽉 차는 정사각형
  emojiStyle?: StyleProp<TextStyle>;
}) {
  const img = scheduleImage(title);
  if (img) {
    return (
      <Image
        source={img}
        style={fill
          ? { width: '100%', aspectRatio: 1, resizeMode: 'cover', borderRadius: radius ?? 16 }
          : { width: size, height: size, resizeMode: 'cover', borderRadius: radius ?? Math.round(size * 0.18) }}
      />
    );
  }
  return <Text style={[{ fontSize: size * 0.82, lineHeight: size * 1.05, textAlign: 'center' }, emojiStyle]}>{emoji || '📋'}</Text>;
}
