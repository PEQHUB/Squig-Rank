import { HP_PAIRS, HP_SINGLES, NOT_A_HEADPHONE, TWS_KEYWORDS } from "../config/classificationRules";

export type ItemType = 'iem' | 'headphone' | 'tws';

export function classifyItem(name: string, domain: string): ItemType {
  if (!name) return 'iem';

  const cleanName = name.trim();
  const nameLower = cleanName.toLowerCase();

  // Check for TWS
  const isTws = TWS_KEYWORDS.some(kw => nameLower.includes(kw.toLowerCase()));
  if (isTws) {
    return 'tws';
  }

  // Check for Headphone
  const isHpPath = domain.includes('5128') || domain.toLowerCase().includes('headphone') || domain.includes('/hp/');

  const hasIemKeyword = NOT_A_HEADPHONE.some(kw => nameLower.includes(kw.toLowerCase()));

  const hasHpSingle = HP_SINGLES.some(kw => nameLower.includes(kw.toLowerCase()));

  const hasHpPair = Object.entries(HP_PAIRS).some(([brand, models]) => {
    const brandLower = brand.toLowerCase();
    if (!nameLower.includes(brandLower)) return false;
    return models.some(model => nameLower.includes(model.toLowerCase()));
  });

  if ((isHpPath || hasHpSingle || hasHpPair) && !hasIemKeyword) {
    if (!domain.includes('jaytiss') || hasHpSingle || hasHpPair) {
      return 'headphone';
    }
  }

  return 'iem';
}
