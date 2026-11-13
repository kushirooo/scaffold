import {
  escapeHtml,
  headerSafe,
  humanDuration,
  renderDetail,
  renderParagraph,
  roleLabel,
} from './render.js';

describe('escapeHtml', () => {
  it('escapes the five HTML metacharacters', () => {
    expect(escapeHtml(`<script>alert("x&y's")</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&amp;y&#39;s&quot;)&lt;/script&gt;',
    );
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('Aisyah Rahman')).toBe('Aisyah Rahman');
  });
});

describe('headerSafe', () => {
  it('collapses CR/LF so a value cannot inject an email header', () => {
    expect(headerSafe('user@rafconsult.test\r\nBcc: evil@rafconsult.test')).toBe(
      'user@rafconsult.test Bcc: evil@rafconsult.test',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(headerSafe('  user@rafconsult.test  ')).toBe(
      'user@rafconsult.test',
    );
  });
});

describe('roleLabel', () => {
  it('humanises the role enum value', () => {
    expect(roleLabel('PROJECT_MANAGER')).toBe('Project manager');
    expect(roleLabel('ADMIN')).toBe('Admin');
    expect(roleLabel('VIEWER')).toBe('Viewer');
  });
});

describe('humanDuration', () => {
  it('pluralises hours and minutes', () => {
    expect(humanDuration(24, 'hour')).toBe('24 hours');
    expect(humanDuration(1, 'hour')).toBe('1 hour');
    expect(humanDuration(15, 'minute')).toBe('15 minutes');
    expect(humanDuration(1, 'minute')).toBe('1 minute');
  });
});

describe('renderDetail', () => {
  it('escapes both the label and the value', () => {
    const html = renderDetail('<User>', '<script>alert(1)</script>');

    expect(html).toContain('&lt;User&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });
});

describe('renderParagraph', () => {
  it('escapes interpolated text', () => {
    expect(renderParagraph('<b>hello</b>')).not.toContain('<b>');
  });
});
