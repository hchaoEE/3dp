import type { PluginInterface } from '@chip3d/sdk';

export class PluginRegistry {
  private static instance: PluginRegistry;
  private plugins = new Map<string, PluginInterface>();

  static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  register(name: string, plugin: PluginInterface): void {
    this.plugins.set(name, plugin);
  }

  get(name: string): PluginInterface | undefined {
    return this.plugins.get(name);
  }

  list(): Array<{ name: string; manifest: PluginInterface['manifest'] }> {
    return [...this.plugins.entries()].map(([name, p]) => ({
      name,
      manifest: p.manifest,
    }));
  }

  has(name: string): boolean {
    return this.plugins.has(name);
  }
}
