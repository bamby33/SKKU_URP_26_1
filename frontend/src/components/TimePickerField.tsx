/**
 * 시간 선택 필드 — 아이폰 시계처럼 시·분을 굴리는 휠 스피너
 * - 네이티브 DateTimePicker(spinner) 사용, 1분 단위 정확한 시각
 * - 테마에 맞춘 심플한 바텀시트
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

type Props = {
  value: string;            // "HH:MM"
  onChange: (v: string) => void;
  accent?: string;
};

const pad = (n: number) => String(n).padStart(2, '0');
const toDate = (hhmm: string): Date => {
  const [h, m] = (hhmm || '09:00').split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
};
const label12 = (hhmm: string): string => {
  const [h, m] = (hhmm || '09:00').split(':').map(Number);
  const ampm = h < 12 ? '오전' : '오후';
  return `${ampm} ${h % 12 || 12}:${pad(m)}`;
};

export default function TimePickerField({ value, onChange, accent = colors.primary }: Props) {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState<Date>(toDate(value));

  const openPicker = () => { setTemp(toDate(value)); setOpen(true); };
  const confirm = () => { onChange(`${pad(temp.getHours())}:${pad(temp.getMinutes())}`); setOpen(false); };

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={openPicker} activeOpacity={0.7}>
        <Ionicons name="time-outline" size={17} color={accent} />
        <Text style={styles.fieldText}>{label12(value)}</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.head}>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}>
                <Text style={styles.cancel}>취소</Text>
              </TouchableOpacity>
              <Text style={styles.title}>시간 선택</Text>
              <TouchableOpacity onPress={confirm} hitSlop={10}>
                <Text style={[styles.confirm, { color: accent }]}>완료</Text>
              </TouchableOpacity>
            </View>

            <DateTimePicker
              value={temp}
              mode="time"
              display="spinner"
              locale="ko-KR"
              minuteInterval={1}
              themeVariant="light"
              onChange={(_, d) => { if (d) setTemp(d); }}
              style={styles.spinner}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: '#fff', borderRadius: 12, paddingVertical: 13,
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  fieldText: { fontSize: 16, fontWeight: '800', color: '#1E293B' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 30 : 16,
  },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginBottom: 8 },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6, marginBottom: 4,
  },
  title: { fontSize: 16, fontWeight: '900', color: '#1E293B' },
  cancel: { fontSize: 15, fontWeight: '700', color: '#94A3B8' },
  confirm: { fontSize: 16, fontWeight: '900' },
  spinner: { alignSelf: 'center', width: '100%' },
});
