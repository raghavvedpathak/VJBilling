// utils/jewelryIcons.tsx
import React from 'react';
import Svg, { Path, Circle, SvgProps } from 'react-native-svg';

export interface JewelryIconProps extends SvgProps {
  size?: number;
  color?: string;
}

// ======== CUSTOM PREMIUM JEWELRY SVG COMPONENTS ========

// 1. Solitaire Ring Icon
export const RingIcon: React.FC<JewelryIconProps> = ({ size = 24, color = '#D4AF37', ...props }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
    <Circle cx="12" cy="15" r="5.5" stroke={color} strokeWidth="1.5" />
    <Path d="M9 8.5 L12 4 L15 8.5 L12 9.5 Z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.25" />
    <Path d="M9 8.5 L15 8.5" stroke={color} strokeWidth="1.2" />
    <Path d="M10.5 8.5 L12 11.5 L13.5 8.5" stroke={color} strokeWidth="1.2" />
    <Path d="M5.5 4.5 L7 6" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    <Path d="M18.5 4.5 L17 6" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
  </Svg>
);

// 2. Bangle / Kada / Kangan Icon
export const BangleIcon: React.FC<JewelryIconProps> = ({ size = 24, color = '#D4AF37', ...props }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
    <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="1.5" />
    <Circle cx="12" cy="12" r="6" stroke={color} strokeWidth="1.2" strokeDasharray="3 2" />
    <Circle cx="12" cy="3.5" r="1" fill={color} />
    <Circle cx="12" cy="20.5" r="1" fill={color} />
    <Circle cx="3.5" cy="12" r="1" fill={color} />
    <Circle cx="20.5" cy="12" r="1" fill={color} />
  </Svg>
);

// 3. Necklace / Chain / Mangalsutra Icon
export const NecklaceIcon: React.FC<JewelryIconProps> = ({ size = 24, color = '#D4AF37', ...props }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
    <Path d="M4 5 C 4 15, 20 15, 20 5" stroke={color} strokeWidth="1.5" fill="none" />
    <Path d="M12 12.5 L12 15" stroke={color} strokeWidth="1.5" />
    <Path d="M12 15 L15 18 L12 21 L9 18 Z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.3" />
    <Circle cx="8" cy="10" r="0.9" fill={color} />
    <Circle cx="16" cy="10" r="0.9" fill={color} />
  </Svg>
);

// 4. Earring / Jhumka / Tops Icon
export const EarringIcon: React.FC<JewelryIconProps> = ({ size = 24, color = '#D4AF37', ...props }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
    <Circle cx="12" cy="4" r="2" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.3" />
    <Path d="M12 6 L12 9" stroke={color} strokeWidth="1.5" />
    <Path d="M7 14 C7 9.5, 17 9.5, 17 14 Z" stroke={color} strokeWidth="1.5" fill="none" />
    <Path d="M6.5 14 L17.5 14" stroke={color} strokeWidth="1.5" />
    <Circle cx="8" cy="17.5" r="1" fill={color} />
    <Circle cx="12" cy="18.5" r="1" fill={color} />
    <Circle cx="16" cy="17.5" r="1" fill={color} />
  </Svg>
);

// 5. Coin / Bullion / Vedhani Icon
export const CoinIcon: React.FC<JewelryIconProps> = ({ size = 24, color = '#D4AF37', ...props }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
    <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="1.5" />
    <Circle cx="12" cy="12" r="6.5" stroke={color} strokeWidth="1" />
    <Path d="M12 7.5 L13.2 10.2 L16 10.4 L13.8 12.2 L14.5 15 L12 13.5 L9.5 15 L10.2 12.2 L8 10.4 L10.8 10.2 Z" stroke={color} strokeWidth="1" fill={color} fillOpacity="0.3" />
  </Svg>
);

// 6. Gem / Faceted Diamond Icon
export const GemIcon: React.FC<JewelryIconProps> = ({ size = 24, color = '#D4AF37', ...props }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
    <Path d="M6 9 L9 4 L15 4 L18 9 L12 20 Z" stroke={color} strokeWidth="1.5" fill="none" />
    <Path d="M9 4 L15 4 L18 9 L6 9 Z" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.2" />
    <Path d="M9 4 L12 9 L15 4" stroke={color} strokeWidth="1.2" />
    <Path d="M6 9 L12 20 L18 9" stroke={color} strokeWidth="1.2" />
    <Path d="M12 9 L12 20" stroke={color} strokeWidth="1.2" />
  </Svg>
);

// 7. Crown Icon (Default Fallback)
export const CrownIcon: React.FC<JewelryIconProps> = ({ size = 24, color = '#D4AF37', ...props }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
    <Path d="M4 18 L20 18" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M4 18 L4 11 L8 14 L12 7 L16 14 L20 11 L20 18 Z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.2" />
    <Circle cx="4" cy="9.5" r="1.2" fill={color} />
    <Circle cx="12" cy="5.5" r="1.5" fill={color} />
    <Circle cx="20" cy="9.5" r="1.2" fill={color} />
  </Svg>
);

// ======== KEYWORD MATCHING RULE ENGINE ========

const CATEGORY_RULES: { keywords: string[]; Component: React.FC<JewelryIconProps> }[] = [
  {
    keywords: ['ring', 'अंगठी', 'angathi'],
    Component: RingIcon,
  },
  {
    keywords: ['bangle', 'kangan', 'kada', 'पाटल्या', 'बांगड्या', 'bracelet'],
    Component: BangleIcon,
  },
  {
    keywords: ['chain', 'necklace', 'mangalsutra', 'mala', 'हार', 'साखळी', 'मंगळसूत्र'],
    Component: NecklaceIcon,
  },
  {
    keywords: ['earring', 'jhumka', 'tops', 'झुमका', 'कुडी'],
    Component: EarringIcon,
  },
  {
    keywords: ['coin', 'vedhani', 'bullion', 'नाणे', 'वेदणी', 'bar'],
    Component: CoinIcon,
  },
  {
    keywords: ['gem', 'stone', 'diamond', 'माणिक', 'हिरा', 'pendant'],
    Component: GemIcon,
  },
];

export function getJewelryCategoryIcon(
  categoryName?: string,
  designName?: string,
  metal?: string,
  size: number = 24,
  color: string = '#D4AF37'
) {
  const nameStr = `${categoryName || ''} ${designName || ''}`.toLowerCase();

  // Find matching SVG component by keyword lookup
  const matchedRule = CATEGORY_RULES.find((rule) =>
    rule.keywords.some((kw) => nameStr.includes(kw))
  );

  let SelectedIcon: React.FC<JewelryIconProps> = CrownIcon; // Default luxury crown fallback

  if (matchedRule) {
    SelectedIcon = matchedRule.Component;
  } else if (metal?.toUpperCase() === 'SILVER') {
    SelectedIcon = CoinIcon;
  }

  return <SelectedIcon size={size} color={color} />;
}
