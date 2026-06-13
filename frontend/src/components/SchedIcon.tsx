/**
 * 일과 아이콘 — 제목에 맞는 이미지가 있으면 이미지, 없으면 이모티콘 폴백.
 * 일과가 표시되는 모든 곳(목록·카드·편집 블록·팝업)에서 공용 사용.
 */
import React from 'react';
import { Image, Text, StyleProp, TextStyle } from 'react-native';
import { scheduleImage } from '../utils/scheduleImage';

export function SchedIcon({ title, emoji, size, emojiStyle }: {
  title?: string | null;
  emoji?: string;        // 이미지 없을 때 보여줄 이모티콘
  size: number;
  emojiStyle?: StyleProp<TextStyle>;
}) {
  const img = scheduleImage(title);
  if (img) {
    return <Image source={img} style={{ width: size, height: size, resizeMode: 'contain' }} />;
  }
  return <Text style={[{ fontSize: size * 0.82, lineHeight: size }, emojiStyle]}>{emoji || '📋'}</Text>;
}
