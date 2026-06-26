import { format, parseISO } from 'date-fns';
import { useAppSettingsStore } from '@/store/appSettingsStore';

export function formatDate(isoString: string): string {
  if (!isoString) return '';
  const token = useAppSettingsStore.getState().dateFormatToken ?? 'dd/MM/yyyy'; // date-fns v3 token — lowercase dd and yyyy
  try {
    return format(parseISO(isoString), token);
  } catch (e) {
    console.error('Invalid date format or string:', e);
    return isoString; // fallback
  }
}