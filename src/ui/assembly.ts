import { tr } from '../i18n'
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
  1: [tr('Costas', 'Back'), tr('Apoie a placa das costas na mesa. Ela é a referência de todo o resto.', 'Rest the back plate on the table. It is the reference for everything else.')],
  2: ['Base', tr('Encaixe a base nas costas: as abas entram nas ranhuras. Sem cola no começo.', 'Fit the base onto the back: the tabs go into the slots. No glue at first.')],
  3: [tr('Laterais, divisórias e quadros', 'Sides, dividers and frames'), tr('Encaixe as laterais e divisórias nas ranhuras da base e das costas. Confira que estão retas.', 'Fit the sides and dividers into the slots of the base and back. Check that they are straight.')],
  4: [tr('Prateleiras', 'Shelves'), tr('Encaixe as prateleiras nas ranhuras das laterais, uma a uma.', 'Fit the shelves into the slots of the sides, one by one.')],
  5: [tr('Topo', 'Top'), tr('Feche a estrutura com o topo. Se as abas estiverem justas, bata de leve com a palma da mão.', 'Close the frame with the top. If the tabs are tight, tap gently with the palm of your hand.')],
  6: [tr('Gavetas', 'Drawers'), tr('Deslize cada gaveta no seu vão. Elas correm sem cola.', 'Slide each drawer into its bay. They run without glue.')],
  7: [tr('Painéis e espaçadores', 'Panels and spacers'), tr('Coloque os painéis frontais e espaçadores. Podem ser colados se quiser fixar.', 'Place the front panels and spacers. They can be glued if you want them fixed.')],
  8: [tr('Fixações', 'Fasteners'), tr('Prenda o gabinete na parede ou em outro gabinete com as peças de fixação.', 'Fasten the cabinet to the wall or to another cabinet with the fastening parts.')],
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
      const [title, text] = TEXT[s] ?? [tr(`Passo ${s}`, `Step ${s}`), tr('Encaixe as peças.', 'Fit the parts together.')]
      return { n: i + 1, title, text, parts: [...by.get(s)!] }
    })
}

/** Highest raw step (as `stepOf` returns it) shown while the user is at step `n`. */
export function rawStepAt(steps: AssemblyStep[], parts: Part[], n: number): number {
  const raws = [...new Set(parts.map((p) => stepOf(p.group, p.assemblyStep)).filter((x): x is number => x !== null))].sort((a, b) => a - b)
  return raws[Math.min(n, steps.length) - 1] ?? 99
}
