// components/ui/CardContainer.tsx — Centralized Card Container Design System for VJ Billing
// Purpose: Unified single source of truth for all card containers across all screens and hubs.
// Note: Android HWUI safe — zero shadow/elevation to prevent black rectangular clipping artifacts.
// Visual Architecture: Translucent Frosted Glass with Crisp 4-Sided Jewel Gold Borders, Spacious Luxury Sizing, and High-Definition Clarity.

import React from 'react';
import { View, Text, TouchableOpacity, ViewProps, ViewStyle, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { ChevronRight } from 'lucide-react-native';
import { COLORS, getThemeColors } from '../../constants/theme';
import { appSettingsStore } from '../../store/phase1/appSettingsStore';

// ============================================================================
// 1. BASE GLASS CARD CONTAINER
// Foundational translucent glassmorphism container with crisp uniform Android-safe borders.
// ============================================================================
export interface GlassCardProps extends ViewProps {
  children: React.ReactNode;
  intensity?: number | undefined;
  contentPadding?: number | undefined;
  borderColor?: string | undefined;
  backgroundColor?: string | undefined;
  rounded?: number | undefined;
}

export function GlassCard({
  children,
  style,
  contentPadding = 16,
  borderColor,
  backgroundColor,
  rounded = 24,
  intensity = 40,
  ...props
}: GlassCardProps) {
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const isDark = activeTheme === 'dark';
  const defaultBg = isDark ? 'rgba(28, 20, 24, 0.86)' : 'rgba(255, 255, 255, 0.86)';
  const defaultBorder = isDark ? 'rgba(212, 175, 55, 0.35)' : 'rgba(212, 175, 55, 0.45)';

  const flatStyle: ViewStyle = StyleSheet.flatten(style) || {};

  // Extract padding, borders, and background color for the frosted glass layer
  const effectiveBg = flatStyle.backgroundColor || backgroundColor || defaultBg;
  const effectiveBorderColor = flatStyle.borderColor || borderColor || defaultBorder;
  const effectiveBorderWidth = flatStyle.borderWidth !== undefined ? flatStyle.borderWidth : 1.2;
  const effectivePadding = flatStyle.padding !== undefined ? flatStyle.padding : contentPadding;

  const isFixedSize = flatStyle.height !== undefined || flatStyle.flex !== undefined;

  // Outer container handles positioning, margins, dimensions, and rounded border clipping
  const outerStyle: ViewStyle = {
    borderRadius: rounded,
    borderWidth: effectiveBorderWidth,
    borderColor: effectiveBorderColor,
    overflow: 'hidden',
    marginBottom: flatStyle.marginBottom !== undefined ? flatStyle.marginBottom : 16,
    backgroundColor: 'transparent',
    ...(flatStyle.width !== undefined ? { width: flatStyle.width } : {}),
    ...(flatStyle.height !== undefined ? { height: flatStyle.height } : {}),
    ...(flatStyle.flex !== undefined ? { flex: flatStyle.flex } : {}),
    ...(flatStyle.margin !== undefined ? { margin: flatStyle.margin } : {}),
    ...(flatStyle.marginTop !== undefined ? { marginTop: flatStyle.marginTop } : {}),
    ...(flatStyle.marginLeft !== undefined ? { marginLeft: flatStyle.marginLeft } : {}),
    ...(flatStyle.marginRight !== undefined ? { marginRight: flatStyle.marginRight } : {}),
    ...(flatStyle.marginHorizontal !== undefined ? { marginHorizontal: flatStyle.marginHorizontal } : {}),
    ...(flatStyle.marginVertical !== undefined ? { marginVertical: flatStyle.marginVertical } : {}),
    ...(flatStyle.opacity !== undefined ? { opacity: flatStyle.opacity } : {}),
    ...(flatStyle.alignSelf !== undefined ? { alignSelf: flatStyle.alignSelf } : {}),
  };

  // Inner BlurView handles the frosted translucent glass backdrop and internal content padding
  const innerStyle: ViewStyle = {
    width: '100%',
    padding: effectivePadding,
    ...(flatStyle.paddingHorizontal !== undefined ? { paddingHorizontal: flatStyle.paddingHorizontal } : {}),
    ...(flatStyle.paddingVertical !== undefined ? { paddingVertical: flatStyle.paddingVertical } : {}),
    ...(flatStyle.paddingTop !== undefined ? { paddingTop: flatStyle.paddingTop } : {}),
    ...(flatStyle.paddingBottom !== undefined ? { paddingBottom: flatStyle.paddingBottom } : {}),
    ...(flatStyle.paddingLeft !== undefined ? { paddingLeft: flatStyle.paddingLeft } : {}),
    ...(flatStyle.paddingRight !== undefined ? { paddingRight: flatStyle.paddingRight } : {}),
    backgroundColor: effectiveBg,
    ...(isFixedSize ? { flex: 1 } : {}),
  };

  return (
    <View style={outerStyle} {...props}>
      <BlurView
        intensity={Platform.OS === 'ios' ? intensity : 0}
        tint={isDark ? 'dark' : 'light'}
        {...(Platform.OS === 'android' ? { blurMethod: 'none' as const } : {})}
        style={innerStyle}
      >
        {children}
      </BlurView>
    </View>
  );
}

// ============================================================================
// 2. MENU TILE (2-Column Grid Navigation Card)
// Used in Dashboard and Hub screens (e.g. Inventory Hub, Reports).
// ============================================================================
export interface MenuTileProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  iconBg?: string;
  cardBg?: string;
  borderColor?: string;
  badgeText?: string;
  badgeVariant?: 'default' | 'active' | 'warning';
  alertCount?: number;
  onPress?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'dashboard';
}

export function MenuTile({
  title,
  subtitle,
  icon,
  iconBg = 'rgba(255, 255, 255, 0.7)',
  cardBg,
  borderColor = 'rgba(212, 175, 55, 0.45)',
  badgeText,
  badgeVariant = 'default',
  alertCount,
  onPress,
  disabled,
  variant = 'default',
}: MenuTileProps) {
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);
  const hasAlert = alertCount !== undefined && alertCount > 0;
  const isDashboard = variant === 'dashboard';

  return (
    <View style={{ width: '48%' }}>
      <TouchableOpacity
        disabled={disabled}
        onPress={() => {
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } catch (e) {}
          if (onPress) onPress();
        }}
        activeOpacity={0.8}
      >
        <GlassCard
          style={{
            height: 148,
            marginBottom: 0,
            opacity: disabled ? 0.65 : 1,
            borderColor: hasAlert ? '#F59E0B' : borderColor,
            borderWidth: hasAlert ? 1.5 : 1.2,
            backgroundColor: hasAlert
              ? 'rgba(254, 243, 199, 0.85)'
              : (cardBg || (activeTheme === 'dark' ? 'rgba(28, 20, 24, 0.86)' : 'rgba(255, 255, 255, 0.86)')),
            padding: 14,
          }}
        >
          {isDashboard ? (
            <View style={{ flex: 1, justifyContent: 'space-between' }}>
              {/* Upper Section: Icon, Badge, and Title grouped close together */}
              <View>
                {/* Top Row: Icon & Status Badge */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View style={{ position: 'relative' }}>
                    <View
                      style={{
                        padding: 10,
                        borderRadius: 16,
                        borderWidth: 1.5,
                        borderColor: 'rgba(255, 255, 255, 0.95)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: iconBg,
                      }}
                    >
                      {icon}
                    </View>
                    {hasAlert && (
                      <View
                        style={{
                          position: 'absolute',
                          top: -4,
                          right: -4,
                          backgroundColor: '#EF4444',
                          borderRadius: 10,
                          minWidth: 18,
                          height: 18,
                          justifyContent: 'center',
                          alignItems: 'center',
                          paddingHorizontal: 4,
                          borderWidth: 1.5,
                          borderColor: '#FFFFFF',
                        }}
                      >
                        <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '900' }}>
                          {alertCount > 99 ? '99+' : alertCount}
                        </Text>
                      </View>
                    )}
                  </View>

                  {badgeText ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 8,
                        paddingVertical: 2.5,
                        borderRadius: 999,
                        borderWidth: 1,
                        backgroundColor: hasAlert
                          ? 'rgba(245, 158, 11, 0.2)'
                          : badgeVariant === 'active'
                          ? 'rgba(16, 185, 129, 0.12)'
                          : 'rgba(0, 0, 0, 0.05)',
                        borderColor: hasAlert
                          ? 'rgba(245, 158, 11, 0.4)'
                          : badgeVariant === 'active'
                          ? 'rgba(16, 185, 129, 0.25)'
                          : 'rgba(0, 0, 0, 0.10)',
                      }}
                    >
                      {badgeVariant === 'active' && (
                        <View
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: 2.5,
                            backgroundColor: '#10B981',
                            marginRight: 4,
                          }}
                        />
                      )}
                      <Text
                        style={{
                          fontSize: 8.5,
                          fontWeight: '900',
                          textTransform: 'uppercase',
                          letterSpacing: 0.8,
                          color: hasAlert
                            ? '#B45309'
                            : badgeVariant === 'active'
                            ? '#047857'
                            : 'rgba(42, 18, 8, 0.5)',
                        }}
                      >
                        {badgeText}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Title & Subtitle sitting directly in close proximity to the icon */}
                <Text
                  style={{
                    color: colors.vjText,
                    fontWeight: '900',
                    fontSize: 16,
                    lineHeight: 20,
                    marginBottom: 2,
                  }}
                  numberOfLines={1}
                >
                  {title}
                </Text>
                {subtitle ? (
                  <Text
                    style={{
                      color: `${colors.vjText}8C`,
                      fontSize: 10,
                      fontWeight: '800',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                    numberOfLines={1}
                  >
                    {subtitle}
                  </Text>
                ) : null}
              </View>

              {/* Bottom Row: Micro-Navigation Indicator at bottom right */}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', minHeight: 18 }}>
                {!disabled && (
                  <View
                    style={{
                      padding: 4,
                      borderRadius: 999,
                      backgroundColor: 'rgba(212, 175, 55, 0.12)',
                      borderWidth: 1,
                      borderColor: 'rgba(212, 175, 55, 0.30)',
                    }}
                  >
                    <ChevronRight size={13} color="#D4AF37" />
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={{ flex: 1, justifyContent: 'space-between', paddingBottom: 4 }}>
              {/* Top Row: Icon & Status Badge */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ position: 'relative' }}>
                  <View
                    style={{
                      padding: 11,
                      borderRadius: 18,
                      borderWidth: 1.5,
                      borderColor: 'rgba(255, 255, 255, 0.95)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: iconBg,
                    }}
                  >
                    {icon}
                  </View>
                  {hasAlert && (
                    <View
                      style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        backgroundColor: '#EF4444',
                        borderRadius: 10,
                        minWidth: 18,
                        height: 18,
                        justifyContent: 'center',
                        alignItems: 'center',
                        paddingHorizontal: 4,
                        borderWidth: 1.5,
                        borderColor: '#FFFFFF',
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '900' }}>
                        {alertCount > 99 ? '99+' : alertCount}
                      </Text>
                    </View>
                  )}
                </View>

                {badgeText ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 8,
                      paddingVertical: 2.5,
                      borderRadius: 999,
                      borderWidth: 1,
                      backgroundColor: hasAlert
                        ? 'rgba(245, 158, 11, 0.2)'
                        : badgeVariant === 'active'
                        ? 'rgba(16, 185, 129, 0.12)'
                        : 'rgba(0, 0, 0, 0.05)',
                      borderColor: hasAlert
                        ? 'rgba(245, 158, 11, 0.4)'
                        : badgeVariant === 'active'
                        ? 'rgba(16, 185, 129, 0.25)'
                        : 'rgba(0, 0, 0, 0.10)',
                    }}
                  >
                    {badgeVariant === 'active' && (
                      <View
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 2.5,
                          backgroundColor: '#10B981',
                          marginRight: 4,
                        }}
                      />
                    )}
                    <Text
                      style={{
                        fontSize: 8.5,
                        fontWeight: '900',
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                        color: hasAlert
                          ? '#B45309'
                          : badgeVariant === 'active'
                          ? '#047857'
                          : 'rgba(42, 18, 8, 0.5)',
                      }}
                    >
                      {badgeText}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Bottom Row: Title, Subtitle, and Micro-Navigation Indicator */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: 4, marginTop: 4 }}>
                  <Text
                    style={{
                      color: colors.vjText,
                      fontWeight: '900',
                      fontSize: 16,
                      lineHeight: 20,
                      marginBottom: 2,
                    }}
                    numberOfLines={1}
                  >
                    {title}
                  </Text>
                  {subtitle ? (
                    <Text
                      style={{
                        color: `${colors.vjText}8C`,
                        fontSize: 10,
                        fontWeight: '800',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                      numberOfLines={1}
                    >
                      {subtitle}
                    </Text>
                  ) : null}
                </View>

                {!disabled && (
                  <View
                    style={{
                      padding: 4,
                      borderRadius: 999,
                      backgroundColor: 'rgba(212, 175, 55, 0.12)',
                      borderWidth: 1,
                      borderColor: 'rgba(212, 175, 55, 0.30)',
                      marginBottom: 2,
                    }}
                  >
                    <ChevronRight size={13} color="#D4AF37" />
                  </View>
                )}
              </View>
            </View>
          )}
        </GlassCard>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// 3. LIST TILE CARD (Full-Width Horizontal Row Navigation Card)
// Canonical card for Settings, Master lists, and Module links.
// ============================================================================
export interface ListTileCardProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  iconBg?: string;
  borderColor?: string;
  rightElement?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}

export function ListTileCard({
  title,
  subtitle,
  icon,
  iconBg = 'rgba(255, 255, 255, 0.7)',
  borderColor = 'rgba(212, 175, 55, 0.45)',
  rightElement,
  onPress,
  disabled,
}: ListTileCardProps) {
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  return (
    <TouchableOpacity
      onPress={() => {
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch (e) {}
        if (onPress) onPress();
      }}
      disabled={disabled}
      activeOpacity={0.7}
      style={{ marginBottom: 10 }}
    >
      <GlassCard style={{ paddingVertical: 15, paddingHorizontal: 16, borderWidth: 1.2, borderColor }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, opacity: disabled ? 0.5 : 1 }}>
          <View
            style={{
              backgroundColor: iconBg,
              padding: 12,
              borderRadius: 16,
              borderWidth: 1.5,
              borderColor: 'rgba(255, 255, 255, 0.90)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.vjText, fontWeight: '800', fontSize: 16.5, lineHeight: 21 }}>{title}</Text>
            {subtitle ? (
              <Text style={{ color: `${colors.vjText}99`, fontSize: 12, fontWeight: '600', marginTop: 2 }}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {rightElement ? (
            rightElement
          ) : (
            <View 
              style={{ 
                padding: 7, 
                borderRadius: 999, 
                backgroundColor: 'rgba(212, 175, 55, 0.10)',
                borderWidth: 1,
                borderColor: 'rgba(212, 175, 55, 0.30)',
              }}
            >
              <ChevronRight size={18} color="#D4AF37" />
            </View>
          )}
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
}

// Backward-compatible alias
export const GlassSettingsTile = ListTileCard;
export type GlassSettingsTileProps = ListTileCardProps;

// ============================================================================
// 4. BANNER CARD (Featured Hero / Highlight Banner Card)
// Used for Metal Master in Inventory Hub, Firm Switcher, and Featured Banners.
// ============================================================================
export interface BannerCardProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  iconBg?: string;
  borderColor?: string;
  badgeText?: string;
  badgeBg?: string;
  badgeTextColor?: string;
  onPress?: () => void;
  rightAction?: React.ReactNode;
}

export function BannerCard({
  title,
  subtitle,
  icon,
  iconBg = 'rgba(180, 83, 9, 0.12)',
  borderColor = 'rgba(212, 175, 55, 0.45)',
  badgeText,
  badgeBg = 'rgba(212, 175, 55, 0.15)',
  badgeTextColor = '#92400E',
  onPress,
  rightAction,
}: BannerCardProps) {
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const content = (
    <GlassCard style={{ padding: 0, borderWidth: 1.2, borderColor }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18 }}>
        <View
          style={{
            padding: 14,
            borderRadius: 20,
            borderWidth: 1.5,
            borderColor: 'rgba(255, 255, 255, 0.90)',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: iconBg,
          }}
        >
          {icon}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <Text style={{ color: colors.vjText, fontWeight: '900', fontSize: 18 }}>{title}</Text>
            {badgeText ? (
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 2.5,
                  borderRadius: 999,
                  backgroundColor: badgeBg,
                  borderWidth: 1,
                  borderColor: 'rgba(212, 175, 55, 0.40)',
                }}
              >
                <Text
                  style={{
                    fontSize: 8.5,
                    fontWeight: '900',
                    color: badgeTextColor,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  {badgeText}
                </Text>
              </View>
            ) : null}
          </View>
          {subtitle ? (
            <Text style={{ color: `${colors.vjText}99`, fontSize: 12.5, fontWeight: '600' }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {rightAction ? (
          rightAction
        ) : onPress ? (
          <View
            style={{
              padding: 8,
              backgroundColor: 'rgba(212, 175, 55, 0.10)',
              borderRadius: 999,
              borderWidth: 1,
              borderColor: 'rgba(212, 175, 55, 0.35)',
            }}
          >
            <ChevronRight size={18} color="#D4AF37" />
          </View>
        ) : null}
      </View>
    </GlassCard>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } catch (e) {}
          onPress();
        }}
        style={{ marginBottom: 16 }}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={{ marginBottom: 16 }}>{content}</View>;
}

// ============================================================================
// 5. FORM SECTION CARD (Grouped Form Field Container)
// Used in multi-field forms like Add Stock, Bulk Add, Create Firm, Firm Edit.
// ============================================================================
export interface FormSectionCardProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badgeText?: string;
  children: React.ReactNode;
  borderColor?: string;
  style?: ViewStyle;
}

export function FormSectionCard({
  title,
  subtitle,
  icon,
  badgeText,
  children,
  borderColor,
  style,
}: FormSectionCardProps) {
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  return (
    <GlassCard style={[{ padding: 18, marginBottom: 16, borderWidth: 1.2, borderColor: borderColor || 'rgba(212, 175, 55, 0.45)' }, style]}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {icon ? <View style={{ marginRight: 2 }}>{icon}</View> : null}
            <View>
              <Text style={{ fontSize: 16, fontWeight: '900', color: colors.vjText }}>{title}</Text>
              {subtitle ? (
                <Text style={{ fontSize: 11.5, color: `${colors.vjText}99`, marginTop: 1 }}>{subtitle}</Text>
              ) : null}
            </View>
          </View>
          {badgeText ? (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2.5,
                borderRadius: 999,
                backgroundColor: 'rgba(212, 175, 55, 0.15)',
                borderWidth: 1,
                borderColor: 'rgba(212, 175, 55, 0.40)',
              }}
            >
              <Text style={{ fontSize: 8.5, fontWeight: '900', color: '#92400E', textTransform: 'uppercase' }}>
                {badgeText}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {children}
    </GlassCard>
  );
}

// ============================================================================
// 6. STAT CARD (Compact Metric KPI Card)
// Used in Ledgers, Stock Summaries, and Dashboard KPI rows.
// ============================================================================
export interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  color?: string;
  borderColor?: string;
  style?: ViewStyle;
}

export function StatCard({
  label,
  value,
  subtitle,
  icon,
  color,
  borderColor = 'rgba(212, 175, 55, 0.45)',
  style,
}: StatCardProps) {
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);
  const textColor = color || colors.vjText;

  return (
    <GlassCard style={[{ padding: 14, borderWidth: 1.2, borderColor, flex: 1 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontSize: 10.5, fontWeight: '800', color: `${colors.vjText}99`, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </Text>
        {icon}
      </View>
      <Text style={{ fontSize: 19, fontWeight: '900', color: textColor }} numberOfLines={1}>
        {value}
      </Text>
      {subtitle ? (
        <Text style={{ fontSize: 10.5, color: `${colors.vjText}80`, marginTop: 2 }} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </GlassCard>
  );
}
