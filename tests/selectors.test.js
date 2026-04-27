import { describe, it, expect, beforeEach } from 'vitest';
import { findSettingsButton, findQualityMenuButton, findQualityOptions } from '../src/lib/selectors.js';

function setBody(html) {
  document.body.innerHTML = html;
}

describe('findSettingsButton', () => {
  beforeEach(() => setBody(''));

  it('finds the settings button in the player controls by semantic label', () => {
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

  it('does not pick clip before the settings button', () => {
    setBody(`
      <div id="channel-player">
        <div class="player-controls__right-control-group">
          <button id="clip" aria-label="Klipp">Klipp</button>
          <button id="settings" data-a-target="player-settings-button" aria-label="Innstillinger"></button>
        </div>
      </div>
    `);
    expect(findSettingsButton()?.id).toBe('settings');
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

describe('findQualityMenuButton', () => {
  beforeEach(() => setBody(''));

  it('finds the English quality submenu item', () => {
    setBody(`
      <div role="menu">
        <button role="menuitem">Playback speed</button>
        <button role="menuitem" id="quality">Quality</button>
      </div>
    `);
    expect(findQualityMenuButton()?.id).toBe('quality');
  });

  it('finds the Norwegian quality submenu item', () => {
    setBody(`
      <div role="menu">
        <button role="menuitem">Teksting</button>
        <button role="menuitem" id="quality">Kvalitet</button>
      </div>
    `);
    expect(findQualityMenuButton()?.id).toBe('quality');
  });

  it('does not return final quality radio options as the submenu button', () => {
    setBody(`
      <div role="menu">
        <button role="menuitemradio" id="source">1080p60 (Source)</button>
      </div>
    `);
    expect(findQualityMenuButton()).toBeNull();
  });

  it('falls back to the observed Twitch layout class when labels are unavailable', () => {
    setBody(`
      <div role="menu">
        <button role="menuitem" id="quality" class="Layout-sc-1xcs6mc-0 dCYttJ"></button>
      </div>
    `);
    expect(findQualityMenuButton()?.id).toBe('quality');
  });

  it('does not treat final radio options with the layout class as the submenu button', () => {
    setBody(`
      <div role="menu">
        <button role="menuitemradio" id="source" class="Layout-sc-1xcs6mc-0 dCYttJ">1080p60</button>
      </div>
    `);
    expect(findQualityMenuButton()).toBeNull();
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
