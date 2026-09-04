export const DEFAULT_RENDER_BACKGROUND = '#242424';

export interface RenderSurfaceConfig {
  logicalWidth: number;
  logicalHeight: number;
  devicePixelRatio: number;
  backgroundColor: string;
}

export function createRenderSurfaceConfig(
  logicalWidth: number,
  logicalHeight: number,
  devicePixelRatio: number,
  backgroundColor: string = DEFAULT_RENDER_BACKGROUND,
): RenderSurfaceConfig {
  return {
    logicalWidth: Math.max(1, Math.round(logicalWidth)),
    logicalHeight: Math.max(1, Math.round(logicalHeight)),
    devicePixelRatio: Math.max(1, devicePixelRatio || 1),
    backgroundColor,
  };
}

export function getBackingWidth(surface: RenderSurfaceConfig): number {
  return Math.round(surface.logicalWidth * surface.devicePixelRatio);
}

export function getBackingHeight(surface: RenderSurfaceConfig): number {
  return Math.round(surface.logicalHeight * surface.devicePixelRatio);
}
