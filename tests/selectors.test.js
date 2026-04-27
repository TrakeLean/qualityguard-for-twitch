import { describe, it, expect, beforeEach } from 'vitest';
import { findSettingsButton, findQualityOptions } from '../src/lib/selectors.js';

function setBody(html) {
  document.body.innerHTML = html;
}

describe('findSettingsButton', () => {
  beforeEach(() => setBody(''));

  it('finds the button via the user-provided CSS selector', () => {
    setBody(`
      <div id="channel-player">
        <div>
          <div class="Layout-sc-1xcs6mc-0 iqRXAC player-controls__right-control-group">
            <div></div>
            <div>
              <div></div>
              <div>
                <div>
                  <button id="primary">Settings</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `);
    const btn = findSettingsButton();
    expect(btn?.id).toBe('primary');
  });

  it('falls back to data-a-target when CSS selector misses', () => {
    setBody(`<button data-a-target="player-settings-button" id="fallback">x</button>`);
    expect(findSettingsButton()?.id).toBe('fallback');
  });

  it('returns null when nothing matches', () => {
    setBody(`<div></div>`);
    expect(findSettingsButton()).toBeNull();
  });
});

describe('findQualityOptions', () => {
  beforeEach(() => setBody(''));

  it('returns options with their labels and elements via data-a-target', () => {
    setBody(`
      <div data-a-target="player-settings-menu">
        <div data-a-target="player-settings-submenu-quality-option">
          <label><div>Auto</div></label>
        </div>
        <div data-a-target="player-settings-submenu-quality-option">
          <label><div><div>1080p60<span>(Source)</span></div></div></label>
        </div>
        <div data-a-target="player-settings-submenu-quality-option">
          <label><div><div>160p</div></div></label>
        </div>
      </div>
    `);
    const opts = findQualityOptions();
    expect(opts).toHaveLength(3);
    expect(opts[0].label).toBe('Auto');
    expect(opts[1].label.startsWith('1080p60')).toBe(true);
    expect(opts[2].label).toBe('160p');
  });

  it('falls back to role=menuitemradio if data-a-target is missing', () => {
    setBody(`
      <div>
        <div role="menuitemradio"><label><div>Auto</div></label></div>
        <div role="menuitemradio"><label><div>720p</div></label></div>
      </div>
    `);
    const opts = findQualityOptions();
    expect(opts).toHaveLength(2);
    expect(opts[0].label).toBe('Auto');
  });

  it('returns empty array when nothing matches', () => {
    expect(findQualityOptions()).toEqual([]);
  });
});
