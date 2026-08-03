// utils/jewelryIcons.tsx
import React from 'react';
import { Focus, Aperture, Workflow, Gem, Coins, Crown, Award } from 'lucide-react-native';

export function getJewelryCategoryIcon(categoryName?: string, designName?: string, metal?: string, size: number = 22, color?: string) {
  const nameStr = `${categoryName || ''} ${designName || ''}`.toLowerCase();
  const iconProps = color ? { size, color } : { size };
  
  if (nameStr.includes('ring') || nameStr.includes('अंगठी') || nameStr.includes('angathi')) {
    return <Focus {...iconProps} />;
  }
  if (nameStr.includes('bangle') || nameStr.includes('kangan') || nameStr.includes('kada') || nameStr.includes('पाटल्या') || nameStr.includes('बांगड्या') || nameStr.includes('bracelet')) {
    return <Aperture {...iconProps} />;
  }
  if (nameStr.includes('chain') || nameStr.includes('necklace') || nameStr.includes('mangalsutra') || nameStr.includes('mala') || nameStr.includes('हार') || nameStr.includes('साखळी') || nameStr.includes('मंगळसूत्र')) {
    return <Workflow {...iconProps} />;
  }
  if (nameStr.includes('earring') || nameStr.includes('jhumka') || nameStr.includes('tops') || nameStr.includes('झुमका') || nameStr.includes('कुडी')) {
    return <Award {...iconProps} />;
  }
  if (nameStr.includes('coin') || nameStr.includes('vedhani') || nameStr.includes('bullion') || nameStr.includes('नाणे') || nameStr.includes('वेदणी') || nameStr.includes('bar')) {
    return <Coins {...iconProps} />;
  }
  if (nameStr.includes('gem') || nameStr.includes('stone') || nameStr.includes('diamond') || nameStr.includes('माणिक') || nameStr.includes('हिरा') || nameStr.includes('pendant')) {
    return <Gem {...iconProps} />;
  }

  // Fallback by metal
  if (metal === 'SILVER') {
    return <Coins {...iconProps} />;
  }
  return <Crown {...iconProps} />;
}
