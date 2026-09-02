// components/ui/CardContainer.tsx — Centralized Card Container Design System for VJ Billing
// Purpose: Unified single source of truth for all card containers across all screens and hubs.
// Note: Android HWUI safe — zero shadow/elevation to prevent black rectangular clipping artifacts.
// Visual Architecture: Crisp 4-Sided Jewel Gold Borders, Spacious Luxury Sizing, and High-Definition Clarity.

import React from 'react';
import { View, Text, TouchableOpacity, ViewProps, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ChevronRight } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';

// ============================================================================
// 1. BASE GLASS CARD CONTAINER
// Foundational glassmorphism container with crisp uniform Android-safe borders.
// ============================================================================
export interface GlassCardProps extends ViewProps {
  children: React.ReactNode;
  intensity?: number | undefined;
  contentPadding?: number;
  borderColor?: string;
  backgroundColor?: string;
  rounded?: number;
}

export function GlassCard({
  children,
  style,
  contentPadding = 16,
  borderColor,
  backgroundColor,
  rounded = 24,
  ...props
}: GlassCardProps) {
  return (
    <View
      style={[
        {
          borderRadius: rounded,
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          borderWidth: 1.2,
          borderColor: 'rgba(212, 175, 55, 0.45)',
          padding: contentPadding,
          marginBottom: 16,
        },
        style,
        backgroundColor ? { backgroundColor } : undefined,
        borderColor ? { borderColor } : undefined,
      ]}
      {...props}
    >
      {children}
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
}: MenuTileProps) {
  const hasAlert = alertCount !== undefined && alertCount > 0;
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
            backgroundColor: hasAlert ? 'rgba(254, 243, 199, 0.85)' : (cardBg || 'rgba(255, 255, 255, 0.92)'),
            padding: 14,
          }}
        >
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
                    color: COLORS.vjText,
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
                      color: 'rgba(42, 18, 8, 0.55)',
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
      style={{ marginBottom: 8 }}
    >
      <GlassCard style={{ padding: 12, borderWidth: 1.2, borderColor }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: disabled ? 0.5 : 1 }}>
          <View
            style={{
              backgroundColor: iconBg,
              padding: 10,
              borderRadius: 15,
              borderWidth: 1.5,
              borderColor: 'rgba(255, 255, 255, 0.90)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.vjText, fontWeight: '800', fontSize: 15.5 }}>{title}</Text>
            {subtitle ? (
              <Text style={{ color: 'rgba(42, 18, 8, 0.60)', fontSize: 11.5, fontWeight: '600', marginTop: 1 }}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {rightElement ? (
            rightElement
          ) : (
            <View 
              style={{ 
                padding: 6, 
                borderRadius: 999, 
                backgroundColor: 'rgba(212, 175, 55, 0.10)',
                borderWidth: 1,
                borderColor: 'rgba(212, 175, 55, 0.30)',
              }}
            >
              <ChevronRight size={17} color="#D4AF37" />
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
            <Text style={{ color: COLORS.vjText, fontWeight: '900', fontSize: 18 }}>{title}</Text>
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
            <Text style={{ color: 'rgba(92, 22, 35, 0.65)', fontSize: 12.5, fontWeight: '600' }}>
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
  return (
    <GlassCard style={[{ padding: 18, marginBottom: 16, borderWidth: 1.2, borderColor: borderColor || 'rgba(212, 175, 55, 0.45)' }, style]}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {icon ? <View style={{ marginRight: 2 }}>{icon}</View> : null}
            <View>
              <Text style={{ fontSize: 16, fontWeight: '900', color: COLORS.vjText }}>{title}</Text>
              {subtitle ? (
                <Text style={{ fontSize: 11.5, color: 'rgba(92, 22, 35, 0.6)', marginTop: 1 }}>{subtitle}</Text>
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
  color = COLORS.vjText,
  borderColor = 'rgba(212, 175, 55, 0.45)',
  style,
}: StatCardProps) {
  return (
    <GlassCard style={[{ padding: 14, borderWidth: 1.2, borderColor, flex: 1 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontSize: 10.5, fontWeight: '800', color: 'rgba(42, 18, 8, 0.6)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </Text>
        {icon}
      </View>
      <Text style={{ fontSize: 19, fontWeight: '900', color }} numberOfLines={1}>
        {value}
      </Text>
      {subtitle ? (
        <Text style={{ fontSize: 10.5, color: 'rgba(42, 18, 8, 0.5)', marginTop: 2 }} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </GlassCard>
  );
}
