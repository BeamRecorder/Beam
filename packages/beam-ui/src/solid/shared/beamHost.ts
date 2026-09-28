import { NativeHost, type NativeNode } from '@argui/host'

/** Supplies Beam's medium default, while explicit component weights still win. */
export class BeamHost extends NativeHost {
  override createElement(name: string): NativeNode {
    const node = super.createElement(name)
    if (node.type.name === 'Text') this.setProperty(node, 'weight', 500)
    return node
  }
}
