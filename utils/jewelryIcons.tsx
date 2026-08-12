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

// 3. Necklace / Choker / Haar Icon
export const NecklaceIcon: React.FC<JewelryIconProps> = ({ size = 24, color = '#D4AF37', ...props }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
    <Path d="M4 5 C 4 15, 20 15, 20 5" stroke={color} strokeWidth="1.5" fill="none" />
    <Path d="M12 12.5 L12 15" stroke={color} strokeWidth="1.5" />
    <Path d="M12 15 L15 18 L12 21 L9 18 Z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.3" />
    <Circle cx="8" cy="10" r="0.9" fill={color} />
    <Circle cx="16" cy="10" r="0.9" fill={color} />
  </Svg>
);

// 4. Dedicated Mangalsutra Icon
export const MangalsutraIcon: React.FC<JewelryIconProps> = ({ size = 24, color = '#D4AF37', ...props }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
    <Path d="M4 4 C 4 14, 20 14, 20 4" stroke={color} strokeWidth="1.5" fill="none" />
    <Path d="M6 4 C 6 12.5, 18 12.5, 18 4" stroke={color} strokeWidth="1" strokeDasharray="1.5 2" />
    <Circle cx="9" cy="14" r="2" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.2" />
    <Circle cx="15" cy="14" r="2" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.2" />
    <Path d="M11 14 L13 14" stroke={color} strokeWidth="1.5" />
  </Svg>
);

// 5. Chain Icon
export const ChainIcon: React.FC<JewelryIconProps> = ({ size = 24, color = '#D4AF37', ...props }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
    <Path d="M7 6 C 5 6, 5 11, 8 11 C 11 11, 11 6, 9 6" stroke={color} strokeWidth="1.5" />
    <Path d="M15 13 C 13 13, 13 18, 16 18 C 19 18, 19 13, 17 13" stroke={color} strokeWidth="1.5" />
    <Path d="M9 10 C 8 12, 14 12, 15 14" stroke={color} strokeWidth="1.5" />
  </Svg>
);

// 6. Earring / Jhumka / Tops Icon
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

// 7. Payal / Anklet / Bichhiya Icon
export const AnkletIcon: React.FC<JewelryIconProps> = ({ size = 24, color = '#D4AF37', ...props }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
    <Path d="M3 10 C 6 15, 18 15, 21 10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M4 12 C 7 16.5, 17 16.5, 20 12" stroke={color} strokeWidth="1" strokeDasharray="2 2" />
    <Circle cx="6" cy="14" r="1" fill={color} />
    <Circle cx="9" cy="15.5" r="1" fill={color} />
    <Circle cx="12" cy="16" r="1" fill={color} />
    <Circle cx="15" cy="15.5" r="1" fill={color} />
    <Circle cx="18" cy="14" r="1" fill={color} />
  </Svg>
);

// 8. Nath / Nose Ring Icon
export const NoseRingIcon: React.FC<JewelryIconProps> = ({ size = 24, color = '#D4AF37', ...props }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
    <Circle cx="10" cy="13" r="6" stroke={color} strokeWidth="1.5" />
    <Circle cx="16" cy="13" r="1" fill={color} />
    <Path d="M16 13 L21 7" stroke={color} strokeWidth="1.2" strokeDasharray="2 1" />
    <Circle cx="7" cy="17" r="0.8" fill={color} />
    <Circle cx="10" cy="19" r="0.8" fill={color} />
    <Circle cx="13" cy="17" r="0.8" fill={color} />
  </Svg>
);

// 9. Coin / Bullion / Vedhani Icon
export const CoinIcon: React.FC<JewelryIconProps> = ({ size = 24, color = '#D4AF37', ...props }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
    <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="1.5" />
    <Circle cx="12" cy="12" r="6.5" stroke={color} strokeWidth="1" />
    <Path d="M12 7.5 L13.2 10.2 L16 10.4 L13.8 12.2 L14.5 15 L12 13.5 L9.5 15 L10.2 12.2 L8 10.4 L10.8 10.2 Z" stroke={color} strokeWidth="1" fill={color} fillOpacity="0.3" />
  </Svg>
);

// 10. Silver Utensils / Vessel / Diya / Kalash Icon
export const UtensilsIcon: React.FC<JewelryIconProps> = ({ size = 24, color = '#D4AF37', ...props }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
    <Path d="M7 19 L17 19 L19 9 L5 9 Z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.15" />
    <Path d="M4 9 L20 9" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M8 9 C8 6, 16 6, 16 9" stroke={color} strokeWidth="1.2" fill="none" />
    <Circle cx="12" cy="5" r="1" fill={color} />
  </Svg>
);

// 11. Idol / Statue / Murti Icon
export const IdolIcon: React.FC<JewelryIconProps> = ({ size = 24, color = '#D4AF37', ...props }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
    <Circle cx="12" cy="7" r="3" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.2" />
    <Path d="M7 20 L17 20 L15 13 L9 13 Z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.1" />
    <Path d="M12 10 L12 13" stroke={color} strokeWidth="1.2" />
    <Path d="M5 20 L19 20" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

// 12. Gem / Faceted Diamond Icon
export const GemIcon: React.FC<JewelryIconProps> = ({ size = 24, color = '#D4AF37', ...props }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
    <Path d="M6 9 L9 4 L15 4 L18 9 L12 20 Z" stroke={color} strokeWidth="1.5" fill="none" />
    <Path d="M9 4 L15 4 L18 9 L6 9 Z" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.2" />
    <Path d="M9 4 L12 9 L15 4" stroke={color} strokeWidth="1.2" />
    <Path d="M6 9 L12 20 L18 9" stroke={color} strokeWidth="1.2" />
    <Path d="M12 9 L12 20" stroke={color} strokeWidth="1.2" />
  </Svg>
);

// 13. Crown Icon (Default Fallback)
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
    keywords: ['ring', 'अंगठी', 'angathi', 'anguthi', 'band', 'solitaire', 'रिंग'],
    Component: RingIcon,
  },
  {
    keywords: ['bangle', 'kangan', 'kada', 'पाटल्या', 'बांगड्या', 'bracelet', 'choodi', 'tode', 'goth', 'valya', 'तोडे', 'गोठ', 'वाळ्या', 'कंगन', 'कडा'],
    Component: BangleIcon,
  },
  {
    keywords: ['mangalsutra', 'tanmaniya', 'watamani', 'मंगळसूत्र', 'तन्मण्या', 'वाटी'],
    Component: MangalsutraIcon,
  },
  {
    keywords: ['chain', 'saakli', 'साखळी', 'चेन'],
    Component: ChainIcon,
  },
  {
    keywords: ['necklace', 'choker', 'mala', 'haar', 'ranihar', 'thushi', 'kolhapuri saaj', 'saaj', 'locket', 'pendant', 'हार', 'राणीहार', 'ठुशी', 'साज', 'कोल्हापुरी साज', 'माळा', 'पेंडंट', 'लॉकेट', 'नेकलेस'],
    Component: NecklaceIcon,
  },
  {
    keywords: ['earring', 'jhumka', 'jhumki', 'bali', 'tops', 'top', 'stud', 'kudi', 'bugadi', 'झुमका', 'कुडी', 'बुगडी', 'बाळी', 'इअररिंग', 'टोप्स'],
    Component: EarringIcon,
  },
  {
    keywords: ['payal', 'anklet', 'bichhiya', 'bichiya', 'jodavi', 'gungroo', 'nupur', 'chainjod', 'chain jod', 'chain-jod', 'chain_jod', 'पायाळ', 'पायल', 'जोडवी', 'बिछिया', 'नुपूर', 'घुंगरू', 'चेनजोड', 'चेन जोड', 'पैंजण', 'सखळी'],
    Component: AnkletIcon,
  },
  {
    keywords: ['nath', 'nathani', 'nose pin', 'nose ring', 'nose-pin', 'laung', 'नथ', 'नथणी', 'नोज पिन'],
    Component: NoseRingIcon,
  },
  {
    keywords: ['coin', 'vedhani', 'bullion', 'biscuit', 'bar', 'ingot', 'नाणे', 'वेदणी', 'बिस्कीट', 'बार', 'कॉईन'],
    Component: CoinIcon,
  },
  {
    keywords: ['utensil', 'vessel', 'glass', 'bowl', 'plate', 'thali', 'spoon', 'diya', 'samai', 'pooja', 'kalash', 'niranjan', 'silverware', 'bartan', 'भांडे', 'तांब्या', 'ग्लास', 'वाटी', 'ताट', 'चमचा', 'दिवा', 'समई', 'पूजा', 'निरंजन', 'कळश', 'भांडी'],
    Component: UtensilsIcon,
  },
  {
    keywords: ['idol', 'statue', 'murti', 'ganesha', 'laxmi', 'god', 'मूर्ती', 'मुर्ती', 'गणपती', 'लक्ष्मी', 'प्रतिमा'],
    Component: IdolIcon,
  },
  {
    keywords: ['gem', 'stone', 'diamond', 'pearl', 'moti', 'ruby', 'emerald', 'sapphire', 'panna', 'manik', 'हिरा', 'माणिक', 'मोती', 'पन्ना', 'रत्न'],
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
    SelectedIcon = UtensilsIcon; // Generic Silver items default to Utensils/Silverware icon instead of necklace
  }

  return <SelectedIcon size={size} color={color} />;
}
