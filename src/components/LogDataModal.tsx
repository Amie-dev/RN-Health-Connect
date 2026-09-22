import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getRecordMeta, palette as C, radius as R, spacing as S } from '../theme';
import { Chip } from './ui';
import { LOGGABLE_RECORD_TYPES, type LoggableRecordType } from '../config';

export interface LogFormValues {
  recordType: LoggableRecordType;
  value1: number;
  /** Second value (diastolic pressure); only present for blood pressure. */
  value2?: number;
}

interface LogDataModalProps {
  visible: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (values: LogFormValues) => void;
}

/** Field metadata drives the form — adding a loggable type needs no new JSX. */
const FIELDS: Record<
  LoggableRecordType,
  { title: string; unit: string; placeholder: string; secondField?: string }
> = {
  Steps: { title: 'Steps', unit: 'steps', placeholder: 'e.g. 5000' },
  Weight: { title: 'Weight', unit: 'kg', placeholder: 'e.g. 72.5' },
  HeartRate: { title: 'Heart rate', unit: 'bpm', placeholder: 'e.g. 72' },
  BloodPressure: {
    title: 'Blood pressure',
    unit: 'mmHg',
    placeholder: 'e.g. 120',
    secondField: 'Diastolic (mmHg)',
  },
  Hydration: { title: 'Hydration', unit: 'liters', placeholder: 'e.g. 0.5' },
};

/** Parses a positive number; returns an error string when invalid. */
function parsePositive(raw: string, label: string): number | string {
  const value = Number.parseFloat(raw.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) {
    return `Enter a valid ${label} greater than zero.`;
  }
  return value;
}

/**
 * Sheet for writing a record into Health Connect.
 *
 * Validation happens locally before any native call, and the resulting write is
 * idempotent (`clientRecordId`), so a double tap cannot create duplicates.
 */
export const LogDataModal = React.memo(function LogDataModal({
  visible,
  saving,
  onClose,
  onSave,
}: LogDataModalProps) {
  const [recordType, setRecordType] = useState<LoggableRecordType>('Steps');
  const [value1, setValue1] = useState('');
  const [value2, setValue2] = useState('');
  const [validation, setValidation] = useState<string | null>(null);

  const field = FIELDS[recordType];

  // Reset the form each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setValue1('');
      setValue2('');
      setValidation(null);
    }
  }, [visible]);

  const primaryLabel = useMemo(
    () => (field.secondField ? 'Systolic (mmHg)' : field.title),
    [field]
  );

  const handleSave = () => {
    const first = parsePositive(value1, primaryLabel.toLowerCase());
    if (typeof first === 'string') {
      setValidation(first);
      return;
    }

    if (field.secondField) {
      const second = parsePositive(value2, 'diastolic pressure');
      if (typeof second === 'string') {
        setValidation(second);
        return;
      }
      if (second >= first) {
        setValidation('Diastolic pressure must be lower than systolic pressure.');
        return;
      }
      onSave({ recordType, value1: first, value2: second });
      return;
    }

    onSave({ recordType, value1: first });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>Log health data</Text>
            <Text
              onPress={onClose}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              ✕
            </Text>
          </View>

          <View style={styles.chips}>
            {LOGGABLE_RECORD_TYPES.map((type) => {
              const meta = getRecordMeta(type);
              return (
                <Chip
                  key={type}
                  label={meta.label}
                  icon={meta.icon}
                  active={recordType === type}
                  accent={meta.color}
                  softBackground={meta.soft}
                  onPress={() => {
                    setRecordType(type);
                    setValidation(null);
                  }}
                />
              );
            })}
          </View>

          <Text style={styles.label}>
            {primaryLabel} ({field.unit})
          </Text>
          <TextInput
            style={styles.input}
            placeholder={field.placeholder}
            placeholderTextColor={C.textMuted}
            keyboardType="decimal-pad"
            value={value1}
            onChangeText={(text) => {
              setValue1(text);
              setValidation(null);
            }}
            accessibilityLabel={primaryLabel}
          />

          {field.secondField ? (
            <>
              <Text style={styles.label}>{field.secondField}</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 80"
                placeholderTextColor={C.textMuted}
                keyboardType="number-pad"
                value={value2}
                onChangeText={(text) => {
                  setValue2(text);
                  setValidation(null);
                }}
                accessibilityLabel={field.secondField}
              />
            </>
          ) : null}

          {validation ? <Text style={styles.validation}>{validation}</Text> : null}

          <View style={styles.buttonRow}>
            <Text
              onPress={onClose}
              style={styles.cancelButton}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              Cancel
            </Text>
            <Text
              onPress={saving ? undefined : handleSave}
              style={[styles.saveButton, saving && styles.saving]}
              accessibilityRole="button"
              accessibilityLabel="Save record"
            >
              {saving ? <ActivityIndicator size="small" color="#06281E" /> : '💾  Save record'}
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(4, 8, 18, 0.72)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: S.xl,
    paddingTop: S.sm,
    paddingBottom: S.xxl,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: R.pill,
    backgroundColor: C.border,
    marginBottom: S.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 17, fontWeight: '800', color: C.text },
  close: { fontSize: 16, color: C.textMuted, padding: S.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: S.md },
  label: { fontSize: 12, fontWeight: '700', color: C.textSecondary, marginTop: S.md, marginBottom: 6 },
  input: {
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: S.lg,
    paddingVertical: 11,
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
  },
  validation: { fontSize: 12, color: C.red, fontWeight: '700', marginTop: S.sm },
  buttonRow: { flexDirection: 'row', gap: S.sm, marginTop: S.xl },
  cancelButton: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: 13,
    borderRadius: R.md,
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    overflow: 'hidden',
  },
  saveButton: {
    flex: 2,
    textAlign: 'center',
    paddingVertical: 16,
    borderRadius: R.md,
    backgroundColor: C.primary,
    color: '#06281E',
    fontSize: 13,
    fontWeight: '800',
    overflow: 'hidden',
  },
  saving: { opacity: 0.6 },
});

