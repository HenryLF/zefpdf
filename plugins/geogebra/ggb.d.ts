// `deployggb.js` is a plain script that puts `GGBApplet` on `window`; it is not
// a module and is never imported by the bundle. This declares just the part of
// its API the plugin uses.

export interface GgbParams {
  appName: string;
  width?: number;
  height?: number;
  showToolBar?: boolean;
  showAlgebraInput?: boolean;
  showMenuBar?: boolean;
  showResetIcon?: boolean;
  enableRightClick?: boolean;
  scaleContainerClass?: string;
  /** leave the page's focus alone when the applet loads, instead of taking it */
  preventFocus?: boolean;
  /** URL of a .ggb file to open */
  filename?: string;
  /** id of a geogebra.org material, fetched from there */
  material_id?: string;
  appletOnLoad?: (api: GgbApi) => void;
}

export interface GgbApi {
  setSize(width: number, height: number): void;
}

export interface GgbApplet {
  /** point the loader at a locally served HTML5 build, for offline use */
  setHTML5Codebase(url: string): void;
  inject(elementId: string): void;
}

declare global {
  interface Window {
    GGBApplet?: new (
      params: GgbParams,
      html5NoWebSimple?: boolean,
    ) => GgbApplet;
  }
}
