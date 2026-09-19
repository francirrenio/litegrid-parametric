import type { Part, PartGroup } from '../model/part'

export interface AssemblyStep {
  n: number
  title: string
  text: string
  parts: string[]
}

/** Assembly order of a part: the skeleton parts carry their own step, the rest follow in a fixed order. */
export function stepOf(group: PartGroup, step?: number): number | null {
  if (group === 'teste') return null
  if (group === 'gabinete') return step ?? 3
  if (group === 'gaveta') return 6
  if (group === 'skin' || group === 'espacador') return 7
  return 8
}

const TEXT: Record<number, [string, string]> = {
  1: ['Costas', 'Apoie a placa das costas na mesa. Ela é a referência de todo o resto.'],
  2: ['Base', 'Encaixe a base nas costas: as abas entram nas ranhuras. Sem cola no começo.'],
  3: ['Laterais, divisórias e quadros', 'Encaixe as laterais e divisórias nas ranhuras da base e das costas. Confira que estão retas.'],
  4: ['Prateleiras', 'Encaixe as prateleiras nas ranhuras das laterais, uma a uma.'],
  5: ['Topo', 'Feche a estrutura com o topo. Se as abas estiverem justas, bata de leve com a palma da mão.'],
  6: ['Gavetas', 'Deslize cada gaveta no seu vão. Elas correm sem cola.'],
  7: ['Painéis e espaçadores', 'Coloque os painéis frontais e espaçadores. Podem ser colados se quiser fixar.'],
  8: ['Fixações', 'Prenda o gabinete na parede ou em outro gabinete com as peças de fixação.'],
}

/** The ordered assembly steps of this result, with the parts that go in at each one. */
export function assemblySteps(parts: Part[]): AssemblyStep[] {
  const by = new Map<number, Set<string>>()
  for (const p of parts) {
    const s = stepOf(p.group, p.assemblyStep)
    if (s === null) continue
    if (!by.has(s)) by.set(s, new Set())
    by.get(s)!.add(`${p.instances.length}× ${p.label}`)
  }
  return [...by.keys()]
    .sort((a, b) => a - b)
    .map((s, i) => {
      const [title, text] = TEXT[s] ?? [`Passo ${s}`, 'Encaixe as peças.']
      return { n: i + 1, title, text, parts: [...by.get(s)!] }
    })
}

/** Highest raw step (as `stepOf` returns it) shown while the user is at step `n`. */
export function rawStepAt(steps: AssemblyStep[], parts: Part[], n: number): number {
  const raws = [...new Set(parts.map((p) => stepOf(p.group, p.assemblyStep)).filter((x): x is number => x !== null))].sort((a, b) => a - b)
  return raws[Math.min(n, steps.length) - 1] ?? 99
}
