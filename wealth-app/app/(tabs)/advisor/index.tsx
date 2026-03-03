// app/(tabs)/advisor.tsx — AI Advisor Chat
import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { colors, spacing, radius } from '../../../lib/theme';
import { api } from '../../../lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

function FormattedText({ text, isUser }: { text: string; isUser: boolean }) {
  const baseColor = isUser ? '#fff' : colors.text;
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    if (i > 0) elements.push(<Text key={`br-${i}`}>{'\n'}</Text>);

    // Headers
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      elements.push(
        <Text key={i} style={{ fontWeight: '700', fontSize: level === 1 ? 18 : level === 2 ? 16 : 14, color: baseColor }}>
          {headerMatch[2]}
        </Text>
      );
      return;
    }

    // Bullet points
    const bulletMatch = line.match(/^[-*•]\s+(.+)/);
    if (bulletMatch) {
      elements.push(
        <Text key={i} style={{ color: baseColor }}>
          {'  \u2022 '}{parseBold(bulletMatch[1], baseColor)}
        </Text>
      );
      return;
    }

    elements.push(<Text key={i} style={{ color: baseColor }}>{parseBold(line, baseColor)}</Text>);
  });

  return <Text style={[styles.bubbleText, { color: baseColor }]}>{elements}</Text>;
}

function parseBold(text: string, color: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <Text key={i} style={{ fontWeight: '700', color }}>{part.slice(2, -2)}</Text>;
    }
    return part;
  });
}

const EXAMPLES = [
  'How am I doing financially?',
  'How can I reduce my tax bill?',
  'Am I on track for retirement?',
  'What should I prioritise next?',
  'Analyse my spending patterns',
  'Should I overpay my mortgage?',
];

export default function AdvisorScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList>(null);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const resp = await api.sendChat(text.trim());
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: resp.reply || resp.response || resp.message || JSON.stringify(resp),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e: any) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Sorry, I couldn't connect to the server. ${e.message}`,
      }]);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const handleLongPress = (content: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Copy message?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Copy', onPress: () => Clipboard.setStringAsync(content) },
    ]);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <TouchableOpacity
        style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}
        onLongPress={() => handleLongPress(item.content)}
        activeOpacity={0.8}
      >
        {!isUser && (
          <View style={styles.aiIcon}>
            <Ionicons name="sparkles" size={14} color={colors.primary} />
          </View>
        )}
        <FormattedText text={item.content} isUser={isUser} />
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {messages.length === 0 ? (
        <View style={styles.welcome}>
          <View style={styles.welcomeIcon}>
            <Ionicons name="sparkles" size={32} color={colors.primary} />
          </View>
          <Text style={styles.welcomeTitle}>AI Financial Advisor</Text>
          <Text style={styles.welcomeSub}>
            I have full access to your finances — net worth, investments, spending, debts, tax position, and retirement plans.
          </Text>
          <Text style={styles.exampleLabel}>Try asking:</Text>
          <View style={styles.examples}>
            {EXAMPLES.map(q => (
              <TouchableOpacity key={q} style={styles.exampleChip} onPress={() => send(q)}>
                <Text style={styles.exampleText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        />
      )}

      {loading && (
        <View style={styles.typingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.typingText}>Thinking...</Text>
        </View>
      )}

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about your finances..."
          placeholderTextColor={colors.text3}
          multiline
          maxLength={2000}
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || loading) && { opacity: 0.4 }]}
          onPress={() => send(input)}
          disabled={!input.trim() || loading}
        >
          <Ionicons name="send" size={20} color={colors.bg} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  welcome: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  welcomeIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.primaryDim, alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  welcomeTitle: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  welcomeSub: { fontSize: 13, color: colors.text2, textAlign: 'center', maxWidth: 300, lineHeight: 20, marginBottom: spacing.xl },
  exampleLabel: { fontSize: 11, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.md },
  examples: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  exampleChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border,
  },
  exampleText: { fontSize: 12, color: colors.text2 },

  list: { padding: spacing.lg, paddingBottom: spacing.sm },
  bubble: { maxWidth: '85%', padding: spacing.md, borderRadius: radius.lg, marginBottom: spacing.sm },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  aiIcon: { marginBottom: 4 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  userText: { color: '#fff' },
  aiText: { color: colors.text },

  typingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  typingText: { fontSize: 12, color: colors.text3 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    padding: spacing.md, paddingBottom: Platform.OS === 'ios' ? spacing.lg : spacing.md,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  input: {
    flex: 1, maxHeight: 100,
    backgroundColor: colors.surface2, borderRadius: radius.lg,
    padding: spacing.md, color: colors.text, fontSize: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
});
