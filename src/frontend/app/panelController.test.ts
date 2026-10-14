import { expect, it } from 'vitest';
import { derivePanelState } from './panelController';
it('derives all remembered desktop/mobile states without conflating modality', () => {
  for(const mobile of [false,true]) for(const desktopOpen of [false,true]) for(const mobileOpen of [false,true]) {
    const open=mobile?mobileOpen:desktopOpen;
    expect(derivePanelState({mobile,desktopOpen,mobileOpen})).toEqual({open,modal:mobile&&open});
  }
});
