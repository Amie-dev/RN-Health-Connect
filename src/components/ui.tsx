import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { motion, palette as C, radius as R, spacing as S } from '../theme';

/* -------------------------------------------------------------------------- */
/* Animation primitives                                                       */
/* -------------------------------------------------------------------------- */

/** Fade + slide-up entrance that plays once when the view mounts. */
export function Reveal({
  children,
  delay = 0,
  duration = motion.slow,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      delay,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, delay, duration]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Tactile press feedback: springs down on touch, bounces back on release. */
export function PressableScale({
  children,
  onPress,
  onLongPress,
  disabled,
  style,
  outerStyle,
  scaleTo = 0.96,
  accessibilityLabel,
  accessibilityHint,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  outerStyle?: StyleProp<ViewStyle>;
  scaleTo?: number;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () =>
    Animated.spring(scale, {
      toValue: scaleTo,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4,
    }).start();

  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 7 }).start();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={outerStyle}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled) }}
      hitSlop={6}
    >
      <Animated.View style={[style, { transform: [{ scale }] }, disabled && styles.dimmed]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

/** Endless breathing pulse — used for the hero avatar and LIVE badge. */
export function Pulse({
  children,
  minScale = 1,
  maxScale = 1.15,
  duration = 1300,
  style,
}: {
  children: React.ReactNode;
  minScale?: number;
  maxScale?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: duration * 0.42,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: duration * 0.58,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, duration]);

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [minScale, maxScale] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Spins its children in an endless loop while `spinning` is true. */
export function Spin({
  children,
  spinning,
  duration = 850,
}: {
  children: React.ReactNode;
  spinning: boolean;
  duration?: number;
}) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!spinning) return undefined;
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spinning, rotation, duration]);

  if (!spinning) return <>{children}</>;

  return (
    <Animated.View
      style={{
        transform: [
          { rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

/* -------------------------------------------------------------------------- */
/* Data-display primitives                                                    */
/* -------------------------------------------------------------------------- */

/** Number that counts up (and re-counts) whenever its value changes. */
export function CountUp({
  value,
  format,
  duration = 900,
  style,
}: {
  value: number | null;
  format: (n: number) => string;
  duration?: number;
  style?: StyleProp<TextStyle>;
}) {
  const isValid = typeof value === 'number' && Number.isFinite(value);
  const [text, setText] = useState(() => (isValid ? format(value as number) : '--'));
  const animation = useRef(new Animated.Value(1)).current;
  const previous = useRef<number | null>(isValid ? (value as number) : null);

  useEffect(() => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      previous.current = null;
      setText('--');
      return undefined;
    }

    const from = previous.current ?? 0;
    previous.current = value;

    if (from === value) {
      setText(format(value));
      return undefined;
    }

    animation.setValue(0);
    const listenerId = animation.addListener(({ value: t }) => {
      const current = from + (value - from) * t;
      setText(Number.isFinite(current) ? format(current) : '--');
    });
    const timer = Animated.timing(animation, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      // Text content cannot be animated natively.
      useNativeDriver: false,
    });
    timer.start();

    return () => {
      animation.removeListener(listenerId);
      timer.stop();
    };
  }, [value, format, duration, animation]);

  return (
    <Text style={style} numberOfLines={1}>
      {text}
    </Text>
  );
}

/** Goal progress bar that eases to its target width whenever `pct` changes. */
export function GoalBar({ pct, color, track }: { pct: number; color: string; track: string }) {
  const progress = useRef(new Animated.Value(0)).current;
  const target = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: target,
      duration: 1000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [target, progress]);

  return (
    <View style={[styles.barTrack, { backgroundColor: track }]}>
      <Animated.View
        style={[
          styles.barFill,
          {
            backgroundColor: color,
            width: progress.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
          },
        ]}
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Surfaces & controls                                                        */
/* -------------------------------------------------------------------------- */

/** Themed surface used by every card in the dashboard. */
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[surfaceStyles.card, style]}>{children}</View>;
}

/** Section title with an optional right-hand accessory. */
export function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={surfaceStyles.sectionHeader}>
      <View style={surfaceStyles.sectionHeaderText}>
        <Text style={surfaceStyles.sectionTitle}>{title}</Text>
        {subtitle ? (
          <Text style={surfaceStyles.sectionSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** Selectable filter / logging chip. */
export function Chip({
  label,
  icon,
  active,
  onPress,
  accent = C.primary,
  softBackground = C.primarySoft,
}: {
  label: string;
  icon?: string;
  active?: boolean;
  onPress: () => void;
  accent?: string;
  softBackground?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active) }}
      accessibilityLabel={label}
      style={[
        surfaceStyles.chip,
        active ? { backgroundColor: softBackground, borderColor: accent } : null,
      ]}
    >
      <Text style={[surfaceStyles.chipText, active ? { color: accent, fontWeight: '700' } : null]}>
        {icon ? `${icon} ` : ''}
        {label}
      </Text>
    </Pressable>
  );
}

/** Small coloured status badge. */
export function StatusPill({
  label,
  color,
  background,
  icon,
}: {
  label: string;
  color: string;
  background: string;
  icon?: string;
}) {
  return (
    <View style={[surfaceStyles.pill, { backgroundColor: background }]}>
      <Text style={[surfaceStyles.pillText, { color }]} numberOfLines={1}>
        {icon ? `${icon} ` : ''}
        {label}
      </Text>
    </View>
  );
}

/** Compact secondary button used across the console and permission panels. */
export function ActionButton({
  label,
  onPress,
  disabled,
  tone = 'default',
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'primary' | 'danger' | 'warning';
  icon?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const tones: Record<string, { bg: string; border: string; text: string }> = {
    default: { bg: C.surfaceAlt, border: C.border, text: C.text },
    primary: { bg: C.primarySoft, border: C.primary, text: C.mint },
    danger: { bg: C.redSoft, border: C.red, text: C.red },
    warning: { bg: C.amberSoft, border: C.amber, text: C.amber },
  };
  const palette = tones[tone] ?? tones.default;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={[
        surfaceStyles.actionButton,
        { backgroundColor: palette.bg, borderColor: palette.border },
        disabled && surfaceStyles.dimmed,
        style,
      ]}
    >
      <Text style={[surfaceStyles.actionButtonText, { color: palette.text }]} numberOfLines={1}>
        {icon ? `${icon} ` : ''}
        {label}
      </Text>
    </Pressable>
  );
}

const surfaceStyles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: S.md,
    gap: S.md,
  },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  sectionSubtitle: { fontSize: 12, color: C.textMuted, marginTop: 2, fontWeight: '500' },
  chip: {
    paddingHorizontal: S.lg,
    paddingVertical: 9,
    borderRadius: R.pill,
    borderWidth: 1,
    marginRight: S.sm,
    marginBottom: S.sm,
    backgroundColor: C.surfaceAlt,
    borderColor: C.border,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: C.textSecondary },
  pill: { paddingHorizontal: S.md, paddingVertical: 5, borderRadius: R.pill, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  actionButton: {
    paddingHorizontal: S.lg,
    paddingVertical: 10,
    borderRadius: R.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: { fontSize: 13, fontWeight: '700' },
  dimmed: { opacity: 0.5 },
});

/* -------------------------------------------------------------------------- */
/* Feedback                                                                  */
/* -------------------------------------------------------------------------- */

export type BannerTone = 'info' | 'success' | 'warning' | 'error';

/** Inline status message. Replaces the old blocking Alert popups. */
export function Banner({
  tone = 'info',
  title,
  message,
  actionLabel,
  onAction,
  onDismiss,
}: {
  tone?: BannerTone;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}) {
  const tones: Record<BannerTone, { accent: string; background: string; icon: string }> = {
    info: { accent: C.sky, background: C.skySoft, icon: 'ℹ️' },
    success: { accent: C.primary, background: C.primarySoft, icon: '✅' },
    warning: { accent: C.amber, background: C.amberSoft, icon: '⚠️' },
    error: { accent: C.red, background: C.redSoft, icon: '⛔' },
  };
  const tonePalette = tones[tone];

  return (
    <View
      style={[
        bannerStyles.container,
        { backgroundColor: tonePalette.background, borderColor: tonePalette.accent },
      ]}
      accessibilityRole="alert"
    >
      <Text style={bannerStyles.icon}>{tonePalette.icon}</Text>
      <View style={bannerStyles.content}>
        <Text style={[bannerStyles.title, { color: tonePalette.accent }]}>{title}</Text>
        {message ? <Text style={bannerStyles.message}>{message}</Text> : null}
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} accessibilityRole="button" style={bannerStyles.action}>
            <Text style={[bannerStyles.actionText, { color: tonePalette.accent }]}>
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
          hitSlop={10}
          style={bannerStyles.dismiss}
        >
          <Text style={bannerStyles.dismissText}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Friendly empty / zero-data state with an optional call to action. */
export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={bannerStyles.empty}>
      <Text style={bannerStyles.emptyIcon}>{icon}</Text>
      <Text style={bannerStyles.emptyTitle}>{title}</Text>
      <Text style={bannerStyles.emptyMessage}>{message}</Text>
      {actionLabel && onAction ? (
        <ActionButton label={actionLabel} onPress={onAction} tone="primary" style={bannerStyles.emptyAction} />
      ) : null}
    </View>
  );
}

/** Centered spinner with a label — used while a screen-level load is running. */
export function LoadingState({ label }: { label: string }) {
  return (
    <View style={bannerStyles.loading}>
      <Text style={bannerStyles.loadingSpinner}>⏳</Text>
      <Text style={bannerStyles.loadingLabel}>{label}</Text>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: S.sm,
    padding: S.md,
    borderRadius: R.md,
    borderWidth: 1,
    marginBottom: S.md,
  },
  icon: { fontSize: 15 },
  content: { flex: 1 },
  title: { fontSize: 13, fontWeight: '800' },
  message: { fontSize: 12, color: C.textSecondary, marginTop: 3, lineHeight: 17 },
  action: { marginTop: S.sm, alignSelf: 'flex-start' },
  actionText: { fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' },
  dismiss: { paddingLeft: S.sm },
  dismissText: { color: C.textMuted, fontSize: 13, fontWeight: '700' },
  empty: {
    alignItems: 'center',
    paddingHorizontal: S.xl,
    paddingVertical: S.xxl,
    backgroundColor: C.surfaceDeep,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: 'dashed',
  },
  emptyIcon: { fontSize: 34, marginBottom: S.md },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: C.text, textAlign: 'center' },
  emptyMessage: {
    fontSize: 13,
    color: C.textMuted,
    textAlign: 'center',
    marginTop: S.sm,
    lineHeight: 19,
  },
  emptyAction: { marginTop: S.lg, minWidth: 160 },
  loading: { alignItems: 'center', paddingVertical: S.xl },
  loadingSpinner: { fontSize: 26 },
  loadingLabel: { marginTop: S.sm, fontSize: 13, color: C.textSecondary, fontWeight: '600' },
});

/** Shared animation styles (kept last so every component above can use them). */
const styles = StyleSheet.create({
  dimmed: { opacity: 0.55 },
  barTrack: { height: 6, borderRadius: R.pill, overflow: 'hidden', width: '100%' },
  barFill: { height: '100%', borderRadius: R.pill },
});



