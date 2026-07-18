// Adversarial shape 4: nesting deeper than the v1 depth-2 partition — inner
// structure beyond depth 2 must fold into leaves without breaking the partition.
export namespace Outer {
  export class Container {
    private registry = new Map<string, () => number>();

    register(name: string, fn: () => number): void {
      this.registry.set(name, fn);
    }

    runAll(): Record<string, number> {
      const out: Record<string, number> = {};
      for (const [name, fn] of this.registry) {
        try {
          out[name] = fn();
        } catch {
          out[name] = -1;
        }
      }
      return out;
    }
  }

  export function makeDefault(): Container {
    const c = new Container();
    c.register("answer", () => {
      const inner = (): number => {
        const deeper = (): number => 42;
        return deeper();
      };
      return inner();
    });
    return c;
  }
}
