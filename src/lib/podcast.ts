export const MEDIA_BASE_URL = 'https://briefing.vorasec.com';
export const EPISODES_PER_PAGE = 12;

export type EpisodeFile = {
  id: string;
  dateKey: string;
  timeKey: string;
  audioKey: string;
  notesKey?: string;
  uploaded: Date;
  size: number;
};

const briefingMatch = key.match(/^briefing_(\d{4}-\d{2}-\d{2})\.mp3$/);
const notesMatch = key.match(/^shownotes_(\d{4}-\d{2}-\d{2})\.md$/);

const episodeId = briefingMatch[1];

shownotesById.get(episodeId)

export function pairEpisodes(objects: R2Object[]): EpisodeFile[] {
  const notes = new Map<string, string>();

  for (const object of objects) {
    const match = object.key.match(NOTES_RE);
    if (match) notes.set(`${match[1]}_${match[2]}`, object.key);
  }

  return objects
    .flatMap((object) => {
      const match = object.key.match(AUDIO_RE);
      if (!match) return [];

      const id = `${match[1]}_${match[2]}`;
      return [{
        id,
        dateKey: match[1],
        timeKey: match[2],
        audioKey: object.key,
        notesKey: notes.get(id),
        uploaded: object.uploaded,
        size: object.size,
      } satisfies EpisodeFile];
    })
    .sort((a, b) => b.id.localeCompare(a.id));
}

export function episodeTitle(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function episodeTime(timeKey: string): string {
  const hour = Number(timeKey.slice(0, 2));
  const minute = Number(timeKey.slice(2));
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2000, 0, 1, hour, minute)));
}

export function publicObjectUrl(key: string): string {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return `${MEDIA_BASE_URL.replace(/\/$/, '')}/${encoded}`;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function escapeHtml(value: string): string {
  return decodeEntities(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Conservative renderer for generated show notes. It supports headings,
 * paragraphs, and bullet items with an optional URL on the following line.
 * Raw HTML is always escaped.
 */
export function renderShowNotes(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const output: string[] = [];
  let paragraph: string[] = [];
  let listOpen = false;

  const closeParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${escapeHtml(paragraph.join(' ').trim())}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!listOpen) return;
    output.push('</ul>');
    listOpen = false;
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();

    if (!line) {
      closeParagraph();
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeParagraph();
      closeList();
      const level = Math.min(heading[1].length + 1, 4);
      output.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+?)(?:\s+—\s*)?$/);
    if (bullet) {
      closeParagraph();
      if (!listOpen) {
        output.push('<ul>');
        listOpen = true;
      }

      let label = bullet[1].replace(/\s+—\s*$/, '').trim();
      const nextLine = lines[index + 1]?.trim() ?? '';
      const url = safeUrl(nextLine);
      if (url) index++;

      output.push(
        url
          ? `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a></li>`
          : `<li>${escapeHtml(label)}</li>`,
      );
      continue;
    }

    const standaloneUrl = safeUrl(line);
    if (standaloneUrl) {
      closeParagraph();
      closeList();
      output.push(`<p><a href="${escapeHtml(standaloneUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(standaloneUrl)}</a></p>`);
      continue;
    }

    paragraph.push(line);
  }

  closeParagraph();
  closeList();
  return output.join('\n');
}
