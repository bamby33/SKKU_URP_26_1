/**
 * 탭으로 시간을 고르는 피커 필드 (키보드 입력 대체)
 * - 06:00 ~ 22:00, 30분 단위 (스케줄 슬롯과 동일)
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { colors } from '../theme/colors';

const HOURS = Array.from({ length: 17 }, (_, i) => String(i + 6).padStart(2, '0')); // 06~22
const MINS = ['00', '30'];

type Props = {
  value: string;            // "HH:MM"
  onChange: (v: string) => void;
  accent?: string;
};

export default function TimePickerField({ value, onChange, accent = colors.primary }: Props) {
  const [open, setOpen] = useState(false);
  const [h, setH] = useState(value.split(':')[0] ?? '09');
  const [m, setM] = useState(value.split(':')[1] ?? '00');

  const openPicker = () => {
    setH(value.split(':')[0] ?? '09');
    setM(value.split(':')[1] ?? '00');
    setOpen(true);
  };
  const confirm = () => { onChange(`${h}:${m}`); setOpen(false); };

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={openPicker} activeOpacity={0.8}>
        <Text style={styles.fieldText}>{value}</Text>
        <Text style={styles.fieldHint}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Text style={[styles.selected, { color: accent }]}>{h}:{m}</Text>

            <Text style={styles.label}>시</Text>
            <View style={styles.hourGrid}>
              {HOURS.map(hh => (
                <TouchableOpacity
                  key={hh}
                  style={[styles.hBtn, h === hh && { backgroundColor: accent, borderColor: accent }]}
                  onPress={() => setH(hh)}
                >
                  <Text style={[styles.hTxt, h === hh && { color: '#fff' }]}>{hh}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>분</Text>
            <View style={styles.minRow}>
              {MINS.map(mm => (
                <TouchableOpacity
                  key={mm}
                  style={[styles.mBtn, m === mm && { backgroundColor: accent, borderColor: accent }]}
                  onPress={() => setM(mm)}
                >
                  <Text style={[styles.mTxt, m === mm && { color: '#fff' }]}>{mm}분</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.btns}>
              <TouchableOpacity style={styles.cancel} onPress={() => setOpen(false)}>
                <Text style={styles.cancelT}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.ok, { backgroundColor: accent }]} onPress={confirm}>
                <Text style={styles.okT}>확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#F4FAF7', borderRadius: 12, paddingVertical: 13,
    borderWidth: 1.5, borderColor: colors.border,
  },
  fieldText: { fontSize: 17, fontWeight: '800', color: colors.text },
  fieldHint: { fontSize: 12, color: '#aaa' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: {
    backgroundColor: colors.white, borderRadius: 24, padding: 22, width: '100%',
    elevation: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 6 },
  },
  selected: { fontSize: 34, fontWeight: '900', textAlign: 'center', marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', color: '#888', marginBottom: 8 },

  hourGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  hBtn: {
    width: 46, height: 44, borderRadius: 12, backgroundColor: '#F4FAF7',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.border,
  },
  hTxt: { fontSize: 15, fontWeight: '700', color: '#666' },

  minRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  mBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#F4FAF7',
    alignItems: 'center', borderWidth: 1.5, borderColor: colors.border,
  },
  mTxt: { fontSize: 16, fontWeight: '700', color: '#666' },

  btns: { flexDirection: 'row', gap: 10 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: '#E8F5EE', alignItems: 'center' },
  cancelT: { fontSize: 15, fontWeight: '700', color: '#888' },
  ok: { flex: 2, paddingVertical: 13, borderRadius: 14, alignItems: 'center' },
  okT: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
