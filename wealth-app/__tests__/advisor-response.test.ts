/**
 * Functional tests for AI Advisor response parsing and markdown formatting.
 */

// ─── Response extraction logic (from advisor screen) ─────────

function extractReply(resp: any): string {
  return resp.reply || resp.response || resp.message || JSON.stringify(resp);
}

// ─── Markdown parsing logic (from advisor FormattedText) ─────

function parseBoldSegments(text: string): { text: string; bold: boolean }[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.filter(p => p.length > 0).map(part => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return { text: part.slice(2, -2), bold: true };
    }
    return { text: part, bold: false };
  });
}

function classifyLine(line: string): 'header' | 'bullet' | 'text' {
  if (/^#{1,3}\s+/.test(line)) return 'header';
  if (/^[-*•]\s+/.test(line)) return 'bullet';
  return 'text';
}

function getHeaderLevel(line: string): number {
  const match = line.match(/^(#{1,3})\s+/);
  return match ? match[1].length : 0;
}

function getHeaderText(line: string): string {
  const match = line.match(/^#{1,3}\s+(.+)/);
  return match ? match[1] : line;
}

function getBulletText(line: string): string {
  const match = line.match(/^[-*•]\s+(.+)/);
  return match ? match[1] : line;
}

// ═════════════════════════════════════════════════════════════════════════════

describe('Response extraction', () => {
  test('extracts reply field from Flask response', () => {
    const resp = { reply: 'Your net worth is £150,000.' };
    expect(extractReply(resp)).toBe('Your net worth is £150,000.');
  });

  test('falls back to response field', () => {
    const resp = { response: 'Alternative format' };
    expect(extractReply(resp)).toBe('Alternative format');
  });

  test('falls back to message field', () => {
    const resp = { message: 'Message format' };
    expect(extractReply(resp)).toBe('Message format');
  });

  test('falls back to JSON.stringify when no known field', () => {
    const resp = { data: 'unknown' };
    expect(extractReply(resp)).toBe('{"data":"unknown"}');
  });

  test('prefers reply over response and message', () => {
    const resp = { reply: 'correct', response: 'wrong', message: 'wrong' };
    expect(extractReply(resp)).toBe('correct');
  });

  test('handles empty reply string (falsy) — falls through', () => {
    const resp = { reply: '', response: 'fallback' };
    expect(extractReply(resp)).toBe('fallback');
  });
});

describe('Markdown line classification', () => {
  test('recognises headers', () => {
    expect(classifyLine('# Heading')).toBe('header');
    expect(classifyLine('## Sub heading')).toBe('header');
    expect(classifyLine('### Sub sub heading')).toBe('header');
  });

  test('recognises bullet points', () => {
    expect(classifyLine('- Item one')).toBe('bullet');
    expect(classifyLine('* Item two')).toBe('bullet');
    expect(classifyLine('• Item three')).toBe('bullet');
  });

  test('recognises plain text', () => {
    expect(classifyLine('Regular text here.')).toBe('text');
    expect(classifyLine('')).toBe('text');
  });

  test('header level extraction', () => {
    expect(getHeaderLevel('# Title')).toBe(1);
    expect(getHeaderLevel('## Section')).toBe(2);
    expect(getHeaderLevel('### Subsection')).toBe(3);
    expect(getHeaderLevel('Not a header')).toBe(0);
  });

  test('header text extraction strips hashes', () => {
    expect(getHeaderText('## Financial Summary')).toBe('Financial Summary');
    expect(getHeaderText('# Overview')).toBe('Overview');
  });

  test('bullet text extraction strips prefix', () => {
    expect(getBulletText('- Reduce spending')).toBe('Reduce spending');
    expect(getBulletText('* Increase savings')).toBe('Increase savings');
    expect(getBulletText('• Check ISA limits')).toBe('Check ISA limits');
  });
});

describe('Bold parsing', () => {
  test('parses bold segments', () => {
    const segments = parseBoldSegments('Your **net worth** is growing.');
    expect(segments).toEqual([
      { text: 'Your ', bold: false },
      { text: 'net worth', bold: true },
      { text: ' is growing.', bold: false },
    ]);
  });

  test('handles multiple bold segments', () => {
    const segments = parseBoldSegments('**Income**: £3,500 | **Spending**: £2,100');
    const boldParts = segments.filter(s => s.bold);
    expect(boldParts.map(s => s.text)).toEqual(['Income', 'Spending']);
  });

  test('handles no bold text', () => {
    const segments = parseBoldSegments('Just plain text.');
    expect(segments).toEqual([{ text: 'Just plain text.', bold: false }]);
  });

  test('handles entirely bold text', () => {
    const segments = parseBoldSegments('**Everything bold**');
    expect(segments).toEqual([{ text: 'Everything bold', bold: true }]);
  });
});

describe('Full response rendering pipeline', () => {
  const SAMPLE_RESPONSE = `## Financial Summary

Your **net worth** stands at **£152,340**, up 3.2% from last month.

### Key Highlights
- **Cash savings**: £15,000 (healthy emergency fund)
- **ISA portfolio**: £45,000 — consider maxing your annual allowance
- **Mortgage**: £180,000 remaining at 4.2%

### Recommendations
- Increase pension contributions to reduce tax liability
- Consider overpaying mortgage by £200/month
- Review your entertainment spending (£180/month avg)`;

  test('response splits into correct number of lines', () => {
    const lines = SAMPLE_RESPONSE.split('\n');
    expect(lines.length).toBeGreaterThan(10);
  });

  test('contains headers, bullets, and plain text', () => {
    const lines = SAMPLE_RESPONSE.split('\n').filter(l => l.trim().length > 0);
    const types = lines.map(classifyLine);
    expect(types).toContain('header');
    expect(types).toContain('bullet');
    expect(types).toContain('text');
  });

  test('bold segments within bullets are parsed correctly', () => {
    const bulletLine = '- **Cash savings**: £15,000 (healthy emergency fund)';
    const bulletText = getBulletText(bulletLine);
    const segments = parseBoldSegments(bulletText);
    expect(segments[0]).toEqual({ text: 'Cash savings', bold: true });
  });

  test('extracted reply feeds into formatter without error', () => {
    const resp = { reply: SAMPLE_RESPONSE };
    const content = extractReply(resp);
    const lines = content.split('\n');
    // Every line should be classifiable
    for (const line of lines) {
      const type = classifyLine(line.trim());
      expect(['header', 'bullet', 'text']).toContain(type);
    }
  });
});
