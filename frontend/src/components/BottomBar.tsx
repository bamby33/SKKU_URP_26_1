/**
 * 하단 탭바 (당사자/보호자 공용)
 * items: { key, label, icon(Ionicons name), onPress, active? }
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type BarItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  onLongPress?: () => void;
  active?: boolean;
  danger?: boolean;
};

export default function BottomBar({ items, color }: { items: BarItem[]; color: string }) {
  return (
    <View style={styles.bar}>
      {items.map((it) => {
        const tint = it.danger ? '#E05252' : it.active ? color : '#9AA6B5';
        return (
          <TouchableOpacity key={it.key} style={styles.item} activeOpacity={0.7} onPress={it.onPress} onLongPress={it.onLongPress}>
            <Ionicons name={it.icon} size={23} color={tint} />
            <Text style={[styles.label, { color: tint }]} numberOfLines={1}>{it.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingTop: 8, paddingBottom: 4,
    borderTopWidth: 1, borderTopColor: '#EEF1F6',
  },
  item: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2 },
  label: { fontSize: 11, fontWeight: '700' },
});
