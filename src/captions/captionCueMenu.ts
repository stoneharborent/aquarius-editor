import type { TranscriptWord } from '../transcript/types';
import type { CaptionsData } from './types';
import { updateManualCue } from './manualCaptions';
import { JAPANESE_NATIVE_NAME, KOREAN_NATIVE_NAME } from '../i18n/dict/zh/native-names';

export const CAPTION_CUE_TRANSLATION_LANGS = [
  { label: 'English', flag: '🇺🇸' },
  { label: JAPANESE_NATIVE_NAME, flag: '🇯🇵' },
  { label: KOREAN_NATIVE_NAME, flag: '🇰🇷' },
  { label: 'Español', flag: '🇪🇸' },
  { label: 'Français', flag: '🇫🇷' },
  { label: 'Deutsch', flag: '🇩🇪' },
  { label: 'Português', flag: '🇵🇹' },
] as const;

export interface CaptionCueTextTarget {
  laneId: string;
  index: number;
  words: readonly TranscriptWord[];
}

export function captionCueText(target: CaptionCueTextTarget): string {
  return target.words[target.index]?.text.trim() ?? '';
}

export function replaceCaptionCueText(
  captions: CaptionsData,
  target: CaptionCueTextTarget,
  text: string,
): Partial<CaptionsData> | null {
  const cue = target.words[target.index];
  const clean = text.trim();
  if (!cue || !clean) return null;
  return updateManualCue(captions, target.laneId, target.index, clean, cue.start, cue.end);
}
