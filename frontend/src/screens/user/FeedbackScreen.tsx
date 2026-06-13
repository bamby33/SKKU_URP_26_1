/**
 * 화면 4 · 사용자
 * 스케줄 달성/미달성 피드백 — AI API 연동 + ScheduleLog 저장
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { colors } from '../../theme/colors';
import { api } from '../../api/client';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Feedback'>;
  route: RouteProp<RootStackParamList, 'Feedback'>;
};

const REASONS = [
  { emoji: '😢', label: '하기 싫었어요',   key: '하기 싫었어요' },
  { emoji: '😰', label: '무서워서요',       key: '무서워서요' },
  { emoji: '😵', label: '너무 힘들었어요',  key: '너무 힘들었어요' },
  { emoji: '🤷', label: '잘 모르겠어요',   key: '잘 모르겠어요' },
];

export default function FeedbackScreen({ navigation, route }: Props) {
  const { scheduleId, achieved, title } = route.params;

  const [aiReply, setAiReply]           = useState<string | null>(null);
  const [loading, setLoading]           = useState(false);
  const [reasonPicked, setReasonPicked] = useState<string | null>(null);

  const callAI = async (message: string, achievedVal: boolean, reason?: string) => {
    const stored = await AsyncStorage.getItem('user_id');
    if (!stored) return;
    setLoading(true);
    try {
      const res = await api.post('/chat/', {
        user_id: Number(stored),
        message,
        context: {
          schedule_id: scheduleId,
          achieved: achievedVal,
          ...(reason ? { reason } : {}),
        },
      });
      setAiReply(res.data.reply || '오늘도 수고했어요 😊');
    } catch {
      setAiReply(achievedVal
        ? '잘했어요! 멋져요 😊'
        : '그럴 수 있어요. 다음에 같이 해봐요 💙');
    } finally {
      setLoading(false);
    }
  };

  // 달성인 경우 마운트 시 바로 AI 호출
  useEffect(() => {
    if (achieved) {
      callAI('방금 일과를 완료했어요!', true);
    }
  }, []);

  const handleReasonSelect = (reason: string) => {
    setReasonPicked(reason);
    callAI(`일과를 못 했어요. 이유: ${reason}`, false, reason);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI와 대화하기</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* AI 첫 말풍선 */}
        <View style={styles.aiRow}>
          <View style={styles.aiAvatar}><Text style={{ fontSize: 18 }}>🤖</Text></View>
          <View style={styles.aiBubble}>
            <Text style={styles.aiBubbleText}>
              {achieved
                ? `${title} 했어요? 대단해요! 🎉`
                : `${title}\n못 하셨군요.\n왜 그러셨는지\n알려주실 수 있어요?`}
            </Text>
          </View>
        </View>

        {/* 달성: 로딩 → AI 응답 */}
        {achieved && loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>AI가 응답 중이에요...</Text>
          </View>
        )}
        {achieved && aiReply && !loading && (
          <View style={styles.aiRow}>
            <View style={styles.aiAvatar}><Text style={{ fontSize: 18 }}>🤖</Text></View>
            <View style={[styles.aiBubble, styles.aiBubbleSuccess]}>
              <Text style={styles.aiBubbleText}>{aiReply}</Text>
            </View>
          </View>
        )}

        {/* 미달성: 이유 선택 */}
        {!achieved && !reasonPicked && (
          <>
            <Text style={styles.reasonLabel}>이유를 골라주세요</Text>
            <View style={styles.reasonGrid}>
              {REASONS.map((r) => (
                <TouchableOpacity
                  key={r.key}
                  style={styles.reasonBtn}
                  onPress={() => handleReasonSelect(r.key)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.rEmoji}>{r.emoji}</Text>
                  <Text style={styles.rText}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* 미달성 + 이유 선택 후: 로딩 → AI 응답 */}
        {!achieved && reasonPicked && loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>AI가 응답 중이에요...</Text>
          </View>
        )}
        {!achieved && reasonPicked && aiReply && !loading && (
          <View style={styles.aiRow}>
            <View style={styles.aiAvatar}><Text style={{ fontSize: 18 }}>🤖</Text></View>
            <View style={styles.aiBubble}>
              <Text style={styles.aiBubbleText}>{aiReply}</Text>
            </View>
          </View>
        )}

        {/* 완료 버튼 — AI 응답 후에만 표시 */}
        {aiReply && !loading && (
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
          >
            <Text style={styles.submitText}>알겠어요! 😊</Text>
          </TouchableOpacity>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    backgroundColor: colors.primary,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  back: { color: colors.white, fontSize: 20 },
  headerTitle: { color: colors.white, fontWeight: '700', fontSize: 14 },

  content: { padding: 20, gap: 16 },

  aiRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  aiAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  aiBubble: {
    backgroundColor: colors.primaryBg,
    borderRadius: 18, borderBottomLeftRadius: 4,
    padding: 14, maxWidth: '78%',
  },
  aiBubbleSuccess: { backgroundColor: '#E8F5E9' },
  aiBubbleText: { fontSize: 15, color: colors.primary, lineHeight: 22, fontWeight: '600' },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 48 },
  loadingText: { fontSize: 13, color: '#aaa' },

  reasonLabel: { fontSize: 14, fontWeight: '700', color: '#777', paddingLeft: 4 },
  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  reasonBtn: {
    width: '47%',
    backgroundColor: colors.card,
    borderWidth: 2, borderColor: colors.border,
    borderRadius: 16, padding: 16,
    alignItems: 'center', gap: 8,
  },
  rEmoji: { fontSize: 28 },
  rText: { fontSize: 13, color: colors.primary, fontWeight: '700', textAlign: 'center' },

  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', marginTop: 8,
    elevation: 4,
    shadowColor: colors.primary, shadowOpacity: 0.3,
    shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  submitText: { color: colors.white, fontWeight: '800', fontSize: 16 },
});
