// app/screens/category-management.tsx — Category CRUD, merge, archive
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  RefreshControl, Alert, TextInput, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../../../lib/theme';
import { api, formatGBP } from '../../../lib/api';

export default function CategoryManagementScreen() {
  const [categories, setCategories] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editBudget, setEditBudget] = useState('');
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'expense' | 'income'>('expense');

  const load = useCallback(async () => {
    try {
      const d = await api.getData();
      setCategories(d.user_categories || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => { load(); }, []);

  const startEdit = (cat: any) => {
    if (mergeSource) return; // in merge mode
    if (editingId === cat.id) {
      // Save changes
      saveEdit(cat);
    } else {
      setEditingId(cat.id);
      setEditName(cat.name || '');
      setEditBudget(cat.budget_monthly ? String(cat.budget_monthly) : '');
    }
  };

  const saveEdit = async (cat: any) => {
    try {
      const body: any = {};
      if (editName && editName !== cat.name) body.name = editName;
      const budgetVal = parseFloat(editBudget);
      if (!isNaN(budgetVal) && budgetVal !== cat.budget_monthly) body.budget_monthly = budgetVal;
      if (editBudget === '' && cat.budget_monthly) body.budget_monthly = null;

      if (Object.keys(body).length > 0) {
        await api.updateCategory(cat.id, body);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await load();
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setEditingId(null);
  };

  const handleDelete = (cat: any) => {
    Alert.alert(
      'Delete Category?',
      `Remove "${cat.name}"? Transactions using this category will become uncategorised.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await api.deleteCategory(cat.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await load();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ],
    );
  };

  const handleArchive = async (cat: any) => {
    try {
      await api.updateCategory(cat.id, { archived: true });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const startMerge = (cat: any) => {
    if (mergeSource === cat.id) {
      // Cancel merge
      setMergeSource(null);
      return;
    }
    if (mergeSource) {
      // Select target — confirm merge
      const sourceCat = categories.find(c => c.id === mergeSource);
      Alert.alert(
        'Merge Categories?',
        `Merge all transactions from "${sourceCat?.name}" into "${cat.name}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setMergeSource(null) },
          {
            text: 'Merge', style: 'destructive', onPress: async () => {
              try {
                await api.mergeCategories(mergeSource!, cat.id);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setMergeSource(null);
                await load();
              } catch (e: any) {
                Alert.alert('Error', e.message);
                setMergeSource(null);
              }
            },
          },
        ],
      );
    } else {
      setMergeSource(cat.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleAddCategory = async () => {
    if (!newName.trim()) {
      Alert.alert('Name Required', 'Please enter a category name.');
      return;
    }
    try {
      await api.addCategory({ name: newName.trim(), type: newType });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAddingNew(false);
      setNewName('');
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const activeCategories = categories.filter(c => !c.archived);

  const renderItem = ({ item: cat }: { item: any }) => {
    const isEditing = editingId === cat.id;
    const isMergeSource = mergeSource === cat.id;
    const isMergeTarget = mergeSource && mergeSource !== cat.id;
    const isIncome = (cat.type || '').toLowerCase() === 'income';

    return (
      <TouchableOpacity
        style={[
          styles.catCard,
          isMergeSource && styles.catCardMergeSource,
          isMergeTarget && styles.catCardMergeTarget,
        ]}
        activeOpacity={0.8}
        onPress={() => {
          if (mergeSource) {
            startMerge(cat);
          } else {
            startEdit(cat);
          }
        }}
      >
        <View style={styles.catRow}>
          <Text style={styles.catIcon}>{cat.icon || (isIncome ? '💰' : '📁')}</Text>

          {isEditing ? (
            <View style={styles.editFields}>
              <TextInput
                style={styles.editNameInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Name"
                placeholderTextColor={colors.text3}
                autoFocus
              />
              <TextInput
                style={styles.editBudgetInput}
                value={editBudget}
                onChangeText={setEditBudget}
                placeholder="Budget"
                placeholderTextColor={colors.text3}
                keyboardType="numeric"
              />
            </View>
          ) : (
            <View style={styles.catInfo}>
              <Text style={styles.catName}>{cat.name}</Text>
              <View style={styles.catMetaRow}>
                <View style={[styles.typeBadge, {
                  backgroundColor: isIncome ? colors.tealDim : colors.primaryDim,
                  borderColor: isIncome ? 'rgba(34,197,94,0.3)' : 'rgba(59,130,246,0.3)',
                }]}>
                  <Text style={[styles.typeText, { color: isIncome ? colors.teal : colors.primary }]}>
                    {isIncome ? 'Income' : 'Expense'}
                  </Text>
                </View>
                {cat.budget_monthly ? (
                  <Text style={styles.budgetText}>Budget: {formatGBP(cat.budget_monthly)}/mo</Text>
                ) : null}
              </View>
            </View>
          )}

          {/* Action buttons */}
          {!mergeSource && !isEditing && (
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => startMerge(cat)}
              >
                <Ionicons name="git-merge-outline" size={16} color={colors.text3} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleArchive(cat)}
              >
                <Ionicons name="archive-outline" size={16} color={colors.text3} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleDelete(cat)}
              >
                <Ionicons name="trash-outline" size={16} color={colors.rose} />
              </TouchableOpacity>
            </View>
          )}

          {isEditing && (
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => saveEdit(cat)}
              >
                <Ionicons name="checkmark" size={18} color={colors.teal} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => setEditingId(null)}
              >
                <Ionicons name="close" size={18} color={colors.text3} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {isMergeSource && (
          <Text style={styles.mergeHint}>Source selected — tap target category to merge into</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Merge mode banner */}
      {mergeSource && (
        <View style={styles.mergeBanner}>
          <Ionicons name="git-merge-outline" size={16} color={colors.lavender} />
          <Text style={styles.mergeBannerText}>
            Select the target category to merge into
          </Text>
          <TouchableOpacity onPress={() => setMergeSource(null)}>
            <Text style={styles.mergeBannerCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Add Category form */}
      {addingNew ? (
        <View style={styles.addCard}>
          <TextInput
            style={styles.addNameInput}
            value={newName}
            onChangeText={setNewName}
            placeholder="Category name"
            placeholderTextColor={colors.text3}
            autoFocus
          />
          <View style={styles.addTypeRow}>
            <TouchableOpacity
              style={[styles.typeOption, newType === 'expense' && styles.typeOptionActive]}
              onPress={() => setNewType('expense')}
            >
              <Text style={[styles.typeOptionText, newType === 'expense' && { color: colors.primary }]}>
                Expense
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeOption, newType === 'income' && styles.typeOptionActiveGreen]}
              onPress={() => setNewType('income')}
            >
              <Text style={[styles.typeOptionText, newType === 'income' && { color: colors.teal }]}>
                Income
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.addBtnRow}>
            <TouchableOpacity style={styles.addCancelBtn} onPress={() => { setAddingNew(false); setNewName(''); }}>
              <Text style={styles.addCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addSaveBtn} onPress={handleAddCategory}>
              <Text style={styles.addSaveText}>Add Category</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.addTopBtn}
          onPress={() => setAddingNew(true)}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.addTopBtnText}>Add Category</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={activeCategories}
        keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="pricetags-outline" size={56} color={colors.text3} />
            <Text style={styles.emptyTitle}>No categories</Text>
            <Text style={styles.emptySubtitle}>
              Add categories to organise your transactions and set budgets.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  listContent: { padding: spacing.lg, paddingBottom: 60, gap: spacing.sm },

  addTopBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    marginHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.xs,
    paddingVertical: spacing.md,
    backgroundColor: colors.primaryDim, borderRadius: radius.lg,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
  },
  addTopBtnText: { fontSize: 14, fontWeight: '600', color: colors.primary },

  addCard: {
    margin: spacing.lg, marginBottom: spacing.xs,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.primary,
  },
  addNameInput: {
    backgroundColor: colors.surface2, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    color: colors.text, fontSize: 14, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.md,
  },
  addTypeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  typeOption: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.sm,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  typeOptionActive: { borderColor: colors.primary, backgroundColor: colors.primaryDim },
  typeOptionActiveGreen: { borderColor: colors.teal, backgroundColor: colors.tealDim },
  typeOptionText: { fontSize: 13, color: colors.text3, fontWeight: '500' },
  addBtnRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  addCancelBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  addCancelText: { fontSize: 14, color: colors.text3 },
  addSaveBtn: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.full,
  },
  addSaveText: { fontSize: 14, fontWeight: '600', color: colors.bg },

  mergeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.lavenderDim, borderRadius: radius.md,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)',
  },
  mergeBannerText: { flex: 1, fontSize: 12, color: colors.lavender },
  mergeBannerCancel: { fontSize: 12, fontWeight: '600', color: colors.text3 },

  catCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  catCardMergeSource: { borderColor: colors.lavender, backgroundColor: colors.lavenderDim },
  catCardMergeTarget: { borderColor: colors.primary, borderStyle: 'dashed' },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  catIcon: { fontSize: 24 },
  catInfo: { flex: 1 },
  catName: { fontSize: 15, fontWeight: '600', color: colors.text },
  catMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  typeBadge: {
    borderRadius: radius.sm, borderWidth: 1,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  typeText: { fontSize: 10, fontWeight: '600' },
  budgetText: { fontSize: 11, color: colors.text3 },

  editFields: { flex: 1, gap: spacing.xs },
  editNameInput: {
    backgroundColor: colors.surface2, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    color: colors.text, fontSize: 14, borderWidth: 1, borderColor: colors.border,
  },
  editBudgetInput: {
    backgroundColor: colors.surface2, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    color: colors.text, fontSize: 13, borderWidth: 1, borderColor: colors.border,
    width: 120,
  },

  actions: { flexDirection: 'row', gap: spacing.xs },
  actionBtn: { padding: spacing.xs },

  mergeHint: { fontSize: 11, color: colors.lavender, marginTop: spacing.xs, fontStyle: 'italic' },

  empty: { alignItems: 'center', paddingTop: 80, gap: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  emptySubtitle: { fontSize: 14, color: colors.text3, textAlign: 'center', lineHeight: 20 },
});
