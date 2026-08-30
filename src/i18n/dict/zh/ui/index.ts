// ZH UI dictionary assembly (key = English source string, value = Chinese).
import audio from './audio';
import catalogs from './catalogs';
import captions from './captions';
import chat from './chat';
import components from './components';
import editor from './editor';
import exportPanel from './exportPanel';
import fx from './fx';
import generate from './generate';
import hyperframes from './hyperframes';
import library from './library';
import media from './media';
import progress from './progress';
import review from './review';
import script from './script';
import settings from './settings';
import timeline from './timeline';
import topbar from './topbar';
import transcript from './transcript';

export const ZH: Record<string, string> = Object.assign(
  {},
  audio, catalogs, captions, chat, components, editor, exportPanel, fx, generate, hyperframes, library, media, progress, review, script, settings, timeline, topbar, transcript,
);
