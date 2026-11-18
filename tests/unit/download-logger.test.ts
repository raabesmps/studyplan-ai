// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadTextFile } from '@/lib/download';

describe('downloadTextFile', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves the text through a temporary link, then cleans up', async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:fake-url');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    const clicks: { download: string; href: string; attached: boolean }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      // `attached` matters: some browsers ignore clicks on links that are not in the document.
      clicks.push({ download: this.download, href: this.href, attached: document.body.contains(this) });
    });

    downloadTextFile('plan.md', '# Título ✓', 'text/markdown');

    expect(clicks).toEqual([{ download: 'plan.md', href: 'blob:fake-url', attached: true }]);
    expect(document.querySelector('a[download]')).toBeNull(); // removed right after
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('text/markdown;charset=utf-8');
    expect(await blob.text()).toBe('# Título ✓');

    expect(revokeObjectURL).not.toHaveBeenCalled(); // still needed while the download starts
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
  });
});

describe('logger', () => {
  async function loadLogger(nodeEnv: string) {
    vi.stubEnv('NODE_ENV', nodeEnv);
    vi.resetModules();
    return (await import('@/lib/logger')).logger;
  }

  it('writes only in development', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const dev = await loadLogger('development');
    dev.info('a', 1);
    dev.warn('b');
    dev.error('c', new Error('x'));
    expect(info).toHaveBeenCalledWith('a', 1);
    expect(warn).toHaveBeenCalledWith('b');
    expect(error).toHaveBeenCalledOnce();
  });

  it.each(['production', 'test'])('stays silent in %s', async (env) => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const quiet = await loadLogger(env);
    quiet.info('a');
    quiet.warn('b');
    quiet.error('c');
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
