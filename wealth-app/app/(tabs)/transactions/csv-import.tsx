// app/screens/csv-import.tsx — CSV file import screen
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../../../lib/theme';
import { api } from '../../../lib/api';

let DocumentPicker: any = null;
try {
  DocumentPicker = require('expo-document-picker');
} catch {
  // DocumentPicker not available
}

export default function CsvImportScreen() {
  const [selectedFile, setSelectedFile] = useState<{ name: string; uri: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const pickFile = async () => {
    if (!DocumentPicker) {
      Alert.alert('Not Available', 'File picker is not available on this platform. Use the web app to import CSV files.');
      return;
    }
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        setSelectedFile({ name: asset.name, uri: asset.uri });
        setResult(null);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not pick file.');
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await api.uploadCsv(selectedFile.uri);
      setResult(res);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setResult({ ok: false, error: e.message || 'Import failed' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setImporting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Instructions */}
      <View style={styles.instructionCard}>
        <View style={styles.instructionHeader}>
          <Ionicons name="document-text-outline" size={24} color={colors.primary} />
          <Text style={styles.instructionTitle}>Import Transactions from CSV</Text>
        </View>
        <Text style={styles.instructionText}>
          Supported formats include bank exports from most UK banks (Monzo, Revolut, Barclays, HSBC, etc.) and standard CSV files with columns for date, description, and amount.
        </Text>
        <View style={styles.formatList}>
          {[
            { icon: 'checkmark-circle', text: 'Date, Description, Amount columns' },
            { icon: 'checkmark-circle', text: 'Separate Debit/Credit columns' },
            { icon: 'checkmark-circle', text: 'ISO or DD/MM/YYYY date formats' },
            { icon: 'checkmark-circle', text: 'UTF-8 or Latin-1 encoding' },
          ].map(({ icon, text }, i) => (
            <View key={i} style={styles.formatRow}>
              <Ionicons name={icon as any} size={14} color={colors.teal} />
              <Text style={styles.formatText}>{text}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* File picker area */}
      {!DocumentPicker ? (
        <View style={styles.unavailableCard}>
          <Ionicons name="desktop-outline" size={40} color={colors.text3} />
          <Text style={styles.unavailableTitle}>File picker not available</Text>
          <Text style={styles.unavailableText}>
            Use the web app at your server URL to import CSV files on this device.
          </Text>
        </View>
      ) : (
        <>
          <TouchableOpacity style={styles.pickBtn} onPress={pickFile} disabled={importing}>
            <Ionicons name="folder-open-outline" size={20} color={colors.primary} />
            <Text style={styles.pickBtnText}>Pick CSV File</Text>
          </TouchableOpacity>

          {/* Selected file */}
          {selectedFile && (
            <View style={styles.selectedCard}>
              <View style={styles.fileIconWrap}>
                <Ionicons name="document-attach" size={20} color={colors.teal} />
              </View>
              <View style={styles.fileInfo}>
                <Text style={styles.fileName} numberOfLines={1}>{selectedFile.name}</Text>
                <Text style={styles.fileReady}>Ready to import</Text>
              </View>
              <TouchableOpacity onPress={() => { setSelectedFile(null); setResult(null); }}>
                <Ionicons name="close-circle" size={20} color={colors.text3} />
              </TouchableOpacity>
            </View>
          )}

          {/* Import button */}
          {selectedFile && !result && (
            <TouchableOpacity
              style={[styles.importBtn, importing && { opacity: 0.5 }]}
              onPress={handleImport}
              disabled={importing}
            >
              {importing ? (
                <ActivityIndicator size="small" color={colors.bg} />
              ) : (
                <Ionicons name="cloud-upload-outline" size={20} color={colors.bg} />
              )}
              <Text style={styles.importBtnText}>
                {importing ? 'Importing...' : 'Import'}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Results */}
      {result && (
        <View style={[styles.resultCard, result.ok !== false ? styles.resultOk : styles.resultErr]}>
          <View style={styles.resultHeader}>
            <Ionicons
              name={result.ok !== false ? 'checkmark-circle' : 'alert-circle'}
              size={24}
              color={result.ok !== false ? colors.teal : colors.rose}
            />
            <Text style={styles.resultTitle}>
              {result.ok !== false ? 'Import Complete' : 'Import Failed'}
            </Text>
          </View>
          {result.imported != null && (
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Imported</Text>
              <Text style={styles.resultValue}>{result.imported} transactions</Text>
            </View>
          )}
          {result.skipped != null && result.skipped > 0 && (
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Skipped (duplicates)</Text>
              <Text style={styles.resultValue}>{result.skipped}</Text>
            </View>
          )}
          {result.errors && result.errors.length > 0 && (
            <View style={styles.errorsWrap}>
              <Text style={styles.errorsTitle}>Errors:</Text>
              {result.errors.slice(0, 5).map((err: string, i: number) => (
                <Text key={i} style={styles.errorText}>{err}</Text>
              ))}
              {result.errors.length > 5 && (
                <Text style={styles.errorText}>...and {result.errors.length - 5} more</Text>
              )}
            </View>
          )}
          {result.error && (
            <Text style={styles.errorText}>{result.error}</Text>
          )}
          {result.ok !== false && (
            <TouchableOpacity
              style={styles.importAnotherBtn}
              onPress={() => { setSelectedFile(null); setResult(null); }}
            >
              <Text style={styles.importAnotherText}>Import Another File</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },

  instructionCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  instructionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  instructionTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  instructionText: { fontSize: 13, color: colors.text2, lineHeight: 20, marginBottom: spacing.md },
  formatList: { gap: spacing.xs },
  formatRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  formatText: { fontSize: 12, color: colors.text2 },

  unavailableCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.xxl, alignItems: 'center', gap: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  unavailableTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  unavailableText: { fontSize: 13, color: colors.text3, textAlign: 'center', lineHeight: 20 },

  pickBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primaryDim, borderRadius: radius.lg,
    paddingVertical: spacing.lg, borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
    borderStyle: 'dashed', marginBottom: spacing.md,
  },
  pickBtnText: { fontSize: 15, fontWeight: '600', color: colors.primary },

  selectedCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.md,
  },
  fileIconWrap: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.tealDim, alignItems: 'center', justifyContent: 'center',
  },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '500', color: colors.text },
  fileReady: { fontSize: 11, color: colors.teal, marginTop: 2 },

  importBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingVertical: spacing.md, marginBottom: spacing.lg,
  },
  importBtnText: { fontSize: 16, fontWeight: '700', color: colors.bg },

  resultCard: {
    borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1,
  },
  resultOk: { backgroundColor: colors.tealDim, borderColor: 'rgba(34,197,94,0.25)' },
  resultErr: { backgroundColor: colors.roseDim, borderColor: 'rgba(239,68,68,0.25)' },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  resultTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  resultRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  resultLabel: { fontSize: 13, color: colors.text2 },
  resultValue: { fontSize: 13, fontWeight: '600', color: colors.text },
  errorsWrap: { marginTop: spacing.sm },
  errorsTitle: { fontSize: 12, fontWeight: '600', color: colors.rose, marginBottom: spacing.xs },
  errorText: { fontSize: 12, color: colors.rose, lineHeight: 18 },
  importAnotherBtn: { marginTop: spacing.md, alignSelf: 'center' },
  importAnotherText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
});
